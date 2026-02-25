<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->
<!-- Source: skills/canonical/meta-insights-builder/SKILL.md -->
<!-- Regenerate: pnpm generate:skills -->


# Meta Ads Insights Builder

Workflow ID: `mcp.execute.meta_insights`

## Use When

- You need to query Meta Ads performance metrics via the Insights API.
- You must validate breakdown compatibility before execution.
- You need an auditable query spec + execution summary.

## Steps

1. Invoke prompt:
   - `meta_insights_reporting_workflow` with `adAccountId`
2. Read required resources:
   - `insights-reference://all`
3. Build the insights query specification:
   - Select appropriate `fields` (metrics).
   - Define `datePreset` or `timeRange`.
   - Choose `breakdowns` if dimensional splits are needed.
4. Select the correct tool:
   - `meta_get_insights` for simple metrics without breakdowns.
   - `meta_get_insights_breakdowns` when breakdowns are specified.
5. Summarize results and any follow-up actions.

## Required Output Sections

- `QuerySpec`
- `ValidationChecks`
- `ExecutionSummary`

## Constraints

- Not all breakdowns are compatible with each other; validate combinations first.
- Keep fields under ~20 per request to avoid API limits.
- Insights data may lag up to 48 hours for recent dates.
- Avoid unnecessary breakdowns; they multiply result rows.
