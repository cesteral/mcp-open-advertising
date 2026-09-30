# Fleet review: consolidated summary (2026-09-24)

There are 15 review reports in this directory: one per server, ttd-mcp split into REST and GraphQL, and one cross-fleet report. Together they hold about 377 findings. No repo files were modified.

**Evidence basis.** Every vendor's documentation website was blocked by the egress proxy. Reviewers used vendor sources that could be reached instead:
- Google's Discovery docs (live, per-version API schemas)
- Pinterest's OpenAPI spec
- TikTok's official SDK
- Amazon's `ads-advanced-tools-docs` repo
- a `git clone` of the MicrosoftDocs/Advertising repo
- TTD's GitHub sample repo and SDK

Each finding is labelled live-doc, code-only or model-knowledge. Meta, Snapchat and LinkedIn rest mostly on search snippets. Items tagged ✔ were spot-checked in code by the orchestrator.

## P0: can spend money, leak credentials, or cause damage that can't be undone
1. ✔ **ttd: sandbox mode can write to production.** `.env.example:62` sets `TTD_API_BASE_URL` to prod, and that value overrides `TTD_USE_SANDBOX` (config/index.ts:61-63). Only GraphQL moves to the sandbox.
2. ✔ **cm360 and sa360 send the user's Google Bearer token to any URL the caller supplies** (`download_report`). amazon-dsp, msads, pinterest, snapchat and tiktok fetch any URL without auth (SSRF). TTD's allowlist admits all of `*.amazonaws.com`.
3. **Irreversible statuses are not declared terminal on 9 servers:** gads REMOVED, ttd Archived, tiktok DELETE, msads Deleted, cm360 PERMANENTLY_ARCHIVED, linkedin CANCELED, and ARCHIVED on meta, pinterest and amazon. They are reached through `update_entity`/`bulk_update_status`, and the ratchet can't see status-dependent terminality. Only dv360 declares them.
4. **Writes that silently target the wrong thing or the wrong amount:**
   - pinterest `get_entity` returns the wrong entity, so duplicate, adjust_bids and update snapshots use it.
   - pinterest `adjust_bids` writes bids 1e6× too low.
   - msads `duplicate_entity` copies Active status.
   - cm360 update is a full PUT built from a partial object, while the dry-run predicts a merge.
   - msads and pinterest batch writes report success on HTTP 200 partial failures.
5. **ttd GraphQL bulk:** the mutation bulk tool can run up to 1000 non-cancellable, never-live-tested mutations. It uses the wrong status enum and variable shape, and has no error fields.

## P1: core paths broken against the current API
| Server | Headline (verified basis) |
|---|---|
| gads | `pageSize` in every search → `PAGE_SIZE_NOT_SUPPORTED`; `campaign.start_date/end_date` removed in v23 (Discovery) |
| dv360 | IO duplicate forces PAUSED (only DRAFT allowed); LI duplicate drops targeting (native `:duplicate` exists); `generateDefault` / `creative.previewUrl` don't exist (Discovery) |
| dbm | async tool unusable (no task store, confirmed by boot); retry loop retries 4xx for up to about 72 min; saved queries leak |
| cm360 | ✔ rate limiter never enforces (key `cm360` vs pattern `cm360:*`); several invalid enum values (Discovery) |
| sa360 | default queries use fields absent in v0; `change_event` missing; conversion upload uses `gclid`/`floodlightActivityId` instead of `clickId`/`segmentationId`, and has no `conversionId` (Discovery) |
| meta | pagination never ends; `INHERITED` should be `INHERITED_FROM_SOURCE`; rate-limit codes 80000–80014/613 not retried (snippets / model knowledge) |
| linkedin | ✔ `/rest/adAnalytics` built in Rest.li 1.0 query style under a 2.0 header; 11 `/v2/` call shapes likely dead; ✔ `.env.example` pins expired `202501` (snippets) |
| msads | ✔ wrong paths `/AdExtensionsAssociations`, `/ImportResults/QueryByIds`; updates/bulk omit parent IDs; `Bid` not `{Amount}`; report "schedules" don't exist; campaign list is Search-only (docs clone) |
| tiktok | `Authorization: Bearer` instead of the `Access-Token` header (could break every session); async report chain likely never completes; missing required fields (vendor SDK) |
| pinterest | 7 tools call endpoints or shapes that don't exist; DELETE is unsupported; reports send `type` not `level` (OpenAPI) |
| snapchat | create doesn't inject parent IDs; breakdowns go to `fields` not `report_dimension`; UTC day bounds; metrics 1e6× off; deprecated `objective`/`placement` (snippets) |
| amazon-dsp | ✔ `Amazon-Advertising-API-ClientId` sent where v1 needs `Amazon-Ads-ClientId`; forecast is missing `Amazon-Ads-AccountId`; `/dsp/orders` two generations old; three contradictory reporting contracts (Amazon repo) |
| ttd REST | likely `TotalCount` vs `TotalFilteredCount`, so pagination stops at page 1; bid-list GraphQL errors swallowed; core REST endpoints marked DEPRECATED/LEGACY in vendored docs |

## Fleet-wide patterns (fix once)
1. ✔ **`RateLimiter.consume` throws rather than waits** (shared/rate-limiter.ts:68). With low defaults and 3-token writes, "max 50" bulk tools fail after 2–7 items, and batches end up half-applied. Keys like `meta:default` are shared by all tenants. The sa360 `sa360v2:*` keys are also never enforced.
2. **Tests assert against self-authored mocks.** Many pin the wrong behaviour (linkedin analytics, msads Bid, snapchat breakdowns, sa360 14/17 schema-only). The mocks need to be derived from vendor specs.
3. **Copy-paste drift between servers:** pinterest/snapchat took TikTok's shapes and docs; cross-platform prompts exist in 6 drifted variants across 12 servers; prompts name tools that don't exist (amazon, pinterest, `snapchat_upload_media` on 10 servers).
4. **Contract/schema issues:**
   - `msads_get_entity`, `msads_update_entity` and `dv360_duplicate_entity` advertise empty input schemas, because the top-level Zod union isn't flattened. `definitionHash` is computed over `{}`.
   - gads mixes `google_ads.*` and `gads.*` contract namespaces.
   - Annotation hints are inconsistent across servers for the same operation.
   - Bulk result shapes break CROSS_SERVER_CONTRACT.
5. **Version currency:**
   - gads v23 → latest v25
   - meta v25 → v26 (v26 breaking changes reportedly apply to all versions from 2026-10-27)
   - linkedin 202608 → 202609 exists
   - sa360: v23 is now the preferred version, with mutates, so the CLAUDE.md "read-only" note is stale
   - dbm: an unlisted v3 is already served
   - msads v13 REST is correct (SOAP off 2027-01-31)
   - dv360 v4 and cm360 v5 are current
6. **Docs drift:** package READMEs have wrong tool counts and rate limits on nearly every server. CLAUDE.md says 19 platform facts (there are 28) and names `spillCsvToGcs`, which doesn't exist. The pinterest `retryNonIdempotent` row describes dead code.

## Suggested ratchets (from the cross-fleet report)
- a Zod input with parameters must advertise at least one wire property
- limiter key literals must match the configured pattern
- one contract slug per package
- status enums containing irreversible values must be declared terminal
- prompt and resource text may name only registered `{prefix}_*` tools
- download tools must use a host allowlist, and a token may only go to the platform host

Several fixes change `definitionHash` on governed tools. Batch them into one coordinated contract bump with the governance repo.
