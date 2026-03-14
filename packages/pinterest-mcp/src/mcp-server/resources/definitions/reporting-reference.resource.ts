/**
 * Pinterest Reporting Reference Resource
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatReportingReferenceMarkdown(): string {
  return `# Pinterest Ads Reporting Reference

## Report Types

| Report Type | Description |
|-------------|-------------|
| BASIC | Standard delivery and performance metrics |
| AUDIENCE | Audience breakdown metrics (requires audience dimensions) |
| PLAYABLE_MATERIAL | Playable ad performance metrics |

## Async Reporting Flow

1. **Submit**: POST \`/v5/ad_accounts/{ad_account_id}/reports\` → get \`token\`
2. **Poll**: GET \`/v5/ad_accounts/{ad_account_id}/reports/{token}\` → check \`status\`
3. **Download**: GET the \`download_url\` when status = "FINISHED"

Status values: FINISHED | FAILED

Use \`pinterest_get_report\` or \`pinterest_get_report_breakdowns\` — these tools handle the full flow automatically.

## Common Dimensions

### Time Dimensions
| Dimension | Description |
|-----------|-------------|
| stat_time_day | Daily breakdown (YYYY-MM-DD) |
| stat_time_hour | Hourly breakdown |

### Entity Dimensions
| Dimension | Description |
|-----------|-------------|
| ad_account_id | Advertiser ID |
| campaign_id | Campaign ID |
| adgroup_id | Ad group ID |
| ad_id | Ad ID |

### Audience Dimensions (AUDIENCE report type)
| Dimension | Description |
|-----------|-------------|
| gender | User gender breakdown |
| age | User age group breakdown |
| country_code | Country (ISO 2-letter code) |
| province_id | Province/region ID |
| platform | Operating system platform |
| device_brand_id | Device brand |
| interest_category | Interest category |
| placement | Ad placement |
| language | User language |

## Common Metrics

### Delivery Metrics
| Metric | Description |
|--------|-------------|
| impressions | Total impressions |
| reach | Unique users reached |
| frequency | Average impressions per user |
| clicks | Total clicks |
| ctr | Click-through rate (%) |
| cpm | Cost per mille (per 1000 impressions) |
| cpc | Cost per click |
| spend | Total amount spent |

### Video Metrics
| Metric | Description |
|--------|-------------|
| video_play_actions | Total video plays |
| video_watched_2s | 2-second video views |
| video_watched_6s | 6-second video views |
| video_views_p25 | 25% video completion |
| video_views_p50 | 50% video completion |
| video_views_p75 | 75% video completion |
| video_views_p100 | 100% completion (full views) |
| average_video_play | Average play duration (seconds) |

### Conversion Metrics
| Metric | Description |
|--------|-------------|
| conversions | Total conversion events |
| conversion_rate | Conversions / clicks (%) |
| cost_per_conversion | Spend / conversions |
| real_time_conversions | Real-time tracked conversions |
| total_purchase_value | Total purchase value |
| total_sales | Total sales count |
| cost_per_1000_reached | CPM by unique reach |

### Engagement Metrics
| Metric | Description |
|--------|-------------|
| profile_visits | Profile page visits |
| follows | New followers gained |
| likes | Likes on ads |
| comments | Comments on ads |
| shares | Shares of ads |
| engaged_view | Engaged views (6s+ or interaction) |

## Example Report Configurations

### Campaign Daily Delivery Report
\`\`\`json
{
  "adAccountId": "1234567890",
  "reportType": "BASIC",
  "dimensions": ["campaign_id", "stat_time_day"],
  "metrics": ["impressions", "clicks", "spend", "ctr", "cpc"],
  "startDate": "2026-03-01",
  "endDate": "2026-03-07"
}
\`\`\`

### Ad Performance with Video Metrics
\`\`\`json
{
  "adAccountId": "1234567890",
  "reportType": "BASIC",
  "dimensions": ["ad_id"],
  "metrics": ["impressions", "spend", "video_play_actions", "video_views_p100", "average_video_play"],
  "startDate": "2026-03-01",
  "endDate": "2026-03-07"
}
\`\`\`

### Country Breakdown Report
\`\`\`json
{
  "adAccountId": "1234567890",
  "dimensions": ["campaign_id", "stat_time_day"],
  "breakdowns": ["country_code"],
  "metrics": ["impressions", "clicks", "spend", "conversions"],
  "startDate": "2026-03-01",
  "endDate": "2026-03-07"
}
\`\`\`
`;
}

export const reportingReferenceResource: Resource = {
  uri: "reporting-reference://pinterest",
  name: "Pinterest Reporting Reference",
  description: "Available dimensions, metrics, report types, and example configurations for Pinterest Ads reporting",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatReportingReferenceMarkdown();
    return cachedContent;
  },
};
