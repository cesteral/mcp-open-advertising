// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const pinterestReportingWorkflowPrompt: Prompt = {
  name: "pinterest_reporting_workflow",
  description:
    "Guide for Pinterest Ads async reports: report types, columns, granularity, targeting breakdowns and date-range limits",
  arguments: [
    {
      name: "adAccountId",
      description: "Pinterest ad account ID",
      required: true,
    },
    {
      name: "reportType",
      description: "Report type: CAMPAIGN, AD_GROUP, AD, KEYWORD or ACCOUNT (default: CAMPAIGN)",
      required: false,
    },
  ],
};

export function getPinterestReportingWorkflowMessage(args?: Record<string, string>): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";
  const reportType = args?.reportType || "CAMPAIGN";

  return `# Pinterest Reporting Workflow

Ad account: \`${adAccountId}\`
Report type: \`${reportType}\`

---

## Overview

Pinterest reports are **async**. \`pinterest_get_report\` submits the report (\`POST /v5/ad_accounts/{id}/reports\`), polls until it is ready, and returns the rows. To manage the steps yourself, use \`pinterest_submit_report\`, \`pinterest_check_report_status\` and \`pinterest_download_report\`.

A report has no free-form dimensions. The row level comes from \`type\`, the time buckets from \`granularity\`, and everything else is a \`columns\` value:

| Parameter | Values |
|-----------|--------|
| \`type\` | \`CAMPAIGN\` (default), \`AD_GROUP\`, \`AD\` (Pinterest level \`PIN_PROMOTION\`), \`KEYWORD\`, \`ACCOUNT\` (Pinterest level \`ADVERTISER\`) |
| \`granularity\` | \`DAY\` (default), \`TOTAL\`, \`HOUR\`, \`WEEK\`, \`MONTH\` |
| Date range | \`startDate\` + \`endDate\` (YYYY-MM-DD), or \`datePreset\` |
| Filters | \`campaignIds\`, \`adGroupIds\`, \`adIds\` |

---

## Step 1: Campaign report

\`\`\`json
pinterest_get_report({
  "adAccountId": "${adAccountId}",
  "type": "${reportType}",
  "columns": ["CAMPAIGN_ID", "CAMPAIGN_NAME", "IMPRESSION_1", "CLICKTHROUGH_1", "CTR", "SPEND_IN_DOLLAR", "TOTAL_CONVERSIONS"],
  "granularity": "DAY",
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

Set \`includeComputedMetrics: true\` to add computed CPA, ROAS, CPM, CTR and CPC.

## Step 2: Ad group report for one campaign

\`\`\`json
pinterest_get_report({
  "adAccountId": "${adAccountId}",
  "type": "AD_GROUP",
  "columns": ["AD_GROUP_ID", "IMPRESSION_1", "CLICKTHROUGH_1", "SPEND_IN_DOLLAR", "CPM_IN_DOLLAR", "ECPC_IN_DOLLAR"],
  "campaignIds": ["{campaign_id}"],
  "granularity": "TOTAL",
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 3: Targeting breakdowns

Pinterest breakdowns are not extra columns. Each one is a \`targeting_types\` value, and the report runs at the \`*_TARGETING\` variant of its type. KEYWORD reports cannot be broken down.

\`\`\`json
pinterest_get_report_breakdowns({
  "adAccountId": "${adAccountId}",
  "type": "CAMPAIGN",
  "columns": ["CAMPAIGN_ID", "IMPRESSION_1", "CLICKTHROUGH_1", "SPEND_IN_DOLLAR"],
  "breakdowns": ["GENDER", "AGE_BUCKET"],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

You can pass up to 5 breakdowns, including \`APPTYPE\`, \`GENDER\`, \`AGE_BUCKET\`, \`AGE_BUCKET_AND_GENDER\`, \`COUNTRY\`, \`REGION\`, \`LOCATION\`, \`GEO\`, \`PLACEMENT\`, \`KEYWORD\`, \`TARGETED_INTEREST\`, \`PINNER_INTEREST\`, \`AUDIENCE_INCLUDE\` and \`MEDIA_TYPE\`. The tool's schema has the full list.

## Step 4: Video report

\`\`\`json
pinterest_get_report({
  "adAccountId": "${adAccountId}",
  "type": "AD",
  "columns": [
    "PIN_PROMOTION_ID", "IMPRESSION_1", "VIDEO_MRC_VIEWS_1", "VIDEO_3SEC_VIEWS_1",
    "VIDEO_P25_COMBINED_1", "VIDEO_P50_COMBINED_1", "VIDEO_P75_COMBINED_1", "VIDEO_P100_COMPLETE_1"
  ],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Resource References

- Fetch \`reporting-reference://pinterest\` for more columns
- Fetch \`entity-hierarchy://pinterest/all\` for entity relationships

## Common Columns

| Column | Meaning |
|--------|---------|
| \`CAMPAIGN_ID\`, \`AD_GROUP_ID\`, \`PIN_PROMOTION_ID\` | Entity IDs (a Pinterest ad is a pin promotion) |
| \`IMPRESSION_1\`, \`TOTAL_IMPRESSION\` | Impressions |
| \`CLICKTHROUGH_1\`, \`TOTAL_CLICKTHROUGH\` | Clicks |
| \`CTR\` | Click-through rate |
| \`SPEND_IN_DOLLAR\` / \`SPEND_IN_MICRO_DOLLAR\` | Spend. The \`MICRO\` form is in micros. |
| \`CPM_IN_DOLLAR\`, \`ECPC_IN_DOLLAR\` | Cost per thousand impressions, effective cost per click |
| \`TOTAL_CONVERSIONS\` | Conversions |
| \`VIDEO_MRC_VIEWS_1\`, \`VIDEO_3SEC_VIEWS_1\` | Video views |
| \`VIDEO_P25_COMBINED_1\` … \`VIDEO_P100_COMPLETE_1\` | Video quartiles and completions |

\`columns\` is a fixed enum in the Pinterest API (over 600 values), so use exact names. The tool does not check them, and Pinterest rejects a report with an unknown column.

## Date-range limits (Pinterest \`create_report\`)

- **DAY, WEEK, MONTH, TOTAL**: data up to 914 days back, with at most 186 days per report
- **HOUR**: data up to 8 days back, with at most 3 days per report

Split longer ranges across several reports.
`;
}
