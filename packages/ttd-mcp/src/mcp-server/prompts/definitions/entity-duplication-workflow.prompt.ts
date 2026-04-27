// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * TTD Entity Duplication Workflow Prompt
 *
 * Guides AI agents through duplicating TTD entities (campaigns, ad groups, ads, creatives).
 * TTD has no native duplicate/copy API — this uses the get-then-create pattern.
 */
export const ttdEntityDuplicationWorkflowPrompt: Prompt = {
  name: "ttd_entity_duplication_workflow",
  description:
    "Step-by-step guide for duplicating TTD entities (campaigns, ad groups, ads, creatives) using the get-then-create pattern — covers A/B testing, scaling to new markets, and campaign templating.",
  arguments: [
    {
      name: "entityType",
      description: "Entity type to duplicate: campaign, adGroup, ad, or creative",
      required: true,
    },
    {
      name: "entityId",
      description: "TTD entity ID to duplicate",
      required: true,
    },
  ],
};

export function getTtdEntityDuplicationWorkflowMessage(args?: Record<string, string>): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";

  return `# TTD Entity Duplication Workflow

Entity Type: \`${entityType}\`
Entity ID: \`${entityId}\`

---

## Overview

TTD does not have a native duplicate/copy API. To duplicate an entity, use the **get-then-create** pattern:

1. Read the source entity
2. Strip ID fields and update identifying info (names, dates)
3. Create the copy under the same parent
4. Verify and activate when ready

---

## Step 1: Read the Source Entity

\`\`\`
Tool: ttd_get_entity
Input: {
  "entityType": "${entityType}",
  "entityId": "${entityId}"
}
\`\`\`

Save the full response — this is your template.

> Fetch \`entity-schema://${entityType}\` for the fields you must strip before re-creating.

---

## Step 2: Prepare the Copy Payload

Starting from the source entity response, make these modifications:

### Fields to Remove (always)
- The entity's own ID field (e.g., \`CampaignId\`, \`AdGroupId\`, \`AdId\`, \`CreativeId\`)
- Any read-only metadata: \`CreatedAt\`, \`LastModified\`, \`Version\`, \`Status\` (if auto-set)

### Fields to Update
- **Name**: Add suffix to distinguish the copy (e.g., \`"Q1 Campaign - Copy"\`)
- **Dates**: Update \`StartDate\` and \`EndDate\` if needed
- **Budget/Bid**: Adjust for the new copy's goals
- **Parent ID**: Keep the same parent (e.g., same \`CampaignId\` for ad group copies)

### Campaign Copy Example

\`\`\`
Tool: ttd_create_entity
Input: {
  "entityType": "campaign",
  "data": {
    "AdvertiserId": "{source AdvertiserId}",
    "CampaignName": "Q1 2025 Brand - Copy",
    "Budget": { "Amount": 50000, "CurrencyCode": "USD" },
    "StartDate": "2025-04-01T00:00:00",
    "EndDate": "2025-06-30T23:59:59",
    "PacingMode": "PaceEvenly"
  }
}
\`\`\`

### Ad Group Copy Example

\`\`\`
Tool: ttd_create_entity
Input: {
  "entityType": "adGroup",
  "data": {
    "AdGroupName": "Prospecting US - Copy",
    "CampaignId": "{parent CampaignId}",
    "AdvertiserId": "{source AdvertiserId}",
    "RTBAttributes": {
      "BudgetSettings": {
        "Budget": { "Amount": 10000, "CurrencyCode": "USD" },
        "DailyBudget": { "Amount": 500, "CurrencyCode": "USD" },
        "PacingMode": "PaceEvenly"
      },
      "BaseBidCPM": { "Amount": 5.00, "CurrencyCode": "USD" },
      "MaxBidCPM": { "Amount": 12.00, "CurrencyCode": "USD" }
    }
  }
}
\`\`\`

**Save**: Note the returned ID from the response.

---

## Step 3: Customize the Copy

After creation, apply your desired differences:

### Change Targeting (Ad Group)

\`\`\`
Tool: ttd_update_entity
Input: {
  "entityType": "adGroup",
  "entityId": "{new adGroup ID}",
  "data": {
    "AdGroupId": "{new adGroup ID}",
    "CampaignId": "{parent CampaignId}",
    "AdvertiserId": "{AdvertiserId}",
    "AdGroupName": "Prospecting UK - Copy",
    "RTBAttributes": {
      "BudgetSettings": "...",
      "BaseBidCPM": { "Amount": 5.00, "CurrencyCode": "USD" },
      "GeoSegments": ["GBR"]
    }
  }
}
\`\`\`

---

## Step 4: Verify the Copy

\`\`\`
Tool: ttd_get_entity
Input: {
  "entityType": "${entityType}",
  "entityId": "{new entity ID}"
}
\`\`\`

---

## Step 5: Activate

\`\`\`
Tool: ttd_bulk_update_status
Input: {
  "entityType": "${entityType}",
  "entityIds": ["{new entity ID}"],
  "status": "Running"
}
\`\`\`

---

## Common Duplication Patterns

### A/B Testing (Bid Test)

1. Duplicate an ad group
2. Set a different \`BaseBidCPM\` on the copy
3. Run both simultaneously
4. Compare via report: \`ttd_get_report\` segmented by \`AdGroupId\`

### Scaling to New Geos

1. Duplicate a proven campaign or ad group
2. Update geographic targeting on the copy (GeoSegments or SiteList)
3. Adjust budget for the new market
4. Activate

### Seasonal Refresh

1. Duplicate a past campaign
2. Update \`StartDate\`/\`EndDate\` to new period
3. Update creatives to seasonal versions
4. Reset budget if needed

### Bulk Duplication

For creating many copies at once:

\`\`\`
Tool: ttd_bulk_create_entities
Input: {
  "entityType": "${entityType}",
  "items": [
    { "AdGroupName": "Copy 1 - East", ... },
    { "AdGroupName": "Copy 2 - West", ... }
  ]
}
\`\`\`

---

## Success Criteria

- [ ] Source entity read and saved
- [ ] ID fields stripped from payload
- [ ] Name updated to distinguish the copy
- [ ] Copy created and ID saved
- [ ] Desired changes applied (targeting, budget, creatives)
- [ ] Copy verified via \`ttd_get_entity\`
- [ ] Activated via \`ttd_bulk_update_status\` only after review
`;
}
