// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Compatibility Rules MCP Resource
 *
 * Provides detailed information about metric/filter compatibility
 * rules and restrictions for different report types.
 */

import type { Resource } from "../types.js";
import {
  REPORT_TYPE_RESTRICTIONS,
  INCOMPATIBLE_COMBINATIONS,
  GROUP_BY_ONLY_FILTERS,
  BEST_PRACTICES,
} from "../../../generated/index.js";

/**
 * Format compatibility rules as markdown
 */
function formatCompatibilityRulesMarkdown(): string {
  return `# Bid Manager API Compatibility Rules

This resource documents known restrictions and requirements for using metrics and filters together in different report types.

**Important:** The Bid Manager API performs its own validation and will return HTTP 400 for invalid combinations. These rules are based on naming conventions and Google's documentation to help you avoid errors.

---

## Report Type Restrictions

The following metrics and filters are EXCLUSIVE to specific report types:

| Pattern | Required Report Type(s) | Description |
|---------|------------------------|-------------|
${REPORT_TYPE_RESTRICTIONS.filter((r) => r.exclusive)
  .map((rule) => {
    const pattern = rule.metricsPattern?.source || rule.filtersPattern?.source || "N/A";
    return `| \`${pattern}\` | ${rule.reportTypes.join(", ")} | ${rule.description} |`;
  })
  .join("\n")}

### Key Rules

1. **TrueView Metrics/Filters** (\`METRIC_TRUEVIEW*\`, \`FILTER_TRUEVIEW*\`)
   - Only available in \`reportType: "YOUTUBE"\`
   - Using these with STANDARD will cause an API error

2. **Unique Reach Metrics** (\`METRIC_UNIQUE_REACH*\`)
   - Only available in \`reportType: "REACH"\` or \`"UNIQUE_REACH_AUDIENCE"\`
   - These metrics have privacy thresholds and may return incomplete data with granular dimensions

3. **GRP Metrics/Filters** (\`METRIC_GRP*\`, \`FILTER_NIELSEN*\`)
   - Only available in \`reportType: "GRP"\`

4. **YouTube Programmatic Guaranteed** (\`*YOUTUBE_PROGRAMMATIC_GUARANTEED*\`)
   - Only available in \`reportType: "YOUTUBE_PROGRAMMATIC_GUARANTEED"\`

5. **Floodlight Metrics/Filters** (\`*FLOODLIGHT*\`)
   - Available in both \`reportType: "STANDARD"\` and \`"FLOODLIGHT"\`

---

## GroupBy-Only Filters

These filters can ONLY be used in the \`groupBys\` array, NOT in the \`filters\` array:

${GROUP_BY_ONLY_FILTERS.map((f) => `- \`${f}\``).join("\n")}

Using these as filters (instead of groupBys) will cause an API error.

---

## Known Incompatible Combinations

${INCOMPATIBLE_COMBINATIONS.map(
  (combo) => `### ${combo.description}

${combo.incompatibleItems.metrics ? `**Affected metrics:**\n${combo.incompatibleItems.metrics.map((m) => `- \`${m}\``).join("\n")}` : ""}

**Reason:** ${combo.reason}
`
).join("\n")}

---

## Best Practices

${BEST_PRACTICES.map((bp, i) => `${i + 1}. ${bp}`).join("\n")}

---

## Validation Workflow

When building a query, validate your configuration in this order:

1. **Check Report Type Compatibility**
   - Ensure all metrics match the selected report type
   - Ensure all filters match the selected report type

2. **Check Filter Usage**
   - Time-based dimensions (DATE, WEEK, etc.) must be in \`groupBys\`, not \`filters\`
   - Entity filters (ADVERTISER, CAMPAIGN) can be in either

3. **Test in DV360 UI First**
   - Build the report in the Display & Video 360 interface
   - Use "Show incompatible" toggle to verify combinations
   - Export the configuration once validated

---

## Example: Validating a Query

\`\`\`json
{
  "reportType": "YOUTUBE",
  "groupBys": ["FILTER_DATE", "FILTER_LINE_ITEM"],
  "metrics": [
    "METRIC_TRUEVIEW_VIEWS",       // ✓ YOUTUBE-specific
    "METRIC_TRUEVIEW_VIEW_RATE",   // ✓ YOUTUBE-specific
    "METRIC_IMPRESSIONS"           // ✓ General metric
  ],
  "filters": [
    { "type": "FILTER_ADVERTISER", "value": "123456" }  // ✓ General filter
  ]
}
\`\`\`

This query is valid because:
- TrueView metrics are used with YOUTUBE report type
- FILTER_DATE is in groupBys (not filters)
- General metrics/filters work with any report type

---

## Related Resources

- \`metric-types://all\` - Complete metric reference with report type compatibility
- \`filter-types://all\` - Complete filter reference with report type compatibility
- \`report-types://all\` - Report type reference with compatible metrics/filters lists
- \`query-examples://all\` - Example queries for common use cases
`;
}

/**
 * Compatibility rules resource definition
 */
export const compatibilityRulesResource: Resource = {
  uri: "compatibility-rules://all",
  name: "Bid Manager Compatibility Rules",
  description: "Detailed compatibility rules for metrics and filters across report types",
  mimeType: "text/markdown",
  getContent: () => formatCompatibilityRulesMarkdown(),
};