// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TTD GraphQL Reference Resource
 *
 * Documents working GraphQL query patterns for the TTD GraphQL API
 * (https://desk.thetradedesk.com/graphql). TTD disables schema introspection
 * (__type returns null), so this resource serves as the schema reference for
 * AI agents and developers.
 *
 * Provenance: the non-bulk patterns and the "Known Field Constraints" table
 * are recorded as coming from live API testing on 2026-04-14. No captured
 * evidence of that run is in the repo. The "Bulk Operations" section was never
 * exercised live. It describes what the bulk tools actually send, and it marks
 * each claim as corroborated by TTD's published code (thetradedesk/platform
 * sample scripts @adff1a6, thetradedesk/ttd-workflows-python @cd4e64c) or as
 * unverified.
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatGraphqlReferenceMarkdown(): string {
  return `# TTD GraphQL Reference

## Overview

TTD exposes a GraphQL API at \`https://desk.thetradedesk.com/graphql\`. Use \`ttd_graphql_query\` or \`ttd_graphql_query_bulk\` to execute queries against it.

> **Note:** TTD disables schema introspection — \`{ __type(name: "Me") { fields { name } } }\` returns \`null\`. Use the query patterns documented here instead of attempting introspection.

> **Error handling:** All GraphQL errors return HTTP 200. Errors are in the response body under \`errors[]\` with codes like \`AUTHENTICATION_FAILURE\`, \`VALIDATION_FAILURE\`, \`RESOURCE_LIMIT_EXCEEDED\`, \`GRAPHQL_VALIDATION_FAILED\`, \`NOT_FOUND\`, \`SERVICE_UNAVAILABLE\`.

---

## Cold Start: Partner Discovery

**Always start here.** No other parameters are required.

\`\`\`graphql
{ partners { nodes { id name } } }
\`\`\`

Returns all TTD partners accessible to the authenticated account. Use the \`id\` field as \`partnerId\` when calling \`ttd_list_entities\` (entityType: "advertiser").

Alternatively, call the \`ttd_get_context\` tool which wraps this query automatically.

---

## Identity

\`\`\`graphql
{ me { id } }
\`\`\`

Returns the authenticated user's internal TTD ID. **Only \`id\` is available** — fields like \`name\`, \`email\`, \`partnerIds\`, and \`roles\` do not exist on the \`Me\` type and will fail with GRAPHQL_VALIDATION_FAILED.

---

## Pagination Patterns

TTD uses **two** different pagination conventions depending on the endpoint:

### Relay-style (most entity queries)
\`\`\`graphql
{
  campaigns(advertiserId: "ADV_ID") {
    edges {
      node { id name status }
    }
    pageInfo { hasNextPage endCursor }
  }
}
\`\`\`

### Simple nodes (partner and template queries)
\`\`\`graphql
{
  partners {
    nodes { id name }
    pageInfo { hasNextPage endCursor }
  }
}
\`\`\`

Use \`first: N\` and \`after: "cursor"\` arguments for forward pagination:
\`\`\`graphql
{ partners(first: 10, after: "cursor") { nodes { id name } pageInfo { hasNextPage endCursor } } }
\`\`\`

Use \`last: N\` and \`before: "cursor"\` for backward pagination.

---

## Mutation Patterns

TTD mutations follow a consistent pattern with \`data\` and \`errors\` return fields. **Important:** \`data\` can be either a scalar or an object depending on the mutation — check each mutation's type before selecting sub-fields.

### Error handling in mutations
Always use \`__typename\` with \`MutationError\` as the catch-all error type:
\`\`\`graphql
errors {
  __typename
  ... on MutationError {
    field
    message
  }
}
\`\`\`

Some older mutations use \`userErrors\` instead of \`errors\` — check the schema. Entity report mutations use \`userErrors { field message }\` (no inline fragments needed).

### Enum values
- In inline queries: no quotes — \`format: EXCEL\`
- In JSON variables: use strings — \`"format": "EXCEL"\`
- Values are UPPERCASE — e.g. \`INTERNATIONAL\`, not \`International\`

---

## Report Templates (MyReports)

> **Permission required:** MyReports queries return \`UNAUTHORIZED_FIELD_OR_TYPE\` if the TTD account does not have the MyReports feature enabled. Contact your TTD account manager.

### List templates
\`\`\`graphql
query GetReportTemplates($first: Int, $after: String) {
  myReportsReportTemplates(first: $first, after: $after) {
    pageInfo { startCursor hasNextPage endCursor }
    totalCount
    nodes {
      id
      name
      format
    }
  }
}
\`\`\`

### Get template structure
\`\`\`graphql
query GetReportTemplate($id: ID!) {
  derivedReportTemplate(id: $id) {
    ... on MyReportsGetDerivedTemplateResponse {
      requestedReportTemplateId
      name
      reportFormatType
      resultSets {
        reportType { name }
        fields { columnOrder includedInPivot isOverlapColumn }
        metrics { columnOrder includedInPivot isOverlapColumn }
        conversionMetrics { columnOrder includedInPivot isOverlapColumn }
      }
    }
  }
}
\`\`\`

**Note:** The variable type must be \`ID!\`, not \`String!\`. Column fields only expose \`columnOrder\`, \`includedInPivot\`, and \`isOverlapColumn\` — there are no \`columnId\`, \`columnType\`, or \`name\` fields on \`MyReportsTemplateColumn\`.

### Create template
\`\`\`graphql
mutation CreateReportTemplate($input: MyReportsTemplateCreateInput!) {
  myReportsTemplateCreate(input: $input) {
    data
    errors {
      __typename
      ... on MutationError { field message }
    }
  }
}
\`\`\`

**Important:** \`data\` is a **scalar** — do NOT select sub-fields like \`data { id }\`. The mutation does not return the new template's ID directly. Query \`myReportsReportTemplates(last: 1)\` after a successful create to retrieve it.

### Update template
\`\`\`graphql
mutation UpdateReportTemplate($input: MyReportsTemplateUpdateInput!) {
  myReportsTemplateUpdate(input: $input) {
    data
    errors {
      __typename
      ... on MutationError { field message }
    }
  }
}
\`\`\`

**Important:** \`data\` is a **scalar** here too. The update completely replaces the template structure — re-include all columns you want to keep.

---

## Report Types Discovery

### List report types
\`\`\`graphql
query ListReportTypes($input: ReportTypesInput!) {
  reportTypes(input: $input) {
    id
    name
  }
}
\`\`\`

Variable: \`{ "input": { "format": "EXCEL" } }\`

### Get report type schema (fields + metrics)
\`\`\`graphql
query GetReportTypeSchema($input: ReportTypeInput!, $first: Int, $after: String) {
  reportType(input: $input) {
    id
    name
    fields(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id name }
    }
    metrics(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id name }
    }
  }
}
\`\`\`

Fields and metrics are paginated — use \`first\`/\`after\` to retrieve all.

---

## Report Schedules

### Create schedule from template
\`\`\`graphql
mutation CreateTemplateSchedule($input: MyReportsTemplateScheduleCreateInput!) {
  myReportsTemplateScheduleCreate(input: $input) {
    data {
      scheduleId
    }
    errors {
      __typename
      ... on MutationError { field message }
    }
  }
}
\`\`\`

Required input fields: \`templateId\`, \`reportName\`, \`startDate\`, \`frequency\`, \`dateRange\`, \`timezone\`, \`format\`, \`includeHeaders\`, \`reportFilters\`, \`suppressTotals\`, \`suppressZeroMeasureRows\`, \`dateFormat\` (UPPERCASE enum, e.g. \`INTERNATIONAL\`), \`numericFormat\`.

### Get schedule executions (single)
\`\`\`graphql
query GetReportSchedule($id: ID!) {
  myReportsReportSchedule(id: $id) {
    status
    filters {
      advertiserFilters { name }
      partnerFilters { name }
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
\`\`\`

### List schedule executions (with pagination)
\`\`\`graphql
query GetReportSchedules($where: MyReportsReportScheduleFilterInput, $first: Int, $after: String) {
  myReportsReportSchedules(where: $where, first: $first, after: $after) {
    nodes {
      name
      status
      filters {
        advertiserFilters { name }
        partnerFilters { name }
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
    pageInfo { hasNextPage endCursor }
  }
}
\`\`\`

### Enable/disable schedule
\`\`\`graphql
mutation UpdateSchedule($input: MyReportsReportScheduleUpdateInput!) {
  myReportsReportScheduleUpdate(input: $input) {
    data {
      status
    }
    errors {
      __typename
      ... on MutationError { field message }
    }
  }
}
\`\`\`

### Cancel execution
\`\`\`graphql
mutation CancelExecution($input: MyReportsReportExecutionCancelInput!) {
  myReportsReportExecutionCancel(input: $input) {
    data {
      isCancelled
    }
    errors {
      __typename
      ... on MutationError { field message }
    }
  }
}
\`\`\`

### Rerun schedule
\`\`\`graphql
mutation RerunSchedule($input: MyReportsReportScheduleCreateInput!) {
  myReportsReportScheduleCreate(input: $input) {
    data {
      id
    }
    errors {
      __typename
      ... on MutationError { field message }
    }
  }
}
\`\`\`

---

## Entity Reports (Immediate, No Polling)

These mutations return a download URL directly — no schedule/polling required. They use \`userErrors\` instead of \`errors\`.

### Ad group report
\`\`\`graphql
mutation($entityId: ID!, $reportType: AdGroupReportType!) {
  adGroupReportExecute(input: { id: $entityId, report: $reportType }) {
    data { id url hasSampleData }
    userErrors { field message }
  }
}
\`\`\`

### Campaign report
\`\`\`graphql
mutation($entityId: ID!, $reportType: CampaignReportType!) {
  campaignReportExecute(input: { id: $entityId, report: $reportType }) {
    data { id url hasSampleData }
    userErrors { field message }
  }
}
\`\`\`

### Advertiser report
\`\`\`graphql
mutation($entityId: ID!, $reportType: AdvertiserReportType!) {
  advertiserReportExecute(input: { id: $entityId, report: $reportType }) {
    data { id url hasSampleData }
    userErrors { field message }
  }
}
\`\`\`

Use \`ttd_get_entity_report_types\` to discover valid \`reportType\` enum values for a given entity.

---

## Bulk Operations

> **Not live-verified.** Nothing in this section has been run against TTD from this repo. Each statement names its basis: TTD's published sample scripts (github.com/thetradedesk/platform), TTD's Workflows SDK (github.com/thetradedesk/ttd-workflows-python), or only what the tools send.

Prefer \`ttd_graphql_query_bulk\`, \`ttd_graphql_mutation_bulk\`, \`ttd_graphql_bulk_job\` and \`ttd_graphql_cancel_bulk_job\` to hand-writing these operations.

### Submit a bulk query: \`createQueryBulk\`
TTD's samples submit the query inline, with no variables:
\`\`\`graphql
mutation CreateBulkQuery {
  createQueryBulk(input: { query: """query { partner(id: "PARTNER_ID") { thirdPartyData { nodes { id name } } } }""" }) {
    data { id }
    errors {
      ... on MutationError { message field }
      ... on BulkJobQueryValidationError { message field queryErrors }
    }
  }
}
\`\`\`
The input also accepts an optional \`bulkJobCallback: { callbackUrl, callbackHeaders: [{ key, value }] }\` (shown in TTD's samples; not exposed by the tool).

\`ttd_graphql_query_bulk\` sends \`mutation CreateQueryBulk($input: CreateQueryBulkInput!) { createQueryBulk(input: $input) { data { id status } errors { … } } }\` with variables \`{ "input": { "query": "…", "queryVariables": "<JSON-encoded array of variable maps>" } }\`. **Unverified:** no TTD source shows \`queryVariables\`, the \`CreateQueryBulkInput\` type name, or \`status\` on the returned job.

### Submit a bulk mutation: \`createMutationBulk\`
\`ttd_graphql_mutation_bulk\` sends \`mutation CreateMutationBulk($input: CreateMutationBulkInput!) { createMutationBulk(input: $input) { data { id status } errors { __typename ... on MutationError { field message } } } }\` with variables \`{ "input": { "mutation": "…", "mutationVariables": ["<JSON string per input>", …] } }\`. **Unverified:** no TTD source shows \`createMutationBulk\`, its input fields, whether mutation jobs can be cancelled, or how each entry binds to the mutation's variables.

TTD mutation names are entity first, then verb (\`campaignUpdate\`, \`adGroupUpdate\`, \`bidListUpdate\`), per TTD's Platform API reference.

TTD's documented route for creating campaigns in bulk (>100) is a separate, file-based flow. Call \`fileUpload { id uploadUrl }\`, PUT a JSONL file to \`uploadUrl\`, then call \`bulkCreateCampaigns(input: { advertiserId, fileId }) { data { id } userErrors { field message } }\` and poll \`jobProgress(id:) { jobStatus validationErrors }\` (statuses IN_PROGRESS, COMPLETE, VALIDATION_FAILURE, ERROR). Source: TTD sample \`Campaign/Creating/CreateCampaignsBulkGQL.py\`. No tool here wraps it, and it is not polled with \`bulkJob\`.

### Poll: \`bulkJob\`
\`\`\`graphql
query GetBulkJobStatus($id: ID!) {
  bulkJob(id: $id) {
    id
    status
    url
    gqlErrors
  }
}
\`\`\`
These four fields are exactly what TTD's samples select. The samples inline the id as a string literal, \`bulkJob(id: "123")\`. \`ttd_graphql_bulk_job\` also requests \`__typename\`, \`createdAt\` and \`completedAt\`. The last two are unverified as GraphQL fields.

**Status values:** QUEUED and IN_PROGRESS (exact spellings seen in TTD's samples), plus SUCCESS, PARTIAL_SUCCESS, FAILURE and CANCELLED. The set of six comes from the Workflows SDK's \`BulkJobStatus\`, which uses PascalCase wire values. The GraphQL spellings of the last four follow the same SCREAMING_SNAKE convention but have not been observed. Poll while the status is QUEUED or IN_PROGRESS; every other status is terminal. TTD's samples treat a finished job with no \`url\` as failed and print \`gqlErrors\`. TTD's callback sample fetches results only for Success and PartialSuccess.

**Result file:** TTD's samples fetch \`url\` with a plain HTTP GET (no \`TTD-Auth\` header) and parse the body as JSON: a GraphQL response, \`{"data": {…}}\`. It is **not** a CSV, so \`ttd_download_report\` cannot parse it. The 1-hour expiry quoted by the tools is unverified.

**Not GraphQL fields as far as any TTD source shows:** \`completionPercentage\`, \`runtimeErrors\`, \`rawResult\`, \`queryGqlErrors\`. These appear only in the Workflows REST facade's model, whose names do not match GraphQL one-to-one (its \`queryGqlErrors\` appears to be GraphQL \`gqlErrors\`).

### Cancel: \`cancelBulkJob\`
\`ttd_graphql_cancel_bulk_job\` sends \`mutation CancelBulkJob($input: CancelBulkJobInput!) { cancelBulkJob(input: $input) { data { id status } errors { __typename ... on MutationError { field message } } } }\` with \`{ "input": { "jobId": "…" } }\`. **Unverified:** no TTD source shows this mutation.

---

## Known Field Constraints (from live testing 2026-04-14)

| Type | Field | Status |
|------|-------|--------|
| \`Me\` | \`id\` | ✅ Works |
| \`Me\` | \`name\`, \`email\`, \`partnerIds\`, \`roles\` | ❌ Do not exist |
| \`Partner\` | \`id\`, \`name\` | ✅ Works |
| \`MyReportsTemplate\` (nodes) | \`id\`, \`name\`, \`format\` | ✅ Works |
| \`MyReportsTemplateColumn\` | \`columnOrder\`, \`includedInPivot\`, \`isOverlapColumn\` | ✅ Works |
| \`MyReportsTemplateColumn\` | \`columnId\`, \`columnType\`, \`name\` | ❌ Do not exist |
| \`MyReportsGetDerivedTemplateResponse\` | \`requestedReportTemplateId\`, \`name\`, \`reportFormatType\`, \`resultSets\` | ✅ Works |
| \`MyReportsGetDerivedTemplateResponse\` | \`isDerived\` | ❌ Does not exist |
| \`MyReportsTemplateResultSet\` | \`reportType { name }\`, \`fields\`, \`metrics\`, \`conversionMetrics\` | ✅ Works |
| \`MyReportsTemplateResultSet\` | \`filters\`, \`name\` | ❌ Do not exist |
| \`MyReportsTemplateCreatePayload\` | \`data\` (scalar) | ✅ Works |
| \`MyReportsTemplateUpdatePayload\` | \`data\` (scalar) | ✅ Works |
| \`MyReportsTemplateScheduleCreatePayload\` | \`data { scheduleId }\` | ✅ Works |
| \`derivedReportTemplate\` query | Variable type must be \`ID!\` not \`String!\` | ⚠️ Type matters |
| \`dateFormat\` enum | Must be UPPERCASE (\`INTERNATIONAL\`) | ⚠️ Casing matters |

---

## Complexity and Rate Limits

- TTD calculates query complexity and rejects calls that exceed limits
- \`totalCount\` adds processing overhead — omit if not needed
- Limit page sizes to ~1000 for paginated requests
- Reduce nesting depth to lower complexity scores
- Rate limit errors return code \`RESOURCE_LIMIT_EXCEEDED\` with HTTP 200 (not 429 for GraphQL)
- API Gateway errors return HTTP 429 for extreme overload
`;
}

export const graphqlReferenceResource: Resource = {
  uri: "graphql-reference://ttd",
  name: "TTD GraphQL Reference",
  description:
    "Working GraphQL query patterns for the TTD GraphQL API. TTD disables schema introspection — use this resource instead of __type queries.",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatGraphqlReferenceMarkdown();
    return cachedContent;
  },
};
