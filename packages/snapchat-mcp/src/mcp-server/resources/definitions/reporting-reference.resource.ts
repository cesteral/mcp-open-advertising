// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Snapchat Reporting Reference Resource
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatReportingReferenceMarkdown(): string {
  return `# Snapchat Ads Reporting Reference

Snapchat reporting is ad-account stats, requested asynchronously and returned as CSV.
There are no report "types" and no dimension list: you choose **metric fields**, a **time
granularity**, and optionally an **entity breakdown**.

## Async Reporting Flow

1. **Submit**: GET \`/v1/adaccounts/{ad_account_id}/stats?async=true&async_format=csv&fields=…&granularity=…&start_time=…&end_time=…[&breakdown=…]\`
   → \`async_stats_reports[0].async_stats_report.report_run_id\`
2. **Poll**: GET \`/v1/adaccounts/{ad_account_id}/stats_report?report_run_id={id}\` → \`async_status\`
3. **Download**: GET the \`result\` URL once the report is complete

Snapchat \`async_status\` is normalized by the tools to: PENDING → RUNNING (\`STARTED\`/\`RUNNING\`) → COMPLETE (\`COMPLETED\`) | FAILED.

- \`snapchat_get_report\` / \`snapchat_get_report_breakdowns\` run the whole flow and wait.
- \`snapchat_submit_report\` → \`snapchat_check_report_status\` → \`snapchat_download_report\` is the non-blocking path.

## Tool Parameters

| Parameter | Values | Sent to Snapchat as |
|-----------|--------|---------------------|
| \`fields\` | metric names (see below) | \`fields\` (comma-separated) |
| \`granularity\` | \`TOTAL\`, \`DAY\` (default), \`HOUR\`, \`LIFETIME\` | \`granularity\` |
| \`dimensionType\` | \`CAMPAIGN\`, \`AD_SQUAD\`, \`AD\` (omit for the account total) | \`breakdown\` = \`campaign\` / \`adsquad\` / \`ad\` |
| \`startTime\` / \`endTime\` | ISO 8601 timestamps | \`start_time\` / \`end_time\` |
| \`datePreset\` | e.g. \`LAST_7_DAYS\` (instead of start/end) | resolved to UTC-midnight \`start_time\` and \`…T23:59:59Z\` \`end_time\` |
| \`breakdowns\` (\`snapchat_get_report_breakdowns\` only) | extra names | **appended to \`fields\`** |

**Time boundaries (unverified):** Snapchat is reported to require \`DAY\`-granularity
\`start_time\`/\`end_time\` on day boundaries in the **ad account's timezone**. \`datePreset\`
produces UTC boundaries, which only line up for UTC accounts. For a non-UTC account, pass
explicit \`startTime\`/\`endTime\` with the account's offset (e.g. \`2026-03-01T00:00:00-08:00\`);
the account's \`timezone\` is returned by \`snapchat_list_ad_accounts\`.

**Demographic / geo splits (unverified):** \`snapchat_get_report_breakdowns\` sends its
\`breakdowns\` inside \`fields\`. Snapchat is reported to take demographic and geo splits through
a separate \`report_dimension\` parameter, which these tools do not send yet — if Snapchat
rejects a breakdown name as an unknown field, that is why.

## Metric Fields Used by These Tools

| Field | Description |
|-------|-------------|
| \`impressions\` | Impressions |
| \`swipes\` | Swipe-ups (Snapchat's click) |
| \`spend\` | Spend, in **micro-currency** (1,000,000 = 1.00 of the account currency) |
| \`video_views\` | Video views |
| \`conversion_purchases\` | Purchase conversions |
| \`conversion_purchases_value\` | Purchase value, in micro-currency |

With \`includeComputedMetrics: true\`, \`snapchat_get_report\` and
\`snapchat_get_report_breakdowns\` append \`computed_cpa\`, \`computed_roas\`, \`computed_cpm\`,
\`computed_ctr\` and \`computed_cpc\`, with \`spend\` and \`conversion_purchases_value\` converted
from micro-currency to account currency first. \`swipes\` is used as clicks.

## Example Report Configurations

### Campaign Daily Delivery Report
\`\`\`json
snapchat_get_report({
  "adAccountId": "1234567890",
  "fields": ["impressions", "swipes", "spend"],
  "granularity": "DAY",
  "dimensionType": "CAMPAIGN",
  "startTime": "2026-03-01T00:00:00Z",
  "endTime": "2026-03-08T00:00:00Z"
})
\`\`\`

### Ad Performance with Video and Purchases
\`\`\`json
snapchat_get_report({
  "adAccountId": "1234567890",
  "fields": ["impressions", "spend", "video_views", "conversion_purchases", "conversion_purchases_value"],
  "granularity": "TOTAL",
  "dimensionType": "AD",
  "datePreset": "LAST_7_DAYS",
  "includeComputedMetrics": true
})
\`\`\`

### Non-blocking Ad Squad Report
\`\`\`json
snapchat_submit_report({
  "adAccountId": "1234567890",
  "fields": ["impressions", "swipes", "spend"],
  "granularity": "DAY",
  "dimensionType": "AD_SQUAD",
  "datePreset": "LAST_30_DAYS"
})
\`\`\`
`;
}

export const reportingReferenceResource: Resource = {
  uri: "reporting-reference://snapchat",
  name: "Snapchat Reporting Reference",
  description:
    "Snapchat Ads reporting: async stats flow, tool parameters, metric fields and example configurations",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatReportingReferenceMarkdown();
    return cachedContent;
  },
};
