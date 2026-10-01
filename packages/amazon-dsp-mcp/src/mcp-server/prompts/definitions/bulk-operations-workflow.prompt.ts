// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const bulkOperationsWorkflowPrompt: Prompt = {
  name: "amazon_dsp_bulk_operations_workflow",
  description:
    "Guide for performing bulk create, update, and status operations on Amazon DSP entities (Unified API)",
  arguments: [
    {
      name: "profileId",
      description: "Amazon Ads profile ID bound to the session",
      required: true,
    },
    {
      name: "accountId",
      description: "DSP advertiser ID (advertiserId from amazon_dsp_list_advertisers)",
      required: false,
    },
    {
      name: "entityType",
      description:
        "Entity type to operate on (order, lineItem, creative, target, creativeAssociation)",
      required: false,
    },
  ],
};

export function getBulkOperationsWorkflowMessage(args?: Record<string, string>): string {
  const profileId = args?.profileId || "{profileId}";
  const accountId = args?.accountId || "{accountId}";
  const entityType = args?.entityType || "order";

  return `# Amazon DSP Bulk Operations Workflow (Unified API)

## Profile ID: \`${profileId}\`
## Advertiser (accountId): \`${accountId}\`
## Entity Type: \`${entityType}\`

Every bulk tool sends one Unified API request per item (\`POST /adsApi/v1/{create|update|delete}/…\`) with \`accountId\` as the \`Amazon-Ads-AccountId\` header. The Amazon DSP rate limit is tight: a batch that cannot clear it in time is refused before any write, with the number of items that fit.

---

## Option 1: Bulk Status Update (most common)

\`\`\`json
amazon_dsp_bulk_update_status({
  "entityType": "${entityType}",
  "profileId": "${profileId}",
  "accountId": "${accountId}",
  "entityIds": ["ID_1", "ID_2"],
  "operationStatus": "PAUSED"
})
\`\`\`

**Status values:** \`ENABLED\`, \`PAUSED\`. ARCHIVED is not an update state on the Unified API — remove entities with \`amazon_dsp_delete_entity\`. Targets have no update at all.

---

## Option 2: Bulk Create Entities (up to 50)

\`\`\`json
amazon_dsp_bulk_create_entities({
  "entityType": "creativeAssociation",
  "profileId": "${profileId}",
  "accountId": "${accountId}",
  "items": [
    { "adGroupId": "AD_GROUP_ID", "adId": "AD_ID_1", "state": "ENABLED" },
    { "adGroupId": "AD_GROUP_ID", "adId": "AD_ID_2", "state": "ENABLED" }
  ]
})
\`\`\`

Each item uses the \`amazon_dsp_create_entity\` schema; orders and line items are created PAUSED.

---

## Option 3: Bulk Update Entities (up to 50)

\`\`\`json
amazon_dsp_bulk_update_entities({
  "entityType": "lineItem",
  "profileId": "${profileId}",
  "accountId": "${accountId}",
  "items": [
    { "entityId": "AD_GROUP_ID_1", "data": { "budgets": [{ "budgetType": "MONETARY", "budgetValue": { "monetaryBudgetValue": { "monetaryBudget": { "value": 150 } } }, "recurrenceTimePeriod": "DAILY" }] } },
    { "entityId": "AD_GROUP_ID_2", "data": { "name": "Renamed ad group" } }
  ]
})
\`\`\`

---

## Option 4: Bulk Bid Adjustment (line items only)

Read-modify-write of each ad group's \`bid.baseBid\`:

\`\`\`json
amazon_dsp_adjust_bids({
  "profileId": "${profileId}",
  "accountId": "${accountId}",
  "adjustments": [
    { "lineItemId": "AD_GROUP_ID_1", "bidAmount": 1.5 },
    { "lineItemId": "AD_GROUP_ID_2", "bidAmount": 2.0 }
  ],
  "reason": "Increase bids to improve delivery"
})
\`\`\`

---

## Tips for Bulk Operations

1. **List first**: \`amazon_dsp_list_entities\` (cursor pagination via \`nextToken\`) to collect IDs
2. **Validate first**: \`amazon_dsp_validate_entity\`, or pass \`dry_run: true\` to any bulk tool
3. **Max 50 items** per bulk create/update call
4. **Partial failures are reported** per item — Amazon's 207 \`error[]\` codes appear in each failed item's error

## Workflow: Pause → Adjust → Re-enable

\`\`\`
1. amazon_dsp_list_entities (collect IDs)
2. amazon_dsp_bulk_update_status (PAUSED)
3. amazon_dsp_bulk_update_entities (adjust budgets/settings)
4. amazon_dsp_bulk_update_status (ENABLED)
\`\`\`
`;
}
