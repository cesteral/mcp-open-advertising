# Platform quotas — group "social" (meta, tiktok, snapchat, pinterest, linkedin)

Researched 2026-09-24. Read-only; no repo files edited.

## Egress reality (applies to every platform below)

Every vendor doc host returned `CONNECT tunnel failed, response 403` from curl, or `EGRESS_BLOCKED` from WebFetch: developers.facebook.com, business-api.tiktok.com, developers.snap.com, marketingapi.snapchat.com, developers.pinterest.com, learn.microsoft.com and docs.microsoft.com (LinkedIn). `github.com` clones and `raw.githubusercontent.com` both work. `MicrosoftDocs/linkedin-api-docs` is not public (clone asks for credentials). So:

- **Primary** below means vendor-authored code or spec: an official SDK, the vendor's OpenAPI spec, or a vendor-owned GitHub repo.
- **Numeric per-minute and per-hour quotas** were found in a primary source for only two Pinterest endpoints, and our server calls neither. Every other number is **corroboration-only**: third-party mirrors of vendor doc pages, or search snippets. Each one is labelled that way.

## Our limiter (the same for all five servers)

- `createPlatformRateLimiter("<p>", N)` in `packages/shared/src/utils/rate-limiter.ts:480` configures the pattern `<p>:*` with N tokens per 60 s window (`PLATFORM_RATE_LIMIT_WINDOW_MS = 60_000`, line 441). A caller waits in a queue for up to `PLATFORM_RATE_LIMIT_MAX_WAIT_MS` = 120 s (line 455).
- Each package has one module-level singleton (`src/utils/platform.ts:8`). It is **per process and shared by every session and tenant on the instance**. Each distinct key gets its own N/min.
- Keys:
  - **meta**: `meta:${adAccountId}` for list and create (`meta-service.ts:72,145`). `meta:default` for get, update, delete, bulk, insights and targeting (`meta-service.ts:123,160,167,256,272,362…`, `meta-insights-service.ts:59,136,202,236,304`, `meta-targeting-service.ts:33,80`). Read = 1 token, write = 3 (`META_READ_TOKENS` / `META_WRITE_TOKENS`, `meta-service.ts:30-31`).
  - **tiktok**: `tiktok:default` (CRUD; writes cost 3) and `tiktok:reporting` (task create and polls, `tiktok-reporting-service.ts:149,185,221,348`).
  - **snapchat**: `snapchat:default` (writes cost 3) and `snapchat:reporting`.
  - **pinterest**: `pinterest:${adAccountId}` for entity CRUD (writes cost 3), `pinterest:default` for ad-account list and targeting, and `pinterest:reporting` (shared across all accounts).
  - **linkedin**: `linkedin:${adAccountUrn}` for list and analytics, and `linkedin:default` for everything else (writes cost 3).
- Consequence: a per-process key with limit N reaches the platform at up to **N × instances** per minute, and an app with two keys at up to **2N × instances**. The `*:default` keys pool many tenants and accounts, so for a per-account platform quota they are stricter than necessary, never looser.

---

## 1. meta-mcp — current default 20/min

### What the vendor-authored code says (primary)

- **Throttle error codes.** `facebook/facebook-python-business-sdk` and its PHP twin: `fb-php-sdk/src/FacebookAds/Http/Exception/RequestException.php:178` reads `in_array($error_data['code'], array(4, 17, 341))` → `ThrottleException`. The SDK encodes no numeric limits: I grepped all five `fb-*` clones for rate, throttle and usage terms and found nothing numeric.
- **More codes in another Meta repo.** `facebook/facebook-for-woocommerce` is copyright "Facebook, Inc. and its affiliates" and was cloned at `1d874f8`, 2026-09-22. In `includes/API.php:147-161` it treats these as throttling:
  ```
  4 - API Too Many Calls / 17 - API User Too Many Calls / 32 - Page-level throttling / 613 - Custom-level throttling
  80004 - There have been too many calls to this ad-account
  if ( in_array( $code, array( 4, 17, 32, 613, 80001, 80004 ), true ) ) {
  ```
  **This is the vendor-authored source that `meta-graph-api-client.ts:28-33` says it is waiting for** before it adds 613 and 800xx to `RATE_LIMIT_CODES`. It confirms 613, 80001 and 80004. It does not confirm the full 80000–80014 range.
- **`X-Business-Use-Case-Usage` semantics.** From the same repo, `includes/API/Traits/Rate_Limited_Response.php:38-120`:
  - The fields are `call_count`, `total_time` and `total_cputime`, each a percentage.
  - `estimated_time_to_regain_access` is in **minutes**. `Rate_Limited_API.php:67` multiplies it by `MINUTE_IN_SECONDS`, even though a docblock at line 108 says "seconds".
  - The woo code reads these fields from the top level of the header. The Graph docs mirror below shows them nested under `{business-object-id: [ {type, …} ]}`. `meta-graph-api-client.ts:344-350` handles the nested form correctly, but only reads the first entry of the first key.

### Numbers — corroboration-only

Source: a third-party capture of `developers.facebook.com/docs/marketing-api/overview/rate-limiting/`, dated 2026-08-20, at `github.com/mattei2005/mgs-agent` commit `d4a34d58`, path `work/meta-clone-rate-limit-research-20260820/official/meta-marketing-rate-limiting.md`. The text agrees word for word with two other independent mirrors (`emeraldtarek/meta-ads-api-docs-md`, `yvfl/faceads-mcp-v2`). Quoted:

- **Ad Account Level API-Level Limits.**
  - "Rate limiting is at the ad account level … a read API call is equal to 1 point, and a write API call is equal to 3 points."
  - Dev tier: "maximum score is 60 … decay rate is 300 seconds … blocked for 300 seconds".
  - Full access: "maximum score is 9000 … decay rate is 300 seconds … blocked for 60 seconds".
  - Errors: `17 / subcode 2446079` and `613 / subcode 1487742`.
- **Ad Account Level QPS.** "100 requests per second (QPS) per app and ad account combination", applied to campaign, ad set and ad create and edit. Error: `613 / subcode 5044001`.
- **Business Use Case limits, per ad account per hour.**
  - `ads_management`: "(100000 if … Full access or 300 if … Dev tier) + 40 * Num of Active ads".
  - `ads_insights`: "(190000 … Full access or 600 … Dev tier) + 400 * Number of Active ads - 0.001 * User Errors".
  - `custom_audience`: 190000 (Full) or 5000 (Dev) + 40 × active audiences, capped at 700000.
  - Errors: `80000, 80003, 80004, 80014`.
- **Ads Insights platform limit.** App level, number not published. Error: `4 / subcodes 1504022, 1504039`.
- **App-level limits.** Number not published. Error: `4`.
- **Non-rate caps.** Ad set budget: 4 changes per hour per ad set (`613 / 1487632`, blocked for 1 h). Spend cap: 10 changes per day (`17 / 1885172`). Retrying either one is useless.
- **Headers.** `X-Ad-Account-Usage` carries `acc_id_util_pct`, `reset_time_duration` and `ads_api_access_tier`. Our parser at `meta-graph-api-client.ts:333` looks for `percent_used`, **which would never match if the mirror is right**. Corroboration only; worth a live check.
- **Throttle response.** Error code in the body, usually with HTTP 400, and **no Retry-After header**.

### Recommendation

Our token model (read 1, write 3) matches Meta's scoring exactly. The binding limit is per ad account.

- **Full access:** min(9000 pts / 5 min = 1800 pts/min, BUC 100000/h ≈ 1667/min) ≈ 1667 per ad account per minute.
  - A single ad account's traffic can land on all 10 instances: 1667 / 10 ≈ **166/min per process**.
  - Halve that for headroom (other clients of the same app on the same account, the CPU and time components of BUC, and `meta:default` pooling) → **recommend 100**.
- **Development tier:** BUC `ads_management` is 300/h = **5/min** per ad account with no active ads, and the score limit is 60 / 5 min = 12/min. The current default of 20 already exceeds both on a single instance.
  - Dev-tier deployments should set `META_RATE_LIMIT_PER_MINUTE=5`.
  - Document this next to the default. The tier is visible at runtime as `ads_api_access_tier` in the usage headers.
- **Confidence:** throttle codes and header semantics are **primary**; all numbers are **corroboration-only**.

---

## 2. tiktok-mcp — current default 10/min

### Primary

- The official SDK `tiktok/tiktok-business-api-sdk` (scratchpad `tt-sdk` @ `f809c39`): `python_sdk/business_api_client/tiktok_business/tiktok_code.py:37` has `ERROR_CODE_REQUEST_TOO_FREQUENT = 40100`, and line 67 has `ERROR_CODE_REQUEST_FREQUENCY_LIMITED = 40132`.
- The SDK and its `yml_files/` API specs contain no QPS, QPM or QPD values. I grepped the whole tree for qps, rate limit, per second and per minute.
- A GitHub code search for `org:tiktok QPS business-api` returned 0 results.

### Numbers — corroboration-only

- **Global per-developer-app limits** (two third-party mirrors of `business-api.tiktok.com/portal/docs?id=1740029171730433`, i.e. `/rate-limits/v1.3`: `gaoyangz77/rivonclaw` `docs/API/TIKTOK_BUSINESS/RATE_LIMITS.md`, researched 2026-07-09, and `bruin-data/ingestion-index` `results/tiktok_ads.md`):
  - Basic: 10 QPS / **600 QPM** / 864,000 QPD.
  - Next tiers: 20 / 1,200 / 1.728M, then 30 / 1,800, then 50 / 3,000.
  - The two mirrors disagree on tier names: Standard/Advanced/Partner vs Advanced/Premium/Ultimate.
  - "All apps are set to Basic level by default."
- **Endpoint limits (separate buckets that also count against the app bucket).**
  - `POST /report/task/create/`: **2 QPS / 60 QPM / 4,500 QPD at every tier**. One mirror notes that other TikTok pages say 1 QPS per app.
  - `/ad/create/` on Basic: 5 QPS / 150 QPM / 86,400 QPD (per `YspCoder/social-hub` `adapters/tiktok/marketing/README.md`).
- **Throttle response.** Body `"code": 40100`, usually with HTTP 200, and no Retry-After. After a QPM breach, wait about 5 minutes. QPD resets at 00:00 UTC.
- **Adaptive penalty (bruin mirror).** "If there are 10 time-out requests in 10 seconds, then the QPS limit will be temporarily lowered to 5 QPS for 5 minutes …" The docs also advise "Don't retry the same requests if timeouts occur".

### Recommendation

The quota is **per developer app**: one app serves all tenants and all instances. Both of our keys draw from it.

- Global bucket: 2 keys × L × 10 instances ≤ 600 → **L ≤ 30**.
- `/ad/create/` at L = 30: a write costs 3 tokens, so 10 writes/min per process, ×10 = 100 ≤ 150. OK.
- **Async report create is not covered.** `tiktok:reporting` at 30 gives 300/min fleet-wide if every token went to `task/create`, against a quota of 60 QPM. It stays inside only because polls share the key.
  - Strictly: reporting ≤ 60 / 10 = **6/min**.
  - That needs a separate `TIKTOK_REPORTING_RATE_LIMIT_PER_MINUTE`, or a dedicated key for `task/create` at 6.
- **Recommend 30** for `tiktok:*` with a separate cap of 6 for report task creation. If only one knob is kept, 30 with this caveat documented.
- **Confidence:** codes are **primary**; numbers are **corroboration-only**.

---

## 3. snapchat-mcp — current default 10/min

### Primary

- No primary source for the Ads API.
- The only vendor-authored Snap code is the Conversions API business SDKs (`Snapchat/business-sdk-{go,java,python,v3-java}`, scratchpad `snapsrc/`). For example, `business-sdk-java/README.md:144` says: "We recommend a 1000 QPS limit for sending us requests. You may send up to 2000 events per batch". That covers CAPI only and **does not apply** to `adsapi.snapchat.com`.
- A GitHub search of `org:Snapchat` for the Ads API host found nothing.

### Numbers — corroboration-only

From a search snippet of `developers.snap.com/marketing-api/Ads-API/rate-limits`, matching `reviews/snapchat-mcp.md:37`:

- "rate limits at both App and Token level … App … overall average volume of 20 requests/second, while individual Access tokens … average of 10 requests/second".
- The throttle response is HTTP **429**. No Retry-After semantics were found.

### Recommendation

Our keys are shared across all tenants, so the binding limit is the **app** limit of 20 rps = 1200/min fleet-wide, assuming one hosted Snap app.

- 2 keys × L × 10 ≤ 1200 → **L ≤ 60**.
- A single tenant's token (10 rps = 600/min) cannot be exceeded at L = 60: 2 × 60 × 10 = 1200 only if every call is one token's, so this holds with headroom.
- **Recommend 60, only if the snippet is accepted.** On primary evidence alone: **no primary source**, keep the current 10 until someone reads the page.
- Note: at 10/min, the batch tools are unusable at their advertised sizes (`reviews/snapchat-mcp.md` finding 1).

---

## 4. pinterest-mcp — current default 10/min

### Primary

From `pinterest/api-description` `v5/openapi.json`, spec 5.28.0, repo HEAD `51aca00`, byte-identical to scratchpad `pinterest-openapi.json`:

- **Every operation carries `x-ratelimit-category`.** `extensions.md:13` says "Operations that share a rate limit category will share rate limit quota."
- **Categories of the endpoints we call:**

  | Endpoints | Category |
  | --- | --- |
  | `GET /ad_accounts`; GET on campaigns, ad_groups and ads, collection and item; `POST …/ad_groups/audience_sizing` | `ads_read` |
  | POST/PATCH on campaigns, ad_groups and ads; `POST …/ad_previews` | `ads_write` |
  | `POST` and `GET /ad_accounts/{id}/reports` | `ads_analytics` |
  | `/pins`, `/media` GET | `org_read` |
  | `/pins`, `/media` POST, PATCH, DELETE | `org_write` |

  There are 14 categories in total (ads_read 85 ops, ads_write 77, ads_analytics 16, org_*, catalogs_*, and others).
- **The spec gives no numbers for any category.** The only numeric limits are in two operation descriptions, and we call neither:
  - `events/create` (`POST /ad_accounts/{id}/events`): "This endpoint has a rate limit of 5,000 calls per minute per ad account."
  - `analytics/create_mmm_report`: "An additional limit of 5 queries per minute per advertiser applies to this endpoint while it's in beta release."
- **Throttle response.** Every operation declares `429: "The user has sent too many requests in a given amount of time and is being rate limited."` The official quickstart `pinterest/api-quickstart` `python/src/api_common.py:45-90` raises `RateLimitException` on 429, and `SpamException` when a 429's `message_detail` contains "spam".

### Numbers — corroboration-only

From `api-evangelist/pinterest` `apis.yml`, which cites `developers.pinterest.com/docs/reference/rate-limits/`:

| Category | Trial | Standard |
| --- | --- | --- |
| ads_read | 1000/day | 120000/min |
| ads_write | **300/day** | **400/min** |
| ads_analytics | 1000/day | **300/min** |
| org_read | 1000/day | 1000/min |
| org_write | 300/day | 100/min |

- This source does not state the scope. Search snippets say "per user per app" and cite "100 requests per second per user per app" as a universal ceiling on Standard.
- Search snippets conflict elsewhere (e.g. "300 per minute per ad account"). Treat all of it as weak.

### Recommendation (Standard tier)

- `pinterest:reporting` maps to `ads_analytics` at 300/min: L × 10 ≤ 300 → **L ≤ 30**.
- `pinterest:${acct}` writes map to `ads_write` at 400/min: at L = 30 that is 10 writes/min per process per account, ×10 = 100/min per account. Several accounts under one user token multiply this, so a 4× margin is reasonable.
- **Recommend 30.** A separate reporting knob would allow about 60 for CRUD.
- **A Trial-tier app (300 writes per day) cannot be protected by any per-minute default.** Document it.
- **Confidence:** category mapping is **primary**; numbers are **corroboration-only**.

---

## 5. linkedin-mcp — current default 10/min

### Primary

- The official clients `linkedin-developers/linkedin-api-js-client` (scratchpad `li/`, @ `e4a1fae`, 2023-03-23) and `linkedin-api-python-client` encode no limits.
- The only related artifact is a test fixture, `linkedin-api-js-client/tests/restli-client.test.ts:152-160`: `status: 429, code: 'QUOTA_EXCEEDED', message: 'Daily request quota exceeded'` on `/adAccounts/{id}`. It shows the throttle shape (HTTP 429, `QUOTA_EXCEEDED`) and that the model is a daily quota.
- The docs repo `MicrosoftDocs/linkedin-api-docs` is not public.

### Numbers — corroboration-only

Search snippet of `learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits`:

- LinkedIn enforces an **application** daily limit and a **member** daily limit (per member, per app), set per endpoint. Both reset at midnight UTC, and exceeding either returns HTTP 429.
- **"Standard rate limits are not published in documentation"**. They are visible per endpoint in the Developer Portal → app → Analytics tab. Admins get an email at 75% of quota.
- A third-party figure of "100,000 calls/day per application" is unsourced. Disregard it.

### Recommendation

- **No primary numbers, and LinkedIn itself says none are published**, so any default is a guess.
- The quota is daily, so a per-minute limiter protects only against bursts. 10/min is 14,400/day per key per process, which is 144k/day across 10 instances, above the unverified 100k/day app figure.
- **Keep 10**, or lower it only after reading real values from the app's Developer Portal Analytics tab.
- Record the per-endpoint values in `platform-facts.json` as `unverified`, consistent with the ledger's existing LinkedIn discipline.

---

## Side findings (not quota values, but surfaced by this research)

1. **Meta throttle codes 613 and 80001/80004.** `meta-graph-api-client.ts:28-33` defers adding them "until a primary source confirms them". Meta-authored `facebook/facebook-for-woocommerce` `includes/API.php:161` is that source for 613, 80001 and 80004.
   - Caveat: 613 also covers the 4-per-hour ad-set budget cap (subcode 1487632) and the abuse throttle (no subcode). Retrying those in a backoff loop is pointless.
   - So retry on 613 only with subcodes 1487742 or 5044001 if possible (subcodes are corroboration-only).
2. **Meta `X-Ad-Account-Usage` field name.** Our parser reads `percent_used`, but the docs mirror names `acc_id_util_pct`. Unverified; check on a live response.
3. **Meta dev tier vs current default.** A development-tier Meta app is throttled at 5 BUC calls/min per ad account (with no active ads). Today's default of 20 already exceeds that, so the config comment's "platform_quota / 10" premise does not hold for dev tier.
4. **TikTok and Snapchat run two keys against one app bucket.** The `*:reporting` key doubles effective per-process throughput against the single app-level bucket. Any "quota / instances" arithmetic must also divide by the number of keys.

## Summary

| platform | current default | sourced quota | scope | recommended default | confidence | source |
| --- | --- | --- | --- | --- | --- | --- |
| meta | 20 | Full: score 9000/300s decay (≈1800 pts/min; read=1, write=3); BUC ads_management 100000/h + 40×active ads; ads_insights 190000/h + 400×ads. Dev: score 60/300s; BUC 300/h (≈5/min) | per ad account (per app) | **100** (Full: 1667/10 = 166, halved); **5** for dev-tier apps via env | numbers corroboration-only; codes and header semantics primary | mirror of developers.facebook.com/docs/marketing-api/overview/rate-limiting (mattei2005/mgs-agent@d4a34d5); facebook-for-woocommerce includes/API.php:147-161, Rate_Limited_Response.php; fb-php-sdk RequestException.php:178 |
| tiktok | 10 | Basic 10 QPS / 600 QPM / 864k QPD; report/task/create 60 QPM; /ad/create 150 QPM | per developer app (all tenants) | **30** (2 keys × 30 × 10 = 600); report task create **6** if split | codes primary; numbers corroboration-only | tt-sdk tiktok_code.py:37,67; mirrors of business-api.tiktok.com/portal/docs?id=1740029171730433 (rivonclaw, bruin-data) |
| snapchat | 10 | 20 rps per app, 10 rps per token; 429 | app and token | **60** if the snippet is accepted (2 × 60 × 10 = 1200 = 20 rps); otherwise keep 10 | corroboration-only (no primary source) | search snippet of developers.snap.com/marketing-api/Ads-API/rate-limits |
| pinterest | 10 | categories primary; Standard: ads_read 120000/min, ads_write 400/min, ads_analytics 300/min (Trial: 300 writes/day) | per category (scope per user per app, snippet) | **30** (ads_analytics 300/10) | categories primary; numbers corroboration-only | pinterest/api-description v5/openapi.json (5.28.0) x-ratelimit-category + extensions.md:13; api-evangelist/pinterest apis.yml |
| linkedin | 10 | unpublished; daily per-app and per-member, per endpoint; 429 QUOTA_EXCEEDED | app and member, daily | **keep 10** | none (vendor says not published); 429 shape from vendor test fixture | linkedin-api-js-client tests/restli-client.test.ts:152-160; snippet of learn.microsoft.com rate-limits page |
