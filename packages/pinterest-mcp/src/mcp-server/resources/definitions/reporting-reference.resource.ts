// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Pinterest Reporting Reference Resource
 */
import type { Resource } from "../types.js";

let cachedContent: string | undefined;

function formatReportingReferenceMarkdown(): string {
  return `# Pinterest Ads Reporting Reference

Source: Pinterest Marketing API OpenAPI v5 (\`analytics/create_report\`, \`ReportingColumnAsync\`, \`BulkReportingJobStatus\`).

## Report Types

The tools take \`type\` and map it to Pinterest's report \`level\`:

| \`type\` | Pinterest \`level\` | With breakdowns |
|--------|-------------------|-----------------|
| \`CAMPAIGN\` (default) | \`CAMPAIGN\` | \`CAMPAIGN_TARGETING\` |
| \`AD_GROUP\` | \`AD_GROUP\` | \`AD_GROUP_TARGETING\` |
| \`AD\` | \`PIN_PROMOTION\` | \`PIN_PROMOTION_TARGETING\` |
| \`KEYWORD\` | \`KEYWORD\` | Not supported |
| \`ACCOUNT\` | \`ADVERTISER\` | \`ADVERTISER_TARGETING\` |

\`granularity\`: \`DAY\` (default), \`TOTAL\`, \`HOUR\`, \`WEEK\`, \`MONTH\`.

## Async Reporting Flow

1. **Submit**: \`POST /v5/ad_accounts/{ad_account_id}/reports\` returns a \`token\`
2. **Poll**: \`GET /v5/ad_accounts/{ad_account_id}/reports?token={token}\` returns \`report_status\`
3. **Download**: fetch the returned \`url\` once \`report_status\` is \`FINISHED\`

\`report_status\` values: \`IN_PROGRESS\`, \`FINISHED\`, \`FAILED\`, \`EXPIRED\`, \`CANCELLED\`, \`DOES_NOT_EXIST\`.

\`pinterest_get_report\` and \`pinterest_get_report_breakdowns\` run the whole flow. \`pinterest_submit_report\`, \`pinterest_check_report_status\` and \`pinterest_download_report\` run one step each.

## Date-range limits

| Granularity | Data available | Max range per report |
|-------------|----------------|----------------------|
| \`DAY\`, \`WEEK\`, \`MONTH\`, \`TOTAL\` | 914 days back | 186 days |
| \`HOUR\` | 8 days back | 3 days |

## Columns

There are no separate dimensions and metrics. Everything is a \`columns\` value from Pinterest's \`ReportingColumnAsync\` enum (over 600 values). Unknown names are rejected by Pinterest, not by the tool.

### IDs and names
| Column | Description |
|--------|-------------|
| \`AD_ACCOUNT_ID\` | Ad account ID |
| \`CAMPAIGN_ID\`, \`CAMPAIGN_NAME\` | Campaign |
| \`AD_GROUP_ID\`, \`AD_GROUP_NAME\` | Ad group |
| \`PIN_PROMOTION_ID\`, \`PIN_PROMOTION_NAME\` | Ad (a pin promotion) |
| \`PIN_ID\` | Promoted Pin |

### Delivery and cost
| Column | Description |
|--------|-------------|
| \`IMPRESSION_1\`, \`TOTAL_IMPRESSION\` | Impressions |
| \`CLICKTHROUGH_1\`, \`TOTAL_CLICKTHROUGH\` | Clicks |
| \`CTR\` | Click-through rate |
| \`SPEND_IN_DOLLAR\` | Spend |
| \`SPEND_IN_MICRO_DOLLAR\` | Spend in micros |
| \`CPM_IN_DOLLAR\` | Cost per thousand impressions |
| \`ECPC_IN_DOLLAR\` | Effective cost per click |

### Video
| Column | Description |
|--------|-------------|
| \`VIDEO_MRC_VIEWS_1\` | MRC video views |
| \`VIDEO_3SEC_VIEWS_1\` | 3-second video views |
| \`VIDEO_P25_COMBINED_1\`, \`VIDEO_P50_COMBINED_1\`, \`VIDEO_P75_COMBINED_1\`, \`VIDEO_P95_COMBINED_1\` | Quartile views |
| \`VIDEO_P100_COMPLETE_1\` | Completed views |

### Conversions
| Column | Description |
|--------|-------------|
| \`TOTAL_CONVERSIONS\` | Conversions |
| \`TOTAL_CHECKOUT\` | Checkouts |
| \`TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR\` | Checkout value in micros |

## Breakdowns (\`targeting_types\`)

\`pinterest_get_report_breakdowns\` accepts up to 5 of: \`KEYWORD\`, \`APPTYPE\`, \`GENDER\`, \`LOCATION\`, \`PLACEMENT\`, \`COUNTRY\`, \`TARGETED_INTEREST\`, \`PINNER_INTEREST\`, \`AUDIENCE_INCLUDE\`, \`GEO\`, \`AGE_BUCKET\`, \`REGION\`, \`MEDIA_TYPE\`, \`AGE_BUCKET_AND_GENDER\`, \`AUDIENCE_MULTIPLIER\`, \`CREATIVE_ENHANCEMENTS\`, \`LOCAL_ADS_STORE_CODE\`.

## Example Report Configurations

### Campaign daily delivery (\`pinterest_get_report\`)
\`\`\`json
{
  "adAccountId": "1234567890",
  "type": "CAMPAIGN",
  "columns": ["CAMPAIGN_ID", "IMPRESSION_1", "CLICKTHROUGH_1", "CTR", "SPEND_IN_DOLLAR"],
  "granularity": "DAY",
  "startDate": "2026-03-01",
  "endDate": "2026-03-07"
}
\`\`\`

### Ad video performance (\`pinterest_get_report\`)
\`\`\`json
{
  "adAccountId": "1234567890",
  "type": "AD",
  "columns": ["PIN_PROMOTION_ID", "IMPRESSION_1", "SPEND_IN_DOLLAR", "VIDEO_MRC_VIEWS_1", "VIDEO_P100_COMPLETE_1"],
  "granularity": "TOTAL",
  "startDate": "2026-03-01",
  "endDate": "2026-03-07"
}
\`\`\`

### Country breakdown (\`pinterest_get_report_breakdowns\`)
\`\`\`json
{
  "adAccountId": "1234567890",
  "type": "CAMPAIGN",
  "columns": ["CAMPAIGN_ID", "IMPRESSION_1", "CLICKTHROUGH_1", "SPEND_IN_DOLLAR", "TOTAL_CONVERSIONS"],
  "breakdowns": ["COUNTRY"],
  "startDate": "2026-03-01",
  "endDate": "2026-03-07"
}
\`\`\`
`;
}

export const reportingReferenceResource: Resource = {
  uri: "reporting-reference://pinterest",
  name: "Pinterest Reporting Reference",
  description:
    "Report types, columns, breakdowns, date-range limits and example configurations for Pinterest Ads reporting",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatReportingReferenceMarkdown();
    return cachedContent;
  },
};
