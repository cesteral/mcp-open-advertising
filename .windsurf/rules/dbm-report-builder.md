<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->
<!-- Source: skills/canonical/dbm-report-builder/SKILL.md -->
<!-- Regenerate: pnpm generate:skills -->


# DBM Report Builder

Workflow ID: `mcp.execute.dbm_custom_query`

## Use When

- You need to compose a non-standard Bid Manager report.
- You must validate metric/filter compatibility before execution.
- You need an auditable query build + execution summary.

## Steps

1. Invoke prompt:
   - `custom_query_workflow`
2. Read targeted resources:
   - `report-types://all`
   - `filter-types://category/{slug}`
   - `metric-types://category/{slug}`
3. Read broader resources only when needed:
   - `query-examples://all`
   - `compatibility-rules://all`
4. Build the smallest viable query spec.
5. Execute `run_custom_query`.
6. Summarize results and any follow-up actions.

## Required Output Sections

- `QuerySpec`
- `ValidationChecks`
- `ExecutionSummary`

## Constraints

- Validate compatibility before execution.
- Avoid unnecessary dimensions/metrics.
- Keep output concise; do not paste full resource blobs.
