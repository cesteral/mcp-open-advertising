import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Troubleshoot Underdelivery Workflow Prompt
 *
 * Guides AI agents through diagnosing and fixing underdelivering campaigns
 * or line items in DV360. Covers the full investigation flow:
 * Gather data → Check config → Inspect targeting → Diagnose → Fix → Monitor
 *
 * This prompt coordinates tools across both MCP servers:
 * - dbm-mcp for reporting/metrics (pacing, performance)
 * - dv360-mcp for entity configuration and updates
 */
export const troubleshootUnderdeliveryPrompt: Prompt = {
  name: "troubleshoot_underdelivery",
  description:
    "Step-by-step guide for diagnosing and fixing underdelivering campaigns or line items in DV360. Covers pacing analysis, configuration checks, targeting review, and corrective actions.",
  arguments: [
    {
      name: "advertiserId",
      description: "DV360 Advertiser ID for the underdelivering entity",
      required: true,
    },
    {
      name: "entityType",
      description:
        'Type of entity to troubleshoot (e.g., "lineItem", "insertionOrder", "campaign"). Defaults to "lineItem".',
      required: false,
    },
    {
      name: "entityId",
      description: "Specific entity ID to troubleshoot (if known)",
      required: false,
    },
  ],
};

/**
 * Generate prompt message with troubleshooting workflow guidance
 */
export function getTroubleshootUnderdeliveryPromptMessage(
  args?: Record<string, string>,
): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const entityType = args?.entityType || "lineItem";
  const entityId = args?.entityId || `{${entityType}Id}`;

  return `# Troubleshoot Underdelivery Workflow for DV360

You are diagnosing and fixing an underdelivering entity in DV360. This workflow uses both the **dbm-mcp** (reporting) and **dv360-mcp** (management) servers.

## Context
- **Advertiser ID**: ${advertiserId}
- **Entity Type**: ${entityType}
- **Entity ID**: ${entityId}

## Workflow Overview

\`\`\`
Gather Delivery Data (dbm-mcp)
  ↓
Check Entity Configuration (dv360-mcp)
  ↓
Inspect Targeting (dv360-mcp)
  ↓
Diagnose Root Cause
  ↓
Apply Fixes (dv360-mcp)
  ↓
Monitor Recovery (dbm-mcp)
\`\`\`

---

## Step 1: Gather Delivery Data

Use the **dbm-mcp** reporting server to understand the current delivery situation.

### 1a. Check Pacing Status
\`\`\`
Tool: get_pacing_status (dbm-mcp)
Parameters:
{
  "campaignId": "${entityType === "campaign" ? entityId : "{campaignId}"}",
  "advertiserId": "${advertiserId}"
}
\`\`\`

**What to look for:**
- **Pacing percentage** < 90% indicates underdelivery
- **Pacing percentage** < 70% indicates severe underdelivery
- Note the expected vs. actual spend/impressions

### 1b. Get Performance Metrics
\`\`\`
Tool: get_performance_metrics (dbm-mcp)
Parameters:
{
  "campaignId": "${entityType === "campaign" ? entityId : "{campaignId}"}",
  "advertiserId": "${advertiserId}",
  "dateRange": "LAST_7_DAYS"
}
\`\`\`

**What to look for:**
- **CPM trends**: Increasing CPMs may indicate competitive pressure
- **CTR/CPA**: Unusually low CTR may indicate creative fatigue or poor targeting
- **Win rate**: Low win rate suggests bids are too low

### 1c. Get Historical Trends
\`\`\`
Tool: get_historical_metrics (dbm-mcp)
Parameters:
{
  "campaignId": "${entityType === "campaign" ? entityId : "{campaignId}"}",
  "advertiserId": "${advertiserId}",
  "startDate": "{7_days_ago}",
  "endDate": "{today}",
  "granularity": "DAILY"
}
\`\`\`

**What to look for:**
- When did underdelivery start? (sudden drop vs. gradual decline)
- Day-of-week patterns (weekends often deliver differently)
- Correlation with any changes made

---

## Step 2: Check Entity Configuration

Use the **dv360-mcp** management server to inspect the entity's settings.

### 2a. Get Entity Details
\`\`\`
Tool: dv360_get_entity (dv360-mcp)
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "${entityType}",
  "${entityType}Id": "${entityId}"
}
\`\`\`

**Configuration checklist:**
- [ ] **Entity Status**: Must be \`ENTITY_STATUS_ACTIVE\` (not PAUSED or DRAFT)
- [ ] **Flight Dates**: Start date must be in the past, end date in the future
- [ ] **Budget**: Sufficient remaining budget for the flight period
- [ ] **Bid Strategy**: Appropriate bid amount for the market
- [ ] **Pacing**: Correct pacing type and period

⚠️ **GOTCHA**: If the ${entityType} is ACTIVE but its parent (IO or campaign) is PAUSED, delivery will still be blocked. Always check the full hierarchy.

### 2b. Check Parent Entities (if applicable)
${
  entityType === "lineItem"
    ? `\`\`\`
Tool: dv360_get_entity (dv360-mcp)
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "insertionOrder",
  "insertionOrderId": "{insertionOrderId_from_lineItem}"
}
\`\`\`

Also check the campaign:
\`\`\`
Tool: dv360_get_entity (dv360-mcp)
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "campaign",
  "campaignId": "{campaignId_from_insertionOrder}"
}
\`\`\``
    : entityType === "insertionOrder"
      ? `\`\`\`
Tool: dv360_get_entity (dv360-mcp)
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "campaign",
  "campaignId": "{campaignId_from_insertionOrder}"
}
\`\`\``
      : "Campaign is the top-level entity — no parent to check."
}

---

## Step 3: Inspect Targeting

Overly narrow targeting is one of the most common causes of underdelivery.

### 3a. List Assigned Targeting
\`\`\`
Tool: dv360_list_assigned_targeting (dv360-mcp)
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "${entityType}",
  "${entityType}Id": "${entityId}"
}
\`\`\`

**Targeting red flags:**
- [ ] **Geographic targeting** too narrow (single city vs. national)
- [ ] **Audience lists** too small or stale
- [ ] **Too many negative targeting exclusions** cutting off inventory
- [ ] **Device type** restricted to a single device
- [ ] **Day & time** parting leaving too few delivery hours
- [ ] **Keyword targeting** too specific
- [ ] **Content/channel exclusions** blocking major inventory sources

⚠️ **GOTCHA**: Targeting at the IO level combines (ANDs) with line item targeting. Check both levels for line items.

---

## Step 4: Diagnose Common Issues

Based on the data gathered, match the symptoms to a root cause:

| Symptom | Likely Cause | Diagnostic Check |
|---------|--------------|-----------------|
| Pacing < 50%, low win rate | **Bid too low** | Compare CPM to market average |
| Pacing < 50%, narrow audience | **Targeting too restrictive** | Review audience size, geo scope |
| Sudden drop to 0% delivery | **Budget exhausted** | Check remaining budget vs. spend |
| Delivery stopped on specific date | **Flight dates ended** | Verify end date hasn't passed |
| Entity active but 0 delivery | **Parent entity paused** | Check IO and campaign status |
| Gradual decline over weeks | **Audience fatigue / frequency cap** | Check frequency cap settings |
| High CPM, low impressions | **Competitive pressure** | Review bid strategy, consider auto-bidding |
| Low CTR, declining delivery | **Creative fatigue** | Check creative rotation, ad quality |

### Priority Order for Fixes
1. **Status issues** (entity or parent paused/draft) — immediate fix
2. **Budget exhaustion** — reallocate or increase budget
3. **Flight date issues** — extend or correct dates
4. **Bid too low** — increase bids by 15-25%
5. **Targeting too narrow** — broaden targeting scope
6. **Frequency/creative issues** — adjust caps, refresh creatives

---

## Step 5: Apply Fixes

Based on your diagnosis, apply the appropriate fix:

### Fix: Increase Bid
\`\`\`
Tool: dv360_update_entity (dv360-mcp)
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "${entityType}",
  "${entityType}Id": "${entityId}",
  "data": {
    "bidStrategy": {
      "fixedBid": {
        "bidAmountMicros": "{new_bid_in_micros}"
      }
    }
  },
  "updateMask": "bidStrategy.fixedBid.bidAmountMicros",
  "reason": "Increasing bid to address underdelivery - pacing at {X}%"
}
\`\`\`

⚠️ **GOTCHA**: Bid amounts are in micros. $5.00 CPM = 5000000 micros. A 20% increase on $5 CPM = 6000000 micros.

### Fix: Expand Budget
\`\`\`
Tool: dv360_update_entity (dv360-mcp)
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "${entityType}",
  "${entityType}Id": "${entityId}",
  "data": {
    "budget": {
      "budgetUnit": "BUDGET_UNIT_CURRENCY",
      "maxAmount": "{new_budget_in_micros}"
    }
  },
  "updateMask": "budget.maxAmount",
  "reason": "Increasing budget to address underdelivery"
}
\`\`\`

### Fix: Activate Paused Entity
\`\`\`
Tool: dv360_update_entity (dv360-mcp)
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "${entityType}",
  "${entityType}Id": "${entityId}",
  "data": {
    "entityStatus": "ENTITY_STATUS_ACTIVE"
  },
  "updateMask": "entityStatus",
  "reason": "Reactivating to restore delivery"
}
\`\`\`

### Fix: Remove Overly Restrictive Targeting
\`\`\`
Tool: dv360_delete_assigned_targeting (dv360-mcp)
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "${entityType}",
  "${entityType}Id": "${entityId}",
  "targetingType": "{TARGETING_TYPE_TO_REMOVE}",
  "assignedTargetingOptionId": "{targeting_option_id}"
}
\`\`\`

⚠️ **GOTCHA**: Removing targeting broadens reach. Be careful not to remove brand-safety targeting or advertiser-mandated restrictions without approval.

### Fix: Extend Flight Dates
\`\`\`
Tool: dv360_update_entity (dv360-mcp)
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "${entityType}",
  "${entityType}Id": "${entityId}",
  "data": {
    "flight": {
      "dateRange": {
        "endDate": { "year": 2026, "month": 12, "day": 31 }
      }
    }
  },
  "updateMask": "flight.dateRange.endDate",
  "reason": "Extending flight end date to allow continued delivery"
}
\`\`\`

---

## Step 6: Monitor Recovery

After applying fixes, monitor to confirm delivery improves.

### 6a. Immediate Check (30 minutes after fix)
\`\`\`
Tool: get_pacing_status (dbm-mcp)
Parameters:
{
  "campaignId": "${entityType === "campaign" ? entityId : "{campaignId}"}",
  "advertiserId": "${advertiserId}"
}
\`\`\`

**Expected**: Pacing should begin improving. DV360 delivery changes can take 15-30 minutes to take effect.

### 6b. Follow-up Check (4-6 hours after fix)
\`\`\`
Tool: get_performance_metrics (dbm-mcp)
Parameters:
{
  "campaignId": "${entityType === "campaign" ? entityId : "{campaignId}"}",
  "advertiserId": "${advertiserId}",
  "dateRange": "TODAY"
}
\`\`\`

**Expected**: Delivery metrics should show improvement. If not, revisit Step 4 for additional issues.

### 6c. Day-over-Day Comparison (24 hours after fix)
\`\`\`
Tool: get_historical_metrics (dbm-mcp)
Parameters:
{
  "campaignId": "${entityType === "campaign" ? entityId : "{campaignId}"}",
  "advertiserId": "${advertiserId}",
  "startDate": "{2_days_ago}",
  "endDate": "{today}",
  "granularity": "DAILY"
}
\`\`\`

**Expected**: Clear improvement in daily delivery volume compared to pre-fix baseline.

---

## Escalation Criteria

If the above steps don't resolve underdelivery, consider:

1. **Creative approval issues**: Check if creatives are pending review or rejected
2. **Account-level blocks**: Billing issues, policy violations
3. **Inventory availability**: Niche targeting may simply lack inventory
4. **Programmatic deal issues**: If using PMP/PG deals, verify deal status with the publisher
5. **Seasonal factors**: Some verticals have natural delivery fluctuations

---

## Quick Reference: Common Underdelivery Causes by Severity

| Severity | Cause | Typical Fix Time |
|----------|-------|-----------------|
| 🔴 Critical | Entity/parent paused or draft | Immediate |
| 🔴 Critical | Budget fully exhausted | Immediate |
| 🟠 High | Flight dates expired | Immediate |
| 🟠 High | Bid 30%+ below market | 2-4 hours |
| 🟡 Medium | Targeting too narrow | 4-8 hours |
| 🟡 Medium | Frequency cap too restrictive | 4-8 hours |
| 🟢 Low | Creative fatigue | 24-48 hours |
| 🟢 Low | Seasonal inventory drop | External factor |

---

## Next Steps

After resolving the immediate underdelivery:
- Set up recurring monitoring using \`get_pacing_status\`
- Consider the **budget_reallocation_workflow** prompt if budget needs redistribution
- Review campaign-level frequency caps to prevent future issues
- Document the root cause and fix for future reference

**Need more context?** Fetch these resources:
- \`entity-schema://${entityType}\` for full field documentation
- \`entity-fields://${entityType}\` for available updateMask paths
- \`targeting-types://\` for all available targeting types
`;
}
