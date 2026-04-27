# TTD GraphQL Report Schedule Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 5 new GraphQL-based report schedule tools that cover operations only available via the TTD GraphQL API, complementing the 4 existing REST-based schedule tools.

**Architecture:** All new tools follow the established `ttdService.graphqlQuery()` passthrough pattern (same as the template tools just added). Each tool is a self-contained file in `src/mcp-server/tools/definitions/`, registered in `index.ts`. No new service methods required.

**Tech Stack:** TypeScript, Zod, TTD GraphQL API (`myReportsTemplateScheduleCreate`, `myReportsReportScheduleUpdate`, `myReportsReportExecutionCancel`, `myReportsReportScheduleCreate`, `myReportsReportSchedules`)

---

## Gap Analysis

| Capability                                            | REST tool                       | GraphQL coverage                                                     |
| ----------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| Create schedule from template ID                      | ❌ (REST uses raw dims/metrics) | `myReportsTemplateScheduleCreate`                                    |
| Enable / disable a schedule                           | ❌                              | `myReportsReportScheduleUpdate`                                      |
| Cancel an in-progress execution                       | ❌                              | `myReportsReportExecutionCancel`                                     |
| Rerun existing schedule immediately                   | ❌                              | `myReportsReportScheduleCreate` (singleRunFromExistingScheduleInput) |
| List schedules with download links + execution status | REST only (no download links)   | `myReportsReportSchedules` query                                     |

---

### Task 1: `ttd_create_template_schedule`

**File:** `packages/ttd-mcp/src/mcp-server/tools/definitions/create-template-schedule.tool.ts`

Creates a report schedule from a template ID using `myReportsTemplateScheduleCreate`. This is the intended workflow after `ttd_create_report_template`.

**Input schema:**

```typescript
z.object({
  templateId: z.string().min(1),
  reportName: z.string().min(1),
  startDate: z.string().describe("ISO 8601 datetime, e.g. 2025-10-10T00:00:00Z"),
  frequency: z.enum(["SINGLE_RUN", "DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"]),
  dateRange: z.string().describe("e.g. LAST7_DAYS, LAST14_DAYS, LAST30_DAYS, YESTERDAY, CUSTOM"),
  timezone: z.string().default("UTC"),
  format: z.enum(["EXCEL"]).default("EXCEL"),
  includeHeaders: z.boolean().default(true),
  reportFilters: z
    .array(
      z.object({
        reportType: z.string(),
        partnerIds: z.array(z.string()).optional(),
        advertiserIds: z.array(z.string()).optional(),
      })
    )
    .optional(),
  suppressTotals: z.boolean().optional(),
  suppressZeroMeasureRows: z.boolean().optional(),
});
```

**GraphQL mutation:**

```graphql
mutation CreateTemplateSchedule($input: MyReportsTemplateScheduleCreateInput!) {
  myReportsTemplateScheduleCreate(input: $input) {
    data {
      scheduleId
    }
    errors {
      __typename
      ... on MutationError {
        field
        message
      }
    }
  }
}
```

**Annotations:** `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`

**Step 1:** Create `create-template-schedule.tool.ts` following the pattern in `create-report-template.tool.ts`

**Step 2:** Export from `index.ts` and add to `productionTools` array

**Step 3:** Run `pnpm run typecheck` in `packages/ttd-mcp`

**Step 4:** Verify typecheck passes, fix any errors

---

### Task 2: `ttd_update_report_schedule`

**File:** `packages/ttd-mcp/src/mcp-server/tools/definitions/update-report-schedule.tool.ts`

Enable or disable a report schedule using `myReportsReportScheduleUpdate`. GraphQL-only operation.

**Input schema:**

```typescript
z.object({
  reportScheduleId: z.string().min(1),
  status: z.enum(["ACTIVE", "DISABLED"]),
});
```

**GraphQL mutation:**

```graphql
mutation UpdateReportSchedule($input: MyReportsReportScheduleUpdateInput!) {
  myReportsReportScheduleUpdate(input: $input) {
    data {
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
}
```

**Annotations:** `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`

**Step 1:** Create `update-report-schedule.tool.ts`

**Step 2:** Register in `index.ts`

**Step 3:** Run `pnpm run typecheck`

---

### Task 3: `ttd_cancel_report_execution`

**File:** `packages/ttd-mcp/src/mcp-server/tools/definitions/cancel-report-execution.tool.ts`

Cancel a report that is currently being processed using `myReportsReportExecutionCancel`. Requires an execution ID (retrievable from `ttd_get_report_executions`).

**Input schema:**

```typescript
z.object({
  executionId: z.string().min(1).describe("Execution ID from ttd_get_report_executions"),
});
```

**GraphQL mutation:**

```graphql
mutation CancelReportExecution($input: MyReportsReportExecutionCancelInput!) {
  myReportsReportExecutionCancel(input: $input) {
    data {
      isCancelled
    }
    errors {
      __typename
      ... on MutationError {
        field
        message
      }
    }
  }
}
```

**Annotations:** `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: false`

**Step 1:** Create `cancel-report-execution.tool.ts`

**Step 2:** Register in `index.ts`

**Step 3:** Run `pnpm run typecheck`

---

### Task 4: `ttd_rerun_report_schedule`

**File:** `packages/ttd-mcp/src/mcp-server/tools/definitions/rerun-report-schedule.tool.ts`

Immediately run a report from an existing schedule using `myReportsReportScheduleCreate` with `singleRunFromExistingScheduleInput`. Useful when a download link has expired or a report errored.

**Input schema:**

```typescript
z.object({
  scheduleId: z.string().min(1).describe("Existing report schedule ID to rerun immediately"),
});
```

**GraphQL mutation:**

```graphql
mutation RerunReportSchedule($input: MyReportsReportScheduleCreateInput!) {
  myReportsReportScheduleCreate(input: $input) {
    data
    errors {
      __typename
      ... on MutationError {
        field
        message
      }
    }
  }
}
```

Variables: `{ input: { singleRunFromExistingScheduleInput: scheduleId } }`

**Annotations:** `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`

**Step 1:** Create `rerun-report-schedule.tool.ts`

**Step 2:** Register in `index.ts`

**Step 3:** Run `pnpm run typecheck`

---

### Task 5: `ttd_get_report_executions`

**File:** `packages/ttd-mcp/src/mcp-server/tools/definitions/get-report-executions.tool.ts`

Query report schedules and their execution status + download links using `myReportsReportSchedules` (list) or `myReportsReportSchedule` (single). Returns download links on completed reports — the primary way to retrieve download links after a report finishes.

**Input schema:**

```typescript
z.object({
  scheduleId: z
    .string()
    .optional()
    .describe("If provided, fetch a single schedule by ID (myReportsReportSchedule)"),
  lastStatusChangeAfter: z.string().optional().describe("ISO date filter e.g. 2025-07-01"),
  first: z.number().int().min(1).max(100).default(10).optional(),
  after: z.string().optional().describe("Cursor for pagination"),
});
```

**GraphQL queries:**

Single schedule:

```graphql
query GetReportSchedule($id: String!) {
  myReportsReportSchedule(id: $id) {
    status
    filters {
      advertiserFilters {
        name
      }
      partnerFilters {
        name
      }
    }
    executions {
      nodes {
        reportStartDateInclusive
        reportEndDateExclusive
        lastStatusChangeDate
        state
        delivery {
          downloadLink
          deliveredDate
        }
      }
    }
  }
}
```

List schedules:

```graphql
query GetReportSchedules($where: MyReportsReportScheduleWhereInput, $first: Int, $after: String) {
  myReportsReportSchedules(where: $where, first: $first, after: $after) {
    nodes {
      name
      status
      filters {
        advertiserFilters {
          name
        }
        partnerFilters {
          name
        }
      }
      timezone
      executions {
        nodes {
          reportStartDateInclusive
          reportEndDateExclusive
          lastStatusChangeDate
          state
          delivery {
            downloadLink
            deliveredDate
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

**Annotations:** `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`

**Step 1:** Create `get-report-executions.tool.ts`

**Step 2:** Register in `index.ts`

**Step 3:** Run `pnpm run typecheck`

---

### Task 6: Final verification + docs

**Step 1:** Run full typecheck from root

```bash
cd /Users/daniel.thorner/GitHub/cesteral-mcp-servers && pnpm run typecheck
```

**Step 2:** Update `CLAUDE.md` tool count (31 → 36) and add new tools to the ttd-mcp table

**Step 3:** Update `packages/ttd-mcp/src/mcp-server/tools/definitions/index.ts` comment header (31 → 36 tools)

---

## Files Modified

| File                               | Change                                         |
| ---------------------------------- | ---------------------------------------------- |
| `create-template-schedule.tool.ts` | Create                                         |
| `update-report-schedule.tool.ts`   | Create                                         |
| `cancel-report-execution.tool.ts`  | Create                                         |
| `rerun-report-schedule.tool.ts`    | Create                                         |
| `get-report-executions.tool.ts`    | Create                                         |
| `definitions/index.ts`             | +5 imports + exports + productionTools entries |
| `CLAUDE.md`                        | 31 → 36, add 5 tool rows                       |
