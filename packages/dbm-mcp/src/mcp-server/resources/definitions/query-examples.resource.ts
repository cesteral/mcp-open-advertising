/**
 * Query Examples MCP Resource
 *
 * Provides curated example queries for common Bid Manager API use cases.
 */

import type { Resource } from "../types.js";

/**
 * Example query configurations
 */
export const QUERY_EXAMPLES = {
  delivery: {
    name: "Campaign Delivery Report",
    description: "Basic delivery metrics (impressions, clicks, spend) for a campaign",
    querySpec: {
      metadata: {
        title: "Campaign Delivery Report",
        dataRange: {
          range: "LAST_7_DAYS",
        },
        format: "CSV",
      },
      params: {
        type: "STANDARD",
        groupBys: ["FILTER_DATE", "FILTER_CAMPAIGN"],
        metrics: [
          "METRIC_IMPRESSIONS",
          "METRIC_CLICKS",
          "METRIC_CTR",
          "METRIC_TOTAL_MEDIA_COST_ADVERTISER",
        ],
        filters: [
          { type: "FILTER_ADVERTISER", value: "{advertiserId}" },
          { type: "FILTER_CAMPAIGN", value: "{campaignId}" },
        ],
      },
    },
  },
  performance: {
    name: "Performance Analysis Report",
    description: "Full performance metrics including conversions and revenue",
    querySpec: {
      metadata: {
        title: "Performance Analysis Report",
        dataRange: {
          range: "CUSTOM_DATES",
          customStartDate: { year: 2025, month: 1, day: 1 },
          customEndDate: { year: 2025, month: 1, day: 31 },
        },
        format: "CSV",
      },
      params: {
        type: "STANDARD",
        groupBys: ["FILTER_DATE", "FILTER_CAMPAIGN"],
        metrics: [
          "METRIC_IMPRESSIONS",
          "METRIC_CLICKS",
          "METRIC_CTR",
          "METRIC_TOTAL_MEDIA_COST_ADVERTISER",
          "METRIC_TOTAL_CONVERSIONS",
          "METRIC_POST_CLICK_CONVERSIONS",
          "METRIC_POST_VIEW_CONVERSIONS",
          "METRIC_REVENUE_ADVERTISER",
          "METRIC_CPA_ADVERTISER",
        ],
        filters: [{ type: "FILTER_ADVERTISER", value: "{advertiserId}" }],
      },
    },
  },
  lineItemBreakdown: {
    name: "Line Item Breakdown Report",
    description: "Performance breakdown by line item within a campaign",
    querySpec: {
      metadata: {
        title: "Line Item Breakdown",
        dataRange: {
          range: "LAST_30_DAYS",
        },
        format: "CSV",
      },
      params: {
        type: "STANDARD",
        groupBys: ["FILTER_LINE_ITEM"],
        metrics: [
          "METRIC_IMPRESSIONS",
          "METRIC_CLICKS",
          "METRIC_CTR",
          "METRIC_TOTAL_MEDIA_COST_ADVERTISER",
          "METRIC_CPM_ADVERTISER",
        ],
        filters: [
          { type: "FILTER_ADVERTISER", value: "{advertiserId}" },
          { type: "FILTER_CAMPAIGN", value: "{campaignId}" },
        ],
      },
    },
  },
  deviceType: {
    name: "Device Type Report",
    description: "Performance breakdown by device type",
    querySpec: {
      metadata: {
        title: "Device Type Performance",
        dataRange: {
          range: "LAST_7_DAYS",
        },
        format: "CSV",
      },
      params: {
        type: "STANDARD",
        groupBys: ["FILTER_DEVICE_TYPE"],
        metrics: [
          "METRIC_IMPRESSIONS",
          "METRIC_CLICKS",
          "METRIC_CTR",
          "METRIC_TOTAL_MEDIA_COST_ADVERTISER",
          "METRIC_TOTAL_CONVERSIONS",
        ],
        filters: [
          { type: "FILTER_ADVERTISER", value: "{advertiserId}" },
          { type: "FILTER_CAMPAIGN", value: "{campaignId}" },
        ],
      },
    },
  },
  geographic: {
    name: "Geographic Report",
    description: "Performance breakdown by country and region",
    querySpec: {
      metadata: {
        title: "Geographic Performance",
        dataRange: {
          range: "LAST_30_DAYS",
        },
        format: "CSV",
      },
      params: {
        type: "STANDARD",
        groupBys: ["FILTER_COUNTRY"],
        metrics: [
          "METRIC_IMPRESSIONS",
          "METRIC_CLICKS",
          "METRIC_CTR",
          "METRIC_TOTAL_MEDIA_COST_ADVERTISER",
        ],
        filters: [{ type: "FILTER_ADVERTISER", value: "{advertiserId}" }],
      },
    },
  },
  viewability: {
    name: "Viewability Report",
    description: "Active View viewability metrics",
    querySpec: {
      metadata: {
        title: "Viewability Analysis",
        dataRange: {
          range: "LAST_7_DAYS",
        },
        format: "CSV",
      },
      params: {
        type: "STANDARD",
        groupBys: ["FILTER_DATE", "FILTER_CAMPAIGN"],
        metrics: [
          "METRIC_IMPRESSIONS",
          "METRIC_ACTIVE_VIEW_MEASURABLE_IMPRESSIONS",
          "METRIC_ACTIVE_VIEW_VIEWABLE_IMPRESSIONS",
          "METRIC_ACTIVE_VIEW_PCT_MEASURABLE_IMPRESSIONS",
          "METRIC_ACTIVE_VIEW_PCT_VIEWABLE_IMPRESSIONS",
        ],
        filters: [
          { type: "FILTER_ADVERTISER", value: "{advertiserId}" },
          { type: "FILTER_CAMPAIGN", value: "{campaignId}" },
        ],
      },
    },
  },
  video: {
    name: "Video Performance Report",
    description: "Video engagement metrics",
    querySpec: {
      metadata: {
        title: "Video Performance",
        dataRange: {
          range: "LAST_7_DAYS",
        },
        format: "CSV",
      },
      params: {
        type: "STANDARD",
        groupBys: ["FILTER_DATE", "FILTER_CREATIVE"],
        metrics: [
          "METRIC_IMPRESSIONS",
          "METRIC_VIDEO_PLAYS",
          "METRIC_VIDEO_FIRST_QUARTILE_COMPLETIONS",
          "METRIC_VIDEO_MIDPOINTS",
          "METRIC_VIDEO_THIRD_QUARTILE_COMPLETIONS",
          "METRIC_VIDEO_COMPLETIONS",
          "METRIC_VIDEO_COMPLETION_RATE",
          "METRIC_VIDEO_SKIPS",
        ],
        filters: [
          { type: "FILTER_ADVERTISER", value: "{advertiserId}" },
          { type: "FILTER_CAMPAIGN", value: "{campaignId}" },
        ],
      },
    },
  },
};

/**
 * Format query examples as markdown
 */
function formatQueryExamplesMarkdown(): string {
  let markdown = `# Bid Manager Query Examples

This resource provides curated example queries for common Bid Manager API use cases.

## How to Use These Examples

1. Replace placeholder values (e.g., \`{advertiserId}\`, \`{campaignId}\`) with actual IDs
2. Adjust the \`dataRange\` to your desired time period
3. Modify \`metrics\` and \`groupBys\` as needed

---

`;

  for (const [, example] of Object.entries(QUERY_EXAMPLES)) {
    markdown += `## ${example.name}\n\n`;
    markdown += `**Description:** ${example.description}\n\n`;
    markdown += "```json\n";
    markdown += JSON.stringify(example.querySpec, null, 2);
    markdown += "\n```\n\n";
    markdown += "---\n\n";
  }

  markdown += `## Tips for Building Queries

### Date Ranges

Available preset ranges:
- \`CURRENT_DAY\`, \`PREVIOUS_DAY\`
- \`WEEK_TO_DATE\`, \`MONTH_TO_DATE\`, \`QUARTER_TO_DATE\`, \`YEAR_TO_DATE\`
- \`PREVIOUS_WEEK\`, \`PREVIOUS_MONTH\`, \`PREVIOUS_QUARTER\`, \`PREVIOUS_YEAR\`
- \`LAST_7_DAYS\`, \`LAST_14_DAYS\`, \`LAST_30_DAYS\`, \`LAST_60_DAYS\`, \`LAST_90_DAYS\`, \`LAST_365_DAYS\`
- \`ALL_TIME\`
- \`CUSTOM_DATES\` (requires \`customStartDate\` and \`customEndDate\`)

### Report Types

- \`STANDARD\`: Standard delivery metrics (most common)
- \`AUDIENCE_COMPOSITION\`: Audience demographic breakdowns (deprecated but functional)
- \`FLOODLIGHT\`: Conversion tracking reports
- \`YOUTUBE\`: YouTube-specific metrics
- \`GRP\`: Gross Rating Point reports
- \`YOUTUBE_PROGRAMMATIC_GUARANTEED\`: YouTube PG reports
- \`REACH\`: Reach reports
- \`UNIQUE_REACH_AUDIENCE\`: Unique reach by audience

### Best Practices

1. **Minimize groupBys**: More dimensions = larger reports and longer processing
2. **Filter early**: Use filters to reduce data volume
3. **Choose relevant metrics**: Only request metrics you need
4. **Use preset date ranges**: Faster than custom dates when possible
`;

  return markdown;
}

/**
 * Query examples resource definition
 */
export const queryExamplesResource: Resource = {
  uri: "query-examples://all",
  name: "Bid Manager Query Examples",
  description: "Curated example queries for common Bid Manager API use cases",
  mimeType: "text/markdown",
  getContent: () => formatQueryExamplesMarkdown(),
};
