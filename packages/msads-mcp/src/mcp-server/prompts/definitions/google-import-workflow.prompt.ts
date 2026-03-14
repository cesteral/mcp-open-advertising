import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const googleImportWorkflowPrompt: Prompt = {
  name: "msads_google_import_workflow",
  description: "Guide for importing campaigns from Google Ads into Microsoft Advertising",
  arguments: [
    { name: "googleAccountId", description: "Google Ads customer ID (format: 123-456-7890)", required: true },
  ],
};

export function getGoogleImportWorkflowMessage(args?: Record<string, string>): string {
  const googleAccountId = args?.googleAccountId || "{googleAccountId}";

  return `# Google Ads Import Workflow

Import campaigns from Google Ads into Microsoft Advertising using the ImportJobs API.

## Step 1: Create Import Job
\`\`\`json
msads_import_from_google({
  "operation": "create",
  "data": {
    "ImportJobs": [{
      "Type": "GoogleImportJob",
      "GoogleAccountId": "${googleAccountId}",
      "CampaignAdGroupIds": null,
      "NewAccountNegativeKeywords": true,
      "AutoDeviceBidOptimization": true
    }]
  }
})
\`\`\`

## Step 2: Check Import Status
\`\`\`json
msads_import_from_google({
  "operation": "getStatus",
  "data": { "ImportJobIds": ["{importJobId}"] }
})
\`\`\`

## Step 3: Review Results
\`\`\`json
msads_import_from_google({
  "operation": "getResults",
  "data": { "ImportJobId": "{importJobId}" }
})
\`\`\`

## What Gets Imported
- Campaigns (Search, Shopping, DSA)
- Ad groups and keywords
- Text ads and responsive search ads
- Ad extensions (sitelinks, callouts, etc.)
- Audiences and remarketing lists
- Negative keywords

## What Does NOT Import
- Performance Max campaigns
- Smart campaigns
- App campaigns
- Google-specific features (e.g., Gmail ads)

## Post-Import Checklist
- [ ] Review imported campaigns for accuracy
- [ ] Adjust bids (Microsoft Ads auction differs from Google)
- [ ] Update tracking templates/URLs
- [ ] Add Microsoft Audience Network targeting
- [ ] Set appropriate budgets
- [ ] Activate campaigns when ready
`;
}
