// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * TTD Entity Update Workflow Prompt
 *
 * Guides AI agents through safely updating TTD entities. TTD's v3 PUT is a
 * PARTIAL update (TTD Foundations §8, "Partial Object Updates"): send the ID
 * and only the properties to change. Echoing a whole GET payload back is the
 * failure mode — it re-sends deprecated properties (410 Gone) and slows the
 * request — so this prompt must never tell agents to send the full entity.
 */
export const ttdEntityUpdateWorkflowPrompt: Prompt = {
  name: "ttd_entity_update_workflow",
  description:
    "Step-by-step guide for safely updating TTD entities with partial PUTs: send only the fields that change. Covers advertisers, campaigns, ad groups, creatives and conversion trackers.",
  arguments: [
    {
      name: "entityType",
      description:
        "Entity type to update: advertiser, campaign, adGroup, creative, or conversionTracker",
      required: true,
    },
    {
      name: "entityId",
      description: "TTD entity ID to update",
      required: true,
    },
  ],
};

export function getTtdEntityUpdateWorkflowMessage(args?: Record<string, string>): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";

  return `# TTD Entity Update Workflow

Entity Type: \`${entityType}\`
Entity ID: \`${entityId}\`

---

## TTD Updates Are Partial

TTD's v3 \`PUT\` is a **partial update** (TTD Foundations §8): send the entity ID and only the properties you want to change. Properties you leave out are **not** changed.
- **Do not** send the whole entity back from a GET — deprecated properties in it can fail the request (\`410 Gone\`), and large payloads slow it down.
- **Arrays replace** the current array instead of adding to it. To add an item (e.g. a creative ID), read the current array first and send the full new array.
- A property you include is updated **even if you send \`null\`**.

---

## Step 1: Read Current State

Fetch the entity so you know the current values (for arrays you will extend, and for rollback):

\`\`\`
Tool: ttd_get_entity
Input: {
  "entityType": "${entityType}",
  "entityId": "${entityId}"
}
\`\`\`

**Save the response** for rollback.

> Fetch \`entity-schema://${entityType}\` for full field reference and \`entity-examples://${entityType}\` for update patterns.

---

## Step 2: Build a Payload With Only the Changed Fields

### Campaign Update (Budget Increase)

\`\`\`
Tool: ttd_update_entity
Input: {
  "entityType": "campaign",
  "entityId": "${entityId}",
  "advertiserId": "{AdvertiserId}",
  "data": {
    "Budget": { "Amount": 75000, "CurrencyCode": "USD" }
  }
}
\`\`\`

### Ad Group Bid Adjustment

For bids, prefer \`ttd_adjust_bids\` (below). A direct update sends only the changed bid objects:

\`\`\`
Tool: ttd_update_entity
Input: {
  "entityType": "adGroup",
  "entityId": "${entityId}",
  "advertiserId": "{AdvertiserId}",
  "campaignId": "{CampaignId}",
  "data": {
    "RTBAttributes": {
      "BaseBidCPM": { "Amount": 7.50, "CurrencyCode": "USD" },
      "MaxBidCPM": { "Amount": 15.00, "CurrencyCode": "USD" }
    }
  }
}
\`\`\`

### Bulk Bid Adjustment (Preferred for Multiple Ad Groups)

\`ttd_adjust_bids\` sends one partial PUT per ad group with only the changed bid fields, and reuses each ad group's current bid currency when you omit \`currencyCode\`:

\`\`\`
Tool: ttd_adjust_bids
Input: {
  "adjustments": [
    { "adGroupId": "${entityId}", "baseBidCpm": 7.50, "maxBidCpm": 15.00 }
  ]
}
\`\`\`

---

## Step 3: Execute the Update

Call \`ttd_update_entity\` with the changed fields only. Review the response for any errors.

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

- **PUT is partial**: only the properties you send change. Do not paste the GET response back.
- **Arrays replace**: send the complete new array (current items plus additions).
- **Entity IDs in body**: TTD typically requires the entity ID inside the body (e.g., \`CampaignId\` in the campaign object) in addition to the URL.
- **Budget is lifetime**: Campaign \`Budget.Amount\` is the total lifetime budget, not daily. Use ad group \`DailyBudget\` for day-level pacing.
- **Status changes**: To pause/resume entities, prefer \`ttd_bulk_update_status\` over manual status field updates.
- **Bid adjustments**: For bid changes, prefer \`ttd_adjust_bids\` over manual update — it sends only the changed bid fields.

---

## Rollback

If the update causes issues, send the **original values of the fields you changed**, taken from the response you saved in Step 1 (not the whole entity):

\`\`\`
Tool: ttd_update_entity
Input: {
  "entityType": "${entityType}",
  "entityId": "${entityId}",
  "data": { "{changed field}": "{its original value from Step 1}" }
}
\`\`\`

Always save the original state before making changes.
`;
}
