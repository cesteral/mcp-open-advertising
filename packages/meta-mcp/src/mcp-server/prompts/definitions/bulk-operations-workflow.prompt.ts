// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Bulk Operations Workflow Prompt
 *
 * Guides AI agents through batch operations in Meta Ads:
 * bulk create, bulk update, bulk status changes, and batch bid adjustments.
 */
export const bulkOperationsWorkflowPrompt: Prompt = {
  name: "meta_bulk_operations_workflow",
  description:
    "Step-by-step guide for Meta Ads bulk operations: batch create entities, batch update entities, batch status changes, and batch bid adjustments. Covers partial failure handling and verification.",
  arguments: [
    {
      name: "adAccountId",
      description: "Meta Ad Account ID (e.g., act_123456789)",
      required: true,
    },
    {
      name: "operation",
      description:
        "Operation type: 'create', 'update', 'status', or 'bids' (default: status)",
      required: false,
    },
  ],
};

export function getBulkOperationsWorkflowMessage(
  args?: Record<string, string>,
): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";
  const operation = args?.operation || "status";

  return `# Meta Ads Bulk Operations Workflow

Ad Account: \`${adAccountId}\`
Operation: \`${operation}\`

---

## Overview

Meta MCP supports four bulk operation tools:

| Tool | Purpose | Max Items |
|------|---------|-----------|
| \`meta_bulk_create_entities\` | Create multiple entities of the same type | 50 |
| \`meta_bulk_update_entities\` | Update multiple entities with individual payloads | 50 |
| \`meta_bulk_update_status\` | Pause/activate/archive multiple entities | 50 |
| \`meta_adjust_bids\` | Adjust bids on multiple ad sets | 50 |

All bulk operations support partial success — failed items don't block the rest.

---

## Bulk Status Updates

### Step 1: Identify Entities

\`\`\`json
{
  "tool": "meta_list_entities",
  "params": {
    "entityType": "adSet",
    "adAccountId": "${adAccountId}",
    "fields": ["id", "name", "status", "effective_status"]
  }
}
\`\`\`

### Step 2: Execute Status Change

\`\`\`json
{
  "tool": "meta_bulk_update_status",
  "params": {
    "entityType": "adSet",
    "entityIds": ["{id1}", "{id2}", "{id3}"],
    "status": "PAUSED"
  }
}
\`\`\`

Valid statuses: \`ACTIVE\`, \`PAUSED\`, \`ARCHIVED\`

⚠️ **GOTCHA**: Archiving is **irreversible**. Always pause first if you might want to reactivate.

⚠️ **GOTCHA**: Pausing a campaign pauses all its ad sets and ads (via effective_status), even though their individual status fields remain unchanged.

### Step 3: Verify

Check results for \`successful\` and \`failed\` arrays with per-item status.

---

## Bulk Entity Creation

### Step 1: Fetch Schema

**Resource:** \`entity-schema://{entityType}\` and \`entity-examples://{entityType}\`

### Step 2: Build Payloads

\`\`\`json
{
  "tool": "meta_bulk_create_entities",
  "params": {
    "entityType": "adSet",
    "adAccountId": "${adAccountId}",
    "items": [
      {
        "name": "Ad Set - US 25-44",
        "campaign_id": "{campaignId}",
        "daily_budget": 2500,
        "bid_amount": 150,
        "billing_event": "IMPRESSIONS",
        "optimization_goal": "LINK_CLICKS",
        "targeting": {
          "geo_locations": { "countries": ["US"] },
          "age_min": 25,
          "age_max": 44
        },
        "status": "PAUSED"
      },
      {
        "name": "Ad Set - UK 25-44",
        "campaign_id": "{campaignId}",
        "daily_budget": 2000,
        "bid_amount": 175,
        "billing_event": "IMPRESSIONS",
        "optimization_goal": "LINK_CLICKS",
        "targeting": {
          "geo_locations": { "countries": ["GB"] },
          "age_min": 25,
          "age_max": 44
        },
        "status": "PAUSED"
      }
    ]
  }
}
\`\`\`

⚠️ **GOTCHA**: Budget values are in **cents**. \`daily_budget: 2500\` = $25.00 USD.

⚠️ **GOTCHA**: Always create entities in \`PAUSED\` status. Activate after verification.

### Step 3: Save IDs from Results

Review the results array. Each successful create returns the new entity ID. Save these for subsequent operations (ad creation, targeting, etc.).

---

## Bulk Entity Updates

### Step 1: Build Update Items

Each item needs an \`entityId\` and a \`data\` object with only the fields to change.

\`\`\`json
{
  "tool": "meta_bulk_update_entities",
  "params": {
    "entityType": "adSet",
    "items": [
      {
        "entityId": "{adSetId1}",
        "data": {
          "daily_budget": 3000,
          "bid_amount": 200
        }
      },
      {
        "entityId": "{adSetId2}",
        "data": {
          "daily_budget": 3500,
          "bid_amount": 225
        }
      }
    ]
  }
}
\`\`\`

⚠️ **GOTCHA**: Targeting updates replace entirely. If updating targeting on one ad set, include ALL targeting fields, not just the ones you're changing.

### Step 2: Verify

Check each item in the results for success/failure status.

---

## Batch Bid Adjustments

For ad set bid changes specifically, use the dedicated bid adjustment tool.

### Step 1: Review Current Bids

\`\`\`json
{
  "tool": "meta_list_entities",
  "params": {
    "entityType": "adSet",
    "adAccountId": "${adAccountId}",
    "fields": ["id", "name", "bid_amount", "daily_budget"]
  }
}
\`\`\`

### Step 2: Calculate and Apply

Bid amounts are in **cents**: 100 = $1.00 USD.

\`\`\`json
{
  "tool": "meta_adjust_bids",
  "params": {
    "adjustments": [
      {
        "adSetId": "{adSetId1}",
        "bidAmount": 250
      },
      {
        "adSetId": "{adSetId2}",
        "bidAmount": 300
      }
    ],
    "reason": "Increasing bids on top-performing ad sets"
  }
}
\`\`\`

### Step 3: Verify

Each successful adjustment shows previous and new bid amounts.

---

## Handling Partial Failures

All bulk operations return per-item results:

1. Check \`failed\` array for error messages
2. Common errors: invalid ID, permission denied, policy violation, budget below minimum
3. Fix and retry only the failed items
4. After retrying, verify all entities are in expected state

## Safety Checklist

- [ ] Correct \`adAccountId\`
- [ ] Entity IDs verified by listing first
- [ ] Budget/bid amounts confirmed as cents (not dollars)
- [ ] Status changes: understood parent-child impact
- [ ] Creates: entities set to PAUSED initially
- [ ] Targeting updates: full targeting spec included (not partial)
`;
}