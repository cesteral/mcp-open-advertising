// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const pinterestReportingWorkflowPrompt: Prompt = {
  name: "pinterest_reporting_workflow",
  description:
    "Guide for submitting and retrieving Pinterest Ads async reports with dimensions, metrics, and breakdowns",
  arguments: [
    {
      name: "adAccountId",
      description: "Pinterest Advertiser ID",
      required: true,
    },
    {
      name: "reportLevel",
      description: "Report level: AUCTION, RESERVATION (default: AUCTION)",
      required: false,
    },
  ],
};

export function getPinterestReportingWorkflowMessage(args?: Record<string, string>): string {
  const adAccountId = args?.adAccountId || "{adAccountId}";
  const reportLevel = args?.reportLevel || "AUCTION";

  return `# Pinterest Reporting Workflow

Advertiser: \`${adAccountId}\`
Report Level: \`${reportLevel}\`

---

## Overview

Pinterest reports are **async** — \`pinterest_get_report\` submits the job, polls for completion, and returns the results when ready.

---

## Step 1: Basic Campaign Report

\`\`\`json
pinterest_get_report({
  "adAccountId": "${adAccountId}",
  "dimensions": ["campaign_id", "stat_time_day"],
  "metrics": ["impressions", "clicks", "spend", "ctr", "cpc", "conversions", "cost_per_conversion"],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 2: Ad Group Level Report

\`\`\`json
pinterest_get_report({
  "adAccountId": "${adAccountId}",
  "dimensions": ["adgroup_id", "stat_time_day"],
  "metrics": ["impressions", "clicks", "spend", "video_play_actions", "video_watched_2s", "video_watched_6s"],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 3: Breakdown Report

Add demographic and contextual breakdowns to your report:

\`\`\`json
pinterest_get_report_breakdowns({
  "adAccountId": "${adAccountId}",
  "dimensions": ["campaign_id"],
  "breakdowns": ["gender", "age"],
  "metrics": ["impressions", "clicks", "spend", "conversions"],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 4: Video Engagement Report

\`\`\`json
pinterest_get_report({
  "adAccountId": "${adAccountId}",
  "dimensions": ["ad_id"],
  "metrics": [
    "impressions", "video_play_actions", "video_watched_2s",
    "video_watched_6s", "video_views_p25", "video_views_p50",
    "video_views_p75", "video_views_p100"
  ],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Resource References

- Fetch \`reporting-reference://pinterest\` for full metrics and dimensions list
- Fetch \`entity-hierarchy://pinterest/all\` for entity relationships

## Common Dimensions

| Dimension | Level |
|-----------|-------|
| \`campaign_id\` | Campaign |
| \`adgroup_id\` | Ad Group |
| \`ad_id\` | Ad |
| \`stat_time_day\` | Daily breakdown |
| \`stat_time_hour\` | Hourly breakdown |

## Common Metrics

| Metric | Description |
|--------|-------------|
| \`impressions\` | Total impressions |
| \`clicks\` | Total clicks |
| \`spend\` | Total spend (account currency) |
| \`ctr\` | Click-through rate |
| \`cpc\` | Cost per click |
| \`conversions\` | Total conversions |
| \`cost_per_conversion\` | CPA |
| \`video_play_actions\` | Video starts |
| \`video_watched_2s\` | 2-second video views |
| \`video_watched_6s\` | 6-second video views |

## Tips

- Reports may take **30 seconds to several minutes** depending on date range and data volume
- Data has a **24-48 hour lag** for finalized metrics
- Max date range per report is **180 days**
- Budget and spend values are in **account currency** (not cents, not micros)
`;
}
