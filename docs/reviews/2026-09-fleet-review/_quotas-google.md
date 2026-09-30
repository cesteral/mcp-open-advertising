# Platform quotas: Google group (gads, dv360, dbm, cm360, sa360)

Research date: 2026-09-24. This was read-only. I edited no repo files.

## What was reachable, and what that means for confidence

| Source tried | Result |
| --- | --- |
| `developers.google.com/*` (all five quota pages), `support.google.com`, `ads-developers.googleblog.com`, `developers.google.cn`, web.archive.org, r.jina.ai | **Blocked.** curl got proxy CONNECT 403, and WebFetch returned `EGRESS_BLOCKED`/unable. |
| `https://<api>.googleapis.com/$discovery/rest` for displayvideo v4 (rev 20260923), doubleclickbidmanager v2 (rev 20260916), dfareporting v5 (rev 20260721), searchads360 v0 (rev 20260820), doubleclicksearch v2 | Reachable. **There are no quota values in any of them.** The only quota-related text is the standard `quotaUser` parameter ("Available to use for quota purposes for server-side applications"). |
| `servicemanagement.googleapis.com/v1/services/displayvideo.googleapis.com/config` (the service config, which would hold `quota.limits`) | 403 "Method doesn't allow unregistered callers". It needs an API key or credentials, and this environment has neither (no gcloud, no GOOGLE_* env). |
| `serviceusage.googleapis.com` consumerQuotaMetrics | Needs an authenticated project. Not available. |
| `googleapis/googleapis` (git clone, sparse `google/ads`): `googleads_v23.yaml`, `googleads_grpc_service_config.json`, `searchads360_v0.yaml`, and the error protos | Reachable. **The service YAMLs have no `quota:` block.** The protos are a primary source for the **shape of the throttle error** but give no limit values. |
| `googleads/google-ads-{python,java,dotnet,php,ruby}`, `google-ads-mcp`, `ads-api-report-fetcher`, `google-ads-api-developer-assistant` (already in `scratchpad/gadsfix/`); newly cloned `googleads/googleads-displayvideo-examples`, `googleads-bidmanager-examples`, `googleads-dfa-reporting-samples` (in `scratchpad/gq/`) | Reachable. **None of them encodes a numeric limit.** The samples only say "exponential backoff ... to conserve quota". The Python SDK retries gRPC `RESOURCE_EXHAUSTED` (`google-ads-python/google/ads/googleads/interceptors/interceptor.py:44`). |
| GitHub code search, `org:googleads` for "operations per day" / "Basic Access" / quota "per minute" | 0 relevant hits. |
| WebSearch restricted to `developers.google.com` | Works, but it returns **search snippets summarized by a model**. Under the evidence rule these count as **corroboration only**. |

**Bottom line: none of the five Google APIs has a primary source for a numeric quota that is reachable from here.** Every number below comes from search snippets of the vendor's own pages, so each one is labelled corroboration-only. The things that *are* primary are the throttle-error shapes (protos and Discovery) and the fact that Discovery carries no quota data. Someone with browser access to developers.google.com, or an API key for servicemanagement, should confirm the numbers before a PR relies on them.

## How our limiter behaves in this group (read from source)

- `createPlatformRateLimiter(name, rpm)` configures **one** pattern, `${name}:*`, at `rpm` per 60 s. Every key under a package therefore gets the same limit (`packages/shared/src/utils/rate-limiter.ts:480-490`).
- The limiter is a module singleton (`packages/<pkg>/src/utils/platform.ts:8`), so it is per process and **shared across all sessions and tenants on the instance**.
- **Every consume in these five packages costs 1 token, including writes.** None of them passes the 3-token write cost used elsewhere in the fleet.
- The HTTP clients retry 429 and 5xx up to 3 attempts. Retries do not re-consume the limiter, so upstream requests can reach 3× the limiter admissions under throttling.

Limiter keys:

| Package | Keys |
| --- | --- |
| gads | `gads:${customerId}` (search, create/update/remove, bid adjust, bulkUpdateStatus); `gads:global` (listAccessibleCustomers) |
| dv360 | `dv360:${advertiserId}` for everything |
| dbm | `bidmanager:global` only (createQuery, runQuery, getReportStatus poll) |
| cm360 | `cm360:${profileId}` (entities), `cm360:reporting:${profileId}` (reports), `cm360:global` (listUserProfiles) |
| sa360 | `sa360:${customerId}` (search, customColumns), `sa360:global` (listAccessibleCustomers, searchFields), `sa360:v2:reports` (legacy reports), `sa360:v2:${advertiserId}` (conversion insert/update) |

---

## gads-mcp (Google Ads API v23)

**Quotas (corroboration only, from snippets of `developers.google.com/google-ads/api/docs/best-practices/quotas`, `.../api-policy/access-levels` and `.../productionize/rate-limits`):**
- Daily operations per developer token / Cloud project, by access level:
  - Explorer: "up to 2,880 operations per day against production accounts".
  - Basic: "up to 15,000 operations per day".
  - Standard: "unlimited" daily operations.
- How operations are counted: "A single query or report is counted as one operation, regardless of whether results are streamed or paged. For mutate requests, each mutated item counts as one operation. All other requests count as one operation."
- Short-term rate limits are **not published as numbers**. The docs say limits exist per customer ID and per developer token, are enforced with a token bucket, and vary with server load. Requests over the limit get `RESOURCE_TEMPORARILY_EXHAUSTED`.

**Throttle response (primary):**
- `googleapis/google/ads/googleads/v23/errors/quota_error.proto`:
  - `RESOURCE_EXHAUSTED` = "Too many requests."
  - `RESOURCE_TEMPORARILY_EXHAUSTED` = "Too many requests in a short amount of time."
  - `EXCESSIVE_SHORT_TERM_QUERY_RESOURCE_CONSUMPTION` / `..._LONG_TERM_...` = "Too many expensive requests from query pattern ...".
- `errors.proto:836-898` `QuotaErrorDetails`:
  - `rate_scope`: `ACCOUNT` ("Per customer account quota") or `DEVELOPER` ("Per project quota (formerly developer token quota)").
  - `rate_name` (bucket name, for example "Get requests for standard access" / "Requests per account").
  - `retry_delay` ("Backoff period that customers should wait before sending next request").
- The same schema appears in Discovery `googleads v22` (`scratchpad/gadsfix/v22.json:1460-1485`).
- Observation: `gads-http-client.ts:140` says it "respects Retry-After". Google Ads puts the backoff in the body as `quotaErrorDetails.retryDelay`, not in a header. Whether the client reads that field is not verified here.

**Recommendation:**
- No per-minute number is published, so **no primary or corroborated value exists to raise the per-customer limit against. Keep 10.**
- The only published hard number is the daily quota, and it is scoped to the **developer token (whole project)**, not the customer. A per-customer, per-minute, per-process limiter cannot enforce it. Arithmetic:
  - Basic tier: 15,000 / 1,440 min ≈ **10.4 ops/min sustained for the entire fleet**.
  - At the current default, one saturated customer on 10 instances runs 10 × 10 = 100 req/min. That exhausts Basic in 150 min, faster when N customers are active.
  - It also undercounts: `bulkUpdateStatus` sends N mutate operations for 1 token (`gads-service.ts:654`), so daily-operation spend is not bounded by token count at all.
- Guidance:
  - **Standard access:** 10/min/customer/process is conservative; nothing published argues for lowering it.
  - **Basic access:** set `GADS_RATE_LIMIT_PER_MINUTE` to about 1 (15,000/day ÷ 1,440 ÷ 10 instances ≈ 1.04) or run a single instance. The real fix is a daily operation budget keyed by developer token, weighted by operation count, which is out of scope for this limiter.
- **Confidence:** corroboration only for the numbers; primary for the error shape.

## dv360-mcp (Display & Video 360 API v4)

**Quotas (corroboration only, from snippets of `developers.google.com/display-video/api/limits`):**
- Per advertiser (requests with an advertiser ID in the URL path), per project:
  - "Total requests per minute per advertiser per project: **300**"
  - "Write requests per minute per advertiser per project: **150**"
- Per project: "Default project-wide quota limits are **1500** total requests per minute and **700** write requests per minute."
- Write-intensive methods "are counted as 5 write queries when computing write request quota consumption". The snippet lists: `customBiddingAlgorithms.scripts.create`, `customBiddingAlgorithms.uploadScript`, `firstPartyAndPartnerAudiences.create`, `firstPartyAndPartnerAudiences.editCustomerMatchMembers`, `media.upload`.
- dv360-mcp calls **none** of these (grep of `packages/dv360-mcp/src` found no match), so the 5× weighting does not apply today.

**Throttle response:** primary-source text is not reachable. The snippets and the Google Cloud convention point to HTTP 429 `RESOURCE_EXHAUSTED`. `dv360-http-client.ts:71` retries 429 and respects Retry-After.

**Recommendation.** The key is per advertiser, which matches the per-advertiser quota scope. A single advertiser's traffic can still land on any of 10 instances, so divide by 10:
- Total: 300 / 10 = 30/min per advertiser per process.
- Writes: 150 / 10 = 15/min per advertiser per process.
- The limiter charges writes 1 token, the same as reads, so the all-write worst case must fit the write cap. **Recommend 15** (up from 6).
- If writes were charged 2 tokens, 30 would satisfy both caps (a worst case of 15 writes or 30 reads per process).
- Project-wide cap: 1500 / 10 = 150/min per process in aggregate. A per-advertiser key does not bound this. Up to 10 advertisers saturating at once on one process stays within it (10 × 15 = 150), which is an acceptable margin; note it in the config comment.
- The current comment (`config/index.ts:34`) implies a platform quota of 60. That does not match any published figure found; 300 and 150 are the figures.
- **Confidence:** corroboration only.

## dbm-mcp (Bid Manager API v2)

**Quotas (corroboration only, low quality).** The snippets for `developers.google.com/bid-manager/quotas` returned:
- "2,000 requests per project per day, which can be increased"
- "limits projects to 4 queries per second"
- "Queries per minute per user ... set to 240"
- "Daily quotas refresh at midnight PST"

The search also surfaced the legacy `bid-manager/limits` and `v1/queries` pages, so these numbers **may be v1-era or conflated**. I could not confirm them for v2.

**Throttle response:** HTTP 429. `dbm-mcp/src/services/bid-manager/retry-policy.ts:74` treats an upstream 429 as retryable, and `bid-manager-errors.ts:68` maps it to `RateLimited`.

**Recommendation.** The key is `bidmanager:global`, one bucket per process shared by all tenants. The per-user / per-project quota is shared by the whole fleet (one service account), so divide by 10:
- Per minute: 240 / 10 = 24/min.
- Daily: 2,000 / 1,440 ≈ 1.4/min fleet-wide sustained. The current 10/min × 10 instances = 100/min would exhaust 2,000/day in 20 minutes.
- getReportStatus polling (`reportPollMaxRetries` 30) also consumes from this key.

**Recommend keeping 10.** Do not raise to 24 until the v2 daily figure is confirmed or known to be raised for the project. The per-minute figure alone would allow 24, but the daily figure argues for less, and the daily figure is the least certain number here. **Confidence:** corroboration only, and possibly stale.

## cm360-mcp (Campaign Manager 360 / dfareporting v5)

**Quotas (corroboration only, from snippets of `developers.google.com/doubleclick-advertisers/quotas`):**
- "50,000 requests per project per day" (can be increased).
- "1 query per second (QPS)". One snippet said "per project" and another implied per user. The page states the Console name is "**Queries per minute per user** ... set to **60** by default", "can be increased up to a maximum of 600 (10 QPS)". Treat it as per user (the authenticated principal).
- For the separate Report Data / query endpoint (`guides/query_report_data`): "120 requests per minute per user (2 QPS)", "10,000 requests per day per project". cm360-mcp's reporting service uses the classic reports/files flow, not the query endpoint, so this bucket does not apply today.

**Throttle response:** HTTP 429 (Cloud quota). `cm360-http-client.ts:87` retries 429 and 5xx.

**Recommendation.** The platform scope is **per user** (the service account or OAuth principal). Our keys are **per profileId**, with two keys per profile (`cm360:` and `cm360:reporting:`) plus `cm360:global`. One principal can hold many profiles, so the key does not match the quota scope.
- Worst case for one profile per process: 3 keys × limit.
- Fleet budget: 60/min per user / 10 instances = 6/min per process for **all** of a user's traffic.
- With two keys per profile both active: 6 / 2 = 3/min per key.

**Recommend keeping 5.** The published 60/min default gives 6/min per process at best, and the multi-key, multi-profile layout already lets real traffic exceed it. Five is the defensible middle between 6 and 3; going lower hurts single-profile use. A project that has raised the per-user quota (for example to 600) can set `CM360_RATE_LIMIT_PER_MINUTE=50`.
- Daily: 50,000 / 1,440 ≈ 34.7/min fleet-wide sustained, which fits comfortably under the per-user cap.
- The structural fix is to key by principal, not profile.
- **Confidence:** corroboration only.

## sa360-mcp (SA360 Reporting API v0 and legacy DoubleClick Search v2)

**Reporting API v0 quotas (corroboration only, from snippets of `developers.google.com/search-ads/reporting/concepts/quotas`):**
- "3,000 queries per minute per project per user"
- "3,000 queries per minute per project"
- "150,000 queries per day per project"
- "Each `Search` or `SearchStream` request counts as one operation."
- "Paginated requests (for example, requests that contain a valid next_page_token) are not counted against a user's daily operation quota."
- Daily reset at midnight Pacific.

**v0 throttle response (primary for the shape):** `googleapis/google/ads/searchads360/v0/errors/quota_error.proto` and Discovery `searchads360 v0` (`scratchpad/gadsfix/sa360.json`) carry `QuotaError` and `QuotaErrorDetails` (rate scope ACCOUNT/DEVELOPER, `retryDelay`), the same model as Google Ads. `sa360-http-client.ts:67` maps 429 to `RateLimited`.

**Legacy v2 quotas (DoubleClick Search, `developers.google.com/search-ads/pricing`):**
- The snippets say only that there are daily per-project buckets for `Reports.generate()`, `Reports.request()`, and "other operations", which includes conversion insert/update.
- **No default values were found**, and `Reports.request` quota "varies depending on the amount of computation time needed".
- **No source for v2 has a numeric value, primary or corroborating.**

**Recommendation:**
- v0 key is per customer. Project cap 3,000/min / 10 instances = 300/min per process across all customers.
- Allowing about 10 concurrently active customers per process gives 30/min per customer per process.
- Daily check: 30 × 10 instances = 300/min for one saturated customer, which exhausts 150,000/day in about 8.3 h. That is acceptable, because pagination is free and real use is bursty.
- **But the limit is one value for `sa360:*`, so raising it also raises the v2 keys (`sa360:v2:reports`, `sa360:v2:${advertiserId}`), which have no published number.** Conversion upload is the only governed write here.
- Either:
  - (a) **keep 10** as the single default (the conservative choice given v2), or
  - (b) configure a second pattern: `sa360:v2:*` at 10, with the rest at 30.
- I recommend (b) if the code change is acceptable, otherwise (a).
- **Confidence:** corroboration only for v0; none for v2.

---

## Summary

| Platform | Current default | Sourced quota | Scope | Recommended default | Confidence | Source |
| --- | --- | --- | --- | --- | --- | --- |
| gads | 10 | Daily ops: Explorer 2,880 / Basic 15,000 / Standard unlimited. Short-term rate unpublished (token bucket, `RESOURCE_TEMPORARILY_EXHAUSTED`). | Developer token / project for daily ops; per customer and per project for short-term (`QuotaRateScope` ACCOUNT / DEVELOPER, primary) | **10 (keep)** for Standard. About 1 for Basic via env (15,000/1,440/10). The limiter cannot enforce a daily, op-weighted cap. | Corroboration only for numbers; primary for error shape | Snippets: developers.google.com/google-ads/api/docs/best-practices/quotas, .../api-policy/access-levels. Primary: googleapis `google/ads/googleads/v23/errors/{quota_error,errors}.proto` |
| dv360 | 6 | 300 total + 150 write /min per advertiser per project; 1,500 total + 700 write /min per project; 5× write-intensive methods (not used by us) | Per advertiser per project, plus per project | **15** (150 writes / 10 instances; writes cost 1 token). 30 if writes cost 2 tokens. | Corroboration only | Snippets: developers.google.com/display-video/api/limits |
| dbm | 10 | 2,000 req/day per project; 4 QPS; 240 QPM per user (possibly v1-era) | Per project / per user; our key is global per process | **10 (keep)**. The 240/10 = 24/min figure is capped back by the daily 2,000. | Corroboration only, possibly stale | Snippets: developers.google.com/bid-manager/quotas |
| cm360 | 5 | 60 QPM per user (raisable to 600); 50,000/day per project; query endpoint 120 QPM/user and 10,000/day | Per user (principal); our keys are per profile ×2 plus global | **5 (keep)**, between 60/10 = 6 and 6/2 keys = 3. 50 if the quota is raised to 600. | Corroboration only | Snippets: developers.google.com/doubleclick-advertisers/quotas, .../guides/query_report_data |
| sa360 (v0) | 10 | 3,000 QPM per project per user; 3,000 QPM per project; 150,000/day per project; pagination free | Per project; our key is per customer | **30** for `sa360:*` (3,000/10/10 active customers), **only if v2 is split out** | Corroboration only | Snippets: developers.google.com/search-ads/reporting/concepts/quotas. Primary error shape: googleapis `google/ads/searchads360/v0/errors/quota_error.proto` |
| sa360 (v2) | 10 (same pattern) | Daily per-project buckets (generate / request / other); no default values published | Per project | **10 (keep)**. Add a separate `sa360:v2:*` pattern if v0 is raised. | None | Snippets only confirm the buckets exist: developers.google.com/search-ads/pricing |

Cross-cutting notes for whoever edits the defaults:
1. **Writes cost 1 token everywhere in this group.** If the fleet's 3-token write cost is introduced here, DV360 can go to 30 and stay under the 150 write cap (30/3 = 10 writes/min × 10 instances = 100 ≤ 150).
2. **Limiter tokens under-count upstream requests.** Retries after a 429 or 5xx do not re-consume, and gads `bulkUpdateStatus` sends N operations for 1 token.
3. **No Google quota here can be verified from this environment.** A PR changing these defaults should record each figure in `platform-facts.json` as `unverified`, with the snippet URL as its basis, following the repo's existing discipline.
