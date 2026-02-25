import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const troubleshootEntityPrompt: Prompt = {
  name: "meta_troubleshoot_entity",
  description: "Diagnostic workflow for troubleshooting Meta Ads entity issues",
  arguments: [
    {
      name: "entityType",
      description: "Entity type (campaign, adSet, ad, adCreative)",
      required: true,
    },
    {
      name: "entityId",
      description: "Entity ID to troubleshoot",
      required: true,
    },
  ],
};

export function getTroubleshootEntityMessage(args?: Record<string, string>): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";

  return `# Meta Entity Troubleshoot Workflow

## Target: ${entityType} ${entityId}

## Step 1: Fetch Entity Details

\`\`\`json
meta_get_entity({
  "entityType": "${entityType}",
  "entityId": "${entityId}"
})
\`\`\`

Check: status, effective_status, configured_status, delivery issues.

## Step 2: Check Recent Performance

\`\`\`json
meta_get_insights({
  "entityId": "${entityId}",
  "datePreset": "last_7d",
  "fields": ["impressions", "reach", "spend", "actions"]
})
\`\`\`

## Step 3: Check Parent Entity

If ad set or ad, check parent campaign status:
\`\`\`json
meta_get_entity({
  "entityType": "campaign",
  "entityId": "PARENT_CAMPAIGN_ID"
})
\`\`\`

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| No delivery | Entity PAUSED | Update status to ACTIVE |
| No delivery, ACTIVE | Parent paused | Activate parent campaign |
| No delivery, all ACTIVE | Budget exhausted | Increase budget |
| No delivery, budget OK | Targeting too narrow | Broaden targeting |
| Low reach | Audience saturation | Expand audience or reduce frequency |
| High CPC | Poor relevance | Refresh creative |
| Rejected | Policy violation | Review ad content |

## Step 4: Delivery Estimate (for ad sets)

\`\`\`json
meta_get_delivery_estimate({
  "adAccountId": "AD_ACCOUNT_ID",
  "targetingSpec": { ... targeting from entity ... }
})
\`\`\`
`;
}
