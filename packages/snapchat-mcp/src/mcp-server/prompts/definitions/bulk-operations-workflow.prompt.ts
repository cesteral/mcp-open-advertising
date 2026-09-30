// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const bulkOperationsWorkflowPrompt: Prompt = {
  name: "snapchat_bulk_operations_workflow",
  description:
    "Guide for performing bulk create, update, and status operations on Snapchat Ads entities",
  arguments: [
    {
      name: "adAccountId",
      description: "Snapchat Ad Account ID",
      required: true,
    },
    {
      name: "entityType",
      description: "Entity type to operate on (campaign, adGroup, ad, creative)",
      required: false,
    },
  ],
};

export function getBulkOperationsWorkflowMessage(args?: Record<string, string>): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";
  const entityType = args?.entityType || "campaign";

  const parentHint =
    entityType === "adGroup"
      ? `\n  "campaignId": "{campaignId}",`
      : entityType === "ad"
        ? `\n  "adSquadId": "{adSquadId}",`
        : "";

  return `# Snapchat Bulk Operations Workflow

## Ad Account ID: \`${adAccountId}\`
## Entity Type: \`${entityType}\`

Ad squads (\`adGroup\`) need \`campaignId\` and ads need \`adSquadId\` on every bulk call below —
Snapchat writes them through the parent's collection route.

---

## Option 1: Bulk Status Update (most common, max 20 IDs)

Pause or activate multiple entities in one call:

\`\`\`json
snapchat_bulk_update_status({
  "entityType": "${entityType}",
  "adAccountId": "${adAccountId}",${parentHint}
  "entityIds": ["ID_1", "ID_2", "ID_3"],
  "operationStatus": "PAUSED"
})
\`\`\`

**Status values:**
- \`ACTIVE\` — Activate entities
- \`PAUSED\` — Pause entities (reversible)

Deletion is a separate, irreversible tool: \`snapchat_delete_entity\` (max 20 IDs, one DELETE per ID).

---

## Option 2: Bulk Create Entities (up to 50)

Create multiple entities of the same type in one call. Money fields are in
**micro-currency** (1,000,000 = 1.00 of the account currency). The parent ID
(\`ad_account_id\` / \`campaign_id\` / \`ad_squad_id\`) is injected into every item from
the top-level param, so leave it out of the items:

\`\`\`json
snapchat_bulk_create_entities({
  "entityType": "campaign",
  "adAccountId": "${adAccountId}",
  "items": [
    {
      "name": "Campaign A",
      "status": "PAUSED",
      "start_time": "2026-04-01T00:00:00.000Z",
      "daily_budget_micro": 100000000
    },
    {
      "name": "Campaign B",
      "status": "PAUSED",
      "start_time": "2026-04-01T00:00:00.000Z",
      "lifetime_spend_cap_micro": 500000000
    }
  ]
})
\`\`\`

---

## Option 3: Bulk Update Entities (up to 50)

Update specific fields on multiple entities. The server reads each entity and
sends the merged full object, because Snapchat's PUT replaces the whole object:

\`\`\`json
snapchat_bulk_update_entities({
  "entityType": "${entityType}",
  "adAccountId": "${adAccountId}",${parentHint}
  "items": [
    { "entityId": "ID_1", "data": { "daily_budget_micro": 150000000 } },
    { "entityId": "ID_2", "data": { "daily_budget_micro": 250000000 } }
  ]
})
\`\`\`

---

## Option 4: Bulk Bid Adjustment (ad squads only)

Read-modify-write of each ad squad's \`bid_micro\`. \`bidPrice\` is given in the
account currency and converted to micro-currency for you:

\`\`\`json
snapchat_adjust_bids({
  "adAccountId": "${adAccountId}",
  "adjustments": [
    { "adGroupId": "ADSQUAD_ID_1", "bidPrice": 1.5 },
    { "adGroupId": "ADSQUAD_ID_2", "bidPrice": 2.0 }
  ],
  "reason": "Increase bids to improve delivery"
})
\`\`\`

---

## Tips for Bulk Operations

1. **List first**: Use \`snapchat_list_entities\` to get entity IDs before bulk operations
2. **Validate first**: Use \`snapchat_validate_entity\` to check payloads before bulk create
3. **One request per batch**: bulk create sends one POST, and bulk update/status one PUT, to the parent collection route (after one read per entity for updates)
4. **Limits**: 50 items per bulk create/update, 20 IDs per status update or delete
5. **Error handling**: Partial failures are reported per item — some may succeed while others fail
6. **Account scope**: every entity must belong to the session's ad account; an entity from another account is refused

## Workflow: Pause → Adjust → Re-activate

\`\`\`
1. snapchat_list_entities (get campaign IDs)
2. snapchat_bulk_update_status (operationStatus: "PAUSED")
3. snapchat_bulk_update_entities (adjust daily_budget_micro / settings)
4. snapchat_bulk_update_status (operationStatus: "ACTIVE" for the selected IDs)
\`\`\`
`;
}
