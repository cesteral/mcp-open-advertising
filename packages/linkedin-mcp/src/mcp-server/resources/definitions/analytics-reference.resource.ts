// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * LinkedIn Analytics Reference Resource
 * Available metrics, pivots, date formats
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatAnalyticsReferenceMarkdown(): string {
  return `# LinkedIn Ads Analytics Reference

## Endpoint
\`GET /v2/adAnalytics\`

## Required Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| q | Query type | \`analytics\` |
| pivot | Dimension to aggregate by | \`CAMPAIGN\` |
| timeGranularity | Time bucket size | \`DAILY\` |
| accounts[0] | Ad account URN | \`urn:li:sponsoredAccount:123\` |
| dateRange.start.year | Start year | \`2026\` |
| dateRange.start.month | Start month (1-12) | \`1\` |
| dateRange.start.day | Start day | \`1\` |
| dateRange.end.year | End year | \`2026\` |
| dateRange.end.month | End month (1-12) | \`3\` |
| dateRange.end.day | End day | \`31\` |
| fields | Comma-separated metrics | \`impressions,clicks,costInUsd\` |

## Available Metrics

### Volume Metrics
| Metric | Description |
|--------|-------------|
| impressions | Total ad impressions |
| clicks | Total clicks |
| costInUsd | Total spend in USD |
| reach | Unique users reached |
| frequency | Average impressions per user |

### Engagement Metrics
| Metric | Description |
|--------|-------------|
| likes | Post likes |
| comments | Post comments |
| shares | Post shares |
| follows | New followers |
| companyPageClicks | Clicks to company page |

### Video Metrics
| Metric | Description |
|--------|-------------|
| videoViews | Total video plays |
| videoCompletions | Videos watched to completion |
| videoFirstQuartileCompletions | 25% completion |
| videoMidpointCompletions | 50% completion |
| videoThirdQuartileCompletions | 75% completion |
| videoStarted | Video play starts |

### Conversion Metrics
| Metric | Description |
|--------|-------------|
| conversions | Total conversion events |
| externalWebsiteConversions | Website conversion events |
| leadGenerationMailContactInfoShares | Lead Gen Form submits |
| oneClickLeads | One-click lead conversions |
| costPerConversion | Average cost per conversion |

### Calculated Metrics
| Metric | Description |
|--------|-------------|
| clickThroughRate | CTR (clicks / impressions) |
| averageDailyReach | Average daily unique reach |
| viralImpressions | Viral (unpaid) impressions |
| viralClicks | Viral clicks |

## Available Pivots

| Pivot | Description |
|-------|-------------|
| CAMPAIGN | Per campaign aggregation |
| CAMPAIGN_GROUP | Per campaign group aggregation |
| CREATIVE | Per creative aggregation |
| CONVERSION | Per conversion rule aggregation |
| MEMBER_COMPANY_SIZE | By company size segment |
| MEMBER_INDUSTRY | By industry segment |
| MEMBER_SENIORITY | By seniority level |
| MEMBER_JOB_TITLE | By job title |
| MEMBER_JOB_FUNCTION | By job function |
| MEMBER_COUNTRY | By country |
| MEMBER_REGION | By region |
| MEMBER_COMPANY | By company |
| PLACEMENT_NAME | By ad placement (feed, right rail, etc.) |

## Time Granularity Values

| Value | Description |
|-------|-------------|
| DAILY | One row per day |
| MONTHLY | One row per month |
| YEARLY | One row per year |
| ALL | Aggregate entire date range |

## Date Range Format

Dates are specified as year/month/day integers:
\`\`\`
dateRange.start.year=2026
dateRange.start.month=1
dateRange.start.day=1
dateRange.end.year=2026
dateRange.end.month=3
dateRange.end.day=31
\`\`\`

## Example: Get Daily Campaign Metrics

\`\`\`
GET /v2/adAnalytics?
  q=analytics&
  pivot=CAMPAIGN&
  timeGranularity=DAILY&
  accounts[0]=urn:li:sponsoredAccount:123456789&
  dateRange.start.year=2026&
  dateRange.start.month=1&
  dateRange.start.day=1&
  dateRange.end.year=2026&
  dateRange.end.month=3&
  dateRange.end.day=31&
  fields=impressions,clicks,costInUsd,conversions
\`\`\`

## Response Shape

\`\`\`json
{
  "elements": [
    {
      "dateRange": {
        "start": { "year": 2026, "month": 1, "day": 1 },
        "end": { "year": 2026, "month": 1, "day": 1 }
      },
      "pivotValues": ["urn:li:sponsoredCampaign:111222333"],
      "impressions": 12500,
      "clicks": 342,
      "costInUsd": "45.67"
    }
  ],
  "paging": {
    "count": 100,
    "start": 0,
    "total": 450
  }
}
\`\`\`
`;
}

export const analyticsReferenceResource: Resource = {
  uri: "analytics-reference://linkedin",
  name: "LinkedIn Analytics Reference",
  description:
    "Available metrics, pivot dimensions, date formats, and examples for LinkedIn adAnalytics API",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatAnalyticsReferenceMarkdown();
    return cachedContent;
  },
};
