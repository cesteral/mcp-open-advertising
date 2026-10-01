// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const amazonDspTroubleshootEntityPrompt: Prompt = {
  name: "amazon_dsp_troubleshoot_entity",
  description: "Diagnostic workflow for troubleshooting Amazon DSP entity issues (Unified API)",
  arguments: [
    {
      name: "entityType",
      description: "Entity type (order, lineItem, creative, creativeAssociation)",
      required: true,
    },
    {
      name: "entityId",
      description: "Entity ID to troubleshoot",
      required: true,
    },
    {
      name: "profileId",
      description: "Amazon Ads profile ID bound to the session",
      required: true,
    },
    {
      name: "accountId",
      description: "DSP advertiser ID (advertiserId from amazon_dsp_list_advertisers)",
      required: false,
    },
  ],
};

export function getAmazonDspTroubleshootEntityMessage(args?: Record<string, string>): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";
  const profileId = args?.profileId || "{profileId}";
  const accountId = args?.accountId || "{accountId}";

  return `# Amazon DSP Entity Troubleshoot Workflow

## Target: ${entityType} ${entityId} (Advertiser: ${accountId})

## Step 1: Fetch Entity Details

\`\`\`json
amazon_dsp_get_entity({
  "entityType": "${entityType}",
  "profileId": "${profileId}",
  "accountId": "${accountId}",
  "entityId": "${entityId}"
})
\`\`\`

Check \`state\` (ENABLED / PAUSED / ARCHIVED) and \`status.deliveryStatus\` with its \`status.deliveryReasons[]\` — Amazon's own explanation of why the entity is or is not delivering.

## Step 2: Check Recent Performance

\`\`\`json
amazon_dsp_get_report({
  "accountId": "${accountId}",
  "type": "CAMPAIGN",
  "dimensions": ["ORDER", "LINE_ITEM"],
  "metrics": ["impressions", "clickThroughs", "totalCost"],
  "timeUnit": "DAILY",
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 3: Check Parent and Children

- A line item's parent is \`campaignId\` → \`amazon_dsp_get_entity\` with \`entityType: "order"\`
- A line item's ads: \`amazon_dsp_list_entities\` with \`entityType: "creativeAssociation"\`, \`filters: { adGroupId: "<id>" }\`
- A line item's targets: \`amazon_dsp_list_entities\` with \`entityType: "target"\`, \`filters: { adGroupId: "<id>" }\`

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| No delivery | Entity PAUSED (new orders and line items start PAUSED) | \`amazon_dsp_bulk_update_status\` with \`operationStatus: "ENABLED"\` |
| No delivery, entity ENABLED | Parent order PAUSED | Enable the order too |
| No delivery, all ENABLED | Budget exhausted, or flights ended | Check \`budgets[]\` and \`flights[]\` |
| No delivery, budget OK | Targeting too narrow | Check the forecast and its warnings with \`amazon_dsp_get_campaign_forecast\` |
| Ad has no association | Ad created but never linked | Create a \`creativeAssociation\` |
| 207 error on update | Amazon rejected a field | The tool error lists Amazon's \`code\` and \`fieldLocation\` |

## Step 4: Validate a Payload

\`\`\`json
amazon_dsp_validate_entity({
  "entityType": "${entityType}",
  "mode": "update",
  "accountId": "${accountId}",
  "data": { "...": "fields you intend to send" }
})
\`\`\`

## Status Update Tool

\`\`\`json
amazon_dsp_bulk_update_status({
  "entityType": "${entityType}",
  "profileId": "${profileId}",
  "accountId": "${accountId}",
  "entityIds": ["${entityId}"],
  "operationStatus": "ENABLED"
})
\`\`\`
`;
}
