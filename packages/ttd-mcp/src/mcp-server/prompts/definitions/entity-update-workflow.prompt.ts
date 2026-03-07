import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * TTD Entity Update Workflow Prompt
 *
 * Guides AI agents through safely updating TTD entities using PUT semantics.
 * TTD uses whole-entity replacement (PUT), not partial PATCH — you must read
 * the current state first, then send the full updated object.
 */
export const ttdEntityUpdateWorkflowPrompt: Prompt = {
  name: "ttd_entity_update_workflow",
  description:
    "Step-by-step guide for safely updating TTD entities using PUT semantics. Covers safe read-modify-write pattern for campaigns, ad groups, ads, creatives, site lists, and bid lists.",
  arguments: [
    {
      name: "entityType",
      description:
        "Entity type to update: advertiser, campaign, adGroup, ad, creative, siteList, deal, conversionTracker, or bidList",
      required: true,
    },
    {
      name: "entityId",
      description: "TTD entity ID to update",
      required: true,
    },
  ],
};

export function getTtdEntityUpdateWorkflowMessage(
  args?: Record<string, string>
): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";

  return `# TTD Entity Update Workflow

Entity Type: \`${entityType}\`
Entity ID: \`${entityId}\`

---

## ⚠️ Critical: TTD Uses PUT (Not PATCH)

TTD's update API uses **full entity replacement** (HTTP PUT). This means:
- You MUST read the current entity first
- You MUST include ALL required fields in your update payload
- Any fields you omit may be reset to defaults or cause API errors
- Only send changes — but wrap them in the complete required structure

---

## Step 1: Read Current State

Fetch the entity before modifying it:

\`\`\`
Tool: ttd_get_entity
Input: {
  "entityType": "${entityType}",
  "entityId": "${entityId}"
}
\`\`\`

**Save the response.** You will use it as the base for your update payload.

> Fetch \`entity-schema://${entityType}\` for full field reference and \`entity-examples://${entityType}\` for update patterns.

---

## Step 2: Build Your Update Payload

Start with the full current entity from Step 1, then modify only the fields you want to change.

### Campaign Update (Budget Increase)

\`\`\`
Tool: ttd_update_entity
Input: {
  "entityType": "campaign",
  "entityId": "${entityId}",
  "data": {
    "CampaignId": "${entityId}",
    "AdvertiserId": "{current AdvertiserId}",
    "CampaignName": "{current CampaignName}",
    "Budget": { "Amount": 75000, "CurrencyCode": "USD" },
    "StartDate": "{current StartDate}",
    "EndDate": "{current EndDate}",
    "PacingMode": "{current PacingMode}"
  }
}
\`\`\`

### Ad Group Bid Adjustment

\`\`\`
Tool: ttd_update_entity
Input: {
  "entityType": "adGroup",
  "entityId": "${entityId}",
  "data": {
    "AdGroupId": "${entityId}",
    "CampaignId": "{current CampaignId}",
    "AdvertiserId": "{current AdvertiserId}",
    "AdGroupName": "{current AdGroupName}",
    "RTBAttributes": {
      "BudgetSettings": "{current BudgetSettings}",
      "BaseBidCPM": { "Amount": 7.50, "CurrencyCode": "USD" },
      "MaxBidCPM": { "Amount": 15.00, "CurrencyCode": "USD" }
    }
  }
}
\`\`\`

### Bulk Bid Adjustment (Preferred for Multiple Ad Groups)

For multiple ad group bids, use the specialized bid tool — it handles read-modify-write atomically:

\`\`\`
Tool: ttd_adjust_bids
Input: {
  "adjustments": [
    { "adGroupId": "${entityId}", "bidCPM": 7.50 }
  ]
}
\`\`\`

---

## Step 3: Execute the Update

Call \`ttd_update_entity\` with your full payload. Review the response for any errors.

---

## Step 4: Verify the Change

Confirm the update was applied:

\`\`\`
Tool: ttd_get_entity
Input: {
  "entityType": "${entityType}",
  "entityId": "${entityId}"
}
\`\`\`

Compare the returned values with what you set in Step 2.

---

## Gotchas

- **PUT replaces the entity**: Missing required fields cause API errors. Always start from the current state.
- **Entity IDs in body**: TTD typically requires the entity ID inside the body (e.g., \`CampaignId\` in the campaign object) in addition to the URL.
- **Budget is lifetime**: Campaign \`Budget.Amount\` is the total lifetime budget, not daily. Use ad group \`DailyBudget\` for day-level pacing.
- **Status changes**: To pause/resume entities, prefer \`ttd_bulk_update_status\` over manual status field updates.
- **Bid adjustments**: For bid changes, prefer \`ttd_adjust_bids\` over manual update — it handles the read-modify-write cycle safely.

---

## Rollback

If the update causes issues, restore the original values using the response you saved in Step 1:

\`\`\`
Tool: ttd_update_entity
Input: {
  "entityType": "${entityType}",
  "entityId": "${entityId}",
  "data": "{original entity from Step 1}"
}
\`\`\`

Always save the original state before making changes.
`;
}
