# Platform quota research: programmatic group (ttd-mcp, msads-mcp, amazon-dsp-mcp)

Researched 2026-09-24. Read-only; no repo file edited.

**Bottom line: none of the three vendors publishes a numeric request quota in any primary source reachable from here.** TTD and Microsoft both say outright that the numbers are unpublished or internal, and what they say about scope and throttle response is primary. For Amazon Ads, the only primary material in reach (the vendor OpenAPI specs in `amzn-docs` and the vendored docs) lists `429 TooManyRequests` and nothing more. The scope and token-bucket descriptions come from search snippets and GitHub threads (corroboration only). **I recommend keeping all three defaults. There is no grounded basis to raise any of them.** The MSADS and Amazon limiter *keys* are a bigger lever than the numbers (see below).

Egress check: `learn.microsoft.com`, `advertising.amazon.com` and `partner.thetradedesk.com` all return `CONNECT tunnel failed, response 403` (curl) / `EGRESS_BLOCKED` (WebFetch). `api.github.com` for non-session repos is refused; `github.com` HTML via WebFetch works, and those threads are cited below as corroboration.

## How our limiter actually applies (read before the arithmetic)

- `createPlatformRateLimiter(name, rpm)` (`packages/shared/src/utils/rate-limiter.ts:480`) configures pattern `${name}:*`. The window is counted **per concrete key** (`consume` keys `this.requests` by the full key, `rate-limiter.ts` ~L166). So every distinct key gets the full `rpm`, and the limiter queues for up to 2 windows before rejecting.
- The limiter is a module-level singleton (`packages/<pkg>/src/utils/platform.ts:8`), so it is **per process**, shared by every session and tenant on that instance.

| Server | Keys | Scope of key | Token cost |
|---|---|---|---|
| ttd-mcp | `ttd:${partnerId}` (ttd-service.ts:85 etc., ttd-reporting-service.ts:138 etc.) | per partner, per process, **one bucket across all endpoints** | 1 for every call, reads and writes alike (ttd-service.ts:54 "Every call in this service consumes ONE token") |
| msads-mcp | `msads:read`, `msads:write` (rate-limit-keys.ts:4-5) | **shared by all tenants on the instance** | read 1; write 3 (msads-service.ts:279 etc.; SubmitGenerateReportRequest also 3, msads-reporting-service.ts:69); one path costs 1 on the write key (msads-service.ts:487) |
| amazon-dsp-mcp | `amazon_dsp:read`, `amazon_dsp:write`, `amazon_dsp:reporting` | **shared by all tenants on the instance** | read 1, write 3, reporting 1 |

---

## 1. The Trade Desk (ttd-mcp), current default 60/min

### Quota
**No numeric quota is published.** The primary source defines the *shape* of the limit only:

- `packages/ttd-mcp/docs/api/TTD_Foundations.md:638` (vendored from https://open.thetradedesk.com/advertiser/docsApp/Foundations/resources/doc/RateLimits):
  > "API endpoint limits are defined as a maximum number of calls a client can make to each platform endpoint within a time period (usually a minute). System-level usage is also monitored and can result in further dynamic reductions to the rate limits."
  - **Scope: per client, per endpoint, per window (usually 1 min).** The limit can also be lowered dynamically, so even a published number would not be stable.
- `TTD_Foundations.md:648`, the only numeric guidance anywhere: "Limit concurrency to four callers per endpoint." This caps concurrency, not rate.
- GraphQL has the same kind of limit plus a complexity limit. See `TTD_Foundations.md:442` ("Complexity and rate limits apply to all platform GraphQL API calls"), `:726` (GraphQL cannot be used to bypass rate limiting), and `thetradedesk_graphql_api_docs.md:473` (query-complexity limits "and other rate-limiting rules").
- Auth endpoint: `ttd_partner_portal_api_docs.md:3477`: "this endpoint is rate limited ... it is recommended that you generate a new token once every 24 hours."
- The "query" endpoints are "strictly rate limited and should only be used for infrequent retrieval" (`ttd_partner_portal_api_docs.md:3546`).
- `ttd-platform` and `ttd-workflows-python` (the official SDK) contain no numeric limits. The SDK only has Speakeasy's generic `Retry-After` parsing (`ttd-workflows-python/src/ttd_workflows/utils/retries.py:70-90`) and retries on `5XX` by default (`graphql_request.py:80`).

### Throttle response
- REST returns HTTP **429**: `TTD_Foundations.md:624` ("The number of sent requests to the endpoint has exceeded the rate limit") and `:643`.
- Recommended handling (`TTD_Foundations.md:655-657`): "A fixed delay between calls or wait 1 minute after a failed call before retry", exponential backoff `Min(max_delay, base_delay * 2 ^ retrycount)`, or "Inspect the `retry-after` header ... (in seconds)".
- **503** also carries `Retry-After` (`TTD_Foundations.md:626`).
- GraphQL (`thetradedesk_graphql_api_docs.md`):
  - `:477` "All errors are returned with an HTTP 200 status code". Rate or complexity overrun shows up as `RESOURCE_LIMIT_EXCEEDED` (`:522`).
  - `:511` "API Gateway errors ... you receive a 429 status code".
  - So a GraphQL throttle can arrive **either** as a 200 with `RESOURCE_LIMIT_EXCEEDED` **or** as a 429. The repo already maps `RESOURCE_LIMIT_EXCEEDED` (`ttd-mcp/src/mcp-server/tools/utils/graphql-errors.ts:19`).

### Recommendation: keep 60 (no primary basis to change it)
- Our key is coarser than TTD's scope: one bucket per partner across *all* endpoints, while TTD counts per endpoint. The per-process limit is therefore conservative relative to any single endpoint's budget.
- Across the fleet's assumed 10 instances, one partner can reach up to 60 × 10 = 600 calls/min in aggregate, spread over several endpoints. Nothing primary says whether 600/min on one endpoint is safe, so dividing or multiplying cannot be grounded.
- Noted gap, not a change: `TTD_RETRY_CONFIG` has `maxBackoffMs: 10_000` and 3 retries (`ttd-http-client.ts:10-16`). The shared layer honours `Retry-After`, but when TTD omits it, 1+2+4 s of backoff is well short of the documented "wait 1 minute". This matters more than the rate number.
- Confidence: scope and response are **primary**; the number is **none**.

---

## 2. Microsoft Advertising (msads-mcp), current default 10/min

### Quota
**No numeric quota is published.** Primary source: MicrosoftDocs/Advertising clone at commit `166b9955` (2026-09-23), `scratchpad/msads-src/adv/advertising/bingads-13/guides/services-protocol.md`:

- **Campaign Management (L84-95)** and **Ad Insight (L58-69)**, same text in both:
  > "throttling limits the number of calls to the API that any one user can make in a minute's time. At the customer level, the number of calls a customer can make to the customer data is restricted using a sliding protocol with a 60 second window."
  - **Scope: per user, per minute, plus a per-customer sliding 60 s window.** No value is given.
- **Bulk (L71-80)**: "The details of the service limits are internal and subject to change." This applies to Download*/GetBulkUploadUrl. Our server has no Bulk service calls.
- **Reporting (L97-105)**: `SubmitGenerateReportRequest` is limited by **concurrency** ("maximum number of concurrent report requests"), not rate: "The details of the service limits are internal and subject to change."
- The BingAds Python SDK (`msads-src/py/bingads`) encodes no limits and does not handle 117 or 429.
- The shopping-content "60,000 per minute / 20,000,000 per day" figure that turns up in search belongs to the **Content API** (learn.microsoft.com/advertising/shopping-content/request-method-limits). It is not the Campaign/Reporting API, so it does **not** apply here.

### Throttle response (primary: `services-protocol.md`; `handle-service-errors-exceptions.md:26-33`; `operation-error-codes.md:128-131`)

| Service | Code | Symbolic code | Documented recovery |
|---|---|---|---|
| Campaign Management / Ad Insight | 117 | `CallRateExceeded`: "You have exceeded the number of calls that you are allowed to make in a minute." | "resubmit the request under the limit after waiting 60 seconds" |
| Reporting | 207 | `ConcurrentRequestOverLimit` | wait until previous reports complete |
| Bulk | 4204 | `BulkServiceNoMoreCallsPermittedForTheTimePeriod` | "resubmit your request after waiting up to 15 minutes" |

- No `Retry-After` is documented.
- The docs clone does not say what HTTP status the JSON/REST endpoints use for 117. The only 429 mention is a generic `case 429` in illustrative PHP code (`php-sdk-migration-soap-to-rest.md:674`). That is not a statement of behaviour.

### Code findings (worth more than a number change)
- **(a) Error 117 is not recognised.** `msads-mcp/src` contains no `CallRateExceeded`, `117`, `207` or `4204` handling. If the JSON API reports 117 under a non-429 status, it is neither retried nor surfaced as `RateLimited`.
- **(b) Retry timing is too short.** `MSADS_RETRY_CONFIG` backs off 2 s, then 4 s, then 8 s, capped at 30 s (`msads-http-client.ts:9-16`). The documented recovery is 60 s, so even when 429 is retried, all three retries likely land inside the same throttled window.

### Recommendation: keep 10/min; change the key rather than the number
- The platform limit is **per user**, but our keys are shared by the whole instance. So N tenants on one instance share 10 read + 10 write tokens per minute.
- Per process that is 10 reads plus 10/3 ≈ 3 writes per minute. Across 10 instances the fleet ceiling is 100 reads + ~33 writes per minute *in total, across all tenants*. That is almost certainly far below any per-user limit, but there is no primary number to prove it.
- **Raising the number without a sourced quota is a guess.** The grounded improvement is to key per user or customer, e.g. `msads:read:${customerId}` (the pattern `msads:*` already matches). Each tenant then gets its own budget without raising any single user's rate. Also handle 117 with a ≥ 60 s wait.
- Confidence: scope and error codes are **primary**; the number is **none**.

---

## 3. Amazon Ads / DSP (amazon-dsp-mcp), current default 10/min

### Quota
**No primary source for a number or a scope.**
- `amzn-docs` (amzn/ads-advanced-tools-docs clone, commit `677d3b47`, 2026-09-22):
  - The unified API OpenAPI specs (`unified-campaign-management-migration-skills/api-specs/unified-api-dsp.json`, `-sp.json`, `-sb.json`) declare only `"429": {"description": "TooManyRequests 429 response"}`. The body schema is `TooManyRequestsResponseContent {code, message}`, `components.headers` is empty (no `Retry-After` or `x-amzn-RateLimit-*` declared), and no quota is stated.
  - `skills/unified-api-cli-testing/SKILL.md:952-965,1020` only probes for a 429 by "rapid fire" and says "Wait + exponential backoff".
- `packages/amazon-dsp-mcp/docs/*.md` list `429 Too Many Requests` / `TooManyRequests` in status tables (`sponsored-display-amazon-ads.md:36,84,133,205`) and have no rate-limit section.
- **Corroboration only** (the vendor page https://advertising.amazon.com/API/docs/en-us/reference/concepts/rate-limiting is blocked):
  - Search snippets and a third-party blog (databaaba.com) describe a **per-endpoint token bucket** ("each endpoint has a bucket with a maximum capacity and a steady refill rate") and say `list*Extended` operations carry "5x the throttling weight". No `x-amzn-RateLimit-*` headers, unlike SP-API.
  - amzn/ads-advanced-tools-docs issue #344 (read via github.com, labelled bug/documentation/rate-limiting, open) quotes the vendor page: "When this happens, you will receive a response with the code 429. Contained within that response is a Retry-After header." The same issue reports the header **missing** on `POST /reporting/reports`.
  - Discussion #447 quotes vendor docs: reporting limits "depend on the size of the report generation queue. These limits are determined on a per-region basis". A maintainer did not confirm whether scope is per Client ID, per refresh token or per profile. Users there report empirically that throttling looks **per Client ID (LwA app)**.

### Throttle response
- Documented: 429, plus `Retry-After` according to the vendor page (corroboration-level quote).
- Observed in this repo (internal evidence, not vendor):
  - `amazon-dsp-http-client.ts:14-18`: DSP "returns bare `{"message":"Too Many Requests"}` on 429 with NO Retry-After header".
  - `docs/plans/2026-05-15-amazon-dsp-live-test-findings.md:58-63`: `/dsp/orders` returned 429 "on the very first call, even after a documented 5-minute cooldown — multiple runs across 12 minutes all 429 ... only 1 upstream request was sent". That doc proposed lowering the default to 3.

### Why `isAmazonDspRetryable` omits 429
- The rationale is internal observation, not vendor guidance. `amazon-dsp-http-client.ts:14-18`: a single 429 followed by 3 retries at 2 s, 4 s and 8 s "pushed the /dsp/orders endpoint into a multi-hour penalty window", so the code retries only 5xx and surfaces 429 to the agent (`:35-38`: "deliberately omits 429, which predates the sweep").
- The 429 `nextAction` hint (`:55-56`) says "wait at least 5 minutes". That figure has **no primary source**, and the live run found 5 minutes insufficient.
- Side effect of the omission: if Amazon *does* send `Retry-After` (as its doc claims), the shared layer's `Retry-After` honouring (`retryable-fetch.ts:278-280`) is never reached for 429. This is intentional, but it rests on observation that contradicts the vendor doc. The contradiction should be recorded, perhaps in `platform-facts.json` as `unverified`.

### Recommendation: keep 10/min; do not raise
- If the limit is per LwA app (corroboration-only), it is shared across **every tenant and every instance** using our client id. The live run shows the budget can be exhausted by traffic we do not even send ourselves.
- Worst case at the current setting: 10 instances × (10 read + 10 reporting + ~3 writes) ≈ 230 calls/min on one app id. The live evidence says `/dsp/orders` cannot sustain even 1 call in that window. Raising the number is unjustified; the 2026-05-15 proposal of 3/min is at least as defensible as 10.
- The real protection is the existing refusal to auto-retry 429. **I recommend no change without a primary source.**
- Confidence: **none** for the number; **corroboration-only** for scope and `Retry-After`.

---

## Summary

| Platform | Current default | Sourced quota | Scope | Recommended default | Confidence | Source |
|---|---|---|---|---|---|---|
| TTD (ttd-mcp) | 60/min per partner per process | **None published**. "maximum number of calls a client can make to each platform endpoint within a time period (usually a minute)", dynamically reducible; "limit concurrency to four callers per endpoint" | per client, per endpoint, ~1 min | **60 (unchanged)**. Our key is coarser (all endpoints), so it is already conservative per endpoint. Fix: backoff max 10 s vs documented "wait 1 minute" | scope/response primary; number none | packages/ttd-mcp/docs/api/TTD_Foundations.md:624-657; thetradedesk_graphql_api_docs.md:477,511,522 |
| MSADS (msads-mcp) | 10/min per instance (read), 10 tokens/min per instance (write, 3/write) | **None published**. Campaign Mgmt/Ad Insight: per-user per-minute limit plus per-customer sliding 60 s window; Reporting: concurrency limit, "internal"; Bulk: "internal" | per user; per customer (60 s sliding) | **10 (unchanged)**. Re-key per customer/user (limit is per user; our key is shared by all tenants). Handle 117 with a ≥ 60 s wait | scope/errors primary; number none | msads-src/adv/advertising/bingads-13/guides/services-protocol.md:55-105; handle-service-errors-exceptions.md:26-33 |
| Amazon DSP (amazon-dsp-mcp) | 10/min per instance each for read / write (3/write) / reporting | **None found**. OpenAPI declares 429 only; token bucket per endpoint and per-LwA-app scope are corroboration only; live run hit 429 on the first call after 12 min | likely per LwA app per endpoint (unconfirmed); reporting per region, queue-based (corroboration) | **10 (unchanged); do not raise**. 2026-05-15 live finding suggests 3. Keep 429 non-retryable | none (number); corroboration-only (scope, Retry-After) | amzn-docs/.../api-specs/unified-api-dsp.json (429 only); amazon-dsp-http-client.ts:14-18,55-56; docs/plans/2026-05-15-amazon-dsp-live-test-findings.md:58-63; github.com/amzn/ads-advanced-tools-docs issue #344 and discussion #447 (corroboration) |
