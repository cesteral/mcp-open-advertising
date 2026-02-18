---
name: gads-query-builder
description: Build and execute GAQL-based Google Ads reporting queries with prompt-guided validation.
---

# Google Ads Query Builder

Workflow ID: `mcp.execute.gads_query`

## Use When

- You need to compose a GAQL reporting query against Google Ads.
- You must validate query syntax and field compatibility before execution.
- You need an auditable query build + execution summary.

## Steps

1. Invoke prompts:
   - `gads_tool_schema_exploration` (discover available fields/entities)
   - `gaql_reporting_workflow` (step-by-step query construction)
2. Read targeted resources:
   - `gaql-reference://syntax`
   - `entity-schema://{entityType}`
3. Read broader resources only when needed:
   - `entity-examples://{entityType}`
4. Build the smallest viable GAQL query.
5. Execute `gads_gaql_search`.
6. Summarize results and any follow-up actions.

## Required Output Sections

- `QuerySpec`
- `ValidationChecks`
- `ExecutionSummary`

## Constraints

- Validate GAQL syntax and field compatibility before execution.
- Avoid unnecessary fields in SELECT clause.
- Keep output concise; do not paste full resource blobs.
