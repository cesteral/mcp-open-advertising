/**
 * TTD Report Reference Resource
 *
 * Documents available report dimensions, metrics, date ranges,
 * and common report combinations for the TTD MyReports API.
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatReportReferenceMarkdown(): string {
  return `# TTD Report Reference (MyReports V3)

## Overview

TTD reports are generated via the MyReports V3 API which provides **188 dimensions** and **318 metrics**. Reports are **asynchronous**: you create a report schedule, TTD executes it, and you retrieve results when ready.

### Two-Step Workflow
1. \`ttd_get_report\` — create report schedule, poll for completion, get download URL
2. \`ttd_download_report\` — fetch and parse CSV from the download URL

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
| \`LastWeek\` | Previous full week |
| \`Last90Days\` | Last 90 days |
| \`QuarterToDate\` | Current quarter to date |
| \`LastQuarter\` | Previous full quarter |
| \`YearToDate\` | Year to date |
| \`Custom\` | Custom range (requires \`ReportStartDate\` and \`ReportEndDate\` in \`additionalConfig\`) |

---

## Dimensions (Key Selections from 188 Available)

### Entity Dimensions
| Dimension | Description |
|-----------|-------------|
| \`AdvertiserId\` | Advertiser identifier |
| \`AdvertiserName\` | Advertiser display name |
| \`AdvertiserCurrencyCode\` | Advertiser currency |
| \`CampaignId\` | Campaign identifier |
| \`CampaignName\` | Campaign display name |
| \`AdGroupId\` | Ad group identifier |
| \`AdGroupName\` | Ad group display name |
| \`AdGroupBaseBidCPM\` | Ad group base bid setting |
| \`AdGroupBudget\` | Ad group budget (currency) |
| \`AdGroupBudgetImpressions\` | Ad group budget (impressions) |
| \`AdGroupDailyCap\` | Daily spend cap |
| \`AdGroupDailyTarget\` | Daily spend target |
| \`AdId\` | Ad identifier |
| \`AdName\` | Ad display name |
| \`AdFormat\` | Ad format type |
| \`AdType\` | Ad type |
| \`CreativeId\` | Creative identifier |

### Time Dimensions
| Dimension | Description |
|-----------|-------------|
| \`Date\` | Date (daily granularity) |
| \`Hour\` | Hour of day |
| \`Week\` | Week number |
| \`Month\` | Month |
| \`DayOfWeek\` | Day of week |

### Geo Dimensions
| Dimension | Description |
|-----------|-------------|
| \`Country\` | Country |
| \`Region\` | Region/State |
| \`Metro\` | Metro/DMA |
| \`City\` | City |
| \`PostalCode\` | Postal code |

### Technology Dimensions
| Dimension | Description |
|-----------|-------------|
| \`DeviceType\` | Desktop, Mobile, Tablet, CTV |
| \`OS\` | Operating system |
| \`Browser\` | Browser |
| \`Environment\` | Web, App, CTV |
| \`ConnectionType\` | WiFi, Cellular, Wired |
| \`DeviceMake\` | Device manufacturer |

### Supply Dimensions
| Dimension | Description |
|-----------|-------------|
| \`SupplyVendor\` | Exchange/SSP |
| \`ChannelType\` | Display, Video, Audio, Native |
| \`FoldPosition\` | Above/Below fold |
| \`Site\` | Domain or app name |
| \`AppName\` | Mobile app name |
| \`DealId\` | PMP/PG deal identifier |
| \`ContractId\` | Contract identifier |

### Audience Dimensions
| Dimension | Description |
|-----------|-------------|
| \`AudienceId\` | Audience segment ID |
| \`AudienceName\` | Audience segment name |
| \`DataProvider\` | Third-party data provider |

---

## Metrics (Key Selections from 318 Available)

### Delivery Metrics
| Metric | Description |
|--------|-------------|
| \`Impressions\` | Total impressions served |
| \`Clicks\` | Total clicks |
| \`TotalCost\` | Total advertiser spend |
| \`MediaCost\` | Media cost only |
| \`PartnerCostInAdvertiserCurrency\` | Partner cost |
| \`AdvertiserCostInAdvertiserCurrency\` | Advertiser media cost |
| \`DataCost\` | Third-party data cost |
| \`UniqueReach\` | Unique users reached |
| \`AverageFrequency\` | Average impressions per user |

### Performance Metrics
| Metric | Description |
|--------|-------------|
| \`CTR\` | Click-through rate |
| \`eCPM\` | Effective CPM |
| \`eCPC\` | Effective cost per click |
| \`eCPA\` | Effective cost per action |
| \`CPUR\` | Cost per unique reach |

### Video Metrics
| Metric | Description |
|--------|-------------|
| \`VideoStarted\` | Video starts |
| \`VideoFirstQuartile\` | 25% completion |
| \`VideoMidpoint\` | 50% completion |
| \`VideoThirdQuartile\` | 75% completion |
| \`VideoCompleted\` | 100% completion |
| \`VCR\` | Video completion rate |
| \`CPCV\` | Cost per completed view |

### Conversion Metrics
| Metric | Description |
|--------|-------------|
| \`TotalConversions\` | All conversions |
| \`ClickConversions\` | Click-attributed conversions |
| \`ViewConversions\` | View-attributed conversions |
| \`ConversionRate\` | Conversion rate |
| \`ROAS\` | Return on ad spend |
| \`ConversionRevenue\` | Revenue from conversions |

### Viewability Metrics
| Metric | Description |
|--------|-------------|
| \`MeasuredImpressions\` | Impressions measured for viewability |
| \`ViewableImpressions\` | Viewable impressions (MRC standard) |
| \`ViewableRate\` | Viewability rate |
| \`AverageInViewTime\` | Average time in view (seconds) |

### CTV / Audio Metrics
| Metric | Description |
|--------|-------------|
| \`AudioCompletions\` | Audio ad completions |
| \`AudioCompletionRate\` | Audio completion rate |
| \`CTVImpressions\` | Connected TV impressions |

---

## Common Report Templates

### Campaign Performance Overview
\`\`\`json
{
  "reportName": "Campaign Performance",
  "dateRange": "Last7Days",
  "dimensions": ["CampaignId", "CampaignName"],
  "metrics": ["Impressions", "Clicks", "CTR", "TotalCost", "eCPM", "eCPC", "UniqueReach"],
  "advertiserIds": ["abc123"]
}
\`\`\`

### Daily Delivery Trend
\`\`\`json
{
  "reportName": "Daily Delivery",
  "dateRange": "Last30Days",
  "dimensions": ["Date", "CampaignId", "CampaignName"],
  "metrics": ["Impressions", "TotalCost", "UniqueReach"],
  "advertiserIds": ["abc123"]
}
\`\`\`

### Ad Group Bid Analysis
\`\`\`json
{
  "reportName": "Ad Group Bids",
  "dateRange": "Last7Days",
  "dimensions": ["AdGroupId", "AdGroupName", "AdGroupBaseBidCPM"],
  "metrics": ["Impressions", "Clicks", "TotalCost", "eCPM", "eCPC", "CTR"],
  "advertiserIds": ["abc123"]
}
\`\`\`

### Device Performance
\`\`\`json
{
  "reportName": "Device Performance",
  "dateRange": "Last14Days",
  "dimensions": ["DeviceType", "CampaignName"],
  "metrics": ["Impressions", "Clicks", "CTR", "TotalCost", "eCPM", "CPUR"],
  "advertiserIds": ["abc123"]
}
\`\`\`

### Video Campaign Completion Report
\`\`\`json
{
  "reportName": "Video Completion",
  "dateRange": "Last7Days",
  "dimensions": ["CampaignId", "CampaignName", "AdGroupName"],
  "metrics": ["VideoStarted", "VideoCompleted", "VCR", "CPCV", "TotalCost"],
  "advertiserIds": ["abc123"]
}
\`\`\`

### Geo Performance
\`\`\`json
{
  "reportName": "Geo Performance",
  "dateRange": "Last30Days",
  "dimensions": ["Country", "Region", "CampaignName"],
  "metrics": ["Impressions", "Clicks", "TotalCost", "CTR", "eCPM"],
  "advertiserIds": ["abc123"]
}
\`\`\`

### Conversion / ROAS Report
\`\`\`json
{
  "reportName": "Conversion Analysis",
  "dateRange": "Last30Days",
  "dimensions": ["CampaignId", "CampaignName", "AdGroupName"],
  "metrics": ["TotalConversions", "ClickConversions", "ViewConversions", "eCPA", "ROAS", "ConversionRevenue", "TotalCost"],
  "advertiserIds": ["abc123"]
}
\`\`\`

### Supply / Exchange Analysis
\`\`\`json
{
  "reportName": "Supply Analysis",
  "dateRange": "Last14Days",
  "dimensions": ["SupplyVendor", "ChannelType", "CampaignName"],
  "metrics": ["Impressions", "eCPM", "ViewableRate", "CTR"],
  "advertiserIds": ["abc123"]
}
\`\`\`

### Audience Segment Performance
\`\`\`json
{
  "reportName": "Audience Performance",
  "dateRange": "Last14Days",
  "dimensions": ["AudienceId", "AudienceName", "CampaignName"],
  "metrics": ["Impressions", "Clicks", "CTR", "TotalConversions", "eCPA"],
  "advertiserIds": ["abc123"]
}
\`\`\`

---

## Tips

- **Start small** — fewer dimensions = fewer rows = faster report.
- **Always filter** — use \`advertiserIds\` to scope reports.
- **Custom dates** — set \`ReportStartDate\` and \`ReportEndDate\` in \`additionalConfig\` (format: \`YYYY-MM-DDTHH:mm:ss\`).
- **Download & parse** — use \`ttd_download_report\` to fetch and parse the CSV into structured JSON.
- **Large reports** — may time out (5 min polling limit). Use shorter date ranges or fewer dimensions.
- **V3 upgrade** — this reference covers MyReports V3 with 188 dimensions and 318 metrics. V2 had only 52 dimensions.
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
