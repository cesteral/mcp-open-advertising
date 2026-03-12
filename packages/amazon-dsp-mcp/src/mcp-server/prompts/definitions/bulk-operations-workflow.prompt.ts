import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const bulkOperationsWorkflowPrompt: Prompt = {
  name: "amazon_dsp_bulk_operations_workflow",
  description: "Guide for performing bulk create, update, and status operations on AmazonDsp Ads entities",
  arguments: [
    {
      name: "profileId",
      description: "AmazonDsp Advertiser ID",
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
  const profileId = args?.profileId || "{profileId}";
  const entityType = args?.entityType || "campaign";

  return `# AmazonDsp Bulk Operations Workflow

## Advertiser ID: \`${profileId}\`
## Entity Type: \`${entityType}\`

---

## Option 1: Bulk Status Update (most common)

Pause, enable, or delete multiple entities in one call:

\`\`\`json
amazon_dsp_bulk_update_status({
  "entityType": "${entityType}",
  "profileId": "${profileId}",
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
amazon_dsp_bulk_create_entities({
  "entityType": "${entityType}",
  "profileId": "${profileId}",
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
amazon_dsp_bulk_update_entities({
  "entityType": "${entityType}",
  "profileId": "${profileId}",
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
amazon_dsp_adjust_bids({
  "profileId": "${profileId}",
  "adjustments": [
    { "adGroupId": "ADGROUP_ID_1", "bidPrice": 1.5 },
    { "adGroupId": "ADGROUP_ID_2", "bidPrice": 2.0 }
  ],
  "reason": "Increase bids to improve delivery"
})
\`\`\`

---

## Tips for Bulk Operations

1. **List first**: Use \`amazon_dsp_list_entities\` to get entity IDs before bulk operations
2. **Validate first**: Use \`amazon_dsp_validate_entity\` to check payloads before bulk create
3. **Status update is batched**: AmazonDsp accepts IDs array in one API call
4. **Create/Update is sequential**: Processed concurrently (5 at a time) by the MCP tool
5. **Max 50 items**: Per bulk create/update call (more = multiple calls)
6. **Error handling**: Partial failures are reported — some may succeed while others fail

## Workflow: Pause all campaigns → Adjust → Re-enable

\`\`\`
1. amazon_dsp_list_entities (get campaign IDs)
2. amazon_dsp_bulk_update_status (DISABLE all)
3. amazon_dsp_bulk_update_entities (adjust budgets/settings)
4. amazon_dsp_bulk_update_status (ENABLE selected)
\`\`\`
`;
}
