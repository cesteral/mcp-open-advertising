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
\`GET /rest/adAnalytics\`

## Required Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| q | Query type | \`analytics\` |
| pivot | Dimension to aggregate by | \`CAMPAIGN\` |
| timeGranularity | Time bucket size | \`DAILY\` |
| accounts | Ad account URNs, as a Rest.li 2.0 list | \`List(urn%3Ali%3AsponsoredAccount%3A123)\` |
| dateRange | Start/end dates, as a Rest.li 2.0 record | \`(start:(year:2026,month:1,day:1),end:(year:2026,month:3,day:31))\` |
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

## Query Syntax (Rest.li 2.0)

Every request sends \`X-Restli-Protocol-Version: 2.0.0\`, so query parameters use
Rest.li 2.0 syntax: a list is \`List(a,b)\`, a record is \`(key:value,...)\`, and
URNs inside them are URL-encoded (\`:\` → \`%3A\`) while the structural
\`List(\`, \`(\`, \`:\` and \`,\` stay literal. The Rest.li 1.0 forms
\`accounts[0]=\` and \`dateRange.start.year=\` are a different wire format.
\`fields\` is the exception: a plain comma-separated list.

## Date Range Format

Dates are year/month/day integers inside a \`dateRange\` record:
\`\`\`
dateRange=(start:(year:2026,month:1,day:1),end:(year:2026,month:3,day:31))
\`\`\`

## Example: Get Daily Campaign Metrics

\`\`\`
GET /rest/adAnalytics?
  q=analytics&
  pivot=CAMPAIGN&
  timeGranularity=DAILY&
  accounts=List(urn%3Ali%3AsponsoredAccount%3A123456789)&
  dateRange=(start:(year:2026,month:1,day:1),end:(year:2026,month:3,day:31))&
  fields=impressions,clicks,costInUsd,conversions
\`\`\`
(Line breaks added for readability; the real query string has none.)

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
