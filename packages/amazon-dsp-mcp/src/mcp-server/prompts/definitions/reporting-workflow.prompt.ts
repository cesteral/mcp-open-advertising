import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const amazonDspReportingWorkflowPrompt: Prompt = {
  name: "amazon_dsp_reporting_workflow",
  description:
    "Guide for submitting and retrieving AmazonDsp Ads async reports with dimensions, metrics, and breakdowns",
  arguments: [
    {
      name: "profileId",
      description: "AmazonDsp Advertiser ID",
      required: true,
    },
    {
      name: "reportLevel",
      description: "Report level: AUCTION, RESERVATION (default: AUCTION)",
      required: false,
    },
  ],
};

export function getAmazonDspReportingWorkflowMessage(
  args?: Record<string, string>,
): string {
  const profileId = args?.profileId || "{profileId}";
  const reportLevel = args?.reportLevel || "LINE_ITEM";

  return `# Amazon DSP Reporting Workflow

Advertiser: \`${profileId}\`
Report Level: \`${reportLevel}\`

---

## Overview

Amazon DSP reports are **async** — \`amazon_dsp_get_report\` submits the job, polls for completion, and returns the results when ready.

---

## Step 1: Basic Order Report

\`\`\`json
amazon_dsp_get_report({
  "advertiserId": "${profileId}",
  "reportType": "CAMPAIGN",
  "dimensions": ["orderId", "date"],
  "metrics": ["impressions", "clickThroughs", "totalCost"],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 2: Line Item Level Report

\`\`\`json
amazon_dsp_get_report({
  "advertiserId": "${profileId}",
  "reportType": "LINE_ITEM",
  "dimensions": ["lineItemId", "date"],
  "metrics": ["impressions", "clickThroughs", "totalCost", "videoCompletions", "videoFirstQuartile", "videoMidpoint"],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 3: Creative Report with Shopping Attribution

\`\`\`json
amazon_dsp_get_report({
  "advertiserId": "${profileId}",
  "reportType": "CREATIVE",
  "dimensions": ["creativeId", "date"],
  "metrics": ["impressions", "totalCost", "detailPageViews", "purchases", "sales14d", "newToBrandPurchases"],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 4: Video Engagement Report

\`\`\`json
amazon_dsp_get_report({
  "advertiserId": "${profileId}",
  "reportType": "CREATIVE",
  "dimensions": ["creativeId"],
  "metrics": [
    "impressions", "videoCompletions",
    "videoFirstQuartile", "videoMidpoint",
    "videoThirdQuartile", "viewableImpressions"
  ],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Resource References

- Fetch \`reporting-reference://amazonDsp\` for full metrics and dimensions list
- Fetch \`entity-hierarchy://amazonDsp/all\` for entity relationships

## Common Dimensions

| Dimension | Level |
|-----------|-------|
| \`orderId\` | Order |
| \`lineItemId\` | Line Item |
| \`creativeId\` | Creative |
| \`advertiserId\` | Advertiser |
| \`date\` | Daily breakdown |

## Common Metrics

| Metric | Description |
|--------|-------------|
| \`impressions\` | Total impressions |
| \`clickThroughs\` | Total clicks |
| \`totalCost\` | Total spend (USD) |
| \`viewableImpressions\` | Viewable impressions |
| \`videoCompletions\` | 100% video completions |
| \`detailPageViews\` | Amazon product detail page views |
| \`purchases\` | Total purchase events |
| \`sales14d\` | Total sales (14-day attribution) |
| \`newToBrandPurchases\` | Purchases from new-to-brand customers |
| \`brandedSearches\` | Branded keyword searches |

## Tips

- Reports may take **30 seconds to several minutes** depending on date range and data volume
- Amazon shopping metrics (\`detailPageViews\`, \`purchases\`, \`sales14d\`) require Amazon attribution setup
- Budget and spend values are in **USD**
`;
}
