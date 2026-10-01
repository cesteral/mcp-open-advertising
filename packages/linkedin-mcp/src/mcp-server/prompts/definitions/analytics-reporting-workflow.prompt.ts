// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const linkedInAnalyticsReportingWorkflowPrompt: Prompt = {
  name: "linkedin_analytics_reporting_workflow",
  description:
    "Guide for querying LinkedIn Ads analytics with pivots, time granularities, and breakdowns",
  arguments: [
    {
      name: "adAccountUrn",
      description: "LinkedIn Ad Account URN (e.g., urn:li:sponsoredAccount:123)",
      required: true,
    },
    {
      name: "pivot",
      description:
        "Reporting pivot: CAMPAIGN, CAMPAIGN_GROUP, CREATIVE, CONVERSION (default: CAMPAIGN)",
      required: false,
    },
  ],
};

export function getLinkedInAnalyticsReportingWorkflowMessage(
  args?: Record<string, string>
): string {
  const adAccountUrn = args?.adAccountUrn || "{adAccountUrn}";
  const pivot = args?.pivot || "CAMPAIGN";

  return `# LinkedIn Analytics Reporting Workflow

Ad Account: \`${adAccountUrn}\`
Pivot: \`${pivot}\`

---

## Step 1: Basic Performance Query

\`\`\`json
linkedin_get_analytics({
  "adAccountUrn": "${adAccountUrn}",
  "startDate": "2026-02-01",
  "endDate": "2026-03-07",
  "metrics": ["impressions", "clicks", "costInUsd", "externalWebsiteConversions"],
  "includeComputedMetrics": true,
  "pivot": "${pivot}",
  "timeGranularity": "ALL"
})
\`\`\`

## Step 2: Daily Trend Analysis

\`\`\`json
linkedin_get_analytics({
  "adAccountUrn": "${adAccountUrn}",
  "startDate": "2026-02-01",
  "endDate": "2026-03-07",
  "metrics": ["impressions", "clicks", "costInUsd"],
  "pivot": "${pivot}",
  "timeGranularity": "DAILY"
})
\`\`\`

## Step 3: Add Breakdowns

\`\`\`json
linkedin_get_analytics_breakdowns({
  "adAccountUrn": "${adAccountUrn}",
  "startDate": "2026-02-01",
  "endDate": "2026-03-07",
  "pivots": ["MEMBER_COMPANY_SIZE", "MEMBER_SENIORITY"]
})
\`\`\`

## Step 4: Conversion Performance

\`\`\`json
linkedin_get_analytics({
  "adAccountUrn": "${adAccountUrn}",
  "startDate": "2026-02-01",
  "endDate": "2026-03-07",
  "metrics": ["externalWebsiteConversions", "oneClickLeads", "conversionValueInLocalCurrency"],
  "includeComputedMetrics": true,
  "pivot": "${pivot}",
  "timeGranularity": "MONTHLY"
})
\`\`\`

## Resource References

- Fetch \`analytics-reference://linkedin\` for full metrics and pivot list
- Fetch \`entity-hierarchy://linkedin/all\` for entity relationships

## Available Pivots

| Pivot | Description |
|-------|-------------|
| \`CAMPAIGN\` | Per campaign |
| \`CAMPAIGN_GROUP\` | Per campaign group |
| \`CREATIVE\` | Per creative |
| \`CONVERSION\` | Per conversion rule |
| \`MEMBER_COMPANY_SIZE\` | By company size |
| \`MEMBER_SENIORITY\` | By seniority level |
| \`MEMBER_INDUSTRY\` | By industry |
| \`MEMBER_COUNTRY_V2\` | By country |
| \`MEMBER_REGION_V2\` | By region |

## Available Time Granularities

\`ALL\` (totals), \`DAILY\`, \`MONTHLY\`, \`YEARLY\`

## Tips

- Performance metrics (account, campaign, creative) are near real-time. Demographic (\`MEMBER_*\`) metrics can lag **12 to 24 hours**, and \`videoWatchTime\` up to **48 hours**
- Performance data is retained for 10 years, demographic data for 2 years
- LinkedIn returns at most **15,000 rows** and does not paginate: narrow the range or pivot if you get a warning
- Use \`timeGranularity: "DAILY"\` for trend analysis
- Use \`linkedin_get_analytics_breakdowns\` to compare several single-dimension pivots in one call (results are not cross-tabulated)
- \`costInUsd\` is always in USD regardless of account currency; \`costInLocalCurrency\` is in the account's currency
- LinkedIn has no CTR, CPC, CPA or frequency field: set \`includeComputedMetrics\` to compute them
`;
}
