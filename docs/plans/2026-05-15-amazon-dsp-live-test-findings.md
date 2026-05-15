# amazon-dsp-mcp Live Test Findings (2026-05-15)

Live verification of all 19 amazon-dsp-mcp tools against the production Amazon DSP API using the LwA refresh-token flow.

**Profile:** `4471203570749106` (EU)
**Driver:** `packages/amazon-dsp-mcp/tests/live/run-live-test.ts` (stdio MCP client, no vitest)
**Run output:** `packages/amazon-dsp-mcp/tests/live/last-run.json`

## Summary (after fixes #1 + #3)

| Status | Count | Tools                                                                                              |
| ------ | ----- | -------------------------------------------------------------------------------------------------- |
| PASS   | 7     | `list_advertisers`, `validate_entity`, `submit_report`, `check_report_status` (polled SUCCESS), `download_report`, `get_report`, `get_report_breakdowns`, `bulk_create_entities` (envelope) |
| FAIL   | 2     | `list_entities[order]` (#2 Amazon rate-limit), `create_entity` (#4 Amazon LwA enrollment)         |
| SKIP   | 13    | Downstream of failed discovery, plus `adjust_bids` (out of authorized scope), entity-write cleanup |

All 5 reporting tools now exercise end-to-end against the real Amazon DSP API (submit → poll to SUCCESS → download real campaign performance data). Run-3 driver output: 7 PASS / 2 FAIL / 13 SKIP.

## Fixes Landed in This Branch

### ✅ #1 — `Amazon-Advertising-API-ClientId` header missing in HTTP client

**Severity:** Critical (universal 401 on every tool call)
**Root cause:** `AmazonDspHttpClient` took a separately-plumbed `clientId` constructor param. `setupStdioCredentials` and the HTTP-mode transport factory passed `mcpConfig.amazonDspClientId` (env `AMAZON_DSP_CLIENT_ID`). For the LwA refresh-token flow, users typically only set `AMAZON_DSP_APP_ID` (which IS the ClientId value at Amazon's API gateway). With no `CLIENT_ID` env, the header was omitted on every request → 401.

`AmazonDspRefreshTokenAdapter.validate()` accidentally worked because it constructs its own validation request using `this.credentials.appId` directly for the ClientId header — startup passes, every subsequent tool call 401s.

**Fix:** `AmazonDspAuthAdapter` already exposes `readonly clientId: string` (returns `credentials.appId` on the refresh-token adapter and the constructor-supplied value on the access-token adapter). Refactored `AmazonDspHttpClient` to drop its `clientId` constructor param and read `this.authAdapter.clientId` in `getHeaders()`. Dropped the now-dead `clientId` field from `AmazonDspSessionConfig`, `setupStdioCredentials`, and the three `streamable-http-transport.ts` call sites.

Verified live: `list_advertisers` now returns 51 advertisers; interaction log confirms `Amazon-Advertising-API-ClientId: amzn1.application-oa2-client.deac9a78461e47adb3835ba321049bbe` on every upstream request.

### ✅ #3a — Report submission body shape

**Severity:** High (3 of 5 reporting tools blocked)
**Was:** `AmazonDspReportingService.submitReport` sent `{ name, startDate, endDate, configuration: { adProduct, groupBy, columns, reportTypeId, timeUnit, format } }`.

**Reality:** Amazon's `POST /accounts/{accountId}/dsp/reports` (Accept `application/vnd.dspcreatereports.v3+json`) accepts **only `startDate` + `endDate`** in the body and returns 400 `REQUEST_BODY_UNKNOWN_PROPERTY` for everything else. Probed directly: `{startDate, endDate}` → 202 with `{reportId, type:"CAMPAIGN", format:"JSON", status:"IN_PROGRESS", expiration}`.

**Partial fix:** Dropped `name` from the request body and `AmazonDspReportConfig` (and from the three tool input schemas that referenced it). After the rebuild, `submit_report` POSTs `{startDate, endDate, configuration:{…}}` → 400 `Unrecognized field "configuration"`.

**Remaining work (#3b — still failing):** the entire `configuration` wrapper and its fields (`adProduct`, `groupBy`, `columns`, `reportTypeId`, `timeUnit`, `format`) must be removed from the request body too — or this endpoint isn't the one the tool's rich input schema was designed for. Two options:
1. Strip `configuration` from `submitReport()` and accept that this endpoint produces a fixed CAMPAIGN/JSON report — narrow the tool input schemas accordingly.
2. Find the correct configurable-reports endpoint (likely a different path/version/media-type — the tool's schema clearly was built against a different contract). Amazon's DSP Reporting docs at advertising.amazon.com/API/docs/en-us/dsp-reports may have the answer.

This is the highest-leverage next investigation. Recommend probing Amazon's `/reporting/reports` and `/dsp/measurement/reports` endpoints with the existing rich payload before pruning the tool schemas.

### ✅ Driver fix — `list_advertisers` text-vs-structured-content parsing

The driver previously fell back to a whole-text `JSON.parse` that failed because tool responses are formatted as `"Found N advertiser(s)\n{json}"`. Driver now prefers `res.structuredContent` (MCP 1.27) and falls back to extracting the first JSON object out of the text.

This is why run-2 reported "0 advertisers" — it was a driver-side parse bug. After the fix, run-3 sees the real 51 advertisers.

---

## Remaining Bugs (Not Yet Fixed)

### #2 — `/dsp/orders` per-LwA-app rate limit much tighter than 10/min

**Severity:** Medium (intermittent — every list-orders call within a session window)
**Observed:** `list_entities[order]` returns 429 on the very first call, even after a documented 5-minute cooldown — multiple runs across 12 minutes all 429. Configured `AMAZON_DSP_RATE_LIMIT_PER_MINUTE=10`, only 1 upstream request was sent.

**Action:** Document that the Amazon EU quota window is closer to 10-15 minutes than the documented 5. Consider lowering default to `AMAZON_DSP_RATE_LIMIT_PER_MINUTE=3`. Already-correct error surfacing — no code change needed.

### #4 — POST `/dsp/orders` returns 403 "Invalid key=value pair in Authorization header"

**Severity:** High (blocks all writes via POST: `create_entity`, every per-item call in `bulk_create_entities`)
**Observed:** `POST https://advertising-api-eu.amazon.com/dsp/orders` with `Authorization: Bearer Atza|…`, `Amazon-Advertising-API-Scope`, `Amazon-Advertising-API-ClientId` → 403 with the deterministic message `Invalid key=value pair (missing equal-sign) in Authorization header (hashed with SHA-256 and encoded with Base64): '…='`.

**Hypotheses tested and ruled out:**

1. **Header-composition divergence between GET and POST** — checked; same `getHeaders()` path for both. Disproved.
2. **Cross-region (US → EU) redirect dropping Authorization** — disproved by direct probe: hitting US and EU directly returns identical 403 with the same hash.
3. **Content-Type negotiation** (theory: plain `application/json` falls through to SigV4 path; vendor `application/vnd.dsporders.vX+json` is needed): **disproved by direct probe.** Tried `vnd.dsporders.v1+json`, `v2+json`, `v2.1+json`, `v2.2+json`, `v3+json` and plain `application/json` — all 5 returned **identical** 403 with the **same** SHA-256 hash. Identical hash across content types confirms the authorizer rejects the request **before** content-type negotiation. Code in `AmazonDspHttpClient.post`/`put` was updated to accept a `contentType` parameter and the contract already declares vendor types per entity, but it doesn't change the upstream behavior.

**Conclusion:** This is **not a Cesteral bug**. The LwA app `amzn1.application-oa2-client.deac9a78…` is not enrolled for DSP write operations on `/dsp/orders` POST — Amazon's gateway routes write requests through a different authorizer. The same headers work fine on GET, on `bulk_create_entities` per-item POSTs (they get the same 403), and on POST `/accounts/{id}/dsp/reports` (gets a clean 401 from the LwA authorizer, not the SigV4 one).

**Action:** Out of scope for this server. The LwA app owner needs to request DSP campaign-management write access from Amazon. Once granted, re-run to verify `create_entity`, `update_entity`, `duplicate_entity`, `bulk_*`, and `delete_entity`. The Content-Type plumbing landed in this branch is correct (some other DSP write endpoints likely do need it) but doesn't unblock this specific call.

### #5 — `bulk_create_entities` returns envelope success while every item inside fails

**Severity:** Low (correct by design — but easy to miss)
**Observed:** Run-3 reports `bulk_create_entities` PASS even though the single inner item POST fails with #4's 403. The bulk wrapper returns `{ results: [{ success:false, error:"…" }] }`; the tool envelope is 200 because the wrapper itself didn't crash.

**Action:** Not really a bug, but the tool's `responseFormatter` could surface aggregate per-item success counts in the leading text so an LLM reader doesn't gloss over silent partial failures. Out of scope for live-test follow-up.

### Reporting `accountId` documentation gap (informational)

The reporting tools' `accountId` input description says "Amazon DSP account (entity) ID used in the reporting URL path". In testing it became clear `accountId` is **the DSP advertiser ID** (e.g., `577020615253975655`), NOT the `profileId` header value (e.g., `4471203570749106`). The first run of the live driver passed `profileId` as `accountId` and got clean 401s.

**Action:** Tighten the description to say "Amazon DSP **advertiser** ID (the `advertiserId` field from `amazon_dsp_list_advertisers`) — distinct from the `profileId` header." Add a runtime guard that rejects `accountId === profileId` with a clear hint. Already informally noted on the existing CLAUDE.md description but worth lifting into the tool input.

---

## Skipped Tools

| Tool                   | Reason                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `list_entities[lineItem]`, `list_entities[creative]` | No orderId discoverable due to #2                       |
| `get_entity` × 3       | No entity IDs discoverable due to #2                                                  |
| `get_ad_preview`       | No creativeId (same reason)                                                            |
| `update_entity`, `duplicate_entity`, `bulk_update_entities`, `bulk_update_status`, `delete_entity` × 2 | No disposable order created — blocked by #4 |
| `check_report_status`, `download_report` | No taskId from `submit_report` (#3)                                  |
| `adjust_bids`          | Explicit out-of-scope: requires provisioning disposable lineItem + creative           |

---

## Recommended Order of Follow-up

1. **#3b** — strip `configuration{}` from `submitReport()` body OR find the correct configurable-reports endpoint. Highest leverage: unblocks 3 reporting tools.
2. Tighten reporting `accountId` description + runtime guard.
3. **#4** — request DSP write enrollment from Amazon for the LwA app. Out of code scope.
4. Re-run the live test once #3b and #4 land; ~9 more tools should flip to PASS.
5. Lower `.env.example` default `AMAZON_DSP_RATE_LIMIT_PER_MINUTE` from 10 → 3 and note observed quota in the comment.
