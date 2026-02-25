<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->
<!-- Source: skills/canonical/meta-bulk-operator/SKILL.md -->
<!-- Regenerate: pnpm generate:skills -->


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
