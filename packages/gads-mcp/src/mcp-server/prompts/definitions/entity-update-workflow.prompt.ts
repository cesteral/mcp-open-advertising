// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Google Ads Entity Update Workflow Prompt
 *
 * Guides AI agents through safely updating Google Ads entities using PATCH semantics.
 * Google Ads uses updateMask to specify which fields to update — omitting updateMask
 * can cause unexpected field resets or API errors.
 */
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const entityUpdateWorkflowPrompt: Prompt = {
  name: "gads_entity_update_workflow",
  description:
    "Step-by-step guide for safely updating Google Ads entities. Covers the read-then-update pattern with explicit updateMask for campaigns, adGroups, ads, keywords, campaignBudgets, and assets.",
  arguments: [
    {
      name: "customerId",
      description: "Google Ads customer ID (no dashes)",
      required: true,
    },
    {
      name: "entityType",
      description:
        "Entity type to update: campaign, adGroup, ad, keyword, campaignBudget, or asset",
      required: true,
    },
    {
      name: "entityId",
      description: "Google Ads entity ID to update",
      required: true,
    },
  ],
};

export function getEntityUpdateWorkflowMessage(
  args?: Record<string, string>
): string {
  const customerId = args?.customerId || "{customerId}";
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";

  return `# Google Ads Entity Update Workflow

## Context
- Customer ID: \`${customerId}\`
- Entity Type: \`${entityType}\`
- Entity ID: \`${entityId}\`
- Platform: Google Ads API v23

---

## ⚠️ Critical: Always Use updateMask

Google Ads uses **partial updates via updateMask**. The \`updateMask\` field is a comma-separated list of field paths to update. Only the listed fields are modified — all other fields are left untouched.

**Without updateMask**: The API may reject the request or update unexpected fields.
**With updateMask**: Only the specified fields are written; all others remain as-is.

---

## Step 1: Read Current State

Fetch the entity before modifying it to understand its current configuration.

\`\`\`
Tool: gads_gaql_search
Input: {
  "customerId": "${customerId}",
  "query": "SELECT ${entityType}.id, ${entityType}.name, ${entityType}.status, ${entityType}.resource_name FROM ${entityType} WHERE ${entityType}.id = ${entityId}"
}
\`\`\`

**Save the response** — particularly the \`resource_name\`, which is required for the update call.

> Resource name format: \`customers/${customerId}/${entityType}s/${entityId}\`

---

## Step 2: Build Your Update Payload

Only include the fields you want to change. The \`updateMask\` must list every field path you are setting in \`data\`.

### Campaign — Pause a Campaign
\`\`\`
Tool: gads_update_entity
Input: {
  "entityType": "campaign",
  "customerId": "${customerId}",
  "entityId": "${entityId}",
  "data": {
    "status": "PAUSED"
  },
  "updateMask": "status"
}
\`\`\`

### Campaign — Update Name and End Date
\`\`\`
Tool: gads_update_entity
Input: {
  "entityType": "campaign",
  "customerId": "${customerId}",
  "entityId": "${entityId}",
  "data": {
    "name": "Q2 Search Campaign — Revised",
    "endDate": "2025-06-30"
  },
  "updateMask": "name,end_date"
}
\`\`\`

### Ad Group — Update Default CPC Bid
\`\`\`
Tool: gads_update_entity
Input: {
  "entityType": "adGroup",
  "customerId": "${customerId}",
  "entityId": "${entityId}",
  "data": {
    "cpcBidMicros": "3500000"
  },
  "updateMask": "cpc_bid_micros"
}
\`\`\`

### Campaign Budget — Increase Daily Budget
\`\`\`
Tool: gads_update_entity
Input: {
  "entityType": "campaignBudget",
  "customerId": "${customerId}",
  "entityId": "${entityId}",
  "data": {
    "amountMicros": "75000000"
  },
  "updateMask": "amount_micros"
}
\`\`\`

### Keyword — Update Bid and Status
\`\`\`
Tool: gads_update_entity
Input: {
  "entityType": "keyword",
  "customerId": "${customerId}",
  "entityId": "${entityId}",
  "data": {
    "status": "ENABLED",
    "cpcBidMicros": "4000000"
  },
  "updateMask": "status,cpc_bid_micros"
}
\`\`\`

---

## Step 3: Execute the Update

Call \`gads_update_entity\` with your payload and updateMask. Review the response for field-level errors.

---

## Step 4: Verify the Change

Confirm the update was applied:

\`\`\`
Tool: gads_get_entity
Input: {
  "entityType": "${entityType}",
  "customerId": "${customerId}",
  "entityId": "${entityId}"
}
\`\`\`

Compare the returned values with what you set in Step 2.

---

## Gotchas

- **updateMask field naming**: Use snake_case for updateMask paths (e.g., \`cpc_bid_micros\`, not \`cpcBidMicros\`). The \`data\` payload uses camelCase.
- **Resource name vs ID**: The API identifies entities by \`resource_name\` internally. Always verify the entity exists before updating.
- **Budget is shared**: \`campaignBudget.amountMicros\` is the daily budget, shared across all campaigns linked to it. Changing it affects all linked campaigns.
- **advertisingChannelType**: Cannot be changed after campaign creation.
- **Ad updates**: Most ad fields are immutable after creation. To change ad copy, create a new ad and pause/remove the old one.
- **Bulk status changes**: For pausing/enabling multiple entities, prefer \`gads_bulk_update_status\` over individual update calls.
- **Bid adjustments**: For batch bid changes across multiple ad groups, use \`gads_adjust_bids\` — it handles read-modify-write safely.

---

## Common updateMask Field Paths

| Entity | Field | updateMask Path |
|--------|-------|-----------------|
| campaign | status | \`status\` |
| campaign | name | \`name\` |
| campaign | end date | \`end_date\` |
| campaign | budget | \`campaign_budget\` |
| adGroup | status | \`status\` |
| adGroup | CPC bid | \`cpc_bid_micros\` |
| adGroup | name | \`name\` |
| campaignBudget | daily amount | \`amount_micros\` |
| keyword | status | \`status\` |
| keyword | CPC bid | \`cpc_bid_micros\` |

---

## Success Checklist

- [ ] Current entity state read via \`gads_gaql_search\` or \`gads_get_entity\`
- [ ] Update payload built with only the fields being changed
- [ ] \`updateMask\` set to comma-separated snake_case field paths
- [ ] \`gads_update_entity\` called and returned success
- [ ] Change verified by re-fetching the entity

## Related Resources
- \`entity-schema://${entityType}\` — Full field reference for this entity type
- \`entity-hierarchy://gads\` — Entity relationships and resource name patterns
- \`gaql-reference://syntax\` — GAQL query syntax for reading current state
`;
}