// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

/**
 * Google Ads Bulk Operations Workflow Prompt
 *
 * Guides AI agents through batch mutate, status changes, bid adjustments,
 * and entity removal in Google Ads.
 */
export const bulkOperationsWorkflowPrompt: Prompt = {
  name: "gads_bulk_operations_workflow",
  description:
    "Step-by-step guide for Google Ads bulk operations: batch mutate (create+update+remove), batch status changes, batch bid adjustments, and entity removal. Covers atomic vs partial failure, micros conversion, and verification.",
  arguments: [
    {
      name: "customerId",
      description: "Google Ads customer ID (no dashes)",
      required: true,
    },
    {
      name: "operation",
      description: "Operation type: 'mutate', 'status', 'bids', or 'remove' (default: status)",
      required: false,
    },
  ],
};

export function getBulkOperationsWorkflowMessage(args?: Record<string, string>): string {
  const customerId = args?.customerId || "{customerId}";
  const operation = args?.operation || "status";

  return `# Google Ads Bulk Operations Workflow

Customer ID: \`${customerId}\`
Operation: \`${operation}\`

---

## Overview

Google Ads supports these bulk operation tools:

| Tool | Purpose | Max Items | Default Behavior |
|------|---------|-----------|-----------------|
| \`gads_bulk_mutate\` | Multi-operation mutate (create+update+remove) | 5,000 | Atomic (all-or-nothing) |
| \`gads_bulk_update_status\` | Batch enable/pause/remove entities | 100 | Partial success |
| \`gads_adjust_bids\` | Batch adjust ad group CPC/CPM bids | 50 | Per-item results |
| \`gads_remove_entity\` | Remove a single entity | 1 | N/A |

---

## Bulk Status Updates

The simplest bulk operation. Use to enable, pause, or remove multiple entities.

### Step 1: Identify Entities

\`\`\`json
{
  "tool": "gads_list_entities",
  "params": {
    "entityType": "adGroup",
    "customerId": "${customerId}",
    "filters": "campaign.id = {campaignId}"
  }
}
\`\`\`

### Step 2: Execute Status Change

\`\`\`json
{
  "tool": "gads_bulk_update_status",
  "params": {
    "entityType": "adGroup",
    "customerId": "${customerId}",
    "entityIds": ["{adGroupId1}", "{adGroupId2}", "{adGroupId3}"],
    "status": "PAUSED"
  }
}
\`\`\`

Valid statuses:
- \`ENABLED\` — active and eligible for delivery
- \`PAUSED\` — temporarily stopped, can be re-enabled
- \`REMOVED\` — permanently removed, **cannot be un-removed**

⚠️ **GOTCHA**: \`REMOVED\` is permanent and irreversible. Always prefer \`PAUSED\` unless you truly want to delete. Entity data is retained but the entity becomes permanently inactive.

### Step 3: Review Results

Check \`results\` array for per-entity success/failure, \`totalSucceeded\` / \`totalFailed\` counts.

---

## Bulk Mutate (Create + Update + Remove)

The most powerful bulk tool — execute mixed operations in a single call.

### Step 1: Fetch Schemas

**Resource:** \`entity-schema://{entityType}\` and \`entity-examples://{entityType}\`

### Step 2: Build Operations

Each operation must be exactly ONE of: \`create\`, \`update\`, or \`remove\`.

\`\`\`json
{
  "tool": "gads_bulk_mutate",
  "params": {
    "entityType": "adGroup",
    "customerId": "${customerId}",
    "operations": [
      {
        "create": {
          "name": "New Ad Group - US",
          "campaign": "customers/${customerId}/campaigns/{campaignId}",
          "status": "PAUSED",
          "type": "SEARCH_STANDARD",
          "cpcBidMicros": "2000000"
        }
      },
      {
        "update": {
          "resourceName": "customers/${customerId}/adGroups/{adGroupId}",
          "cpcBidMicros": "2500000"
        },
        "updateMask": "cpcBidMicros"
      },
      {
        "remove": "customers/${customerId}/adGroups/{oldAdGroupId}"
      }
    ],
    "partialFailure": true
  }
}
\`\`\`

### Atomic vs Partial Failure

- **\`partialFailure: false\`** (default): All operations succeed or all fail. Use when operations are interdependent.
- **\`partialFailure: true\`**: Each operation succeeds or fails independently. Use for batch processing where individual failures are acceptable.

⚠️ **GOTCHA**: The \`updateMask\` must exactly match the fields in the \`update\` object. Missing fields in the mask = fields not updated.

⚠️ **GOTCHA**: \`resourceName\` format is \`customers/{customerId}/{entityType}/{entityId}\`. Entity type in resource name is plural (e.g., \`adGroups\`, \`campaigns\`, \`ads\`).

---

## Batch Bid Adjustments

### Step 1: Review Current Bids

\`\`\`json
{
  "tool": "gads_list_entities",
  "params": {
    "entityType": "adGroup",
    "customerId": "${customerId}",
    "filters": "campaign.id = {campaignId}"
  }
}
\`\`\`

### Step 2: Calculate New Bids

All Google Ads bid amounts are in **micros**: 1,000,000 micros = $1.00 USD.

| Current Bid | Micros | +20% | New Micros |
|---|---|---|---|
| $2.00 CPC | 2,000,000 | $2.40 | 2,400,000 |
| $5.00 CPM | 5,000,000 | $6.00 | 6,000,000 |

### Step 3: Execute

\`\`\`json
{
  "tool": "gads_adjust_bids",
  "params": {
    "customerId": "${customerId}",
    "adjustments": [
      {
        "adGroupId": "{adGroupId1}",
        "cpcBidMicros": "2400000"
      },
      {
        "adGroupId": "{adGroupId2}",
        "cpcBidMicros": "3000000",
        "cpmBidMicros": "6000000"
      }
    ],
    "reason": "Increasing bids on top-performing ad groups by 20%"
  }
}
\`\`\`

### Step 4: Verify

Each successful adjustment shows \`previousCpcBidMicros\` / \`previousCpmBidMicros\` and new values.

⚠️ **GOTCHA**: Bid values must be strings (e.g., \`"2400000"\`), not numbers. The Google Ads API uses string representation for micros.

⚠️ **GOTCHA**: At least one of \`cpcBidMicros\` or \`cpmBidMicros\` must be provided per adjustment.

---

## Entity Removal

For removing a single entity:

\`\`\`json
{
  "tool": "gads_remove_entity",
  "params": {
    "entityType": "keyword",
    "customerId": "${customerId}",
    "entityId": "{keywordId}"
  }
}
\`\`\`

For bulk removal, use \`gads_bulk_mutate\` with \`remove\` operations, or \`gads_bulk_update_status\` with status \`REMOVED\`.

⚠️ **GOTCHA**: Removal is permanent. For campaigns and ad groups, prefer \`PAUSED\` status instead of removing.

---

## Safety Checklist

- [ ] Correct \`customerId\` (no dashes)
- [ ] Entity IDs verified by listing first
- [ ] Bid amounts in micros (not dollars) — multiply by 1,000,000
- [ ] Bid values as strings, not numbers
- [ ] For updates: \`updateMask\` matches fields exactly
- [ ] For removes: confirmed permanence with user
- [ ] \`partialFailure\` flag set appropriately (atomic vs independent)
- [ ] Resource names use correct plural entity type format
- [ ] For \`gads_bulk_mutate\`: keep operation count under 100 for best performance (API supports 5,000 but latency degrades significantly above 100)
`;
}
