import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const tiktokTroubleshootEntityPrompt: Prompt = {
  name: "tiktok_troubleshoot_entity",
  description: "Diagnostic workflow for troubleshooting TikTok Ads entity issues",
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
      name: "advertiserId",
      description: "TikTok Advertiser ID",
      required: true,
    },
  ],
};

export function getTiktokTroubleshootEntityMessage(
  args?: Record<string, string>,
): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";
  const advertiserId = args?.advertiserId || "{advertiserId}";

  return `# TikTok Entity Troubleshoot Workflow

## Target: ${entityType} ${entityId} (Advertiser: ${advertiserId})

## Step 1: Fetch Entity Details

\`\`\`json
tiktok_get_entity({
  "entityType": "${entityType}",
  "advertiserId": "${advertiserId}",
  "entityId": "${entityId}"
})
\`\`\`

Check: operation_status, primary_status, secondary_status, and any rejection reasons.

## Step 2: Check Recent Performance

\`\`\`json
tiktok_get_report({
  "advertiserId": "${advertiserId}",
  "dimensions": ["campaign_id", "stat_time_day"],
  "metrics": ["impressions", "clicks", "spend", "conversions"],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 3: Check Parent Entity

If ad group or ad, check parent entity status:
\`\`\`json
tiktok_get_entity({
  "entityType": "campaign",
  "advertiserId": "${advertiserId}",
  "entityId": "{parentCampaignId}"
})
\`\`\`

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| No delivery | Entity DISABLED | Use \`tiktok_bulk_update_status\` with operationStatus: "ENABLE" |
| No delivery, ENABLE | Parent disabled | Enable parent campaign or ad group |
| No delivery, all ENABLE | Budget exhausted | Increase budget |
| No delivery, budget OK | Targeting too narrow | Check audience estimate |
| Ad under review | TikTok ad review in progress | Allow 24-48h for review |
| Ad rejected | Policy violation | Review TikTok creative guidelines |
| Video not playing | Video upload incomplete | Check video status in Creative Library |
| Low reach | Targeting too narrow | Broaden age, interests, or geos |

## Step 4: Audience Estimate

\`\`\`json
tiktok_get_audience_estimate({
  "advertiserId": "${advertiserId}",
  "targetingConfig": { ... targeting from adGroup ... }
})
\`\`\`

## Step 5: Validate Entity Payload

\`\`\`json
tiktok_validate_entity({
  "entityType": "${entityType}",
  "mode": "update",
  "data": { ... current entity data ... }
})
\`\`\`

## Status Update Tool

TikTok uses a separate status endpoint — do NOT use \`tiktok_update_entity\` for status changes:

\`\`\`json
tiktok_bulk_update_status({
  "entityType": "${entityType}",
  "advertiserId": "${advertiserId}",
  "entityIds": ["${entityId}"],
  "operationStatus": "ENABLE"
})
\`\`\`
`;
}
