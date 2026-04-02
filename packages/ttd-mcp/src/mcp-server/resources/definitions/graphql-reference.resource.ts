// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TTD GraphQL Reference Resource
 *
 * Documents working GraphQL query patterns for the TTD GraphQL API
 * (https://desk.thetradedesk.com/graphql). TTD disables schema introspection
 * (__type returns null), so this resource serves as the schema reference for
 * AI agents and developers.
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatGraphqlReferenceMarkdown(): string {
  return `# TTD GraphQL Reference

## Overview

TTD exposes a GraphQL API at \`https://desk.thetradedesk.com/graphql\`. Use \`ttd_graphql_query\` or \`ttd_graphql_query_bulk\` to execute queries against it.

> **Note:** TTD disables schema introspection — \`{ __type(name: "Me") { fields { name } } }\` returns \`null\`. Use the query patterns documented here instead of attempting introspection.

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

Use \`first: N\` and \`after: "cursor"\` arguments for pagination:
\`\`\`graphql
{ partners(first: 10, after: "cursor") { nodes { id name } pageInfo { hasNextPage endCursor } } }
\`\`\`

---

## Report Templates (MyReports)

### List templates
\`\`\`graphql
query GetReportTemplates($first: Int, $after: String) {
  myReportsReportTemplates(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    totalCount
    nodes {
      id
      name
      userGenerated
      createdBy
      format
    }
  }
}
\`\`\`

> **Permission required:** \`myReportsReportTemplates\` returns \`UNAUTHORIZED_FIELD_OR_TYPE\` if the TTD account does not have the MyReports feature enabled. Contact your TTD account manager.

### Create template
\`\`\`graphql
mutation CreateReportTemplate($input: MyReportsTemplateCreateInput!) {
  myReportsTemplateCreate(input: $input) {
    data { id }
    errors {
      ... on MyReportsTemplateCreateValidationError { message }
    }
  }
}
\`\`\`

### Update template
\`\`\`graphql
mutation UpdateReportTemplate($input: MyReportsTemplateUpdateInput!) {
  myReportsTemplateUpdate(input: $input) {
    data { id }
    errors {
      ... on MyReportsTemplateUpdateValidationError { message }
    }
  }
}
\`\`\`

---

## Report Schedules

### List executions
\`\`\`graphql
query GetExecutions($scheduleId: String, $lastStatusChangeAfter: DateTime, $first: Int) {
  myReportsReportExecutions(
    scheduleId: $scheduleId
    lastStatusChangeAfter: $lastStatusChangeAfter
    first: $first
  ) {
    nodes {
      id
      scheduleId
      status
      downloadUrl
      scheduledAt
      completedAt
    }
  }
}
\`\`\`

### Enable/disable schedule
\`\`\`graphql
mutation UpdateSchedule($input: MyReportsReportScheduleUpdateInput!) {
  myReportsReportScheduleUpdate(input: $input) {
    data { status }
    errors { ... on MutationError { field message } }
  }
}
\`\`\`

### Cancel execution
\`\`\`graphql
mutation CancelExecution($input: MyReportsReportExecutionCancelInput!) {
  myReportsReportExecutionCancel(input: $input) {
    data { isCancelled }
    errors { ... on MutationError { field message } }
  }
}
\`\`\`

### Rerun schedule
\`\`\`graphql
mutation RerunSchedule($input: MyReportsReportScheduleCreateInput!) {
  myReportsReportScheduleCreate(input: $input) {
    data { id name status }
    errors { ... on MutationError { field message } }
  }
}
\`\`\`

---

## Entity Reports (Immediate, No Polling)

These mutations return a download URL directly — no schedule/polling required.

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

## Report Types Discovery

\`\`\`graphql
query GetReportTypes {
  reportTypes(input: { format: EXCEL }) {
    name
  }
}
\`\`\`

Valid \`format\` values: \`EXCEL\`, \`CSV\`.

---

## Bulk Operations

TTD supports async bulk GraphQL jobs for large-scale operations. Submit a job and poll for results:

### Submit bulk query
\`\`\`graphql
mutation BulkQuery($query: String!, $variables: [JSON!]!) {
  bulkQuery(input: { query: $query, variables: $variables }) {
    jobId
  }
}
\`\`\`

### Check job status
\`\`\`graphql
query BulkJobStatus($jobId: String!) {
  bulkJob(id: $jobId) {
    id
    status
    resultUrl
    errorMessage
  }
}
\`\`\`

Use \`ttd_graphql_query_bulk\`, \`ttd_graphql_mutation_bulk\`, \`ttd_graphql_bulk_job\`, and \`ttd_graphql_cancel_bulk_job\` tools to avoid managing this flow manually.

---

## Known Field Constraints (from live evaluation)

| Type | Field | Status |
|------|-------|--------|
| \`Me\` | \`id\` | ✅ Works |
| \`Me\` | \`name\` | ❌ Does not exist |
| \`Me\` | \`email\` | ❌ Does not exist |
| \`Me\` | \`partnerIds\` | ❌ Does not exist |
| \`Partner\` | \`id\` | ✅ Works |
| \`Partner\` | \`name\` | ✅ Works |
| Top-level \`partners\` | \`nodes { id name }\` | ✅ Works |
| \`myReportsReportTemplates\` | \`nodes { id name format userGenerated createdBy }\` | ✅ Works (requires MyReports permission) |
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
