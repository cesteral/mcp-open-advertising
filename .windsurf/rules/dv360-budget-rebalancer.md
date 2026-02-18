<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->
<!-- Source: skills/canonical/dv360-budget-rebalancer/SKILL.md -->
<!-- Regenerate: pnpm generate:skills -->


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
