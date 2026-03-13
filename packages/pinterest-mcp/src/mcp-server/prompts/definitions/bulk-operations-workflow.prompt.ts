import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const bulkOperationsWorkflowPrompt: Prompt = {
  name: "pinterest_bulk_operations_workflow",
  description: "Guide for performing bulk create, update, and status operations on Pinterest Ads entities",
  arguments: [
    {
      name: "adAccountId",
      description: "Pinterest Advertiser ID",
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

## Advertiser ID: \`${adAccountId}\`
## Entity Type: \`${entityType}\`

---

## Option 1: Bulk Status Update (most common)

Pause, enable, or delete multiple entities in one call:

\`\`\`json
pinterest_bulk_update_status({
  "entityType": "${entityType}",
  "adAccountId": "${adAccountId}",
  "entityIds": ["ID_1", "ID_2", "ID_3"],
  "operationStatus": "PAUSED"
})
\`\`\`

**Operation status values:**
- \`ACTIVE\` — Activate entities
- \`PAUSED\` — Pause entities
- \`DELETE\` — Permanently delete (irreversible!)

---

## Option 2: Bulk Create Entities (up to 50)

Create multiple entities of the same type in one call:

\`\`\`json
pinterest_bulk_create_entities({
  "entityType": "${entityType}",
  "adAccountId": "${adAccountId}",
  "items": [
    {
      "name": "Campaign A",
      "objective_type": "AWARENESS",
      "daily_spend_cap": 50000000
    },
    {
      "name": "Campaign B",
      "objective_type": "CONVERSIONS",
      "daily_spend_cap": 100000000
    }
  ]
})
\`\`\`

---

## Option 3: Bulk Update Entities (up to 50)

Update specific fields on multiple entities:

\`\`\`json
pinterest_bulk_update_entities({
  "entityType": "${entityType}",
  "adAccountId": "${adAccountId}",
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
pinterest_adjust_bids({
  "adAccountId": "${adAccountId}",
  "adjustments": [
    { "adGroupId": "ADGROUP_ID_1", "bidPrice": 1.5 },
    { "adGroupId": "ADGROUP_ID_2", "bidPrice": 2.0 }
  ],
  "reason": "Increase bids to improve delivery"
})
\`\`\`

---

## Tips for Bulk Operations

1. **List first**: Use \`pinterest_list_entities\` to get entity IDs before bulk operations
2. **Validate first**: Use \`pinterest_validate_entity\` to check payloads before bulk create
3. **Status update is batched**: Pinterest accepts IDs array in one API call
4. **Create/Update is sequential**: Processed concurrently (5 at a time) by the MCP tool
5. **Max 50 items**: Per bulk create/update call (more = multiple calls)
6. **Error handling**: Partial failures are reported — some may succeed while others fail

## Workflow: Pause all campaigns → Adjust → Re-enable

\`\`\`
1. pinterest_list_entities (get campaign IDs)
2. pinterest_bulk_update_status (PAUSED all)
3. pinterest_bulk_update_entities (adjust budgets/settings)
4. pinterest_bulk_update_status (ACTIVE selected)
\`\`\`
`;
}
