/**
 * TTD Report Reference Resource
 *
 * Documents available report dimensions, metrics, date ranges,
 * and common report combinations for the TTD MyReports API.
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatReportReferenceMarkdown(): string {
  return `# TTD Report Reference

## Overview

TTD reports are generated via the MyReports API. Reports are **asynchronous**: you create a report schedule, TTD executes it, and you retrieve results when ready.

Use the \`ttd_get_report\` tool to create and retrieve reports.

---

## Date Ranges

| Value | Description |
|-------|-------------|
| \`Yesterday\` | Previous day only |
| \`Last7Days\` | Last 7 days |
| \`Last14Days\` | Last 14 days |
| \`Last30Days\` | Last 30 days |
| \`MonthToDate\` | Current month to date |
| \`LastMonth\` | Previous full month |
| \`Custom\` | Custom date range (requires \`ReportStartDate\` and \`ReportEndDate\` in \`additionalConfig\`) |

---

## Common Dimensions

| Dimension | Description |
|-----------|-------------|
| \`AdvertiserId\` | Advertiser identifier |
| \`AdvertiserName\` | Advertiser display name |
| \`CampaignId\` | Campaign identifier |
| \`CampaignName\` | Campaign display name |
| \`AdGroupId\` | Ad group identifier |
| \`AdGroupName\` | Ad group display name |
| \`AdId\` | Ad identifier |
| \`AdName\` | Ad display name |
| \`CreativeId\` | Creative identifier |
| \`Date\` | Date (daily granularity) |
| \`Hour\` | Hour of day |
| \`Week\` | Week number |
| \`Month\` | Month |
| \`Country\` | Country |
| \`Region\` | Region/State |
| \`Metro\` | Metro/DMA |
| \`DeviceType\` | Device type (Desktop, Mobile, Tablet, CTV) |
| \`OS\` | Operating system |
| \`Browser\` | Browser |
| \`Environment\` | Web, App, CTV |
| \`SupplyVendor\` | Exchange/SSP |
| \`ChannelType\` | Display, Video, Audio, Native |
| \`FoldPosition\` | Above/Below fold |

---

## Common Metrics

### Delivery Metrics
| Metric | Description |
|--------|-------------|
| \`Impressions\` | Total impressions served |
| \`Clicks\` | Total clicks |
| \`TotalCost\` | Total advertiser spend (in advertiser currency) |
| \`PartnerCostInAdvertiserCurrency\` | Partner cost |
| \`AdvertiserCostInAdvertiserCurrency\` | Advertiser media cost |
| \`DataCost\` | Third-party data cost |

### Performance Metrics
| Metric | Description |
|--------|-------------|
| \`CTR\` | Click-through rate (Clicks / Impressions) |
| \`eCPM\` | Effective CPM |
| \`eCPC\` | Effective cost per click |
| \`eCPA\` | Effective cost per action |

### Video Metrics
| Metric | Description |
|--------|-------------|
| \`VideoStarted\` | Video starts |
| \`VideoFirstQuartile\` | 25% completion |
| \`VideoMidpoint\` | 50% completion |
| \`VideoThirdQuartile\` | 75% completion |
| \`VideoCompleted\` | 100% completion |
| \`VCR\` | Video completion rate |

### Conversion Metrics
| Metric | Description |
|--------|-------------|
| \`TotalConversions\` | All conversions |
| \`ClickConversions\` | Click-attributed conversions |
| \`ViewConversions\` | View-attributed conversions |
| \`ConversionRate\` | Conversion rate |

### Viewability Metrics
| Metric | Description |
|--------|-------------|
| \`MeasuredImpressions\` | Impressions measured for viewability |
| \`ViewableImpressions\` | Viewable impressions (MRC standard) |
| \`ViewableRate\` | Viewability rate |

---

## Common Report Combinations

### Campaign Performance Overview
\`\`\`json
{
  "reportName": "Campaign Performance",
  "dateRange": "Last7Days",
  "dimensions": ["CampaignId", "CampaignName"],
  "metrics": ["Impressions", "Clicks", "CTR", "TotalCost", "eCPM", "eCPC"],
  "advertiserIds": ["abc123"]
}
\`\`\`

### Daily Delivery Trend
\`\`\`json
{
  "reportName": "Daily Delivery",
  "dateRange": "Last30Days",
  "dimensions": ["Date", "CampaignId", "CampaignName"],
  "metrics": ["Impressions", "TotalCost"],
  "advertiserIds": ["abc123"]
}
\`\`\`

### Ad Group Bid Analysis
\`\`\`json
{
  "reportName": "Ad Group Bids",
  "dateRange": "Last7Days",
  "dimensions": ["AdGroupId", "AdGroupName"],
  "metrics": ["Impressions", "Clicks", "TotalCost", "eCPM", "eCPC", "CTR"],
  "advertiserIds": ["abc123"]
}
\`\`\`

### Device Performance Breakdown
\`\`\`json
{
  "reportName": "Device Performance",
  "dateRange": "Last14Days",
  "dimensions": ["DeviceType", "CampaignName"],
  "metrics": ["Impressions", "Clicks", "CTR", "TotalCost", "eCPM"],
  "advertiserIds": ["abc123"]
}
\`\`\`

### Video Campaign Completion Report
\`\`\`json
{
  "reportName": "Video Completion",
  "dateRange": "Last7Days",
  "dimensions": ["CampaignId", "CampaignName", "AdGroupName"],
  "metrics": ["VideoStarted", "VideoCompleted", "VCR", "TotalCost"],
  "advertiserIds": ["abc123"]
}
\`\`\`

### Geo Performance
\`\`\`json
{
  "reportName": "Geo Performance",
  "dateRange": "Last30Days",
  "dimensions": ["Country", "Region", "CampaignName"],
  "metrics": ["Impressions", "Clicks", "TotalCost", "CTR"],
  "advertiserIds": ["abc123"]
}
\`\`\`

---

## Tips

- Start with fewer dimensions; add granularity only if needed.
- Use \`advertiserIds\` filter to scope reports — unfiltered reports across all advertisers can be slow.
- \`Custom\` date range requires \`ReportStartDate\` and \`ReportEndDate\` in \`additionalConfig\` (format: \`YYYY-MM-DDTHH:mm:ss\`).
- Reports are async; the tool polls for completion but very large reports may time out.
`;
}

export const reportReferenceResource: Resource = {
  uri: "report-reference://all",
  name: "TTD Report Reference",
  description:
    "Available report dimensions, metrics, date ranges, and common report combinations for TTD MyReports API",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatReportReferenceMarkdown();
    return cachedContent;
  },
};
