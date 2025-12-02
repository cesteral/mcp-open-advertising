/**
 * Filter Types MCP Resource
 *
 * Provides a reference of all available Bid Manager API filter/dimension types
 * with descriptions and usage guidance.
 */

import type { Resource } from "../types.js";

/**
 * Filter/dimension documentation with descriptions
 */
export const FILTER_DOCUMENTATION: Record<string, { description: string; category: string; usage: string }> = {
  // Time dimensions
  FILTER_DATE: {
    description: "Date dimension for daily breakdown",
    category: "Time",
    usage: "Group by date for time-series analysis",
  },
  FILTER_MONTH: {
    description: "Month dimension for monthly breakdown",
    category: "Time",
    usage: "Group by month for monthly trends",
  },
  FILTER_YEAR: {
    description: "Year dimension",
    category: "Time",
    usage: "Group by year for annual comparisons",
  },
  FILTER_WEEK: {
    description: "Week dimension",
    category: "Time",
    usage: "Group by week for weekly trends",
  },
  FILTER_TIME_OF_DAY: {
    description: "Hour of day dimension",
    category: "Time",
    usage: "Analyze performance by time of day",
  },
  FILTER_DAY_OF_WEEK: {
    description: "Day of week dimension",
    category: "Time",
    usage: "Analyze performance by day of week",
  },

  // Entity hierarchy
  FILTER_PARTNER: {
    description: "DV360 Partner ID",
    category: "Entity",
    usage: "Filter or group by partner",
  },
  FILTER_ADVERTISER: {
    description: "DV360 Advertiser ID",
    category: "Entity",
    usage: "Filter or group by advertiser",
  },
  FILTER_CAMPAIGN: {
    description: "DV360 Campaign ID",
    category: "Entity",
    usage: "Filter or group by campaign",
  },
  FILTER_INSERTION_ORDER: {
    description: "DV360 Insertion Order ID",
    category: "Entity",
    usage: "Filter or group by insertion order",
  },
  FILTER_LINE_ITEM: {
    description: "DV360 Line Item ID",
    category: "Entity",
    usage: "Filter or group by line item",
  },
  FILTER_CREATIVE: {
    description: "DV360 Creative ID",
    category: "Entity",
    usage: "Filter or group by creative",
  },

  // Targeting dimensions
  FILTER_DEVICE_TYPE: {
    description: "Device type (Desktop, Mobile, Tablet, Connected TV)",
    category: "Targeting",
    usage: "Analyze performance by device type",
  },
  FILTER_BROWSER: {
    description: "Browser type",
    category: "Targeting",
    usage: "Analyze performance by browser",
  },
  FILTER_COUNTRY: {
    description: "Country",
    category: "Targeting",
    usage: "Analyze performance by country",
  },
  FILTER_REGION: {
    description: "Region/State",
    category: "Targeting",
    usage: "Analyze performance by region",
  },
  FILTER_CITY: {
    description: "City",
    category: "Targeting",
    usage: "Analyze performance by city",
  },
  FILTER_DMA: {
    description: "Designated Market Area (US)",
    category: "Targeting",
    usage: "Analyze performance by DMA",
  },
  FILTER_OS: {
    description: "Operating System",
    category: "Targeting",
    usage: "Analyze performance by OS",
  },

  // Audience dimensions
  FILTER_AUDIENCE_LIST: {
    description: "Audience list ID",
    category: "Audience",
    usage: "Analyze performance by audience list",
  },
  FILTER_AGE: {
    description: "Age demographic",
    category: "Audience",
    usage: "Analyze performance by age group",
  },
  FILTER_GENDER: {
    description: "Gender demographic",
    category: "Audience",
    usage: "Analyze performance by gender",
  },
  FILTER_HOUSEHOLD_INCOME: {
    description: "Household income level",
    category: "Audience",
    usage: "Analyze performance by income level",
  },
  FILTER_PARENTAL_STATUS: {
    description: "Parental status",
    category: "Audience",
    usage: "Analyze performance by parental status",
  },

  // Inventory dimensions
  FILTER_INVENTORY_SOURCE: {
    description: "Inventory source",
    category: "Inventory",
    usage: "Analyze performance by inventory source",
  },
  FILTER_INVENTORY_SOURCE_TYPE: {
    description: "Inventory source type",
    category: "Inventory",
    usage: "Analyze by inventory source type",
  },
  FILTER_EXCHANGE: {
    description: "Ad exchange",
    category: "Inventory",
    usage: "Analyze performance by exchange",
  },
  FILTER_SITE_ID: {
    description: "Site/Publisher ID",
    category: "Inventory",
    usage: "Analyze performance by site",
  },
  FILTER_APP_URL: {
    description: "App URL/ID",
    category: "Inventory",
    usage: "Analyze performance by app",
  },

  // Video dimensions
  FILTER_VIDEO_PLAYER_SIZE: {
    description: "Video player size",
    category: "Video",
    usage: "Analyze video performance by player size",
  },
  FILTER_VIDEO_CREATIVE_DURATION: {
    description: "Video creative duration",
    category: "Video",
    usage: "Analyze by video duration",
  },
  FILTER_VIDEO_AD_POSITION: {
    description: "Video ad position (pre-roll, mid-roll, post-roll)",
    category: "Video",
    usage: "Analyze by video ad position",
  },

  // Other
  FILTER_MEDIA_PLAN: {
    description: "Media plan ID",
    category: "Other",
    usage: "Filter or group by media plan",
  },
  FILTER_ORDER_ID: {
    description: "Order ID",
    category: "Other",
    usage: "Filter or group by order",
  },
  FILTER_TRUEVIEW_CONVERSION_TYPE: {
    description: "TrueView conversion type",
    category: "Other",
    usage: "Analyze TrueView by conversion type",
  },
};

/**
 * Format filters documentation as markdown
 */
function formatFiltersMarkdown(): string {
  const byCategory = new Map<
    string,
    Array<[string, { description: string; category: string; usage: string }]>
  >();

  for (const [filter, doc] of Object.entries(FILTER_DOCUMENTATION)) {
    const existing = byCategory.get(doc.category) || [];
    existing.push([filter, doc]);
    byCategory.set(doc.category, existing);
  }

  let markdown = `# Bid Manager API Filter/Dimension Types Reference

This resource provides a complete reference of all available filter and dimension types for Bid Manager API queries.

## Usage

Filters are used in two ways:
1. **In \`filters\` array**: To restrict data to specific values (e.g., filter by advertiser ID)
2. **In \`groupBys\` array**: To break down data by dimension (e.g., daily breakdown)

---

`;

  for (const [category, filters] of byCategory) {
    markdown += `## ${category} Filters\n\n`;
    markdown += "| Filter | Description | Usage |\n";
    markdown += "|--------|-------------|-------|\n";

    for (const [filter, doc] of filters) {
      markdown += `| \`${filter}\` | ${doc.description} | ${doc.usage} |\n`;
    }

    markdown += "\n";
  }

  markdown += `---

## Common Filter Combinations

### Daily Delivery by Campaign
\`\`\`json
{
  "groupBys": ["FILTER_DATE", "FILTER_CAMPAIGN"],
  "filters": [
    { "type": "FILTER_ADVERTISER", "value": "123456" }
  ]
}
\`\`\`

### Device Type Breakdown
\`\`\`json
{
  "groupBys": ["FILTER_DEVICE_TYPE"],
  "filters": [
    { "type": "FILTER_ADVERTISER", "value": "123456" },
    { "type": "FILTER_CAMPAIGN", "value": "789012" }
  ]
}
\`\`\`

### Geographic Performance
\`\`\`json
{
  "groupBys": ["FILTER_COUNTRY", "FILTER_REGION"],
  "filters": [
    { "type": "FILTER_ADVERTISER", "value": "123456" }
  ]
}
\`\`\`

### Line Item Performance
\`\`\`json
{
  "groupBys": ["FILTER_LINE_ITEM"],
  "filters": [
    { "type": "FILTER_ADVERTISER", "value": "123456" },
    { "type": "FILTER_CAMPAIGN", "value": "789012" }
  ]
}
\`\`\`
`;

  return markdown;
}

/**
 * Filter types resource definition
 */
export const filterTypesResource: Resource = {
  uri: "filter-types://all",
  name: "Bid Manager Filter/Dimension Types",
  description: "Complete reference of all available Bid Manager API filters and dimensions",
  mimeType: "text/markdown",
  getContent: () => formatFiltersMarkdown(),
};
