// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const msadsReportingWorkflowPrompt: Prompt = {
  name: "msads_reporting_workflow",
  description: "Guide for running Microsoft Advertising reports (blocking and non-blocking)",
  arguments: [{ name: "accountId", description: "Microsoft Ads Account ID", required: true }],
};

export function getMsAdsReportingWorkflowMessage(args?: Record<string, string>): string {
  const accountId = args?.accountId || "{accountId}";

  return `# Microsoft Ads Reporting Workflow

## Option A: Blocking (recommended for simple reports)
\`\`\`json
msads_get_report({
  "reportType": "CampaignPerformanceReportRequest",
  "accountId": "${accountId}",
  "columns": ["CampaignName", "Impressions", "Clicks", "Spend", "Conversions"],
  "startDate": "2026-01-01",
  "endDate": "2026-01-31",
  "aggregation": "Daily"
})
\`\`\`
This submits, polls, and downloads in one call.

## Option B: Non-Blocking (for long-running reports)

### Step 1: Submit
\`\`\`json
msads_submit_report({
  "reportType": "KeywordPerformanceReportRequest",
  "accountId": "${accountId}",
  "columns": ["Keyword", "Impressions", "Clicks", "AverageCpc", "QualityScore"],
  "startDate": "2026-01-01",
  "endDate": "2026-03-31"
})
\`\`\`

### Step 2: Check Status
\`\`\`json
msads_check_report_status({ "reportRequestId": "{id}" })
\`\`\`

### Step 3: Download
\`\`\`json
msads_download_report({ "downloadUrl": "{url}" })
\`\`\`

## Common Report Types
- **CampaignPerformanceReportRequest**: Campaign metrics
- **AdGroupPerformanceReportRequest**: Ad group metrics
- **KeywordPerformanceReportRequest**: Keyword metrics + quality scores
- **SearchQueryPerformanceReportRequest**: Search terms triggering ads
- **AudiencePerformanceReportRequest**: Audience targeting metrics
- **GeographicPerformanceReportRequest**: Location-based metrics
`;
}
