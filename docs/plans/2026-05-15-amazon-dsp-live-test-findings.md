# amazon-dsp-mcp Live Test Findings (2026-05-15)

Live verification of all 19 amazon-dsp-mcp tools against the production Amazon DSP API using the LwA refresh-token flow.

**Profile:** `4471203570749106` (EU)
**Driver:** `packages/amazon-dsp-mcp/tests/live/run-live-test.ts` (vitest-independent stdio MCP client)
**Run output:** `packages/amazon-dsp-mcp/tests/live/last-run.json`

## Summary

| Status | Count | Notes                                                                                    |
| ------ | ----- | ---------------------------------------------------------------------------------------- |
| PASS   | 3     | `list_advertisers`, `validate_entity`, `bulk_create_entities` (suspicious — see #4)      |
| FAIL   | 5     | `list_entities`, `submit_report`, `get_report`, `get_report_breakdowns`, `create_entity` |
| SKIP   | 15    | Downstream of failed discovery; `adjust_bids` (scope); cleanup                           |

Run-1 results were obscured by **Bug #1** (clientId header missing → universal 401). Run-2 after the fix surfaces the remaining real findings #2–#4.

## Bugs Found

### #1 — `Amazon-Advertising-API-ClientId` header missing in stdio refresh-token flow ✅ FIXED

**Severity:** Critical (every tool call 401s)
**Root cause:** `packages/amazon-dsp-mcp/src/index.ts` `setupStdioCredentials` passed `clientId: mcpConfig.amazonDspClientId` (env `AMAZON_DSP_CLIENT_ID`) into `createSessionServices`. For the LwA refresh-token flow, users typically only set `AMAZON_DSP_APP_ID` (which IS the ClientId at the Ads API gateway). With no `CLIENT_ID` env, the HTTP client omitted the header entirely and Amazon returned 401 on every data-plane call.

`AmazonDspRefreshTokenAdapter.validate()` worked by accident because it builds its own validation request using `this.credentials.appId` directly for the ClientId header — so startup passes, then every tool call fails.

**Fix applied:** `src/index.ts` now derives `httpClientId` as `amazonDspClientId ?? amazonDspAppId` for the refresh-token branch. Build green; `list_advertisers` PASS after rebuild.

**Follow-up:** The static-access-token path already plumbs `mcpConfig.amazonDspClientId` directly. Consider whether the HTTP-mode `AmazonDspBearerAuthStrategy` has the same surface (out of scope for this run).

---

### #2 — `list_entities` rate-limited at very first call (429)

**Severity:** Medium (observability) / Low (intermittent)
**Observed:** First `list_entities[order]` immediately after a successful `list_advertisers` returned 429 with `"Too Many Requests"`. Configured `AMAZON_DSP_RATE_LIMIT_PER_MINUTE=10`; only 1 request had been sent. Suggests the per-LwA-app rolling-window quota at Amazon is tighter than 10/min (or accumulated from prior runs/validates).

**Action:** Not a server bug per se — Amazon's docs warn about this on `/dsp/orders`, `/dsp/lineItems`, `/dsp/creatives`. The error message Cesteral surfaces is already correct ("wait at least 5 minutes"). No code change needed; could lower default `AMAZON_DSP_RATE_LIMIT_PER_MINUTE` from 10 to 5 to match observed reality.

---

### #3 — Reporting endpoints `/accounts/{accountId}/dsp/reports` return 401

**Severity:** High (3 of 5 reporting tools blocked)
**Observed:** `submit_report`, `get_report`, `get_report_breakdowns` all POST to `https://advertising-api-eu.amazon.com/accounts/4471203570749106/dsp/reports` and receive 401 Unauthorized.

GET `/dsp/advertisers` succeeded with the same headers in the same run, so the bearer token IS valid for the entity-management API. The 401 is specific to the `/accounts/{accountId}/dsp/reports` path.

**Probable cause:** Reports API uses `accountId` (DSP entity ID), distinct from the `profileId` header. The driver passed the advertiser's `profileId` (4471203570749106) as `accountId`, which is documented as wrong in CLAUDE.md ("Reporting v3 is scoped by `accountId` (DSP entity ID) in the URL path, distinct from the profile header"). Worth confirming whether 401 is the right error code for "accountId not found" — it should probably be 404. Either way, the server is not at fault if the account ID is wrong; but the tool inputs make it easy to confuse the two.

**Action:** Improve the `accountId` description on report tools, or add a runtime check that rejects an `accountId` equal to the profile header.

---

### #4 — `create_entity` (POST) returns 403 "Invalid key=value pair in Authorization header"

**Severity:** High (blocks all writes via POST: `create_entity`, `bulk_create_entities` partial)
**Observed:** POST `/dsp/orders` → 403 `Invalid key=value pair (missing equal-sign) in Authorization header (hashed with SHA-256 and encoded with Base64): 'TIQBF8laWkg20w8y4lC8s08XrPbhMYJtJwG+bI7/tp8='`.

Same `Bearer …` token works for GET requests in the same session. The base64 hash is of the Authorization header value as Amazon's gateway saw it. The hex/base64 shape suggests the gateway tried AWS SigV4 parsing on the value.

**Hypotheses to verify:**

1. The bearer token contains whitespace/control characters that survive into the header on POST but not GET (e.g., a trailing `\n` from the LwA token response not being trimmed).
2. The HTTP client adds a duplicate or malformed `Authorization` header on POST that doesn't appear on GET — look at `src/services/amazon-dsp/amazon-dsp-http-client.ts` `post()` vs `get()` for divergence in how headers are composed.
3. The 30x redirect from US→EU drops or mutates the Authorization header differently for POST.

**Suspicious side effect:** `bulk_create_entities` returned PASS at the MCP envelope level but `bulkCreatedOrderId=undefined`. The bulk wrapper likely treats per-item 403s as soft failures and returns success at the envelope; this should be re-examined once #4 is fixed.

**Recommended next step:** Add a debug log of the exact Authorization header bytes (`Buffer.from(token).toString('hex')`) in `getHeaders()` for POST, plus enable `fetchWithTimeout` request-body logging. Re-run and compare token bytes vs the SHA-256 hash Amazon returns.

---

### #5 — `list_advertisers` returns 0 advertisers

**Severity:** Informational / Configuration
**Observed:** With clientId fixed, `list_advertisers` returns HTTP 200 + empty array. Suggests the LwA refresh token / profile combination doesn't actually have DSP advertiser visibility, or the LwA app is not enrolled for DSP entities. Token validity at `/dsp/advertisers` is necessary but not sufficient.

**Action:** Verify the configured `AMAZON_DSP_APP_ID` is enrolled for the DSP API surface (vs Sponsored Ads), and the refresh token belongs to a user with at least one advertiser association on the profile. This is account configuration, not a server bug.

---

## Driver Quirks (Not Bugs)

- The driver originally passed `operation: "create"` to `validate_entity` (tool expects `mode`) and `entities: [...]` to `bulk_create_entities`/`bulk_update_entities` (tools expect `items`). These are inconsistencies _between_ tool input schemas worth noting but not server bugs — both `operation` vs `mode` and `entities` vs `items` would be more consistent if normalized across the package. Driver was fixed mid-run.

---

## Skipped Tools (Justified)

| Tool                   | Reason                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `get_entity` × 3       | No entity IDs discoverable due to #2 (`list_entities[order]` 429) and zero advertisers from #5         |
| `get_ad_preview`       | Same — no creativeId                                                                                   |
| `update_entity`        | No disposable order created (blocked by #4)                                                            |
| `duplicate_entity`     | Same                                                                                                   |
| `bulk_update_entities` | Same                                                                                                   |
| `bulk_update_status`   | Same                                                                                                   |
| `delete_entity` × 2    | Same                                                                                                   |
| `check_report_status`  | No taskId from `submit_report` (#3)                                                                    |
| `download_report`      | Same                                                                                                   |
| `adjust_bids`          | Requires a disposable lineItem (would need a creative too); explicitly out of scope per user direction |

---

## Recommended Order of Fixes

1. **#1 already merged in this branch.** Rebuild + sanity-check with a fresh refresh token.
2. **#4** — debug the POST Authorization header malformation. Likely a one-line fix once the divergence is located.
3. Re-run the live test once #4 is fixed; the disposable-order flow should then unblock 9 more tools (update/duplicate/bulk\_\*/delete).
4. **#3** — clarify reporting `accountId` semantics in tool descriptions and validate at boundary.
5. **#2** — lower `AMAZON_DSP_RATE_LIMIT_PER_MINUTE` default from 10 to 5 in `.env.example`.
6. **#5** — separately, verify Amazon LwA app enrollment and refresh-token entitlements.
