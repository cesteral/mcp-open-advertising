// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const bulkOperationsWorkflowPrompt: Prompt = {
  name: "pinterest_bulk_operations_workflow",
  description: "Guide for bulk create, update, status and bid operations on Pinterest Ads entities",
  arguments: [
    {
      name: "adAccountId",
      description: "Pinterest ad account ID",
      required: true,
    },
    {
      name: "entityType",
      description: "Entity type to operate on (campaign, adGroup, ad)",
      required: false,
    },
  ],
};

export function getBulkOperationsWorkflowMessage(args?: Record<string, string>): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";
  const entityType = args?.entityType || "campaign";

  return `# Pinterest Bulk Operations Workflow

## Ad account ID: \`${adAccountId}\`
## Entity Type: \`${entityType}\`

---

## Option 1: Bulk Status Update (most common)

Pause, activate or archive several entities in one call:

\`\`\`json
pinterest_bulk_update_status({
  "entityType": "${entityType}",
  "adAccountId": "${adAccountId}",
  "entityIds": ["ID_1", "ID_2", "ID_3"],
  "operationStatus": "PAUSED"
})
\`\`\`

**\`operationStatus\` values:**
- \`ACTIVE\`: activate
- \`PAUSED\`: pause
- \`ARCHIVED\`: archive. Pinterest v5 has no DELETE for campaigns, ad groups or ads, so archiving is how they are removed. **An archived entity cannot be reactivated.**

Each id is sent as its own one-item PATCH, so every id gets its own success or error.

---

## Option 2: Bulk Create Entities (up to 50)

Create several entities of the same type. Each item has the same shape as \`pinterest_create_entity\`'s \`data\`, and \`ad_account_id\` is added for you.

\`\`\`json
pinterest_bulk_create_entities({
  "entityType": "campaign",
  "adAccountId": "${adAccountId}",
  "items": [
    {
      "name": "Campaign A",
      "objective_type": "AWARENESS",
      "status": "PAUSED",
      "daily_spend_cap": 50000000
    },
    {
      "name": "Campaign B",
      "objective_type": "WEB_CONVERSION",
      "status": "PAUSED",
      "daily_spend_cap": 100000000
    }
  ]
})
\`\`\`

A campaign requires \`name\` and \`objective_type\` (one of \`AWARENESS\`, \`CONSIDERATION\`, \`WEB_CONVERSION\`, \`CATALOG_SALES\`, \`VIDEO_COMPLETION\`, \`SALES\`, \`APP_INSTALL\`, \`CTV_CONSIDERATION\`). An ad group requires \`name\`, \`campaign_id\` and \`billable_event\`. An ad requires \`ad_group_id\`, \`creative_type\` and \`pin_id\`.

Money is in **micro-currency**: \`daily_spend_cap: 50000000\` is 50.00 in the account currency.

---

## Option 3: Bulk Update Entities (up to 50)

Update fields on several entities. Each item is an \`entityId\` plus a \`data\` object of Pinterest field names:

\`\`\`json
pinterest_bulk_update_entities({
  "entityType": "adGroup",
  "adAccountId": "${adAccountId}",
  "items": [
    { "entityId": "ID_1", "data": { "budget_in_micro_currency": 150000000 } },
    { "entityId": "ID_2", "data": { "budget_in_micro_currency": 250000000 } }
  ]
})
\`\`\`

The budget fields are \`daily_spend_cap\` / \`lifetime_spend_cap\` on a campaign and \`budget_in_micro_currency\` on an ad group, all in micro-currency.

---

## Option 4: Bulk Bid Adjustment (ad groups only)

Read-modify-write on each ad group's \`bid_in_micro_currency\`:

\`\`\`json
pinterest_adjust_bids({
  "adAccountId": "${adAccountId}",
  "adjustments": [
    { "adGroupId": "ADGROUP_ID_1", "bidPrice": 1.5 },
    { "adGroupId": "ADGROUP_ID_2", "bidPrice": 2.0 }
  ],
  "reason": "Increase bids to improve delivery"
})
\`\`\`

Unlike the other tools, \`bidPrice\` is in the account currency (1.5 = 1.50). The tool converts it to micros. It only matters for manual bid strategies (\`MAX_BID\` or \`TARGET_AVG\`). Ad groups on \`AUTOMATIC_BID\` may ignore it.

---

## Tips for Bulk Operations

1. **List first**: use \`pinterest_list_entities\` to get entity IDs.
2. **Validate first**: run \`pinterest_validate_entity\` on one item. It checks the required fields, enum values, micro-currency, Unix-second times and \`targeting_spec\` keys locally. Then create a single entity with \`pinterest_create_entity\` before the batch, so a mistake the local check can't see fails once instead of 50 times.
3. **One request per item**: the bulk tools send each item separately, at most 5 at a time.
4. **Max 50 items per call**: split larger sets across several calls.
5. **Partial failures**: some items can succeed while others fail. Pinterest answers a rejected item with HTTP 200 and per-item \`exceptions\`, and the tools report those as failures. Check \`results\` before assuming success.

## Workflow: Pause campaigns → Adjust → Re-activate

\`\`\`
1. pinterest_list_entities (get campaign IDs)
2. pinterest_bulk_update_status (operationStatus PAUSED)
3. pinterest_bulk_update_entities (adjust budgets or settings)
4. pinterest_bulk_update_status (operationStatus ACTIVE, for the selected IDs)
\`\`\`
`;
}
