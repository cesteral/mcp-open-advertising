// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const msadsBulkOperationsWorkflowPrompt: Prompt = {
  name: "msads_bulk_operations_workflow",
  description: "Guide for performing bulk operations in Microsoft Advertising",
  arguments: [],
};

export function getMsAdsBulkOperationsWorkflowMessage(): string {
  return `# Microsoft Ads Bulk Operations Workflow

## Bulk Create Entities
\`\`\`json
msads_bulk_create_entities({
  "entityType": "keyword",
  "items": [
    { "AdGroupId": 123, "Text": "keyword 1", "MatchType": "Phrase", "Bid": { "Amount": 1.50 } },
    { "AdGroupId": 123, "Text": "keyword 2", "MatchType": "Exact", "Bid": { "Amount": 2.00 } }
  ]
})
\`\`\`

## Bulk Update Status (Pause/Activate)
\`\`\`json
msads_bulk_update_status({
  "entityType": "campaign",
  "entityIds": ["111", "222", "333"],
  "status": "Paused"
})
\`\`\`

## Bulk Bid Adjustments
\`\`\`json
msads_adjust_bids({
  "entityType": "keyword",
  "adjustments": [
    { "entityId": "111", "bidField": "Bid", "newBid": 1.75 },
    { "entityId": "222", "bidField": "Bid", "newBid": 2.25 }
  ]
})
\`\`\`
The adjust-bids tool uses a safe read-modify-write pattern.

## Batch Limits
| Entity | Batch Limit |
|--------|-------------|
| Campaign | 100 |
| Ad Group | 1,000 |
| Ad | 50 |
| Keyword | 1,000 |
| Budget | 100 |
| Ad Extension | 100 |
| Audience | 100 |
| Label | 100 |
`;
}