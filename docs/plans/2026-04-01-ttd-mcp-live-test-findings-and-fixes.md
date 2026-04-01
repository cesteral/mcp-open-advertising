# TTD-MCP Live Test Findings & Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all bugs found during live testing of the 37 ttd-mcp tools against the production TTD API.

**Architecture:** Each fix is isolated to a single tool file + its test. Fixes fall into 5 categories: wrong API field names, stale GraphQL types, output schema mismatches, phantom entity types, and missing field extraction.

**Tech Stack:** TypeScript, Zod, TTD REST API v3, TTD GraphQL API, Vitest

---

## Live Test Results Summary

### Working Tools (20/37 - no bugs)

| Tool | Status | Notes |
|------|--------|-------|
| `ttd_get_context` | PASS | Cold-start discovery works perfectly |
| `ttd_list_entities` (advertiser) | PASS | Pagination, filtering works |
| `ttd_list_entities` (campaign) | PASS | Correct parent ID handling |
| `ttd_list_entities` (adGroup) | PASS | Two-parent (advertiserId+campaignId) works |
| `ttd_list_entities` (creative) | PASS | Returns audit statuses, share links |
| `ttd_get_entity` (advertiser) | PASS | Full entity details |
| `ttd_get_entity` (campaign) | PASS | Full campaign with flights |
| `ttd_validate_entity` (valid) | PASS | Passes valid payloads |
| `ttd_validate_entity` (invalid) | PASS | Catches missing fields with clear messages |
| `ttd_graphql_query` | PASS | Passthrough works with correct GQL schemas |
| `ttd_list_report_schedules` | PASS | Returns schedules with full details |
| `ttd_get_report_schedule` | PASS | Single schedule retrieval works |
| `ttd_delete_report_schedule` | PASS (untested live) | Simple DELETE, no schema issues |
| `ttd_download_report` | PASS (untested live) | CSV parse logic, no schema issues |
| `ttd_graphql_query_bulk` | PASS (untested live) | No schema issues in code review |
| `ttd_graphql_mutation_bulk` | PASS (untested live) | No schema issues in code review |
| `ttd_graphql_bulk_job` | PASS (untested live) | No schema issues in code review |
| `ttd_graphql_cancel_bulk_job` | PASS (untested live) | No schema issues in code review |
| `ttd_create_entity` | PASS (untested live) | Code review clean |
| `ttd_update_entity` | PASS (untested live) | Code review clean |

### Buggy Tools (11/37)

| Tool | Bug | Severity |
|------|-----|----------|
| `ttd_get_report` | Missing `ReportScheduleName` + `ReportTemplateId` | **Critical** |
| `ttd_submit_report` | Missing `ReportScheduleName` + `ReportTemplateId` | **Critical** |
| `ttd_create_report_schedule` | Missing `ReportScheduleName` + `ReportTemplateId` | **Critical** |
| `ttd_check_report_status` | REST endpoint `/myreports/reportexecution/query` returns 404 | **Critical** |
| `ttd_get_report_executions` (list mode) | Wrong GraphQL type `MyReportsReportScheduleWhereInput` | **High** |
| `ttd_get_report_executions` (single mode) | Uses `String!` instead of `ID!` for schedule ID | **High** |
| `ttd_rerun_report_schedule` | Missing subfield selection on `data` in GraphQL mutation | **High** |
| `ttd_get_entity_report_types` | Output schema `schedule` expects boolean, API returns string | **Medium** |
| `ttd_execute_entity_report` | Output validation: `reportId` required but API returns null | **Medium** |
| `ttd_get_ad_preview` | Missing `ShareLink` extraction (only checks `PreviewUrl`) | **Medium** |
| `ttd_list_entities` (4 phantom types) | `ad`, `siteList`, `deal`, `bidList` in schema but not in entity mapping | **Medium** |

### Skipped Tools (6/37 - destructive, tested via unit tests only)

| Tool | Reason |
|------|--------|
| `ttd_delete_entity` | Destructive on live data |
| `ttd_bulk_create_entities` | Creates live entities |
| `ttd_bulk_update_entities` | Modifies live entities |
| `ttd_bulk_update_status` | Modifies live entities |
| `ttd_archive_entities` | Irreversible archive |
| `ttd_adjust_bids` | Modifies live bids |

---

## What Works Well

1. **Cold-start workflow** (`ttd_get_context` → `ttd_list_entities`) is excellent — zero-arg discovery
2. **Entity CRUD** for core types (advertiser, campaign, adGroup, creative) is solid
3. **GraphQL passthrough** (`ttd_graphql_query`) works perfectly for arbitrary queries
4. **Validation** catches missing fields with actionable error messages
5. **Error propagation** surfaces TTD API errors clearly with request IDs and HTTP status
6. **Rate limiting** and retry logic in `TtdHttpClient` works correctly
7. **Entity mapping** for the 5 supported types is well-structured
8. **REST report schedule management** (list, get, delete) works correctly

## What Should Be Improved

1. **Reporting tools are broadly broken** — the TTD MyReports REST API now requires `ReportScheduleName` (not `ReportName`) and a `ReportTemplateId`
2. **GraphQL schema drift** — several tools use stale type names (`WhereInput` vs `FilterInput`, `String!` vs `ID!`)
3. **Phantom entity types** in tool input schemas that aren't actually implemented
4. **Ad preview** misses the `ShareLink` field that TTD actually returns
5. **Output schemas too strict** in some tools (non-nullable fields that API returns as null)

---

## Fix Tasks

### Task 1: Fix REST Reporting Field Names (Critical)

**Files:**
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/get-report.tool.ts:73-86`
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/submit-report.tool.ts:76-89`
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/create-report-schedule.tool.ts:98-111`
- Modify: `packages/ttd-mcp/src/services/ttd/ttd-reporting-service.ts:20-32`
- Test: `packages/ttd-mcp/tests/tools/ttd-get-report.test.ts`
- Test: `packages/ttd-mcp/tests/tools/ttd-submit-report.test.ts`

**Root cause:** TTD API v3 MyReports endpoint requires `ReportScheduleName` (not `ReportName`) and `ReportTemplateId` is now mandatory.

**Step 1: Update the TtdReportConfig interface**

In `ttd-reporting-service.ts`, update the interface to reflect the actual API fields:

```typescript
export interface TtdReportConfig {
  ReportScheduleName: string;
  ReportScheduleType: "Once" | "Daily" | "Weekly" | "Monthly";
  ReportDateRange: string;
  ReportFrequency: string;
  ReportDateFormat: string;
  ReportNumericFormat: string;
  ReportFileFormat: string;
  TimeZone: string;
  ReportTemplateId?: number;
  ReportFilters?: Array<{
    Type: string;
    Value: string;
  }>;
  ReportDimensions?: string[];
  ReportMetrics?: string[];
  AdvertiserFilters?: string[];
  [key: string]: unknown;
}
```

**Step 2: Fix get-report.tool.ts payload**

Change line 74 from `ReportName: input.reportName` to `ReportScheduleName: input.reportName`. Add `ReportTemplateId` as an optional input parameter with a sensible approach (either require it or look up a default template).

**Step 3: Fix submit-report.tool.ts payload**

Same fix: `ReportName` → `ReportScheduleName`, add `ReportTemplateId` handling.

**Step 4: Fix create-report-schedule.tool.ts payload**

Line 99: `ReportName` → `ReportScheduleName`. Add `ReportTemplateId` handling.

**Step 5: Add `reportTemplateId` to input schemas**

Add optional `reportTemplateId` parameter to `GetReportInputSchema`, `SubmitReportInputSchema`, and `CreateReportScheduleInputSchema`. Include description explaining users can find template IDs via `ttd_list_report_templates` or the TTD UI.

**Step 6: Update tests to match new field names**

Update mocked payloads in test files to use `ReportScheduleName` instead of `ReportName`.

**Step 7: Run tests and verify**

```bash
cd packages/ttd-mcp && pnpm run test
```

**Step 8: Commit**

```bash
git add packages/ttd-mcp/src/services/ttd/ttd-reporting-service.ts \
       packages/ttd-mcp/src/mcp-server/tools/definitions/get-report.tool.ts \
       packages/ttd-mcp/src/mcp-server/tools/definitions/submit-report.tool.ts \
       packages/ttd-mcp/src/mcp-server/tools/definitions/create-report-schedule.tool.ts \
       packages/ttd-mcp/tests/
git commit -m "fix(ttd-mcp): use ReportScheduleName and add ReportTemplateId for MyReports API"
```

---

### Task 2: Fix `ttd_check_report_status` 404 (Critical)

**Files:**
- Modify: `packages/ttd-mcp/src/services/ttd/ttd-reporting-service.ts:132-178`
- Test: `packages/ttd-mcp/tests/tools/ttd-check-report-status.test.ts`

**Root cause:** The REST endpoint `/myreports/reportexecution/query` returns 404. The correct endpoint may be `/myreports/reportexecution/query/reportSchedule` or the API has moved to GraphQL only.

**Step 1: Investigate the correct endpoint**

Check TTD API v3 documentation. The working `runReport` polling also uses this endpoint (line 264), so if it was working before, the endpoint path may have changed. Alternatives:
- `/myreports/reportexecution/query/reportschedule`
- Use GraphQL `myReportsReportSchedule` query instead (recommended — more reliable)

**Step 2: Option A — Fix REST path if it still exists**

Update the POST body or path in `checkReportExecution()`.

**Step 2: Option B — Migrate to GraphQL (recommended)**

Replace the REST polling with a GraphQL query using `myReportsReportSchedule(id: $id)` to check execution state. This aligns with the GraphQL-first direction of the TTD API and reuses the working `SINGLE_QUERY` pattern from `get-report-executions.tool.ts` (after fixing its type bug).

**Step 3: Update tests**

**Step 4: Commit**

```bash
git commit -m "fix(ttd-mcp): fix check_report_status endpoint (404)"
```

---

### Task 3: Fix `ttd_get_report_executions` GraphQL Types (High)

**Files:**
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/get-report-executions.tool.ts:65,87`

**Bug 1 — Line 65:** SINGLE_QUERY uses `$id: ID!` which is correct per the live error. Wait — actually the error said `Variable "$id" of type "String!" used in position expecting type "ID!"`. So the query template at line 65 says `$id: ID!` but the code passes the variable as a plain string. GraphQL should coerce this. Let me re-read...

Actually the query on line 65 says `$id: ID!` — that's correct. But the error says `"String!"`. This means either: (a) the query is being modified at runtime, or (b) there's a second query path. Re-reading the code: line 125 calls `ttdService.graphqlQuery(SINGLE_QUERY, { id: input.scheduleId })`. The `SINGLE_QUERY` at line 65 clearly shows `$id: ID!`. The schedule ID `91688430` is numeric but passed as string `"91688430"` — this should be fine for `ID!`. This needs deeper investigation.

**Bug 2 — Line 87:** LIST_QUERY uses `MyReportsReportScheduleWhereInput` but should be `MyReportsReportScheduleFilterInput`.

**Step 1: Fix LIST_QUERY type on line 87**

```typescript
const LIST_QUERY = `query GetReportSchedules($where: MyReportsReportScheduleFilterInput, $first: Int, $after: String) {
```

**Step 2: Investigate SINGLE_QUERY type mismatch**

The `$id: ID!` declaration looks correct. The error might be a TTD GraphQL schema issue. Try with `$id: String!` as a workaround if `ID!` doesn't work, since TTD may type the field differently.

**Step 3: Test both modes**

**Step 4: Commit**

```bash
git commit -m "fix(ttd-mcp): fix GraphQL types in get_report_executions"
```

---

### Task 4: Fix `ttd_rerun_report_schedule` GraphQL Mutation (High)

**Files:**
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/rerun-report-schedule.tool.ts:50-61`

**Root cause:** Line 52 selects bare `data` which is a scalar type that requires subfield selection. The TTD API error: `Field "data" of type "MyReportsReportScheduleCreatePayload" must have a selection of subfields.`

**Step 1: Add subfield selection to the mutation**

```typescript
const RERUN_REPORT_SCHEDULE_MUTATION = `mutation RerunReportSchedule($input: MyReportsReportScheduleCreateInput!) {
  myReportsReportScheduleCreate(input: $input) {
    data {
      id
      name
      status
    }
    errors {
      __typename
      ... on MutationError {
        field
        message
      }
    }
  }
}`;
```

**Step 2: Update result extraction (line 91)**

Update the extraction to handle the new `data` shape (now an object, not a scalar).

**Step 3: Test and commit**

```bash
git commit -m "fix(ttd-mcp): add subfield selection to rerun_report_schedule mutation"
```

---

### Task 5: Fix `ttd_get_entity_report_types` Output Schema (Medium)

**Files:**
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/get-entity-report-types.tool.ts:49,89`

**Root cause:** Output schema declares `schedule: z.union([z.boolean(), z.string()])` (which is correct) but line 89 casts as `r.schedule as boolean` which doesn't match the union type and causes output validation failure when the API returns a string.

**Step 1: Fix the type cast on line 89**

```typescript
schedule: r.schedule as boolean | string,
```

**Step 2: Run tests and commit**

```bash
git commit -m "fix(ttd-mcp): fix schedule type cast in get_entity_report_types"
```

---

### Task 6: Fix `ttd_execute_entity_report` Output Schema (Medium)

**Files:**
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/execute-entity-report.tool.ts:92`

**Root cause:** Line 92 extracts `reportData.id as string | undefined` but the API returns `null`. The schema on line 45 correctly allows `.nullable().optional()` but the extraction doesn't convert null → undefined.

**Step 1: Fix null handling on line 92**

```typescript
reportId: (reportData.id as string | null | undefined) ?? undefined,
```

Or alternatively, leave it as `null` since the schema allows `.nullable()`:
```typescript
reportId: (reportData.id as string | null) ?? null,
```

**Step 2: Run tests and commit**

```bash
git commit -m "fix(ttd-mcp): handle null reportId in execute_entity_report"
```

---

### Task 7: Fix `ttd_get_ad_preview` Missing ShareLink (Medium)

**Files:**
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/get-ad-preview.tool.ts:38-44,59-64`

**Root cause:** TTD creative entities return `ShareLink` (confirmed in live test: `https://preview-desk.thetradedesk.com/Creatives/ClickTrackingPreview?...`) but the tool only checks `PreviewUrl` which doesn't exist on the response.

**Step 1: Update the TTDCreativeResponse interface**

```typescript
interface TTDCreativeResponse {
  CreativeId?: string;
  CreativeName?: string;
  PreviewUrl?: string;
  ShareLink?: string;
  ClickUrl?: string;
  CreativeType?: string;
  // Video creatives use nested attributes
  TradeDeskHostedVideoAttributes?: {
    ClickthroughUrl?: string;
    LandingPageUrl?: string;
  };
}
```

**Step 2: Update extraction with fallbacks**

```typescript
return {
  previewUrl: creative.PreviewUrl || creative.ShareLink,
  creativeName: creative.CreativeName,
  clickUrl: creative.ClickUrl
    || creative.TradeDeskHostedVideoAttributes?.ClickthroughUrl
    || creative.TradeDeskHostedVideoAttributes?.LandingPageUrl,
  adFormat: creative.CreativeType,
  creativeId: input.creativeId,
};
```

**Step 3: Run tests and commit**

```bash
git commit -m "fix(ttd-mcp): extract ShareLink and video click URLs in ad preview"
```

---

### Task 8: Remove Phantom Entity Types from Tool Schemas (Medium)

**Files:**
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/list-entities.tool.ts`
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/get-entity.tool.ts`
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/create-entity.tool.ts`
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/update-entity.tool.ts`
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/delete-entity.tool.ts`
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/validate-entity.tool.ts`
- Modify: `packages/ttd-mcp/src/mcp-server/tools/definitions/bulk-update-status.tool.ts`

**Root cause:** Tool input schemas advertise 9 entity types (`advertiser`, `campaign`, `adGroup`, `ad`, `creative`, `siteList`, `deal`, `conversionTracker`, `bidList`) but `entity-mapping.ts` only implements 5 (`advertiser`, `campaign`, `adGroup`, `creative`, `conversionTracker`). The 4 phantom types (`ad`, `siteList`, `deal`, `bidList`) cause 404 errors at runtime.

**Step 1: Use `getEntityTypeEnum()` from entity-mapping for tool schemas**

Instead of hardcoding enum values in each tool file, import the canonical list:

```typescript
import { getEntityTypeEnum } from "../utils/entity-mapping.js";

// In schema:
entityType: z.enum(getEntityTypeEnum()).describe("Type of entity")
```

This ensures tool schemas always match the implemented entity types.

**Step 2: Also fix `bulk-update-status.tool.ts`**

This tool has its own expanded enum. Restrict it to the same 5 supported types.

**Step 3: Update tests if they reference phantom types**

**Step 4: Commit**

```bash
git commit -m "fix(ttd-mcp): remove phantom entity types from tool schemas"
```

---

### Task 9: Fix `conversionTracker` API Path (Medium)

**Files:**
- Modify: `packages/ttd-mcp/src/mcp-server/tools/utils/entity-mapping.ts:67-72`

**Root cause:** The `conversionTracker` entity uses path `/trackingtag/query/advertiser` but this returned 404 in live testing. The correct path may be `/advertiserconversion/query/advertiser` or the entity may require a different query approach.

**Step 1: Investigate the correct TTD API path**

Check TTD API v3 docs for conversion tracking endpoints. Possible paths:
- `/trackingtag/query/advertiser` (current — 404)
- `/advertiserconversion/query/advertiser`
- `/conversion/query/advertiser`

**Step 2: Update entity-mapping.ts with correct paths**

```typescript
conversionTracker: {
  apiPath: "/trackingtag",           // verify GET path
  queryPath: "/trackingtag/query/advertiser",  // fix this
  parentIds: ["advertiserId"],
  idField: "TrackingTagId",
},
```

**Step 3: Test with live API and commit**

```bash
git commit -m "fix(ttd-mcp): fix conversionTracker API path"
```

---

### Task 10: Typecheck and Full Test Suite

**Step 1: Run typecheck**

```bash
cd /Users/daniel.thorner/GitHub/cesteral-mcp-servers && pnpm run typecheck
```

**Step 2: Run full test suite**

```bash
pnpm run test
```

**Step 3: Build all packages**

```bash
pnpm run build
```

**Step 4: Final commit**

```bash
git commit -m "chore(ttd-mcp): verify all fixes pass typecheck and tests"
```

---

## Priority Order

1. **Task 1** (Critical) — REST reporting field names — blocks 3 tools
2. **Task 2** (Critical) — check_report_status 404 — blocks report polling
3. **Task 3** (High) — get_report_executions GraphQL types — blocks both modes
4. **Task 4** (High) — rerun_report_schedule mutation — blocks rerun
5. **Task 8** (Medium) — phantom entity types — prevents confusing 404s
6. **Task 5** (Medium) — get_entity_report_types schema cast
7. **Task 6** (Medium) — execute_entity_report null reportId
8. **Task 7** (Medium) — ad preview ShareLink extraction
9. **Task 9** (Medium) — conversionTracker path
10. **Task 10** — Final verification
