// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Budget Reallocation Workflow Prompt
 *
 * Guides AI agents through reallocating budget across insertion orders
 * and line items based on performance data. Covers:
 * Fetch hierarchy → Gather metrics → Identify performers → Calculate → Execute → Verify
 *
 * This prompt coordinates tools across both MCP servers:
 * - dbm-mcp for performance/delivery metrics
 * - dv360-mcp for entity hierarchy and budget updates
 */
export const budgetReallocationPrompt: Prompt = {
  name: "budget_reallocation_workflow",
  description:
    "Guide for reallocating budget across insertion orders and line items based on performance data. Includes performance analysis, reallocation formulas, and execution steps with DV360-specific constraints.",
  arguments: [
    {
      name: "advertiserId",
      description: "DV360 Advertiser ID for the campaign to rebalance",
      required: true,
    },
    {
      name: "campaignId",
      description: "Specific Campaign ID to rebalance (if known). If omitted, you will need to identify the campaign first.",
      required: false,
    },
  ],
};

/**
 * Generate prompt message with budget reallocation workflow guidance
 */
export function getBudgetReallocationPromptMessage(
  args?: Record<string, string>,
): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const campaignId = args?.campaignId || "{campaignId}";

  return `# Budget Reallocation Workflow for DV360

You are guiding a budget reallocation across insertion orders (IOs) and line items within a DV360 campaign. This workflow uses both the **dbm-mcp** (reporting) and **dv360-mcp** (management) servers.

## Context
- **Advertiser ID**: ${advertiserId}
- **Campaign ID**: ${campaignId}

## Workflow Overview

\`\`\`
Fetch Campaign Hierarchy (dv360-mcp)
  ↓
Gather Performance Data (dbm-mcp)
  ↓
Identify Top/Bottom Performers
  ↓
Calculate Reallocation Amounts
  ↓
Execute Budget Changes (dv360-mcp)
  ↓
Verify Changes & Set Monitoring
\`\`\`

---

## Step 1: Fetch Campaign Hierarchy

Get the full structure of the campaign to understand budget distribution.

### 1a. List Insertion Orders
\`\`\`
Tool: dv360_list_entities (dv360-mcp)
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "insertionOrder",
  "filter": "campaignId = ${campaignId}"
}
\`\`\`

### 1b. List Line Items (per IO)
For each insertion order returned, list its line items:
\`\`\`
Tool: dv360_list_entities (dv360-mcp)
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "lineItem",
  "filter": "insertionOrderId = {insertionOrderId}"
}
\`\`\`

### 1c. Build Budget Map
Create a table of all entities and their current budgets:

| Entity | ID | Type | Budget | Budget Type | Status | Flight End |
|--------|----|------|--------|-------------|--------|------------|
| IO-1 | ... | IO | $X | Daily/Total | Active | YYYY-MM-DD |
| LI-1a | ... | LI | $Y | Fixed/Auto | Active | YYYY-MM-DD |
| LI-1b | ... | LI | $Z | Fixed/Auto | Active | YYYY-MM-DD |

⚠️ **GOTCHA**: Note the \`budgetUnit\` (CURRENCY vs. IMPRESSIONS) and allocation type (\`FIXED\` vs. \`AUTOMATIC\`). You can only reallocate between entities with the same budget type.

---

## Step 2: Gather Performance Data

Use the **dbm-mcp** reporting server to get delivery and performance metrics.

### 2a. Campaign-Level Pacing
\`\`\`
Tool: dbm_get_pacing_status (dbm-mcp)
Parameters:
{
  "campaignId": "${campaignId}",
  "advertiserId": "${advertiserId}"
}
\`\`\`

### 2b. Performance Metrics
\`\`\`
Tool: dbm_get_performance_metrics (dbm-mcp)
Parameters:
{
  "campaignId": "${campaignId}",
  "advertiserId": "${advertiserId}",
  "dateRange": "LAST_7_DAYS"
}
\`\`\`

### 2c. Historical Delivery Trends
\`\`\`
Tool: dbm_get_historical_metrics (dbm-mcp)
Parameters:
{
  "campaignId": "${campaignId}",
  "advertiserId": "${advertiserId}",
  "startDate": "{14_days_ago}",
  "endDate": "{today}",
  "granularity": "DAILY"
}
\`\`\`

**What to capture per IO/Line Item:**
- Spend to date
- Pacing percentage (actual spend / expected spend)
- CPM / CPA / ROAS
- Remaining budget
- Days remaining in flight

---

## Step 3: Identify Top and Bottom Performers

### Performance Classification

Classify each IO/line item into performance tiers:

| Tier | Criteria | Action |
|------|----------|--------|
| **🟢 Top Performer** | Pacing ≥ 100% AND CPA/CPM at or below target | Increase budget |
| **🟡 On Track** | Pacing 85-100% AND metrics near target | Keep current budget |
| **🟠 Underperforming** | Pacing 50-85% OR metrics above target | Evaluate — fix or reduce |
| **🔴 Poor Performer** | Pacing < 50% OR metrics 2x+ above target | Reduce budget, reallocate |

### Performance Score Formula

For each entity, calculate a simple performance score:

\`\`\`
Performance Score = (Pacing % × 0.4) + (Target CPA Achievement % × 0.3) + (CTR Percentile × 0.3)
\`\`\`

Where:
- **Pacing %** = actual_spend / expected_spend × 100
- **Target CPA Achievement %** = target_CPA / actual_CPA × 100 (higher is better)
- **CTR Percentile** = entity CTR rank among siblings × 100

⚠️ **GOTCHA**: Don't reallocate budget away from entities that are underdelivering due to fixable issues (low bids, paused status). Fix those issues first — see the **troubleshoot_underdelivery** prompt.

---

## Step 4: Calculate Reallocation

### Reallocation Rules

1. **Total campaign budget stays the same** — this is a zero-sum reallocation
2. **Never reduce an IO below its minimum viable budget** (typically $100 daily or $500 total)
3. **Account for remaining flight days** when calculating amounts
4. **Match budget types** — only move currency-to-currency or impressions-to-impressions

### Reallocation Formula

\`\`\`
available_to_reallocate = SUM(poor_performer_budget_reductions)
\`\`\`

Distribute the available amount to top performers proportionally:

\`\`\`
additional_budget_for_entity_i = available_to_reallocate × (entity_i_performance_score / SUM(all_top_performer_scores))
\`\`\`

### Example Calculation

| Entity | Current Budget | Pacing | Score | Action | New Budget |
|--------|---------------|--------|-------|--------|-----------|
| IO-1 (Top) | $10,000 | 110% | 92 | +$3,000 | $13,000 |
| IO-2 (OK) | $8,000 | 95% | 78 | No change | $8,000 |
| IO-3 (Poor) | $7,000 | 40% | 35 | -$3,000 | $4,000 |
| **Total** | **$25,000** | | | | **$25,000** |

### Budget Guardrails

Before applying changes, validate:
- [ ] No IO/LI budget goes below minimum threshold ($100/day or $500/flight)
- [ ] Sum of IO budgets ≤ campaign budget
- [ ] Sum of LI budgets within each IO ≤ IO budget
- [ ] Budget types are compatible (don't mix daily and total)
- [ ] Flight dates still have remaining delivery days

⚠️ **GOTCHA**: Budget amounts in the DV360 API are in **micros** (1 USD = 1,000,000 micros). A budget of $10,000 = 10,000,000,000 micros.

⚠️ **GOTCHA**: Changing from a **daily** budget to a **total** budget (or vice versa) requires updating both \`budgetUnit\` and the amount in the same update. You cannot change just the amount if you also need to change the type.

---

## Step 5: Execute Budget Changes

Apply budget changes one entity at a time, starting with **reductions** (to free up budget) then **increases**.

### 5a. Reduce Poor Performer Budgets

For each poor performer:
\`\`\`
Tool: dv360_update_entity (dv360-mcp)
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "insertionOrder",
  "insertionOrderId": "{io_id}",
  "data": {
    "budget": {
      "budgetUnit": "BUDGET_UNIT_CURRENCY",
      "maxAmount": "{new_reduced_budget_in_micros}"
    }
  },
  "updateMask": "budget.maxAmount",
  "reason": "Budget reallocation: reducing underperforming IO (pacing at {X}%, CPA {Y}% above target)"
}
\`\`\`

### 5b. Increase Top Performer Budgets

For each top performer:
\`\`\`
Tool: dv360_update_entity (dv360-mcp)
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "insertionOrder",
  "insertionOrderId": "{io_id}",
  "data": {
    "budget": {
      "budgetUnit": "BUDGET_UNIT_CURRENCY",
      "maxAmount": "{new_increased_budget_in_micros}"
    }
  },
  "updateMask": "budget.maxAmount",
  "reason": "Budget reallocation: increasing top-performing IO (pacing at {X}%, CPA {Y}% below target)"
}
\`\`\`

### 5c. Update Line Item Budgets (if applicable)

If reallocating at the line item level within an IO:
\`\`\`
Tool: dv360_update_entity (dv360-mcp)
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "lineItem",
  "lineItemId": "{line_item_id}",
  "data": {
    "budget": {
      "budgetAllocationType": "LINE_ITEM_BUDGET_ALLOCATION_TYPE_FIXED",
      "maxAmount": "{new_budget_in_micros}"
    }
  },
  "updateMask": "budget.budgetAllocationType,budget.maxAmount",
  "reason": "Budget reallocation within IO: adjusting line item budget based on performance"
}
\`\`\`

⚠️ **GOTCHA**: If line items use \`LINE_ITEM_BUDGET_ALLOCATION_TYPE_AUTOMATIC\`, DV360 distributes the IO budget automatically. Switching to \`FIXED\` requires setting explicit amounts for **all** line items in the IO.

⚠️ **GOTCHA**: When updating pacing on a line item after a budget change, ensure \`dailyMaxMicros\` (if using daily pacing) is also updated to match the new budget.

---

## Step 6: Verify Changes & Set Monitoring

### 6a. Verify Budget Updates

For each entity that was changed:
\`\`\`
Tool: dv360_get_entity (dv360-mcp)
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "insertionOrder",
  "insertionOrderId": "{io_id}"
}
\`\`\`

**Verify:**
- [ ] Budget amount matches expected value
- [ ] Budget type is correct (daily vs. total)
- [ ] Entity is still ACTIVE
- [ ] Sum of IO budgets ≤ campaign budget
- [ ] Sum of LI budgets ≤ IO budget (per IO)

### 6b. Monitor Post-Reallocation (4-6 hours later)
\`\`\`
Tool: dbm_get_pacing_status (dbm-mcp)
Parameters:
{
  "campaignId": "${campaignId}",
  "advertiserId": "${advertiserId}"
}
\`\`\`

**Expected outcomes:**
- Top performer pacing should remain strong or improve
- Reduced entities should not drop below minimum viable delivery
- Overall campaign pacing should trend toward 100%

### 6c. Day-over-Day Check (24 hours later)
\`\`\`
Tool: dbm_get_historical_metrics (dbm-mcp)
Parameters:
{
  "campaignId": "${campaignId}",
  "advertiserId": "${advertiserId}",
  "startDate": "{2_days_ago}",
  "endDate": "{today}",
  "granularity": "DAILY"
}
\`\`\`

**Success criteria:**
- Overall campaign spend rate improved
- Top performers spending the additional budget effectively
- No entity hitting budget caps prematurely

---

## Summary: Reallocation Record

After completing the workflow, document the changes:

\`\`\`
Reallocation Summary
Date: {today}
Campaign: ${campaignId}
Advertiser: ${advertiserId}

Changes Made:
| Entity | Type | Old Budget | New Budget | Change | Reason |
|--------|------|-----------|-----------|--------|--------|
| {id} | IO | \${X} | \${Y} | +/-\${Z} | {reason} |

Total Budget: \${total} (unchanged)
Expected Impact: {description}
Next Review: {date}
\`\`\`

---

## Common Pitfalls

| Pitfall | Description | Prevention |
|---------|-------------|------------|
| **Budget type mismatch** | Moving budget between daily and total entities | Always check budgetUnit before updating |
| **Exceeding parent budget** | IO budgets sum exceeds campaign budget | Validate hierarchy before applying |
| **Minimum budget violation** | Reducing an IO/LI below minimum threshold | Set floor of $100/day or $500/flight |
| **Pacing disruption** | Large budget changes cause pacing algorithm to reset | Limit single changes to ≤30% of current budget |
| **Auto-budget LIs** | Changing IO budget doesn't distribute evenly to auto-budget LIs | Check line item allocation type first |
| **Flight date mismatch** | Increasing budget on entity with few remaining days | Pro-rate budget increase based on remaining days |

---

## Next Steps

After budget reallocation:
- Schedule a follow-up review in 24-48 hours
- If underdelivery persists for specific entities, use the **troubleshoot_underdelivery** prompt
- Consider adjusting bids alongside budget for maximum impact
- Document the reallocation rationale for stakeholders

**Need more context?** Fetch these resources:
- \`entity-schema://insertionOrder\` for full IO field documentation
- \`entity-schema://lineItem\` for line item field documentation
- \`entity-fields://insertionOrder\` for updateMask paths
- \`entity-fields://lineItem\` for line item updateMask paths
`;
}