// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

// Field names, report types, dimensions and metric names below follow the
// tool input schemas and Amazon's Postman DSP report examples
// (github.com/amzn/ads-advanced-tools-docs, Reporting / DSP report).
export const amazonDspReportingWorkflowPrompt: Prompt = {
  name: "amazon_dsp_reporting_workflow",
  description:
    "Guide for submitting and retrieving AmazonDsp Ads async reports with dimensions, metrics, and breakdowns",
  arguments: [
    {
      name: "accountId",
      description:
        "DSP advertiser ID (advertiserId from amazon_dsp_list_advertisers) — the report URL's {accountId}",
      required: true,
    },
    {
      name: "reportType",
      description:
        "Report type: CAMPAIGN, INVENTORY, AUDIENCE, PRODUCTS, TECHNOLOGY, GEOGRAPHY, CONVERSION_SOURCE (default: CAMPAIGN)",
      required: false,
    },
  ],
};

export function getAmazonDspReportingWorkflowMessage(args?: Record<string, string>): string {
  const accountId = args?.accountId || args?.profileId || "{accountId}";
  const reportType = args?.reportType || "CAMPAIGN";

  return `# Amazon DSP Reporting Workflow

DSP advertiser (accountId): \`${accountId}\`
Report type: \`${reportType}\`

---

## Overview

Amazon DSP reports are **async** (DSP reports v3, \`POST /accounts/{accountId}/dsp/reports\`). \`amazon_dsp_get_report\` submits the job, polls for completion, and returns the results when ready. For a non-blocking flow use \`amazon_dsp_submit_report\` → \`amazon_dsp_check_report_status\` → \`amazon_dsp_download_report\`.

\`accountId\` is the DSP **advertiser** ID (from \`amazon_dsp_list_advertisers\`), not the profile ID.

---

## Step 1: Order-Level Campaign Report

\`\`\`json
amazon_dsp_get_report({
  "accountId": "${accountId}",
  "type": "CAMPAIGN",
  "dimensions": ["ORDER"],
  "metrics": ["impressions", "clickThroughs", "totalCost"],
  "timeUnit": "DAILY",
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 2: Line Item Level Report with Video Metrics

\`\`\`json
amazon_dsp_get_report({
  "accountId": "${accountId}",
  "type": "CAMPAIGN",
  "dimensions": ["ORDER", "LINE_ITEM"],
  "metrics": ["impressions", "clickThroughs", "totalCost", "videoStart", "videoFirstQuartile", "videoMidpoint", "videoThirdQuartile", "videoComplete"],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 3: Creative Report with Shopping Attribution

\`\`\`json
amazon_dsp_get_report({
  "accountId": "${accountId}",
  "type": "CAMPAIGN",
  "dimensions": ["ORDER", "LINE_ITEM", "CREATIVE"],
  "metrics": ["impressions", "totalCost", "dpv14d", "purchases14d", "sales14d", "newToBrandPurchases14d"],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 4: Breakdowns

\`\`\`json
amazon_dsp_get_report_breakdowns({
  "accountId": "${accountId}",
  "type": "CAMPAIGN",
  "dimensions": ["ORDER"],
  "breakdowns": ["LINE_ITEM"],
  "metrics": ["impressions", "viewableImpressions", "totalCost"],
  "datePreset": "LAST_7_DAYS"
})
\`\`\`

## Resource References

- Fetch \`reporting-reference://amazonDsp\` for report types, per-type dimensions and sample metrics
- Fetch \`entity-hierarchy://amazonDsp/all\` for entity relationships

## Dimensions (\`CAMPAIGN\` type)

| Dimension | Level |
|-----------|-------|
| \`ORDER\` | Order (campaign) |
| \`LINE_ITEM\` | Line item (ad group) |
| \`CREATIVE\` | Creative |

Other types use their own dimensions (e.g. \`GEOGRAPHY\`: \`COUNTRY\`, \`DMA\`, \`POSTAL_CODE\`; \`TECHNOLOGY\`: \`DEVICE_TYPE\`, \`OPERATING_SYSTEM\`). Daily rows come from \`timeUnit: "DAILY"\`, not from a date dimension.

## Common Metrics

| Metric | Description |
|--------|-------------|
| \`impressions\` | Total impressions |
| \`clickThroughs\` | Total clicks |
| \`totalCost\` | Total spend in the report currency |
| \`viewableImpressions\` | Viewable impressions |
| \`videoStart\` / \`videoComplete\` | Video starts / completions |
| \`dpv14d\` | Detail page views (14-day attribution) |
| \`purchases14d\` | Purchases (14-day attribution) |
| \`sales14d\` | Sales (14-day attribution) |
| \`newToBrandPurchases14d\` | Purchases from new-to-brand customers (14-day attribution) |

## Tips

- Reports may take **30 seconds to several minutes** depending on date range and data volume
- Amazon shopping metrics (\`dpv14d\`, \`purchases14d\`, \`sales14d\`) require Amazon attribution setup
- Unknown metric names are rejected with a 422 that lists the invalid names
- Confirm the report currency before comparing spend across advertisers or platforms
`;
}
