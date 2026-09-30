// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const snapchatReportingWorkflowPrompt: Prompt = {
  name: "snapchat_reporting_workflow",
  description:
    "Guide for pulling Snapchat Ads stats: metric fields, entity-level splits, and geo/demographic/device breakdowns (report_dimension)",
  arguments: [
    {
      name: "adAccountId",
      description: "Snapchat Ad Account ID",
      required: true,
    },
    {
      name: "dimensionType",
      description: "Entity level to split stats by: CAMPAIGN, AD_SQUAD or AD (default: CAMPAIGN)",
      required: false,
    },
  ],
};

export function getSnapchatReportingWorkflowMessage(args?: Record<string, string>): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";
  const dimensionType = args?.dimensionType || "CAMPAIGN";

  return `# Snapchat Reporting Workflow

Ad Account: \`${adAccountId}\`
Entity level: \`${dimensionType}\`

---

## Overview

Snapchat stats are **async**. \`snapchat_get_report\` submits the job, polls for completion and returns the rows. To control the steps yourself use \`snapchat_submit_report\`, \`snapchat_check_report_status\` and \`snapchat_download_report\`.

**Time ranges.** Snapchat measures days in the **ad account's timezone**. \`datePreset\` (e.g. \`LAST_7_DAYS\`) reads that timezone and resolves to local midnight. With explicit \`startTime\`/\`endTime\`, for \`DAY\` granularity use the account's day boundaries with its UTC offset (\`2026-02-01T00:00:00-08:00\`). The end is exclusive: to include 7 March, end at \`2026-03-08T00:00:00-08:00\`. Both must fall on the start of an hour. \`snapchat_list_ad_accounts\` returns each account's \`timezone\`.

---

## Step 1: Account-level daily report

\`\`\`json
snapchat_get_report({
  "adAccountId": "${adAccountId}",
  "fields": ["impressions", "swipes", "spend", "conversion_purchases"],
  "datePreset": "LAST_30_DAYS",
  "granularity": "DAY",
  "includeComputedMetrics": true
})
\`\`\`

## Step 2: Split by entity level

\`dimensionType\` returns one row per campaign, ad squad or ad:

\`\`\`json
snapchat_get_report({
  "adAccountId": "${adAccountId}",
  "fields": ["impressions", "swipes", "spend"],
  "datePreset": "LAST_7_DAYS",
  "granularity": "TOTAL",
  "dimensionType": "${dimensionType}"
})
\`\`\`

## Step 3: Geo, demographic and device breakdowns

\`snapchat_get_report_breakdowns\` takes one \`reportDimension\` and sends it as Snapchat's \`report_dimension\`:

\`\`\`json
snapchat_get_report_breakdowns({
  "adAccountId": "${adAccountId}",
  "fields": ["impressions", "swipes", "spend"],
  "reportDimension": "age,gender",
  "datePreset": "LAST_30_DAYS",
  "granularity": "TOTAL",
  "dimensionType": "${dimensionType}"
})
\`\`\`

| Category | \`reportDimension\` | Metrics |
|----------|-------------------|---------|
| Geo | \`country\`, \`country,os\` | delivery + conversion |
| Geo | \`region\`, \`dma\` | delivery only |
| Demographic | \`gender\`, \`age\`, \`age,gender\` | delivery + conversion |
| Device | \`os\`, \`os,country\` | delivery + conversion |
| Device | \`make\` | delivery only |
| Interest | \`lifestyle_category\` | delivery only |

One dimension per request, except age with gender. \`HOUR\` granularity cannot be combined with a dimension. region, dma, make and lifestyle_category return delivery metrics only (no conversion metrics).

## Step 4: Video engagement

\`\`\`json
snapchat_get_report({
  "adAccountId": "${adAccountId}",
  "fields": ["impressions", "video_views", "quartile_1", "quartile_2", "quartile_3", "view_completion"],
  "datePreset": "LAST_7_DAYS",
  "granularity": "TOTAL",
  "dimensionType": "AD"
})
\`\`\`

## Common metric fields

| Field | Description |
|-------|-------------|
| \`impressions\` | Paid impressions |
| \`swipes\` | Swipe-ups (Snapchat's click) |
| \`spend\` | Spend in **micro-currency** (1,000,000 = 1.00 of the account currency) |
| \`video_views\` | Video views (2s of watch time or a swipe up) |
| \`quartile_1\` / \`quartile_2\` / \`quartile_3\` | Video views to 25% / 50% / 75% |
| \`view_completion\` | Video views to completion |
| \`conversion_purchases\` | Purchase conversions |

## Tips

- Metrics are finalized 48 hours after the end of the day in the account's timezone
- Very large requests can time out: prefer \`snapchat_submit_report\` and poll with \`snapchat_check_report_status\`
- Fetch \`reporting-reference://snapchat\` for the full field list
- Fetch \`entity-hierarchy://snapchat/all\` for entity relationships
`;
}
