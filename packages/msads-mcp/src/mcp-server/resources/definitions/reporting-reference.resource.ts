import type { Resource } from "../types.js";

export const reportingReferenceResource: Resource = {
  uri: "msads://reporting-reference",
  name: "Microsoft Ads Reporting Reference",
  description: "Report types, columns, and async reporting flow for Microsoft Advertising",
  mimeType: "text/markdown",
  getContent: () => `# Microsoft Ads Reporting Reference

## Async Reporting Flow

1. **Submit**: POST \`/Reports/Submit\` → returns \`ReportRequestId\`
2. **Poll**: POST \`/Reports/Poll\` → returns \`Status\` + \`ReportDownloadUrl\`
3. **Download**: GET download URL → CSV/TSV data

Statuses: \`Pending\` → \`InProgress\` → \`Success\` | \`Error\`

## Report Types

| Report Type | Description |
|-------------|-------------|
| CampaignPerformanceReportRequest | Campaign-level metrics |
| AdGroupPerformanceReportRequest | Ad group-level metrics |
| AdPerformanceReportRequest | Ad-level metrics |
| KeywordPerformanceReportRequest | Keyword-level metrics |
| SearchQueryPerformanceReportRequest | Search term report |
| AudiencePerformanceReportRequest | Audience targeting metrics |
| GeographicPerformanceReportRequest | Geographic performance |
| ShareOfVoiceReportRequest | Impression share metrics |
| ProductDimensionPerformanceReportRequest | Shopping product data |
| DSAAutoTargetPerformanceReportRequest | Dynamic search ads targets |

## Common Columns

### Attributes
\`CampaignName\`, \`CampaignId\`, \`AdGroupName\`, \`AdGroupId\`, \`AdId\`, \`Keyword\`, \`TimePeriod\`

### Performance Metrics
\`Impressions\`, \`Clicks\`, \`Spend\`, \`Conversions\`, \`Revenue\`, \`CostPerConversion\`

### Rate Metrics
\`Ctr\`, \`AverageCpc\`, \`AverageCpm\`, \`ConversionRate\`

### Competitive Metrics
\`ImpressionSharePercent\`, \`ClickSharePercent\`, \`AbsoluteTopImpressionSharePercent\`

### Quality
\`QualityScore\`, \`ExpectedCtr\`, \`AdRelevance\`, \`LandingPageExperience\`

## Aggregation Options
\`Daily\`, \`Weekly\`, \`Monthly\`, \`Hourly\`, \`DayOfWeek\`, \`HourOfDay\`, \`Summary\`

## Example Tool Call
\`\`\`json
{
  "reportType": "CampaignPerformanceReportRequest",
  "accountId": "123456789",
  "columns": ["CampaignName", "Impressions", "Clicks", "Spend", "Conversions"],
  "startDate": "2026-01-01",
  "endDate": "2026-01-31",
  "aggregation": "Daily"
}
\`\`\`
`,
};
