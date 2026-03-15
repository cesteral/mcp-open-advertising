// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Troubleshoot Report Prompt
 *
 * Diagnostic workflow for debugging failed Bid Manager queries.
 */

import type { Prompt } from "./types.js";

export const troubleshootReportPrompt: Prompt = {
  name: "troubleshoot_report",
  description: "Diagnostic workflow for debugging failed Bid Manager queries and common issues",
  arguments: [
    {
      name: "errorMessage",
      description: "The error message from the failed query",
      required: false,
    },
    {
      name: "queryType",
      description: "Type of query that failed (e.g., 'dbm_run_custom_query', 'dbm_get_campaign_delivery')",
      required: false,
    },
  ],
};

export function getTroubleshootReportMessage(args?: Record<string, string>): string {
  const errorMessage = args?.errorMessage || "{error message}";
  const queryType = args?.queryType || "dbm_run_custom_query";

  return `# Troubleshooting Bid Manager Report Issues

## Error Context
- **Tool:** ${queryType}
- **Error:** ${errorMessage}

---

## Step 1: Identify Error Category

### Validation Errors
If you see "Unknown filter type" or "Unknown metric type":

1. **Check spelling** - Filter/metric names are case-sensitive and exact
2. **Verify availability** - Some filters/metrics only work with specific report types
3. **Fetch references:**
   - \`filter-types://all\` - All valid filter names
   - \`metric-types://all\` - All valid metric names
   - \`report-types://all\` - Report type compatibility

**Quick fix:** Set \`strictValidation: false\` to bypass validation and see API's native error

---

### API Errors
If you see "Report failed" or "Query execution failed":

1. **Check date range:**
   - Is the date range valid? (start before end)
   - Is data available for that period?
   - Try a recent preset like \`LAST_7_DAYS\`

2. **Check advertiser ID:**
   - Is the advertiser ID correct?
   - Do you have access to this advertiser?

3. **Reduce complexity:**
   - Fewer groupBys = smaller report
   - Start with 2-3 groupBys max
   - Some combinations aren't supported

---

### No Data Returned
If the query succeeds but returns empty results:

1. **Verify filters:**
   - Is the advertiser ID correct?
   - Are campaign/line item IDs valid?
   - Check if filters are too restrictive

2. **Check date range:**
   - Is there activity in this period?
   - Try \`LAST_30_DAYS\` for broader range

3. **Verify metric availability:**
   - Video metrics require video campaigns
   - Conversion metrics require Floodlight setup
   - Reach metrics require REACH report type

---

## Step 2: Common Issues by Report Type

### STANDARD Reports
- Most flexible, supports most filters/metrics
- Conversion metrics may need Floodlight setup

### YOUTUBE Reports
- Requires YouTube/TrueView campaigns
- Only supports YouTube-specific metrics
- Limited filter compatibility

### FLOODLIGHT Reports
- Requires Floodlight activities
- Uses \`FILTER_FLOODLIGHT_ACTIVITY\` for grouping
- Limited to conversion-related metrics

### REACH Reports
- Limited to reach/frequency metrics
- Fewer groupBy options supported
- May have data processing delays

---

## Step 3: Diagnostic Queries

### Test Basic Connectivity
\`\`\`json
{
  "reportType": "STANDARD",
  "groupBys": ["FILTER_DATE"],
  "metrics": ["METRIC_IMPRESSIONS"],
  "filters": [
    { "type": "FILTER_ADVERTISER", "value": "{advertiserId}" }
  ],
  "dateRange": { "preset": "LAST_7_DAYS" }
}
\`\`\`

### Test Specific Campaign
\`\`\`json
{
  "reportType": "STANDARD",
  "groupBys": ["FILTER_MEDIA_PLAN"],
  "metrics": ["METRIC_IMPRESSIONS", "METRIC_CLICKS"],
  "filters": [
    { "type": "FILTER_ADVERTISER", "value": "{advertiserId}" },
    { "type": "FILTER_MEDIA_PLAN", "value": "{campaignId}" }
  ],
  "dateRange": { "preset": "LAST_30_DAYS" }
}
\`\`\`

---

## Step 4: Error Messages Reference

| Error | Cause | Solution |
|-------|-------|----------|
| "Unknown filter type: X" | Invalid filter name | Check \`filter-types://all\` |
| "Unknown metric type: X" | Invalid metric name | Check \`metric-types://all\` |
| "Unknown report type: X" | Invalid report type | Use STANDARD, YOUTUBE, etc. |
| "Unknown date range preset" | Invalid preset | Check \`report-types://all\` |
| "Report timed out" | Query too large | Reduce groupBys or date range |
| "No data available" | Empty results | Check filters, widen date range |
| "Access denied" | Permission issue | Verify advertiser access |
| "Invalid date range" | Date format error | Use YYYY-MM-DD format |

---

## Step 5: Escalation

If issues persist after troubleshooting:

1. **Try pass-through mode:**
   \`\`\`json
   { "strictValidation": false }
   \`\`\`
   This sends the query directly to the API for native error messages.

2. **Check API status:**
   - Bid Manager API may have service issues
   - Check Google Cloud Status Dashboard

3. **Verify credentials:**
   - OAuth tokens may need refresh
   - Service account permissions may be insufficient

---

## Best Practices

1. **Start simple** - Begin with few groupBys and expand
2. **Use presets** - Date presets are more reliable than custom dates
3. **Filter early** - Add specific filters to reduce data volume
4. **Check examples** - Fetch \`query-examples://all\` for working templates
`;
}