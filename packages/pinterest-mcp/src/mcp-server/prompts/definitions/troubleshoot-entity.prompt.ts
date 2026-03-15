// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const pinterestTroubleshootEntityPrompt: Prompt = {
  name: "pinterest_troubleshoot_entity",
  description: "Diagnostic workflow for troubleshooting Pinterest Ads entity issues",
  arguments: [
    {
      name: "entityType",
      description: "Entity type (campaign, adGroup, ad, creative)",
      required: true,
    },
    {
      name: "entityId",
      description: "Numeric entity ID to troubleshoot",
      required: true,
    },
    {
      name: "adAccountId",
      description: "Pinterest Advertiser ID",
      required: true,
    },
  ],
};

export function getPinterestTroubleshootEntityMessage(
  args?: Record<string, string>,
): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";
  const adAccountId = args?.adAccountId || "{adAccountId}";

  return `# Pinterest Entity Troubleshoot Workflow

## Target: ${entityType} ${entityId} (Advertiser: ${adAccountId})

## Step 1: Fetch Entity Details

\`\`\`json
pinterest_get_entity({
  "entityType": "${entityType}",
  "adAccountId": "${adAccountId}",
  "entityId": "${entityId}"
})
\`\`\`

Check: operation_status, primary_status, secondary_status, and any rejection reasons.

## Step 2: Check Recent Performance

\`\`\`json
pinterest_get_report({
  "adAccountId": "${adAccountId}",
  "dimensions": ["campaign_id", "stat_time_day"],
  "metrics": ["impressions", "clicks", "spend", "conversions"],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 3: Check Parent Entity

If ad group or ad, check parent entity status:
\`\`\`json
pinterest_get_entity({
  "entityType": "campaign",
  "adAccountId": "${adAccountId}",
  "entityId": "{parentCampaignId}"
})
\`\`\`

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| No delivery | Entity DISABLED | Use \`pinterest_bulk_update_status\` with operationStatus: "ENABLE" |
| No delivery, ENABLE | Parent disabled | Enable parent campaign or ad group |
| No delivery, all ENABLE | Budget exhausted | Increase budget |
| No delivery, budget OK | Targeting too narrow | Check audience estimate |
| Ad under review | Pinterest ad review in progress | Allow 24-48h for review |
| Ad rejected | Policy violation | Review Pinterest creative guidelines |
| Video not playing | Video upload incomplete | Check video status in Creative Library |
| Low reach | Targeting too narrow | Broaden age, interests, or geos |

## Step 4: Audience Estimate

\`\`\`json
pinterest_get_audience_estimate({
  "adAccountId": "${adAccountId}",
  "targetingConfig": { ... targeting from adGroup ... }
})
\`\`\`

## Step 5: Validate Entity Payload

\`\`\`json
pinterest_validate_entity({
  "entityType": "${entityType}",
  "mode": "update",
  "data": { ... current entity data ... }
})
\`\`\`

## Status Update Tool

Pinterest uses a separate status endpoint — do NOT use \`pinterest_update_entity\` for status changes:

\`\`\`json
pinterest_bulk_update_status({
  "entityType": "${entityType}",
  "adAccountId": "${adAccountId}",
  "entityIds": ["${entityId}"],
  "operationStatus": "ENABLE"
})
\`\`\`
`;
}