import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const amazonDspTroubleshootEntityPrompt: Prompt = {
  name: "amazon_dsp_troubleshoot_entity",
  description: "Diagnostic workflow for troubleshooting AmazonDsp Ads entity issues",
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
      name: "profileId",
      description: "AmazonDsp Advertiser ID",
      required: true,
    },
  ],
};

export function getTiktokTroubleshootEntityMessage(
  args?: Record<string, string>,
): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";
  const profileId = args?.profileId || "{profileId}";

  return `# AmazonDsp Entity Troubleshoot Workflow

## Target: ${entityType} ${entityId} (Advertiser: ${profileId})

## Step 1: Fetch Entity Details

\`\`\`json
amazon_dsp_get_entity({
  "entityType": "${entityType}",
  "profileId": "${profileId}",
  "entityId": "${entityId}"
})
\`\`\`

Check: operation_status, primary_status, secondary_status, and any rejection reasons.

## Step 2: Check Recent Performance

\`\`\`json
amazon_dsp_get_report({
  "profileId": "${profileId}",
  "dimensions": ["campaign_id", "stat_time_day"],
  "metrics": ["impressions", "clicks", "spend", "conversions"],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 3: Check Parent Entity

If ad group or ad, check parent entity status:
\`\`\`json
amazon_dsp_get_entity({
  "entityType": "campaign",
  "profileId": "${profileId}",
  "entityId": "{parentCampaignId}"
})
\`\`\`

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| No delivery | Entity DISABLED | Use \`amazon_dsp_bulk_update_status\` with operationStatus: "ENABLE" |
| No delivery, ENABLE | Parent disabled | Enable parent campaign or ad group |
| No delivery, all ENABLE | Budget exhausted | Increase budget |
| No delivery, budget OK | Targeting too narrow | Check audience estimate |
| Ad under review | AmazonDsp ad review in progress | Allow 24-48h for review |
| Ad rejected | Policy violation | Review AmazonDsp creative guidelines |
| Video not playing | Video upload incomplete | Check video status in Creative Library |
| Low reach | Targeting too narrow | Broaden age, interests, or geos |

## Step 4: Audience Estimate

\`\`\`json
amazon_dsp_get_audience_estimate({
  "profileId": "${profileId}",
  "targetingConfig": { ... targeting from adGroup ... }
})
\`\`\`

## Step 5: Validate Entity Payload

\`\`\`json
amazon_dsp_validate_entity({
  "entityType": "${entityType}",
  "mode": "update",
  "data": { ... current entity data ... }
})
\`\`\`

## Status Update Tool

AmazonDsp uses a separate status endpoint — do NOT use \`amazon_dsp_update_entity\` for status changes:

\`\`\`json
amazon_dsp_bulk_update_status({
  "entityType": "${entityType}",
  "profileId": "${profileId}",
  "entityIds": ["${entityId}"],
  "operationStatus": "ENABLE"
})
\`\`\`
`;
}
