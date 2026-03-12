import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const bulkOperationsWorkflowPrompt: Prompt = {
  name: "cm360_bulk_operations_workflow",
  description: "Guide for batch operations on CM360 entities",
  arguments: [
    {
      name: "profileId",
      description: "CM360 User Profile ID",
      required: true,
    },
    {
      name: "operation",
      description: "Operation type: create, update, status",
      required: false,
    },
  ],
};

export function getBulkOperationsWorkflowMessage(
  args?: Record<string, string>,
): string {
  const profileId = args?.profileId || "{profileId}";
  const operation = args?.operation || "all";
  return `# CM360 Bulk Operations Workflow

## Profile ID: ${profileId}
## Operation: ${operation}

## Available Bulk Tools

| Tool | Purpose | Max Items |
|------|---------|-----------|
| \`cm360_bulk_update_status\` | Batch activate/deactivate | 50 |
| \`cm360_bulk_create_entities\` | Batch entity creation | 50 |
| \`cm360_bulk_update_entities\` | Batch entity updates | 50 |

## Batch Status Update

\`\`\`json
{
  "tool": "cm360_bulk_update_status",
  "params": {
    "profileId": "${profileId}",
    "entityType": "campaign",
    "entityIds": ["CAMPAIGN_ID_1", "CAMPAIGN_ID_2"],
    "status": "ARCHIVED"
  }
}
\`\`\`

## Batch Create

\`\`\`json
{
  "tool": "cm360_bulk_create_entities",
  "params": {
    "profileId": "${profileId}",
    "entityType": "placement",
    "advertiserId": "ADVERTISER_ID",
    "items": [
      { "name": "Placement A", "campaignId": "CID", "siteId": "SID", "compatibility": "DISPLAY", "size": { "width": 300, "height": 250 } },
      { "name": "Placement B", "campaignId": "CID", "siteId": "SID", "compatibility": "DISPLAY", "size": { "width": 728, "height": 90 } }
    ]
  }
}
\`\`\`

## Batch Update

Each item must contain the **full entity object** (PUT semantics).

\`\`\`json
{
  "tool": "cm360_bulk_update_entities",
  "params": {
    "profileId": "${profileId}",
    "entityType": "campaign",
    "items": [
      { "entityId": "CID_1", "data": { "...full object..." } },
      { "entityId": "CID_2", "data": { "...full object..." } }
    ]
  }
}
\`\`\`

## Gotchas

| Issue | Solution |
|-------|----------|
| Max 50 items per request | Split into batches |
| Partial failures possible | Check results array for individual errors |
| PUT semantics for updates | Fetch all entities first, then merge changes |
| Status cascading | Deactivating parent affects children |
`;
}
