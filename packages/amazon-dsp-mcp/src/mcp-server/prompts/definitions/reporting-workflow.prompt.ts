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

export function getTiktokReportingWorkflowMessage(
  args?: Record<string, string>,
): string {
  const profileId = args?.profileId || "{profileId}";
  const reportLevel = args?.reportLevel || "AUCTION";

  return `# AmazonDsp Reporting Workflow

Advertiser: \`${profileId}\`
Report Level: \`${reportLevel}\`

---

## Overview

AmazonDsp reports are **async** — \`amazon_dsp_get_report\` submits the job, polls for completion, and returns the results when ready.

---

## Step 1: Basic Campaign Report

\`\`\`json
amazon_dsp_get_report({
  "profileId": "${profileId}",
  "dimensions": ["campaign_id", "stat_time_day"],
  "metrics": ["impressions", "clicks", "spend", "ctr", "cpc", "conversions", "cost_per_conversion"],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 2: Ad Group Level Report

\`\`\`json
amazon_dsp_get_report({
  "profileId": "${profileId}",
  "dimensions": ["adgroup_id", "stat_time_day"],
  "metrics": ["impressions", "clicks", "spend", "video_play_actions", "video_watched_2s", "video_watched_6s"],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 3: Breakdown Report

Add demographic and contextual breakdowns to your report:

\`\`\`json
amazon_dsp_get_report_breakdowns({
  "profileId": "${profileId}",
  "dimensions": ["campaign_id"],
  "breakdowns": ["gender", "age"],
  "metrics": ["impressions", "clicks", "spend", "conversions"],
  "startDate": "2026-02-01",
  "endDate": "2026-03-07"
})
\`\`\`

## Step 4: Video Engagement Report

\`\`\`json
amazon_dsp_get_report({
  "profileId": "${profileId}",
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

- Fetch \`reporting-reference://amazonDsp\` for full metrics and dimensions list
- Fetch \`entity-hierarchy://amazonDsp/all\` for entity relationships

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
