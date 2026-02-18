<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->
<!-- Source: skills/canonical/ttd-report-builder/SKILL.md -->
<!-- Regenerate: pnpm generate:skills -->

---
name: ttd-report-builder
description: Build and execute TTD MyReports V3 async reports with prompt-guided validation.
---

# TTD Report Builder

Workflow ID: `mcp.execute.ttd_report`

## Use When

- You need to generate a custom TTD report via MyReports V3 API.
- You must validate dimension/metric combinations before execution.
- You need an auditable query spec + execution summary.

## Steps

1. Invoke prompt:
   - `ttd_report_generation_workflow`
2. Build the report specification:
   - Select appropriate `dimensions` and `metrics`.
   - Define `dateRange` and `advertiserIds`.
3. Execute `ttd_get_report` to submit the async report.
4. Execute `ttd_download_report` to fetch and parse CSV results.
5. Summarize results and any follow-up actions.

## Required Output Sections

- `QuerySpec`
- `ValidationChecks`
- `ExecutionSummary`

## Constraints

- Validate dimension/metric compatibility before execution.
- Avoid unnecessary dimensions/metrics.
- Keep output concise; summarize large result sets.
