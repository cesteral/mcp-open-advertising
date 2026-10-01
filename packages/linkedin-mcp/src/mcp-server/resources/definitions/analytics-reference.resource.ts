// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * LinkedIn Analytics Reference Resource
 * Available metrics, pivots, date formats
 */
import type { Resource } from "../types.js";
import {
  ANALYTICS_MAX_ELEMENTS,
  ANALYTICS_MAX_FIELDS,
} from "../../../services/linkedin/analytics-fields.js";

let cachedContent: string | undefined;

function formatAnalyticsReferenceMarkdown(): string {
  return `# LinkedIn Ads Analytics Reference

## Endpoint
\`GET /rest/adAnalytics\`

## Required Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| q | Finder. \`analytics\` takes one pivot (this server's choice) | \`analytics\` |
| pivot | Dimension to aggregate by | \`CAMPAIGN\` |
| timeGranularity | Time bucket size | \`DAILY\` |
| accounts | Ad account URNs, as a Rest.li 2.0 list | \`List(urn%3Ali%3AsponsoredAccount%3A123)\` |
| dateRange | Start/end dates, as a Rest.li 2.0 record | \`(start:(year:2026,month:1,day:1),end:(year:2026,month:3,day:31))\` |
| fields | Comma-separated metrics, at most ${ANALYTICS_MAX_FIELDS} | \`impressions,clicks,costInUsd,dateRange,pivotValues\` |

## Fields

LinkedIn returns only \`impressions\` and \`clicks\` unless \`fields\` names metrics, and allows at most ${ANALYTICS_MAX_FIELDS}. \`dateRange\` and \`pivotValues\` are themselves fields: without them a row does not say which date or pivot value it belongs to, so this server always adds them, and they count toward the limit (pass at most ${ANALYTICS_MAX_FIELDS - 2} metrics).

**These are not fields:** \`conversions\`, \`reach\`, \`frequency\`, \`videoStarted\`, \`clickThroughRate\`, \`costPerConversion\`, \`averageDailyReach\`. The tools refuse them with the field to use instead. Compute CTR, CPC, CPM, CPA and ROAS client-side (\`includeComputedMetrics\`).

## Available Metrics

### Volume Metrics
| Metric | Description |
|--------|-------------|
| impressions | Total ad impressions |
| clicks | Total clicks |
| costInUsd | Spend in USD |
| costInLocalCurrency | Spend in the account's currency |
| approximateMemberReach | Approximate unique members reached. Non-demographic pivots only, and date ranges of 92 days or less |
| landingPageClicks | Clicks to the landing page |

### Engagement Metrics
| Metric | Description |
|--------|-------------|
| likes | Post likes |
| comments | Post comments |
| shares | Post shares |
| follows | New followers |
| totalEngagements | All engagements |
| companyPageClicks | Clicks to the company page |
| viralImpressions | Viral (unpaid) impressions |
| viralClicks | Viral clicks |

### Video Metrics
| Metric | Description |
|--------|-------------|
| videoViews | Video views |
| videoStarts | Video play starts |
| videoCompletions | Videos watched to completion |
| videoFirstQuartileCompletions | 25% completion |
| videoMidpointCompletions | 50% completion |
| videoThirdQuartileCompletions | 75% completion |

### Conversion Metrics
| Metric | Description |
|--------|-------------|
| externalWebsiteConversions | Website conversion events |
| externalWebsitePostClickConversions | Website conversions after a click |
| externalWebsitePostViewConversions | Website conversions after a view |
| conversionValueInLocalCurrency | Conversion value in the account's currency. Not available with MEMBER_* pivots |
| leadGenerationMailContactInfoShares | Lead Gen Form submits |
| oneClickLeads | One-click lead conversions |

## Available Pivots

| Pivot | Description |
|-------|-------------|
| CAMPAIGN | Per campaign |
| CAMPAIGN_GROUP | Per campaign group |
| CREATIVE | Per creative |
| ACCOUNT | Per ad account |
| SHARE | Per share (post) |
| COMPANY | Per advertiser company |
| CONVERSION | Per conversion rule |
| SERVING_LOCATION | By serving location |
| PLACEMENT_NAME | By ad placement (feed, right rail, etc.) |
| IMPRESSION_DEVICE_TYPE | By device type |
| MEMBER_COMPANY_SIZE | By company size segment |
| MEMBER_INDUSTRY | By industry segment |
| MEMBER_SENIORITY | By seniority level |
| MEMBER_JOB_TITLE | By job title |
| MEMBER_JOB_FUNCTION | By job function |
| MEMBER_COUNTRY_V2 | By country |
| MEMBER_REGION_V2 | By region |
| MEMBER_COUNTY | By county |
| MEMBER_COMPANY | By company |

Also valid: CONVERSATION_NODE, CONVERSATION_NODE_OPTION_INDEX, CARD_INDEX, EVENT_STAGE. The geo pivots are the \`_V2\` ones; \`MEMBER_COUNTRY\` and \`MEMBER_REGION\` are not accepted. \`MEMBER_DESIGNATED_MARKET_AREA\` needs API version 202609 and is not available at the pinned 202608.

Demographic (\`MEMBER_*\`) pivots return only the top 100 values per creative per day, drop values with fewer than 3 events, and exclude conversionValueInLocalCurrency and approximateMemberReach. Demographic metrics can lag 12 to 24 hours.

## Time Granularity Values

| Value | Description |
|-------|-------------|
| DAILY | One row per day |
| MONTHLY | One row per month |
| YEARLY | One row per year |
| ALL | Aggregate entire date range. A range reaching outside the 6-month daily-retention window is rounded to whole months |

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
  fields=impressions,clicks,costInUsd,dateRange,pivotValues
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
    "count": 10,
    "links": [],
    "start": 0
  }
}
\`\`\`

The endpoint is **not paginated**: \`paging\` carries no \`total\` and no next link, and a response is limited to ${ANALYTICS_MAX_ELEMENTS.toLocaleString("en-US")} elements. A result that size has probably been cut off, so narrow the date range or use a coarser pivot or \`timeGranularity\`; the tools add a warning when it happens. LinkedIn also throttles adAnalytics by data volume (45 million metric values per 5 minutes, then HTTP 429).
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
