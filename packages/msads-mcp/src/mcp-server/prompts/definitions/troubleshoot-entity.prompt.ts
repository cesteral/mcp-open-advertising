// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const msadsTroubleshootEntityPrompt: Prompt = {
  name: "msads_troubleshoot_entity",
  description: "Troubleshoot issues with Microsoft Advertising entities",
  arguments: [
    {
      name: "entityType",
      description: "Entity type (campaign, adGroup, ad, keyword)",
      required: true,
    },
    { name: "entityId", description: "Entity ID to troubleshoot", required: true },
  ],
};

export function getMsAdsTroubleshootEntityMessage(args?: Record<string, string>): string {
  const entityType = args?.entityType || "{entityType}";
  const entityId = args?.entityId || "{entityId}";

  return `# Troubleshoot Microsoft Ads Entity

## Step 1: Fetch Entity Details
\`\`\`json
msads_get_entity({ "entityType": "${entityType}", "entityIds": ["${entityId}"] })
\`\`\`

## Step 2: Check Status
Look for: Status (Active/Paused/Deleted), editorial status, delivery issues.

## Step 3: Check Parent Entity
If this is an ad group, ad, or keyword, verify the parent entity is active.

## Step 4: Review Performance
\`\`\`json
msads_get_report({
  "reportType": "${entityType === "campaign" ? "CampaignPerformanceReportRequest" : entityType === "adGroup" ? "AdGroupPerformanceReportRequest" : entityType === "keyword" ? "KeywordPerformanceReportRequest" : "AdPerformanceReportRequest"}",
  "accountId": "{accountId}",
  "columns": ["Impressions", "Clicks", "Spend", "Conversions", "QualityScore"],
  "startDate": "2026-01-01",
  "endDate": "2026-01-31"
})
\`\`\`

## Common Issues
- **Not serving**: Check budget, status, targeting, and payment method
- **Low quality score**: Improve ad relevance, expected CTR, or landing page
- **High CPC**: Review competition and consider bid adjustments
- **Disapproved ads**: Check editorial policies and ad content
`;
}
