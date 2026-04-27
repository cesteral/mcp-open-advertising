// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Bulk Operations Workflow Prompt
 *
 * Guides AI agents through batch create, update, status change, and bid
 * adjustment operations in DV360.
 */
export const bulkOperationsPrompt: Prompt = {
  name: "bulk_operations_workflow",
  description:
    "Step-by-step guide for DV360 bulk operations: batch create entities, batch update with updateMask, batch status changes, and batch bid adjustments. Covers safety checks, partial failure handling, and verification.",
  arguments: [
    {
      name: "advertiserId",
      description: "DV360 Advertiser ID",
      required: true,
    },
    {
      name: "operation",
      description: "Operation type: 'create', 'update', 'status', or 'bids' (default: status)",
      required: false,
    },
  ],
};

export function getBulkOperationsPromptMessage(args?: Record<string, string>): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";
  const operation = args?.operation || "status";

  return `# DV360 Bulk Operations Workflow

Advertiser: \`${advertiserId}\`
Operation: \`${operation}\`

---

## Overview

DV360 supports four bulk operation tools:

| Tool | Purpose | Max Items |
|------|---------|-----------|
| \`dv360_bulk_create_entities\` | Create multiple entities of the same type | 50 |
| \`dv360_bulk_update_entities\` | Update multiple entities with updateMask | 50 |
| \`dv360_bulk_update_status\` | Pause/activate/archive multiple entities | 50 |
| \`dv360_adjust_line_item_bids\` | Adjust bids on multiple line items | 50 |

All bulk operations process items individually (DV360 API has no native batch endpoint). Failed items do not block remaining operations — you get partial success results.

---

## Bulk Status Updates

The most common bulk operation. Use to pause, activate, or archive multiple entities at once.

### Step 1: Identify Entities to Update

List entities to find their IDs:

\`\`\`json
{
  "tool": "dv360_list_entities",
  "params": {
    "entityType": "lineItem",
    "advertiserId": "${advertiserId}",
    "insertionOrderId": "{ioId}"
  }
}
\`\`\`

### Step 2: Execute Bulk Status Change

\`\`\`json
{
  "tool": "dv360_bulk_update_status",
  "params": {
    "entityType": "lineItem",
    "advertiserId": "${advertiserId}",
    "entityIds": ["{liId1}", "{liId2}", "{liId3}"],
    "status": "ENTITY_STATUS_PAUSED",
    "reason": "Pausing underperforming line items"
  }
}
\`\`\`

### Step 3: Review Results

Check the response for:
- \`successful\` array — entities that were updated (includes \`previousStatus\` and \`newStatus\`)
- \`failed\` array — entities that failed (includes \`error\` message)
- \`totalSuccessful\` / \`totalFailed\` counts

⚠️ **GOTCHA**: Valid statuses are \`ENTITY_STATUS_ACTIVE\`, \`ENTITY_STATUS_PAUSED\`, \`ENTITY_STATUS_ARCHIVED\`, \`ENTITY_STATUS_DRAFT\`. Archiving is **irreversible** — you cannot unarchive.

⚠️ **GOTCHA**: Pausing a parent entity (campaign, IO) effectively pauses all children. The children's own status doesn't change, but they stop serving.

---

## Bulk Entity Creation

Create multiple entities of the same type in one call.

### Step 1: Fetch Schema

**Resource:** \`entity-schema://{entityType}\` and \`entity-examples://{entityType}\`

### Step 2: Build Payloads

Each item in the \`items\` array follows the same schema as \`dv360_create_entity\`'s \`data\` field.

### Step 3: Execute

\`\`\`json
{
  "tool": "dv360_bulk_create_entities",
  "params": {
    "entityType": "lineItem",
    "advertiserId": "${advertiserId}",
    "items": [
      {
        "insertionOrderId": "{ioId}",
        "displayName": "Line Item - Geo US",
        "entityStatus": "ENTITY_STATUS_DRAFT",
        "lineItemType": "LINE_ITEM_TYPE_DISPLAY_DEFAULT",
        "budget": {
          "budgetAllocationType": "LINE_ITEM_BUDGET_ALLOCATION_TYPE_FIXED",
          "budgetUnit": "BUDGET_UNIT_CURRENCY",
          "maxAmount": "50000000"
        },
        "pacing": {
          "pacingPeriod": "PACING_PERIOD_FLIGHT",
          "pacingType": "PACING_TYPE_EVEN"
        },
        "frequencyCap": {
          "unlimited": true
        },
        "bidStrategy": {
          "fixedBid": {
            "bidAmountMicros": "5000000"
          }
        }
      },
      {
        "insertionOrderId": "{ioId}",
        "displayName": "Line Item - Geo UK",
        "entityStatus": "ENTITY_STATUS_DRAFT",
        "lineItemType": "LINE_ITEM_TYPE_DISPLAY_DEFAULT",
        "budget": {
          "budgetAllocationType": "LINE_ITEM_BUDGET_ALLOCATION_TYPE_FIXED",
          "budgetUnit": "BUDGET_UNIT_CURRENCY",
          "maxAmount": "30000000"
        },
        "pacing": {
          "pacingPeriod": "PACING_PERIOD_FLIGHT",
          "pacingType": "PACING_TYPE_EVEN"
        },
        "frequencyCap": {
          "unlimited": true
        },
        "bidStrategy": {
          "fixedBid": {
            "bidAmountMicros": "4000000"
          }
        }
      }
    ],
    "reason": "Creating geo-targeted line items for Q2 campaign"
  }
}
\`\`\`

### Step 4: Check Results

Review the \`results\` array. Each item has:
- \`index\` — position in the input array
- \`success\` — whether it was created
- \`entity\` — the created entity (on success)
- \`error\` — error message (on failure)

Save the entity IDs from successful creates for subsequent targeting setup.

---

## Bulk Entity Updates

Update multiple entities with updateMask discipline.

### Step 1: Fetch Field Paths

**Resource:** \`entity-fields://{entityType}\`

This returns all valid field paths for the \`updateMask\` parameter.

### Step 2: Build Update Items

Each item needs:
- \`entityId\` — ID of the entity to update
- \`data\` — partial payload with only the fields being updated
- \`updateMask\` — comma-separated field paths

### Step 3: Execute

\`\`\`json
{
  "tool": "dv360_bulk_update_entities",
  "params": {
    "entityType": "lineItem",
    "advertiserId": "${advertiserId}",
    "items": [
      {
        "entityId": "{liId1}",
        "data": {
          "bidStrategy": {
            "fixedBid": {
              "bidAmountMicros": "6000000"
            }
          }
        },
        "updateMask": "bidStrategy.fixedBid.bidAmountMicros"
      },
      {
        "entityId": "{liId2}",
        "data": {
          "bidStrategy": {
            "fixedBid": {
              "bidAmountMicros": "7000000"
            }
          }
        },
        "updateMask": "bidStrategy.fixedBid.bidAmountMicros"
      }
    ],
    "reason": "Increasing bids on top-performing line items"
  }
}
\`\`\`

⚠️ **GOTCHA**: The \`updateMask\` must exactly match the fields in \`data\`. Missing mask paths = fields not updated. Extra mask paths = API error.

⚠️ **GOTCHA**: Prefer small, focused updates (one field at a time) over multi-field patches to reduce risk.

---

## Batch Bid Adjustments

For line item bid changes specifically, use the dedicated bid adjustment tool.

### Step 1: Review Current Bids

\`\`\`json
{
  "tool": "dv360_list_entities",
  "params": {
    "entityType": "lineItem",
    "advertiserId": "${advertiserId}",
    "insertionOrderId": "{ioId}"
  }
}
\`\`\`

Note the current \`bidStrategy.fixedBid.bidAmountMicros\` for each line item.

### Step 2: Calculate New Bids

Bid amounts are in **micros**: 1 USD = 1,000,000 micros.

| Current Bid | Micros | +20% | New Micros |
|---|---|---|---|
| $5.00 | 5,000,000 | $6.00 | 6,000,000 |
| $3.50 | 3,500,000 | $4.20 | 4,200,000 |

### Step 3: Execute

\`\`\`json
{
  "tool": "dv360_adjust_line_item_bids",
  "params": {
    "adjustments": [
      {
        "advertiserId": "${advertiserId}",
        "lineItemId": "{liId1}",
        "newBidMicros": 6000000,
        "reason": "Increasing bid by 20% due to strong CTR"
      },
      {
        "advertiserId": "${advertiserId}",
        "lineItemId": "{liId2}",
        "newBidMicros": 4200000,
        "reason": "Increasing bid by 20% due to strong CTR"
      }
    ]
  }
}
\`\`\`

### Step 4: Verify

Check the response for \`successful\` and \`failed\` arrays. Each successful adjustment shows \`previousBidMicros\` and \`newBidMicros\` for confirmation.

⚠️ **GOTCHA**: This tool only works for \`fixedBid\` strategy line items. For auto-bidding line items, use \`dv360_bulk_update_entities\` with the appropriate bid strategy fields.

---

## Safety Checklist

Before executing any bulk operation:

- [ ] Confirmed the correct \`advertiserId\`
- [ ] Verified entity IDs exist by listing them first
- [ ] For status changes: understood the impact on child entities
- [ ] For updates: fetched entity-fields resource for valid updateMask paths
- [ ] For bids: amounts are in micros (not dollars)
- [ ] For creates: fetched entity-schema and entity-examples resources
- [ ] Reason field provided for audit trail

## Handling Partial Failures

All bulk operations return partial results. If some items fail:

1. Check the \`failed\` array for error messages
2. Common errors: invalid entity ID, entity not found, permission denied, invalid field values
3. Fix the failing items and retry only those (don't re-run the successful ones)
4. After retrying, verify all entities are in the expected state
`;
}
