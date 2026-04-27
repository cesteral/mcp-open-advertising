# Reporting Consistency & Improvement — Design

**Date:** 2026-04-16
**Status:** Approved, awaiting implementation plan
**Scope:** All 12 reporting-capable MCP servers (treating `dbm-mcp` as DV360's reporting server)

## Background

An audit of reporting features across every MCP server surfaced 10 distinct inconsistencies and improvement opportunities:

1. LinkedIn is the only server not on the bounded report-view contract.
2. `report-csv://` MCP resources only exist in `pinterest-mcp`; TTD, TikTok, Snapchat, Amazon DSP, and MSADS all return CSV payloads inline.
3. Async polling loops are re-implemented in 9 servers with subtly different backoff logic.
4. CSV parsing is duplicated across 7 servers despite a shared helper existing.
5. Computed metrics (CPA/ROAS/CPM/CTR/CPC) are inlined per server with inconsistent flag naming and default behavior.
6. `*_check_report_status` tools return platform-shaped payloads, not a canonical shape.
7. Meta and SA360 have no metric/field discovery tool; users must guess column names.
8. Platforms with native scheduling support (Meta, SA360) don't expose it; platforms with scheduling (TTD, CM360, MSADS) return inconsistent list/get shapes.
9. Error mapping is inconsistent — some servers pass raw API errors, others wrap in `McpError` without platform context.
10. Reports over ~100k rows risk OOM or timeout because bounded views still buffer the full CSV in memory.

## Decisions from Brainstorming

- **Scope:** All 10 items.
- **Rollout:** Phased by dependency.
- **Verification:** Unit tests + fixture-based integration tests; no live API.
- **Scheduling:** Native-only — skip platforms where the upstream API doesn't support it.
- **CSV streaming:** GCS-backed spill for reports above a threshold.
- **Approach:** Foundation-first (Approach A). Build shared helpers → adopt across servers → per-server features → streaming.

## Architecture

`@cesteral/shared` is the single contract authority. New modules (all under `packages/shared/src/`):

- `utils/report-polling.ts` — `pollUntilComplete<T>(fetchStatus, isComplete, ...)` with exponential backoff, max attempts, and `AbortSignal` support.
- `utils/report-csv.ts` — single UTF-8-boundary-safe parser handling RFC 4180 quoting and CRLF/LF normalization.
- `utils/report-computed-metrics.ts` — canonical `computeMetrics(rows)` plus `ComputedMetricsFlagSchema` for the opt-in `includeComputedMetrics` flag.
- `schemas/report-status.ts` — `ReportStatusSchema` with states `pending | running | complete | failed | cancelled`, plus `from{Platform}Status` normalization helpers.
- `utils/report-errors.ts` — `ReportingError extends McpError` and `mapReportingError(err, platform)` covering TTD, Meta, Google RPC, Microsoft error envelopes.
- `utils/report-csv-store.ts` — extended with `createSessionScopedStore(sessionId)` for deterministic cleanup.
- `utils/report-spill.ts` _(Phase 4)_ — GCS-backed spill; signed URLs; session-scoped lifecycle.

Dependency direction stays linear: servers → shared.

## Phase 1 — Shared Infra

Five independently mergeable PRs against `@cesteral/shared`.

### 1.1 `pollUntilComplete`

```ts
pollUntilComplete<T>({
  fetchStatus: () => Promise<T>,
  isComplete: (s: T) => boolean,
  isFailed?: (s: T) => boolean,
  initialDelayMs?: number,   // default 2000
  maxDelayMs?: number,       // default 30000
  maxAttempts?: number,      // default 60
  backoffFactor?: number,    // default 1.5
  signal?: AbortSignal,
}): Promise<T>
```

Throws `ReportTimeoutError` on max attempts, `ReportFailedError` when `isFailed` returns true. Unit tests cover: happy path, failure propagation, timeout, abort, backoff schedule.

### 1.2 Consolidated CSV parser

Exposes `parseCSV(text, options)` returning `{ headers, rows }` with RFC 4180 quote handling, CRLF/LF normalization, UTF-8 boundary safety, and configurable header aliasing.

### 1.3 Canonical computed metrics

Exports `computeMetrics(rows, columnMap?)` and `ComputedMetricsFlagSchema`. Handles CPM, CPC, CTR, CPA, ROAS; detects impression/click/spend/conversion columns via aliases; emits a structured warning if an input column is missing rather than producing `NaN`.

### 1.4 Canonical report-status schema

`ReportStatusSchema` with the five-state union above plus helpers `fromTtdStatus`, `fromMetaStatus`, `fromGoogleStatus`, `fromMicrosoftStatus`. Each server's service layer normalizes once before returning.

### 1.5 Reporting error mapper + base class

`class ReportingError extends McpError` carrying `{ platform, upstreamCode, retryable, rawMessage }`. `mapReportingError(err, platform)` handles common HTTP/RPC status codes plus platform-specific error envelopes. Existing `McpError.fromError` call sites in reporting services migrate to this.

**Exit criteria:** all five modules land with unit + fixture tests; no server consumes them yet.

## Phase 2 — Adoption

One PR per server, sequenced to surface contract issues on the most complex servers first:

**TTD → Meta → CM360 → SA360 → TikTok → Snapchat → Amazon DSP → MSADS → Pinterest → DBM → GADS → LinkedIn.**

### Per-server checklist

1. Replace inlined polling loop with `pollUntilComplete`.
2. Replace local CSV parser with shared `parseCSV`; delete dead code.
3. Thread canonical `includeComputedMetrics` through the download tool; remove server-local computation.
4. Normalize `*_check_report_status` via the relevant `from{Platform}Status` helper.
5. Replace bare `throw new McpError(...)` with `mapReportingError(err, platform)` in reporting services.
6. Update fixtures for the new response shapes.

### LinkedIn bounded-view migration (final step)

- `linkedin_get_analytics` and `linkedin_get_analytics_breakdowns` migrate to merge `ReportViewInputSchema` and return `ReportViewOutputSchema`.
- LinkedIn uses cursor paging (`start`/`count`); omit `offset` from the input and expose `nextStart` + `fetchedAllRows` in the output — matching the existing Meta precedent.
- Convert LinkedIn result elements to flat records keyed by pivot + metric so bounded-view `aggregateBy` works.

### DBM and GADS

- DBM already uses bounded view on `dbm_run_custom_query`; adoption here is (a) shared CSV parser and (b) shared polling for Bid Manager queries that require waiting.
- GADS is synchronous GAQL — only status/error canonicalization and computed-metrics consolidation apply.

**Exit criteria:** every server's reporting tools produce `ReportStatusSchema`-shaped status, use shared polling + CSV + computed metrics, map errors via `mapReportingError`, and LinkedIn is on the bounded-view contract. No duplicated helpers remain in server packages.

## Phase 3 — Per-Server Features

Three independent tracks, parallelizable after Phase 2 lands.

### 3A — `report-csv://` resources

Replicate the Pinterest pattern in TTD, TikTok, Snapchat, Amazon DSP, and MSADS:

- Add `storeRawCsv: z.boolean().default(false)` to each download tool's input schema.
- When true, persist the full CSV to a session-scoped `ReportCsvStore` and return `{ boundedView, csvResourceUri: "report-csv://<id>" }`.
- Register the resource handler via a shared `createReportCsvResourceHandler(store)` factory added to `@cesteral/shared` in this phase.
- Redaction + 50 MB truncation markers inherit from the existing store.

### 3B — Discovery tools for Meta and SA360

- `meta_get_available_metrics` — returns breakdowns, action breakdowns, and the documented Insights metric list keyed by entity type (Ad, AdSet, Campaign). Source: a versioned JSON catalog at `packages/meta-mcp/src/config/insights-catalog.json`, updated on Marketing API version bumps.
- `sa360_list_report_columns` — wraps SA360's `searchFields` equivalent when available; otherwise ships a versioned catalog. Returns `{ columnName, type, category, supportedReportTypes[] }`.

Lightweight result objects — no bounded view needed for metadata listings.

### 3C — Native scheduling

Only platforms with upstream API support.

- **Meta:** `meta_create_report_schedule`, `meta_list_report_schedules`, `meta_delete_report_schedule` backed by async report exports; tools return a structured "not entitled on this account" error via `mapReportingError` for accounts without the permission.
- **SA360:** `sa360_create_report_schedule`, `sa360_list_report_schedules`, `sa360_delete_report_schedule` against the v2 recurring report surface.

TTD, CM360, MSADS already have scheduling — this phase normalizes their list/get responses to a shared `ReportScheduleSummarySchema` so every scheduling-capable server returns a consistent shape.

**Exit criteria:** five new `report-csv://` resources; Meta and SA360 gain discovery; Meta and SA360 gain native scheduling; all scheduling servers emit `ReportScheduleSummarySchema`.

## Phase 4 — GCS-Backed CSV Spill

Enhancement to the existing `report-csv://` path, not a new tool surface.

### Trigger condition

Spill to GCS when raw byte size exceeds `REPORT_SPILL_THRESHOLD_BYTES` (default 16 MB) OR parsed row count exceeds `REPORT_SPILL_THRESHOLD_ROWS` (default 100k).

### Flow

1. Download tool calls `downloadReportToStream(url)` (new shared helper using Node streams — no full-buffer read).
2. Stream is tee-split: one branch parses the bounded view (summary or first page); the other writes directly to `gs://${REPORT_SPILL_BUCKET}/${server}/${sessionId}/${reportId}.csv` via `@google-cloud/storage` `createWriteStream`.
3. Tool returns:

```ts
{
  boundedView: { ... },          // unchanged
  csvResourceUri: "report-csv://<id>",
  spill: { bucket, objectName, bytes, rowCount, signedUrl, expiresAt }
}
```

4. `report-csv://<id>` resource resolution reads from GCS rather than in-memory when spilled.

### Config

- `REPORT_SPILL_BUCKET` — required to enable; absent = fall back to truncation-with-warning (current behavior).
- `REPORT_SPILL_SIGNED_URL_TTL_SECONDS` — default 1800.
- `REPORT_SPILL_THRESHOLD_BYTES`, `REPORT_SPILL_THRESHOLD_ROWS` — tunable.
- GCS auth reuses existing Cloud Run service-account credentials; no new secret.

### Lifecycle

- Objects under `/${sessionId}/` removed on session-close via `SessionServiceStore` cleanup hook.
- Backstop: GCS lifecycle rule deletes spill objects older than 24 h (provisioned via Terraform).

### Scope

Enable spill on every server with a `report-csv://` resource after Phase 3 (TTD, TikTok, Snapchat, Amazon DSP, MSADS, Pinterest). CM360/Meta/SA360 only if they also download CSV.

**Exit criteria:** spill helper in `@cesteral/shared`; six servers integrate behind the threshold; Terraform provisions the bucket + lifecycle rule; `CLAUDE.md` documents `REPORT_SPILL_*` envs.

## Error Handling (Cross-Phase)

- Every new shared helper throws typed errors extending `McpError` (`ReportTimeoutError`, `ReportFailedError`, `ReportingError`). No bare `Error` reaches tool handlers.
- `mapReportingError(err, platform)` is the single choke point for upstream error normalization. Preserves `upstreamCode` and `retryable` on error data for the `InteractionLogger` upstream trail.
- Polling aborts on `AbortSignal` so session teardown cancels in-flight work.
- GCS spill failures degrade gracefully: bounded view is still returned with a `spill.error` field and no `csvResourceUri`.

## Testing Strategy

Verification bar: unit + fixture-based integration; no live APIs.

- **Phase 1:** unit tests per shared helper. Fake timers for `pollUntilComplete` backoff/abort/timeout. Fixture suite for `parseCSV` covering quoted fields, CRLF/LF, UTF-8 boundary splits, malformed rows. Fixture coverage for `computeMetrics` with missing inputs. Round-trip tests per `from{Platform}Status`. Fixture error envelopes for `mapReportingError`.
- **Phase 2:** each server PR adds fixture tests asserting `check_report_status` conforms to `ReportStatusSchema`, `download_report` satisfies the bounded-view contract, and error paths surface `ReportingError`. LinkedIn PR adds the bounded-view fixture suite other servers already have.
- **Phase 3:** `report-csv://` resources tested via fixture CSV + redaction assertions. Meta/SA360 discovery tools tested against checked-in catalog JSON. Scheduling tools tested with mocked HTTP covering create/list/delete success + entitlement errors. `ReportScheduleSummarySchema` verified across TTD/CM360/MSADS/Meta/SA360.
- **Phase 4:** `@google-cloud/storage` test doubles. Coverage: threshold not hit, threshold hit, spill failure mid-stream, signed-URL generation, session-scoped cleanup.

Every PR must pass `pnpm run typecheck` + `pnpm run test` before merge.

## Success Criteria & Rollout Gates

**Phase 1 done when** five shared modules land with unit tests; no server consumes them yet.

**Phase 2 done when** all 12 servers import the shared modules; duplicated helpers deleted (grep for removed symbols returns zero matches); LinkedIn tools merge `ReportViewInputSchema` and return `ReportViewOutputSchema`; every `*_check_report_status` tool validates against `ReportStatusSchema`.

**Phase 3 done when** TTD/TikTok/Snapchat/Amazon DSP/MSADS each expose a `report-csv://` resource; `meta_get_available_metrics` and `sa360_list_report_columns` exist; Meta and SA360 scheduling tools exist; TTD/CM360/MSADS scheduling list/get return `ReportScheduleSummarySchema`.

**Phase 4 done when** `REPORT_SPILL_BUCKET` wired through config in all six servers with `report-csv://`; fixture tests prove spill triggers above threshold and bounded-view-only runs below; Terraform provisions bucket + lifecycle rule; `CLAUDE.md` documents `REPORT_SPILL_*`.

**Rollout gates:** Phase N+1 PRs cannot land until Phase N's exit criteria are green on `main`.
