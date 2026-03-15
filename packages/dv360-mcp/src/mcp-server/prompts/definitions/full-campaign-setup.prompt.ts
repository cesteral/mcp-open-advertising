// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Full Campaign Setup Workflow Prompt
 *
 * Guides AI agents through creating a complete campaign structure in DV360:
 * Campaign → Insertion Order → Line Items → Targeting (optional)
 *
 * This prompt complements the dynamic schema system by providing:
 * - Step-by-step workflow for multi-entity creation
 * - DV360-specific validation rules and gotchas
 * - Error troubleshooting guidance
 * - Best practices for entity relationships
 */
export const fullCampaignSetupPrompt: Prompt = {
  name: "full_campaign_setup_workflow",
  description:
    "Step-by-step guide for creating a complete DV360 campaign structure including campaign, insertion order, line items, and optional targeting. Includes validation rules, common pitfalls, and troubleshooting guidance.",
  arguments: [
    {
      name: "advertiserId",
      description: "DV360 Advertiser ID where the campaign will be created",
      required: true,
    },
    {
      name: "includeTargeting",
      description: "Whether to include targeting setup guidance (true/false)",
      required: false,
    },
  ],
};

/**
 * Generate prompt message with workflow guidance
 */
export function getFullCampaignSetupPromptMessage(args?: Record<string, string>): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const includeTargeting = args?.includeTargeting === "true";

  return `# Full Campaign Setup Workflow for DV360

You are guiding the creation of a complete campaign structure in DV360. This workflow creates entities in the correct order with proper validation at each step.

## Advertiser Context
- **Advertiser ID**: ${advertiserId}
- **Targeting**: ${includeTargeting ? "Will include targeting setup" : "Basic setup without targeting"}

## Workflow Overview

The campaign creation process follows this strict hierarchy:

\`\`\`
Campaign (top-level)
  ↓
Insertion Order (IO, belongs to campaign)
  ↓
Line Item(s) (belong to IO)
  ↓
Targeting Options (optional, assigned to line items)
\`\`\`

**Critical Rules:**
1. Campaign must be created first (provides campaignId)
2. Insertion Order requires campaignId from step 1
3. Line Items require insertionOrderId from step 2
4. Targeting requires lineItemId from step 3

---

## Step 1: Fetch Required Schemas

Before creating entities, fetch their schemas using MCP Resources:

\`\`\`
Resource URIs:
- entity-schema://campaign
- entity-schema://insertionOrder
- entity-schema://lineItem
${includeTargeting ? "- entity-schema://assignedTargetingOption" : ""}

Entity Examples (for reference):
- entity-examples://campaign
- entity-examples://insertionOrder
- entity-examples://lineItem
${includeTargeting ? "- entity-examples://assignedTargetingOption" : ""}
\`\`\`

**Action:** Fetch these resources to understand required fields for each entity type.

---

## Step 2: Create Campaign

### Required Fields
- \`displayName\` (string): Descriptive campaign name
- \`entityStatus\` (enum): **MUST be \`ENTITY_STATUS_PAUSED\` or \`ENTITY_STATUS_ACTIVE\`**
  - ⚠️ **GOTCHA**: Campaigns CANNOT use \`ENTITY_STATUS_DRAFT\` (this is only for IOs/Line Items)
- \`campaignGoal\` (object):
  - \`campaignGoalType\` (enum): e.g., \`CAMPAIGN_GOAL_TYPE_BRAND_AWARENESS\`
- \`campaignFlight\` (object):
  - \`plannedDates.startDate\` (date): Campaign start date
  - \`plannedDates.endDate\` (optional): Campaign end date
- \`frequencyCap\` (object):
  - \`timeUnit\` (enum): e.g., \`TIME_UNIT_LIFETIME\`
  - \`timeUnitCount\` (integer): Number of time units
  - \`maxImpressions\` (integer): Maximum impressions per user

### Tool Call
\`\`\`
Tool: create_entity
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "campaign",
  "data": {
    "displayName": "Your Campaign Name",
    "entityStatus": "ENTITY_STATUS_PAUSED",
    "campaignGoal": {
      "campaignGoalType": "CAMPAIGN_GOAL_TYPE_BRAND_AWARENESS"
    },
    "campaignFlight": {
      "plannedDates": {
        "startDate": { "year": 2025, "month": 1, "day": 1 }
      }
    },
    "frequencyCap": {
      "timeUnit": "TIME_UNIT_LIFETIME",
      "timeUnitCount": 1,
      "maxImpressions": 10
    }
  }
}
\`\`\`

### Success Criteria
- ✅ Response includes \`campaignId\` (save this for next step!)
- ✅ Campaign is in PAUSED or ACTIVE status

### Common Errors
| Error | Cause | Solution |
|-------|-------|----------|
| "DRAFT status not allowed" | Used \`ENTITY_STATUS_DRAFT\` | Use \`ENTITY_STATUS_PAUSED\` instead |
| "Invalid date" | Start date is in the past or after end date | Ensure start date is future and before end date |
| "Missing frequencyCap" | Frequency cap not provided | Include all three frequencyCap fields |

---

## Step 3: Create Insertion Order

### Required Fields
- \`displayName\` (string): Descriptive IO name
- \`campaignId\` (string): **From Step 2 response**
- \`entityStatus\` (enum): **MUST be \`ENTITY_STATUS_DRAFT\`**
  - ⚠️ **GOTCHA**: IOs MUST be created in DRAFT status (opposite of campaigns!)

### Optional but Recommended
- \`kpi\` (object): Performance goal
  - For viewability: \`kpiType: "KPI_TYPE_VIEWABILITY"\`, \`kpiAmountMicros: 70000000\` (70%)
- \`budget\` (object): IO-level budget
  - \`budgetUnit\` (enum): e.g., \`BUDGET_UNIT_CURRENCY\`
  - \`maxAmount\` (integer): Budget in micros (1 USD = 1,000,000 micros)

### Tool Call
\`\`\`
Tool: create_entity
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "insertionOrder",
  "data": {
    "displayName": "Your IO Name",
    "campaignId": "CAMPAIGN_ID_FROM_STEP_2",
    "entityStatus": "ENTITY_STATUS_DRAFT",
    "kpi": {
      "kpiType": "KPI_TYPE_VIEWABILITY",
      "kpiAmountMicros": 70000000
    }
  }
}
\`\`\`

### Success Criteria
- ✅ Response includes \`insertionOrderId\` (save this for next step!)
- ✅ IO is in DRAFT status
- ✅ IO is linked to the correct campaignId

### Common Errors
| Error | Cause | Solution |
|-------|-------|----------|
| "Must be DRAFT status" | Used PAUSED or ACTIVE | IOs must be created as DRAFT |
| "Invalid campaignId" | Wrong campaignId or missing | Use campaignId from Step 2 response |
| "KPI missing kpiAmountMicros" | Used KPI_TYPE_VIEWABILITY without amount | Include kpiAmountMicros (e.g., 70000000 for 70%) |

---

## Step 4: Create Line Item(s)

### Required Fields (Per Line Item)
- \`displayName\` (string): Descriptive line item name
- \`insertionOrderId\` (string): **From Step 3 response**
- \`lineItemType\` (enum): e.g., \`LINE_ITEM_TYPE_DISPLAY_DEFAULT\`
- \`entityStatus\` (enum): **\`ENTITY_STATUS_DRAFT\` recommended for new line items**
- \`partnerRevenueModel\` (object):
  - \`markupType\` (enum): e.g., \`PARTNER_REVENUE_MODEL_MARKUP_TYPE_CPM\`
  - \`markupAmount\` (integer): **MUST be at least 100000** (0.10 USD)
    - ⚠️ **GOTCHA**: Markup amounts are in micros. 100000 = $0.10, 1000000 = $1.00
- \`pacing\` (object):
  - \`pacingPeriod\` (enum): e.g., \`PACING_PERIOD_FLIGHT\` or \`PACING_PERIOD_DAILY\`
  - \`pacingType\` (enum): e.g., \`PACING_TYPE_EVEN\`
  - \`dailyMaxMicros\` (integer): **Required if using PACING_PERIOD_DAILY**

### Optional but Recommended
- \`budget\` (object): Line item budget
  - \`budgetAllocationType\` (enum): \`LINE_ITEM_BUDGET_ALLOCATION_TYPE_FIXED\`
  - \`maxAmount\` (integer): Budget in micros

### Tool Call (Repeat for Each Line Item)
\`\`\`
Tool: create_entity
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "lineItem",
  "data": {
    "displayName": "Your Line Item Name",
    "insertionOrderId": "IO_ID_FROM_STEP_3",
    "lineItemType": "LINE_ITEM_TYPE_DISPLAY_DEFAULT",
    "entityStatus": "ENTITY_STATUS_DRAFT",
    "partnerRevenueModel": {
      "markupType": "PARTNER_REVENUE_MODEL_MARKUP_TYPE_CPM",
      "markupAmount": 500000
    },
    "pacing": {
      "pacingPeriod": "PACING_PERIOD_FLIGHT",
      "pacingType": "PACING_TYPE_EVEN"
    }
  }
}
\`\`\`

### Success Criteria (Per Line Item)
- ✅ Response includes \`lineItemId\` (save for targeting if needed!)
- ✅ Line item is in DRAFT status
- ✅ Line item is linked to correct insertionOrderId

### Common Errors
| Error | Cause | Solution |
|-------|-------|----------|
| "Markup too small" | \`markupAmount < 100000\` | Use at least 100000 (0.10 USD) |
| "Missing dailyMaxMicros" | Used PACING_PERIOD_DAILY without dailyMaxMicros | Include dailyMaxMicros when using daily pacing |
| "Invalid insertionOrderId" | Wrong insertionOrderId | Use insertionOrderId from Step 3 response |
| "Budget allocation error" | Used FIXED without maxAmount | Include maxAmount when using FIXED allocation |

---

${
  includeTargeting
    ? `## Step 5: Assign Targeting Options (Optional)

### Overview
Targeting options refine which users see your ads. Common targeting types:
- \`TARGETING_TYPE_GEO_REGION\`: Geographic targeting
- \`TARGETING_TYPE_AGE_RANGE\`: Age demographics
- \`TARGETING_TYPE_GENDER\`: Gender demographics
- \`TARGETING_TYPE_DEVICE_TYPE\`: Device targeting
- \`TARGETING_TYPE_BROWSER\`: Browser targeting

### Required Fields
- \`advertiserId\` (string): ${advertiserId}
- \`lineItemId\` (string): **From Step 4 response**
- \`targetingType\` (enum): Type of targeting (see list above)
- \`targetingOptionId\` (string): DV360 targeting option ID

⚠️ **GOTCHA**: You must know valid \`targetingOptionId\` values for each targeting type. Use \`list_entities\` with \`entityType: "targetingOption"\` to discover valid IDs.

### Example: Geographic Targeting
\`\`\`
Tool: create_entity
Parameters:
{
  "advertiserId": "${advertiserId}",
  "entityType": "assignedTargetingOption",
  "data": {
    "lineItemId": "LINE_ITEM_ID_FROM_STEP_4",
    "targetingType": "TARGETING_TYPE_GEO_REGION",
    "assignedTargetingOptionDetails": {
      "targetingType": "TARGETING_TYPE_GEO_REGION",
      "geoRegionDetails": {
        "targetingOptionId": "2840"
      }
    }
  }
}
\`\`\`

### Success Criteria
- ✅ Response includes \`assignedTargetingOptionId\`
- ✅ Targeting is linked to correct lineItemId

### Common Errors
| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid targetingOptionId" | Used non-existent ID | Use \`list_entities\` to find valid IDs |
| "Wrong targeting type format" | Mismatched details for targeting type | Ensure details match targeting type (e.g., geoRegionDetails for GEO_REGION) |

---`
    : ""
}

## Final Validation Checklist

After completing all steps, verify:

- [ ] Campaign is created and has \`campaignId\`
- [ ] Insertion Order is linked to campaign and has \`insertionOrderId\`
- [ ] All line items are linked to IO and have \`lineItemId\`
${includeTargeting ? "- [ ] Targeting options are assigned to correct line items" : ""}
- [ ] All entities are in expected status (Campaign: PAUSED/ACTIVE, IO/Line Items: DRAFT)
- [ ] Budget and pacing configurations are valid

## Activation Workflow (After Creation)

Once all entities are created and validated:

1. **Activate Insertion Order**: Use \`update_entity\` to change IO status from DRAFT → ACTIVE
2. **Activate Line Items**: Use \`bulk_update_status\` to change line items from DRAFT → ACTIVE
3. **Activate Campaign** (if in PAUSED): Change campaign status to ACTIVE

⚠️ **Important**: Entities must be activated in order: IO first, then line items, then campaign.

## Troubleshooting Common Issues

### "Creation succeeded but entity not found"
- **Cause**: DV360 API eventual consistency
- **Solution**: Wait 5-10 seconds, then retry \`get_entity\`

### "Budget validation failed"
- **Cause**: Line item budget exceeds IO budget or IO budget exceeds campaign budget
- **Solution**: Ensure budget hierarchy: Campaign ≥ IO ≥ Sum of Line Items

### "Targeting assignment failed"
- **Cause**: Invalid targetingOptionId or line item not in correct status
- **Solution**: Verify line item exists and is in DRAFT/ACTIVE status

### "Authentication error"
- **Cause**: Invalid credentials or insufficient permissions
- **Solution**: Verify advertiser access and OAuth scopes

---

## Next Steps

After successful campaign setup:
- Use \`get_entity\` to verify each entity was created correctly
- Use \`list_entities\` to view the full campaign hierarchy
- Monitor campaign delivery using the reporting MCP server (dbm-mcp)

**Need more help?** Fetch these resources:
- \`entity-schema://{entityType}\` for detailed field documentation
- \`entity-examples://{entityType}\` for example payloads
- \`entity-fields://{entityType}\` for available field paths (useful for updates)
`;
}