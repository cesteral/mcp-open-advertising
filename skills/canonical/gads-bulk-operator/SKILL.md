---
name: gads-bulk-operator
description: Execute batch Google Ads mutate and status operations with controlled sizing and verification.
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
