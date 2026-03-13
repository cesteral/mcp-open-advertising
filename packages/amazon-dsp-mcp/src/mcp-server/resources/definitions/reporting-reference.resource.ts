/**
 * Amazon DSP Reporting Reference Resource
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatReportingReferenceMarkdown(): string {
  return `# Amazon DSP Reporting Reference

## Report Types

| Report Type | Description |
|-------------|-------------|
| CAMPAIGN | Order-level delivery and performance metrics |
| LINE_ITEM | Line item-level metrics breakdown |
| CREATIVE | Creative-level engagement and delivery metrics |

## Async Reporting Flow

Amazon DSP reporting is **async**:

1. **Submit**: POST report request → get \`reportId\`
2. **Poll**: GET \`/dsp/reports/{reportId}\` → check \`status\`
3. **Download**: GET the \`location\` URL when status = "SUCCESS"

Status values: PENDING → IN_PROGRESS → SUCCESS | FAILURE

Use \`amazon_dsp_get_report\` or \`amazon_dsp_get_report_breakdowns\` — these tools handle the full flow automatically.

## Common Dimensions

### Entity Dimensions
| Dimension | Description |
|-----------|-------------|
| \`advertiserId\` | Advertiser ID |
| \`orderId\` | Order ID |
| \`lineItemId\` | Line Item ID |
| \`creativeId\` | Creative ID |
| \`date\` | Daily breakdown (YYYY-MM-DD) |

## Common Metrics

### Delivery Metrics
| Metric | Description |
|--------|-------------|
| \`impressions\` | Total impressions served |
| \`clickThroughs\` | Total clicks on ads |
| \`totalCost\` | Total amount spent (USD) |

### Viewability Metrics
| Metric | Description |
|--------|-------------|
| \`viewableImpressions\` | Impressions meeting viewability standards |
| \`measurableImpressions\` | Impressions eligible for viewability measurement |

### Video Metrics
| Metric | Description |
|--------|-------------|
| \`videoCompletions\` | 100% video completions |
| \`videoFirstQuartile\` | 25% video completion count |
| \`videoMidpoint\` | 50% video completion count |
| \`videoThirdQuartile\` | 75% video completion count |

### Amazon Shopping Performance Metrics
| Metric | Description |
|--------|-------------|
| \`detailPageViews\` | Amazon product detail page views (DPVR) |
| \`brandedSearches\` | Branded keyword searches attributable to ads |
| \`newToBrandPurchases\` | Purchases from customers new to the brand |
| \`purchases\` | Total purchase events |
| \`sales14d\` | Total sales within 14-day attribution window (USD) |

## Example Report Configurations

### Order Daily Delivery Report
\`\`\`json
{
  "advertiserId": "1234567890",
  "reportType": "CAMPAIGN",
  "dimensions": ["orderId", "date"],
  "metrics": ["impressions", "clickThroughs", "totalCost"],
  "startDate": "2026-03-01",
  "endDate": "2026-03-07"
}
\`\`\`

### Line Item Performance with Video Metrics
\`\`\`json
{
  "advertiserId": "1234567890",
  "reportType": "LINE_ITEM",
  "dimensions": ["lineItemId"],
  "metrics": [
    "impressions", "totalCost", "videoCompletions",
    "videoFirstQuartile", "videoMidpoint", "videoThirdQuartile"
  ],
  "startDate": "2026-03-01",
  "endDate": "2026-03-07"
}
\`\`\`

### Creative Shopping Attribution Report
\`\`\`json
{
  "advertiserId": "1234567890",
  "reportType": "CREATIVE",
  "dimensions": ["creativeId", "date"],
  "metrics": [
    "impressions", "clickThroughs", "totalCost",
    "detailPageViews", "purchases", "sales14d", "newToBrandPurchases"
  ],
  "startDate": "2026-03-01",
  "endDate": "2026-03-07"
}
\`\`\`

### Branded Search Impact Report
\`\`\`json
{
  "advertiserId": "1234567890",
  "reportType": "LINE_ITEM",
  "dimensions": ["lineItemId", "date"],
  "metrics": ["impressions", "totalCost", "brandedSearches", "detailPageViews"],
  "startDate": "2026-03-01",
  "endDate": "2026-03-07"
}
\`\`\`
`;
}

export const reportingReferenceResource: Resource = {
  uri: "reporting-reference://amazonDsp",
  name: "Amazon DSP Reporting Reference",
  description: "Available dimensions, metrics, report types, and example configurations for Amazon DSP reporting",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatReportingReferenceMarkdown();
    return cachedContent;
  },
};
