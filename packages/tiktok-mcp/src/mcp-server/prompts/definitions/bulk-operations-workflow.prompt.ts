// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const bulkOperationsWorkflowPrompt: Prompt = {
  name: "tiktok_bulk_operations_workflow",
  description: "Guide for performing bulk create, update, and status operations on TikTok Ads entities",
  arguments: [
    {
      name: "advertiserId",
      description: "TikTok Advertiser ID",
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
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const entityType = args?.entityType || "campaign";

  return `# TikTok Bulk Operations Workflow

## Advertiser ID: \`${advertiserId}\`
## Entity Type: \`${entityType}\`

---

## Option 1: Bulk Status Update (most common)

Pause, enable, or delete multiple entities in one call:

\`\`\`json
tiktok_bulk_update_status({
  "entityType": "${entityType}",
  "advertiserId": "${advertiserId}",
  "entityIds": ["ID_1", "ID_2", "ID_3"],
  "operationStatus": "DISABLE"
})
\`\`\`

**Operation status values:**
- \`ENABLE\` — Activate entities
- \`DISABLE\` — Pause entities
- \`DELETE\` — Permanently delete (irreversible!)

---

## Option 2: Bulk Create Entities (up to 50)

Create multiple entities of the same type in one call:

\`\`\`json
tiktok_bulk_create_entities({
  "entityType": "${entityType}",
  "advertiserId": "${advertiserId}",
  "items": [
    {
      "campaign_name": "Campaign A",
      "objective_type": "TRAFFIC",
      "budget_mode": "BUDGET_MODE_DAY",
      "budget": 100
    },
    {
      "campaign_name": "Campaign B",
      "objective_type": "CONVERSIONS",
      "budget_mode": "BUDGET_MODE_DAY",
      "budget": 200
    }
  ]
})
\`\`\`

---

## Option 3: Bulk Update Entities (up to 50)

Update specific fields on multiple entities:

\`\`\`json
tiktok_bulk_update_entities({
  "entityType": "${entityType}",
  "advertiserId": "${advertiserId}",
  "items": [
    { "entityId": "ID_1", "data": { "budget": 150 } },
    { "entityId": "ID_2", "data": { "budget": 250 } }
  ]
})
\`\`\`

---

## Option 4: Bulk Bid Adjustment (ad groups only)

Safe read-modify-write bid adjustment:

\`\`\`json
tiktok_adjust_bids({
  "advertiserId": "${advertiserId}",
  "adjustments": [
    { "adGroupId": "ADGROUP_ID_1", "bidPrice": 1.5 },
    { "adGroupId": "ADGROUP_ID_2", "bidPrice": 2.0 }
  ],
  "reason": "Increase bids to improve delivery"
})
\`\`\`

---

## Tips for Bulk Operations

1. **List first**: Use \`tiktok_list_entities\` to get entity IDs before bulk operations
2. **Validate first**: Use \`tiktok_validate_entity\` to check payloads before bulk create
3. **Status update is batched**: TikTok accepts IDs array in one API call
4. **Create/Update is sequential**: Processed concurrently (5 at a time) by the MCP tool
5. **Max 50 items**: Per bulk create/update call (more = multiple calls)
6. **Error handling**: Partial failures are reported — some may succeed while others fail

## Workflow: Pause all campaigns → Adjust → Re-enable

\`\`\`
1. tiktok_list_entities (get campaign IDs)
2. tiktok_bulk_update_status (DISABLE all)
3. tiktok_bulk_update_entities (adjust budgets/settings)
4. tiktok_bulk_update_status (ENABLE selected)
\`\`\`
`;
}