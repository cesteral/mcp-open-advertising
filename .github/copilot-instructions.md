<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->
<!-- Source: skills/canonical/*/SKILL.md -->
<!-- Regenerate: pnpm generate:skills -->

# Cesteral MCP Skills

This file contains all Cesteral workflow skills for GitHub Copilot. Each skill provides step-by-step guidance for a specific MCP workflow.

## Table of Contents

- [cesteral-tool-explorer](#cesteral-tool-explorer) — Explore Cesteral tools, prompts, and resources across all servers (DV360, DBM, TTD) with minimal context usage.
- [dbm-report-builder](#dbm-report-builder) — Build and execute custom Bid Manager (DBM) reports with prompt-guided validation.
- [dv360-budget-rebalancer](#dv360-budget-rebalancer) — Analyze and reallocate DV360 budgets across insertion orders and line items with safe execution.
- [dv360-delivery-troubleshooter](#dv360-delivery-troubleshooter) — Diagnose DV360 campaign delivery issues using DBM reporting and DV360 management tools.
- [dv360-entity-updater](#dv360-entity-updater) — Execute schema-first DV360 entity updates with updateMask discipline and verification.
- [gads-bulk-operator](#gads-bulk-operator) — Execute batch Google Ads mutate and status operations with controlled sizing and verification.
- [gads-entity-manager](#gads-entity-manager) — Execute schema-first Google Ads entity CRUD with verification.
- [gads-query-builder](#gads-query-builder) — Build and execute GAQL-based Google Ads reporting queries with prompt-guided validation.
- [learnings-reviewer](#learnings-reviewer) — Review interaction logs and learnings tree to propose codebase improvements.
- [meta-bulk-operator](#meta-bulk-operator) — Execute batch Meta Ads operations with controlled sizing and verification.
- [meta-campaign-builder](#meta-campaign-builder) — Create complete Meta Ads campaign structures with creation-order enforcement and verification.
- [meta-entity-manager](#meta-entity-manager) — Execute schema-first Meta Ads entity CRUD with verification.
- [meta-insights-builder](#meta-insights-builder) — Build and execute Meta Ads Insights queries with breakdown validation and tool selection.
- [meta-troubleshooter](#meta-troubleshooter) — Diagnose and remediate Meta Ads entity issues using API inspection and targeted fixes.
- [ttd-campaign-builder](#ttd-campaign-builder) — Create complete TTD campaign structures with schema-first validation and verification.
- [ttd-entity-updater](#ttd-entity-updater) — Execute schema-disciplined Trade Desk entity creates, updates, and deletes with verification.
- [ttd-report-builder](#ttd-report-builder) — Build and execute TTD MyReports V3 async reports with prompt-guided validation.
- [ttd-troubleshooter](#ttd-troubleshooter) — Diagnose and remediate TTD entity issues using schema inspection and targeted updates.

---


# Cesteral Tool Explorer

Workflow ID: `mcp.explore.tools_and_schemas`

## Use When

- You need to discover available MCP capabilities.
- You are unsure which prompt/resource/tool to call.
- You want to minimize context bloat during exploration.

## Steps

1. List capabilities:
   - `tools/list`
   - `prompts/list`
   - `resources/list`
2. Invoke prompt:
   - `tool_schema_exploration_workflow`
3. Fetch only scoped resources first:
   - `filter-types://category/{slug}`
   - `metric-types://category/{slug}`
4. Fetch `://all` resources only if scoped resources are insufficient.

## Required Output Sections

- `Scope`
- `SelectedResources`
- `NextToolCall`

## Constraints

- Do not paste full schema/resource blobs into chat unless requested.
- Prefer concise text summaries and structured outputs.
- Keep recommendations to one smallest-viable next action.

---


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

---


# DV360 Budget Rebalancer

Workflow ID: `mcp.execute.dv360_budget_reallocation`

## Use When

- You need to redistribute budgets across DV360 IOs or line items.
- You need a data-driven analysis before making budget changes.
- You need auditable reallocation plans with execution summaries.

## Steps

1. Invoke prompt:
   - `budget_reallocation_workflow`
2. Read required resources:
   - `entity-schema://{entityType}` (insertionOrder, lineItem)
   - `entity-fields://{entityType}`
3. Analyze current budget allocation and delivery performance.
4. Build reallocation plan with specific amounts.
5. Execute budget updates via `dv360_update_entity` with precise `updateMask`.
6. Verify final state and summarize changes.

## Required Output Sections

- `AnalysisSummary`
- `ReallocationPlan`
- `ExecutionSummary`

## Constraints

- Never reallocate more than the total available budget.
- Validate that sum of reallocated amounts matches original total.
- Use precise `updateMask` values targeting only budget fields.
- Include before/after comparison in execution summary.

---


# DV360 Delivery Troubleshooter

Workflow ID: `mcp.troubleshoot.delivery`

## Use When

- Campaigns or line items are underdelivering.
- You need prompt-guided diagnostic sequencing.
- You need a clear fix-and-monitor plan.

## Steps

1. Pick primary prompt based on context:
   - Reporting side: `troubleshoot_report`
   - Management side: `troubleshoot_underdelivery`
2. Read targeted resources:
   - `compatibility-rules://all`
   - `targeting-types://`
   - `entity-fields://{entityType}`
3. Gather baseline using reporting tools (`get_pacing_status`, `get_performance_metrics`).
4. Apply smallest corrective action with management tools (`dv360_update_entity`, `dv360_adjust_line_item_bids`, `dv360_bulk_update_status`).
5. Re-check delivery and summarize outcomes.

## Required Output Sections

- `Symptoms`
- `RootCauseHypothesis`
- `FixAndMonitorPlan`

## Constraints

- Prioritize reversible, low-risk changes first.
- Use one focused remediation step at a time.
- Include post-change monitoring checkpoints.

---


# DV360 Entity Updater

Workflow ID: `mcp.execute.dv360_entity_update`

## Use When

- You need to apply a DV360 update safely.
- You need a deterministic prompt/resource/tool call sequence.
- You need auditable, minimal-change execution.

## Steps

1. Invoke prompt:
   - `entity_update_execution_workflow`
2. Read required resources:
   - `entity-schema://{entityType}`
   - `entity-fields://{entityType}`
   - `entity-examples://{entityType}` (optional)
3. Build minimal payload and exact `updateMask`.
4. Execute `dv360_update_entity`.
5. Verify with `dv360_get_entity`.

## Required Output Sections

- `ChangePlan`
- `UpdateMask`
- `VerificationResult`

## Constraints

- One small update per execution step.
- No broad `updateMask` values.
- No unrelated fields in `data`.

---


# Google Ads Bulk Operator

Workflow ID: `mcp.execute.gads_bulk_operations`

## Use When

- You need to batch-create, update, or remove multiple Google Ads entities.
- You need controlled payload sizing with safety checks.
- You need an auditable batch plan and execution summary.

## Steps

1. Invoke prompt:
   - `gads_campaign_setup_workflow` (for batch creation guidance)
2. Read required resources:
   - `entity-schema://{entityType}`
   - `entity-examples://{entityType}`
   - `entity-hierarchy://gads`
3. Build batch operations array with appropriate sizing.
4. Execute the appropriate tool:
   - `gads_bulk_mutate` (multi-operation create+update+remove)
   - `gads_bulk_update_status` (batch enable/pause/remove)
5. Verify results and summarize outcomes.

## Required Output Sections

- `BatchPlan`
- `SafetyChecks`
- `ExecutionSummary`

## Constraints

- Keep batch sizes reasonable; split large batches into chunks.
- Validate entity hierarchy before bulk operations.
- Always include pre-execution safety checks.
- Summarize successes and failures separately.

---


# Google Ads Entity Manager

Workflow ID: `mcp.execute.gads_entity_management`

## Use When

- You need to create, update, or remove Google Ads entities safely.
- You need prompt-guided troubleshooting for entity issues.
- You need explicit payload diff and verification output.

## Steps

1. Invoke prompt based on context:
   - Setup flow: `gads_campaign_setup_workflow`
   - Troubleshooting: `gads_troubleshoot_entity`
2. Read required resources:
   - `entity-schema://{entityType}`
   - `entity-examples://{entityType}`
3. Build minimal payload for the target operation.
4. Execute the appropriate tool:
   - `gads_create_entity`, `gads_update_entity`, `gads_remove_entity`, or `gads_get_entity`
5. Verify with `gads_get_entity` and summarize the delta.

## Required Output Sections

- `ChangePlan`
- `PayloadDiff`
- `VerificationResult`

## Constraints

- Prefer one scoped change per execution step.
- Use targeted `updateMask` values; avoid broad rewrites.
- Always include a verification step after writes.

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

---


# Learnings Reviewer

Workflow ID: `mcp.improve.learnings_review`

## Use When

- Periodic review of accumulated learnings for actionable improvements.
- After a batch of new learnings has been submitted.
- When interaction logs show recurring patterns worth codifying.

## Steps

1. Read resources:
   - `learnings://agent-behaviors` to understand known agent behavior patterns.
   - `learnings://workflows` to understand cross-platform workflow learnings.
   - `learnings://platforms/{platform}` for platform-specific insights.
2. Scan recent interaction logs (`data/interactions/`) for recurring failures or low scores.
3. Cross-reference logs against existing learnings to identify gaps.
4. For each actionable insight:
   a. If it is a **skill improvement** — propose updates to canonical SKILL.md files.
   b. If it is a **code fix** — propose changes to tool handlers or services.
   c. If it is a **new learning** — draft a new entry for the learnings tree via `submit_learning`.
5. Summarize all proposals with rationale and evidence.

## Required Output Sections

- `LogAnalysis`
- `LearningsGaps`
- `Proposals`
- `Evidence`

## Constraints

- Never auto-merge proposals — always present for human review.
- Cite specific log entries or learnings as evidence.
- Prefer updating existing learnings over creating new files.

---


# Meta Ads Bulk Operator

Workflow ID: `mcp.execute.meta_bulk_operations`

## Use When

- You need to batch-create multiple Meta Ads entities at once.
- You need to batch-update statuses across many entities.
- You need an auditable batch plan and execution summary.

## Steps

1. Invoke prompt:
   - `meta_campaign_setup_workflow` (for batch creation guidance)
2. Read required resources:
   - `entity-hierarchy://all`
   - `entity-schema://{entityType}`
3. Build batch operations array with appropriate sizing.
4. Execute the appropriate tool:
   - `meta_bulk_create_entities` (batch entity creation)
   - `meta_bulk_update_status` (batch status updates)
5. Verify results and summarize outcomes.

## Required Output Sections

- `BatchPlan`
- `SafetyChecks`
- `ExecutionSummary`

## Constraints

- Maximum 50 items per batch request.
- Validate entity hierarchy before bulk operations.
- Always include pre-execution safety checks.
- ARCHIVED status is permanent; confirm before bulk-archiving.
- Summarize successes and failures separately.

---


# Meta Ads Campaign Builder

Workflow ID: `mcp.execute.meta_campaign_setup`

## Use When

- You need to create a new Meta Ads campaign structure (Campaign → Ad Set → Ad).
- You need schema-guided entity creation with validation.
- You need explicit payload diff and verification output.

## Steps

1. Invoke prompt:
   - `meta_campaign_setup_workflow` with `adAccountId`
2. Read required resources:
   - `entity-hierarchy://all`
   - `entity-schema://{entityType}` (for each entity in the hierarchy)
   - `entity-examples://{entityType}`
3. Build entity payloads following the creation order.
4. Execute `meta_create_entity` for each entity in sequence.
5. Verify each created entity with `meta_get_entity`.

## Required Output Sections

- `ChangePlan`
- `PayloadDiff`
- `VerificationResult`

## Constraints

- Create entities in hierarchy order: Custom Audience (optional) → Ad Creative → Campaign → Ad Set → Ad.
- `objective` is required on campaign creation.
- The special ad categories field is required on campaign creation (use empty array if none apply).
- Budgets are in cents (e.g. $10.00 = 1000).
- Always include a verification step after each creation.

---


# Meta Ads Entity Manager

Workflow ID: `mcp.execute.meta_entity_update`

## Use When

- You need to create, update, or delete Meta Ads entities safely.
- You need prompt-guided workflow for entity mutations.
- You need explicit payload diff and verification output.

## Steps

1. Invoke prompt based on context:
   - Setup/update flow: `meta_campaign_setup_workflow`
   - Troubleshooting: `meta_troubleshoot_entity`
2. Read required resources:
   - `entity-hierarchy://all`
   - `entity-schema://{entityType}`
   - `entity-examples://{entityType}`
3. Build minimal payload for the target operation.
4. Execute the appropriate tool:
   - `meta_create_entity`, `meta_update_entity`, `meta_delete_entity`, or `meta_get_entity`
5. Verify with `meta_get_entity` and summarize the delta.

## Required Output Sections

- `ChangePlan`
- `PayloadDiff`
- `VerificationResult`

## Constraints

- Budgets are in cents (e.g. $10.00 = 1000).
- The special ad categories field is required on campaign creation (use empty array if none apply).
- Targeting fields are full-replace on update; always send the complete targeting spec.
- ARCHIVED status is permanent and cannot be reversed.
- Always include a verification step after writes.

---


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

---


# Meta Ads Troubleshooter

Workflow ID: `mcp.troubleshoot.meta_entity`

## Use When

- Meta Ads entities are misconfigured, rejected, or underperforming.
- You need prompt-guided diagnostic sequencing for Meta Ads.
- You need a clear fix-and-monitor plan.

## Steps

1. Invoke prompt:
   - `meta_troubleshoot_entity` with `entityType` and `entityId`
2. Read required resources:
   - `entity-hierarchy://all`
   - `entity-schema://{entityType}`
   - `entity-examples://{entityType}`
3. Check parent entity status first (Campaign → Ad Set → Ad).
4. Gather baseline entity state with `meta_get_entity`.
5. Identify root cause from schema comparison and entity state.
6. Apply smallest corrective action with `meta_update_entity`.
7. Re-check entity and summarize outcomes.

## Required Output Sections

- `Symptoms`
- `RootCauseHypothesis`
- `FixAndMonitorPlan`

## Constraints

- Always check parent entity status before investigating children.
- Insights data may lag up to 48 hours; factor this into delivery analysis.
- ARCHIVED status is permanent and cannot be reversed.
- Prioritize reversible, low-risk changes first.
- Use one focused remediation step at a time.

---


# TTD Campaign Builder

Workflow ID: `mcp.execute.ttd_campaign_setup`

## Use When

- You need to create a new TTD campaign structure (Campaign → Ad Group → Ad → Creative).
- You need schema-guided entity creation with validation.
- You need explicit payload diff and verification output.

## Steps

1. Invoke prompt:
   - `ttd_campaign_setup_workflow`
2. Read required resources:
   - `entity-schema://{entityType}` (for each entity in the hierarchy)
   - `entity-examples://{entityType}`
3. Build entity payloads following the hierarchy order.
4. Execute `ttd_create_entity` for each entity in sequence.
5. Verify each created entity with `ttd_get_entity`.

## Required Output Sections

- `ChangePlan`
- `PayloadDiff`
- `VerificationResult`

## Constraints

- Create entities in hierarchy order (Campaign before Ad Group before Ad).
- Use `ttd_validate_entity` for dry-run validation before writes when available.
- Always include a verification step after each creation.

---


# TTD Entity Updater

Workflow ID: `mcp.execute.ttd_entity_update`

## Use When

- You need to create/update/delete TTD entities safely.
- You need schema-guided entity updates with prompt-driven flow.
- You need explicit payload diff and verification output.

## Steps

1. Invoke the `ttd_campaign_setup_workflow` prompt for schema-guided workflow sequencing.
2. Discover available TTD tools with `tools/list`.
3. Retrieve baseline entity state with `ttd_get_entity` (or `ttd_list_entities`).
4. Build minimal payload change for `ttd_create_entity` or `ttd_update_entity`.
5. Execute the write operation.
6. Verify with `ttd_get_entity` and summarize the delta.

## Required Output Sections

- `ChangePlan`
- `PayloadDiff`
- `VerificationResult`

## Constraints

- Prefer one scoped change per call.
- Avoid broad payload rewrites.
- Always include a verification step after writes.

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

---


# TTD Troubleshooter

Workflow ID: `mcp.troubleshoot.ttd_entity`

## Use When

- TTD entities are misconfigured, rejected, or underperforming.
- You need prompt-guided diagnostic sequencing for TTD.
- You need a clear fix-and-monitor plan.

## Steps

1. Invoke prompt:
   - `ttd_troubleshoot_entity`
2. Read required resources:
   - `entity-schema://{entityType}`
3. Gather baseline entity state with `ttd_get_entity`.
4. Identify root cause from schema comparison and entity state.
5. Apply smallest corrective action with `ttd_update_entity`.
6. Re-check entity and summarize outcomes.

## Required Output Sections

- `Symptoms`
- `RootCauseHypothesis`
- `FixAndMonitorPlan`

## Constraints

- Prioritize reversible, low-risk changes first.
- Use one focused remediation step at a time.
- Include post-change monitoring checkpoints.
