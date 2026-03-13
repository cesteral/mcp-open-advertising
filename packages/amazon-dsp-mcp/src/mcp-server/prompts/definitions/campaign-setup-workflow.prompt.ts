import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const campaignSetupWorkflowPrompt: Prompt = {
  name: "amazon_dsp_campaign_setup_workflow",
  description: "Step-by-step guide for creating a complete Amazon DSP campaign structure (Order > Line Item > Creative)",
  arguments: [
    {
      name: "profileId",
      description: "Amazon DSP Entity ID / Profile ID (from Amazon-Advertising-API-Scope header)",
      required: true,
    },
    {
      name: "objective",
      description: "Campaign goal (e.g., REACH, REMARKETING, BEHAVIORAL_RETARGETING, CONTEXTUAL_TARGETING)",
      required: false,
    },
  ],
};

export function getCampaignSetupWorkflowMessage(args?: Record<string, string>): string {
  const profileId = args?.profileId || "{profileId}";
  const objective = args?.objective || "REACH";

  return `# Amazon DSP Campaign Setup Workflow

## Prerequisites
- DSP Entity ID (Profile ID): \`${profileId}\`
- Ensure \`Amazon-Advertising-API-Scope\` header is set to your DSP entity ID
- Verify advertiser access: \`amazon_dsp_list_entities\` with entityType: "advertiser"

⚠️ **GOTCHA: Amazon-Advertising-API-Scope header must contain your DSP entity ID (profile ID).**
⚠️ **GOTCHA: Budget amounts are in USD dollars (not micro-currency). $50 → budget: 50.00**
⚠️ **GOTCHA: Amazon DSP has no DELETE endpoint. Use status: "ARCHIVED" to remove entities.**

## Step 1: Create Order (Campaign)

Orders are the top-level campaign entity in Amazon DSP.

\`\`\`json
amazon_dsp_create_entity({
  "entityType": "order",
  "profileId": "${profileId}",
  "data": {
    "name": "Q1 Brand Awareness Campaign",
    "advertiserId": "ADVERTISER_ID",
    "budget": 50000.00,
    "startDate": "2026-01-01T00:00:00Z",
    "endDate": "2026-03-31T23:59:59Z",
    "status": "DELIVERING"
  }
})
\`\`\`

**Campaign Goals / Objectives:** REACH, REMARKETING, BEHAVIORAL_RETARGETING, CONTEXTUAL_TARGETING

## Step 2: Create Line Item (Ad Group)

Line Items define targeting, bidding, and budget allocation within an Order.

\`\`\`json
amazon_dsp_create_entity({
  "entityType": "lineItem",
  "profileId": "${profileId}",
  "data": {
    "name": "Prospecting - Desktop Display",
    "orderId": "ORDER_ID_FROM_STEP_1",
    "budget": 10000.00,
    "status": "DELIVERING",
    "bidding": {
      "bidOptimization": "${objective === "REACH" ? "AUTO" : "MANUAL"}",
      "bidAmount": 2.50
    },
    "targetingCriteria": {
      "audience": {
        "include": [{ "type": "BEHAVIORAL", "value": ["in-market-auto"] }]
      }
    }
  }
})
\`\`\`

## Step 3: Create Creative

Creatives define the ad format and click-through destination.

\`\`\`json
amazon_dsp_create_entity({
  "entityType": "creative",
  "profileId": "${profileId}",
  "data": {
    "name": "300x250 Banner - Brand",
    "advertiserId": "ADVERTISER_ID",
    "clickThroughUrl": "https://example.com/landing",
    "creativeType": "DISPLAY",
    "status": "ACTIVE"
  }
})
\`\`\`

**Creative Types:** DISPLAY, VIDEO

## Step 4: Verify & Activate

1. Review entities: \`amazon_dsp_get_entity\` for each created entity
2. Activate if paused: \`amazon_dsp_bulk_update_status\` with status: "DELIVERING"

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Missing or invalid access token | Check Authorization: Bearer header |
| 403 Forbidden | Missing API scope header | Set Amazon-Advertising-API-Scope to your DSP entity ID |
| 400 Bad Request | Invalid date format | Use ISO 8601: YYYY-MM-DDTHH:mm:ssZ |
| 400 Bad Request | Budget too low | Amazon DSP requires minimum budget thresholds |

## Success Criteria

- [ ] Order created with correct budget and date range
- [ ] Line Item linked to Order via orderId
- [ ] Creative linked to correct advertiserId
- [ ] All entities in DELIVERING status
`;
}
