# Progressive Discovery & Tool Search Improvements

**Status:** Implemented (2026-05-03)
**Date:** 2026-05-03
**Owner:** TBD
**Related:**
- `docs/plans/2026-04-16-reporting-consistency.md` (precedent for shared-helper rollout pattern)
- Commit `c7a21d8` — `feat(shared): progressive-discovery, uniform pagination, structured errors`
- Commit `e11b56e` — `refactor: collapse TTD workflow tools, enrich validate enums, add nextAction hook`

## Goal

Make the 13 MCP servers easier for an LLM client to navigate by:

1. **Progressive discovery** — keep tool inputSchemas small, push enum/field details into MCP Resources, and wire structured `nextAction` / `suggestedValues` hints through every error and validation path so the model can self-recover instead of guessing.
2. **Tool search** — give servers with 20+ tools a first-class way to surface a relevant subset to the model, instead of paying the tool-listing tax on every interaction.

## Non-goals

- New ad-platform features or coverage.
- Changing the MCP transport, auth, or session model.
- Backwards-compatibility shims (per `feedback_no_backward_compat.md`). Tool renames/collapses are free; this repo is pre-production.

## Current state (audit summary)

Shared helpers already exist but adoption is uneven:

| Helper | File | Adopted by | Missing from |
|---|---|---|---|
| `ErrorHandler` / `McpError` (with `nextAction`, `suggestedValues`) | `packages/shared/src/utils/mcp-errors.ts` | dbm, dv360, msads, cm360, ttd | gads, meta, linkedin, tiktok, sa360, pinterest, snapchat, amazon-dsp |
| `buildPaginationOutput()` / `formatPaginationHint()` | `packages/shared/src/utils/pagination.ts` | most list tools | needs full sweep — some ad-hoc pagination remains |
| `ValidationIssue[]` + `validateEntityResponseFormatter` | `packages/shared/src/utils/client-validation-helpers.ts` | meta, linkedin, tiktok, amazon-dsp, msads | ttd, dv360, cm360, gads, sa360, pinterest, snapchat |
| `registerStaticResourcesFromDefinitions()` | `packages/shared/src/utils/resource-handler-factory.ts` | most servers | no URI-template variant for parameterized resources (e.g. `entity-schema://{type}`) |
| `report-csv://` resource | `packages/shared/src/utils/report-csv-resource.ts` | ttd, tiktok, snapchat, amazon-dsp, pinterest, msads | gads (only server still missing) |

Largest tool inputSchemas (candidates for enum extraction):

| File | Lines | Issue |
|---|---|---|
| `packages/ttd-mcp/src/mcp-server/tools/definitions/validate-entity.tool.ts` | 387 | inline PACING_MODES, CURRENCIES, required-field rules |
| `packages/dv360-mcp/src/mcp-server/tools/definitions/bulk-update-status.tool.ts` | 361 | inline status/targeting enums |
| `packages/dv360-mcp/src/mcp-server/tools/definitions/create-custom-bidding-algorithm.tool.ts` | 357 | inline bidding-strategy enums |
| `packages/meta-mcp/src/mcp-server/tools/definitions/validate-entity.tool.ts` | 327 | 8+ inline `.enum()` blocks (CAMPAIGN_OBJECTIVES, ADSET_OPTIMIZATION_GOALS, etc.) |
| `packages/msads-mcp/src/mcp-server/tools/definitions/validate-entity.tool.ts` | 269 | inline enums + field rules |

Tool count by server (relevant for tool-search):

| Server | Tools | Tool-search candidate |
|---|---|---|
| ttd | 51 | yes — already partly collapsed |
| meta | 26 | yes |
| dv360 | 25 | yes |
| msads | 24 | yes |
| tiktok | 23 | borderline |
| pinterest | 22 | borderline |
| snapchat | 22 | borderline |
| linkedin | 20 | borderline |
| cm360 | 20 | borderline |
| amazon-dsp | 18 | no |
| sa360 | 16 | no |
| gads | 15 | no |
| dbm | 6 | no |

## Plan

Four phases, ordered by leverage and risk. Each phase is independently shippable.

---

### Phase 1 — Standardize error & validation surface (mechanical, highest leverage)

**Outcome:** every tool failure across every server returns a structured `McpError` with optional `nextAction` and `suggestedValues`, and every `validate-entity` tool emits `ValidationIssue[]` through the shared formatter.

**Tasks:**

1. **Sweep error handling** in the eight servers without `ErrorHandler`:
   - `gads-mcp`, `meta-mcp`, `linkedin-mcp`, `tiktok-mcp`, `sa360-mcp`, `pinterest-mcp`, `snapchat-mcp`, `amazon-dsp-mcp`.
   - For each: replace ad-hoc try/catch + string responses with `ErrorHandler.handleError()` (or `McpError.fromError()` when re-throwing inside service code).
   - Add platform-specific `nextAction` hints where the recovery is obvious, e.g. invalid `adAccountId` → `"Call meta_list_ad_accounts to discover valid accounts."`.

2. **Migrate `validate-entity` tools** in the seven servers still using flat strings (ttd, dv360, cm360, gads, sa360, pinterest, snapchat) to `ValidationIssue[]` + `validateEntityResponseFormatter`. Each issue carries `field`, `code`, `message`, optional `suggestedValues`, optional `nextAction`.

3. **Add a shared `buildNextAction()` helper** in `packages/shared/src/utils/mcp-errors.ts` that takes a kind (`"discover-account"`, `"list-entity"`, `"check-status"`, `"read-resource"`) plus parameters, and returns a structured hint object. Use it from both error paths and validation paths so wording stays consistent.

4. **Per-server tests**: add a unit test per server that exercises one validation failure path and asserts the error includes `nextAction`. Cheap insurance against regression.

**Acceptance:**
- `grep -L 'ErrorHandler' packages/*/src/mcp-server/tools/definitions/*.ts` returns nothing (modulo files that legitimately have no error path).
- All `validate-entity` tools share the same response shape.

---

### Phase 2 — Move enum bloat into MCP Resources

**Outcome:** the five oversized tool files shrink by ≥60%, with their enum tables served from parameterized MCP Resources the model can fetch on demand.

**Tasks:**

1. **Add URI-template support** to `resource-handler-factory.ts` — a `registerTemplatedResourcesFromDefinitions()` helper that takes a URI pattern (e.g. `entity-enums://{platform}/{entityType}`) and a resolver function. Mirrors the static helper's API so existing call sites are untouched.

2. **Extract enums** to resources, one server at a time:
   - **ttd**: move `PACING_MODES`, `CURRENCIES`, ad-group/campaign required-field rules to `ttd-field-rules://{entityType}`. Trim `validate-entity.tool.ts` to the minimum schema needed to dispatch.
   - **dv360**: move status, targeting-type, and bidding-strategy enums to `dv360-enums://{kind}`. Update `bulk-update-status.tool.ts` and `create-custom-bidding-algorithm.tool.ts` to reference the resource via tool description.
   - **meta**: extract `CAMPAIGN_OBJECTIVES`, `ADSET_OPTIMIZATION_GOALS`, `CUSTOM_AUDIENCE_SUBTYPES`, `BILLING_EVENTS`, status enums to `meta-enums://{kind}`.
   - **msads**: same treatment for `validate-entity.tool.ts` and `get-report-breakdowns.tool.ts`.

3. **Tool-description convention**: any tool whose schema accepts an enum-keyed field must end its description with `"Valid values: see resource <uri>."`. Codify in `docs/CROSS_SERVER_CONTRACT.md`.

4. **Schema-size guard**: extend the existing `tests/test-schema-size.cjs` pattern (currently dv360-only) to all servers, fail the test at >256 KB serialized for a single tool. Tracks regressions.

**Acceptance (revised on execution, 2026-05-03):**
- Three enum-heavy validate-entity files trimmed below the target: ttd 387→295, meta 327→241, msads 269→180. (The original "<150 lines" target was unrealistic once handler logic was kept inline; the reduction was driven by enum extraction, which these three files needed.)
- dv360's two large files (`bulk-update-status` 361, `create-custom-bidding-algorithm` 357) intentionally **not** trimmed — their size is real handler logic, not enum tables, so the resource-extraction technique does not apply. Documented in commit `34259b5`.
- `pnpm run test` includes a per-server schema-size assertion (256 KB/tool, 1 MB aggregate) across all 13 servers.

---

### Phase 3 — Fill resource gaps & sweep pagination

**Status (2026-05-03):** Re-audit on execution found the resource gaps the plan called out were already closed; only the pagination conformance work remained. **Done.**

**Original tasks vs. reality on execution:**

1. ~~**Add `report-csv://`** to gads-mcp~~ — **N/A.** gads-mcp has no async report-download flow with a CSV body to spill; reporting is GAQL streaming JSON via `gads_gaql_search` / `gads_get_insights`. The plan was wrong to list this — the audit table at the top of this doc reflected the earlier mental model that gads "needs" CSV; it does not.

2. ~~**Add `entity-schema://` + `entity-examples://`** to snapchat-mcp~~ — **already shipped.** `packages/snapchat-mcp/src/mcp-server/resources/definitions/entity-schemas.resource.ts` and `entity-examples.resource.ts` exist.

3. ~~**Add per-query-type schema resources** to dbm-mcp~~ — **already covered.** `dbm-mcp` exposes `report-types` (with per-report-type metric/filter mapping), `metric-types`, `filter-types`, `query-examples`, and `compatibility-rules` (1,285 lines combined, dynamically generated). No clear additional resource is missing without a more concrete user pain report.

4. **Pagination sweep** — done. Every list tool that has an `outputSchema.pagination` field uses the canonical shape; tools without one (`list_accounts`/`list_user_profiles`/`list_advertisers`/etc.) legitimately return all results in one shot. No ad-hoc `{ next_cursor }`/`{ bookmark }`/`{ pageToken }` blocks were found.

5. **Pagination conformance test** — added.
   - Helper: `findPaginationConformanceViolations()` in `packages/shared/src/utils/pagination.ts` walks tool `outputSchema`s and reports any `pagination` field whose Zod shape diverges from `PaginationOutputSchema` (missing required key, unexpected extra key).
   - Per-server test: `tests/pagination-conformance.test.ts` (under `tests/tools/` for ttd) imports each server's `allTools` and asserts no violations.
   - Negative paths covered by unit tests on the helper itself.

**Acceptance — met:**
- 13/13 servers have `tests/pagination-conformance.test.ts` and pass.
- Helper unit tests cover missing-required-key and unexpected-key paths.

---

### Phase 4 — Tool search dispatcher (optional, do last)

**Outcome:** servers with 20+ tools expose a single `{platform}_search_tools` tool that returns the most relevant subset for a natural-language query, so callers can avoid paging through full inventories.

**Tasks:**

1. **Add a shared factory** `createToolSearchTool(allTools, { platform })` in `packages/shared/src/utils/`. Returns a tool definition whose handler does:
   - Tokenize `query`, score each registered tool's `name + title + description` (BM25 or simple TF; no need for an embedding model).
   - Filter by optional `category` / `entityType` parameters if the registry exposes them.
   - Return `{ tools: [{ name, title, description, score }], totalRegistered }`.

2. **Wire** the search tool into the seven 20+ tool servers: ttd, meta, dv360, msads, tiktok, pinterest, snapchat (and linkedin/cm360 if measurement shows benefit).

3. **Document the discovery flow** in `docs/CROSS_SERVER_CONTRACT.md`:
   1. Client calls `{platform}_search_tools(query)` for narrowing.
   2. Client invokes the matched tool.
   3. On validation/lookup error, follow `nextAction` (often `read-resource`) for enum/field details.

**Acceptance:**
- All 20+ tool servers expose `{platform}_search_tools`.
- Discovery flow documented with one worked example per server.

---

## Sequencing rationale

- **Phase 1 first** because it is mechanical, low-risk, and unblocks the rest: once every error has `nextAction`, Phases 2–4 can lean on it.
- **Phase 2 before 3** because the schema-size guard introduced in Phase 2 makes Phase 3's resource additions safer to land.
- **Phase 4 last** because it is the only phase that adds new surface area; the prior phases may make it unnecessary if model behavior improves enough.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Tool renames break existing client configurations | Repo is pre-production (`project_pre_production.md`); document renames in commit messages, no aliases. |
| Resource fetches add latency vs inline enums | Resources are cacheable by client; inline-enum tax was paid on every tool list anyway. |
| Tool-search adds a new failure mode if it returns nothing useful | Phase 4 is gated on Phases 1–3 demonstrably improving discoverability; reassess before starting. |
| Schema-size guard rejects legitimately large tools | Threshold (256 KB) is generous; current largest is ~30 KB. |

## Open questions

1. Should `nextAction` be a typed discriminated union (`{ kind: "read-resource", uri }` / `{ kind: "call-tool", name, args }`) or freeform string? Typed gives clients more leverage; string is simpler. **Lean: typed.**
2. Should `{platform}_search_tools` be one-per-server or one global cross-platform search registered by every server? Cross-platform invites confusion at the MCP boundary. **Lean: one-per-server.**
3. Do we backfill the schema-size test for the existing oversized files, or only enforce on new files? **Lean: backfill once Phase 2 lands.**

## Estimated effort

- Phase 1: 3–4 days (mechanical, well-bounded).
- Phase 2: 4–5 days (one server at a time, plus URI-template helper).
- Phase 3: 2 days (mostly mechanical).
- Phase 4: 2–3 days (single shared factory + wiring).

**Total: ~12–14 engineering days.**
