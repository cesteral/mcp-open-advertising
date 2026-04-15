// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TTD Report Generation Workflow Prompt
 *
 * Guide for creating and retrieving async reports via TTD MyReports API.
 */
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const reportGenerationWorkflowPrompt: Prompt = {
  name: "ttd_report_generation_workflow",
  description:
    "Step-by-step workflow for generating async reports via TTD MyReports API, including dimension/metric selection and common report patterns",
  arguments: [
    {
      name: "advertiserId",
      description: "TTD Advertiser ID to scope the report to",
      required: true,
    },
  ],
};

export function getReportGenerationWorkflowMessage(
  args?: Record<string, string>
): string {
  const advertiserId = args?.advertiserId || "{advertiserId}";

  return `# TTD Report Generation Workflow

## Context
- Advertiser ID: \`${advertiserId}\`
- API: TTD MyReports (async report generation)

Reports in TTD are asynchronous: you submit a report configuration, TTD processes it, and results are retrieved when ready. The \`ttd_get_report\` tool handles this flow end-to-end.

---

## Step 1: Choose Your Report Goal

Before building a report, decide what question you're answering:

| Goal | Recommended Dimensions | Recommended Metrics |
|------|----------------------|---------------------|
| Campaign overview | \`CampaignId\`, \`CampaignName\` | \`Impressions\`, \`Clicks\`, \`CTR\`, \`TotalCost\` |
| Daily delivery trend | \`Date\`, \`CampaignName\` | \`Impressions\`, \`TotalCost\` |
| Device breakdown | \`DeviceType\` | \`Impressions\`, \`Clicks\`, \`CTR\`, \`eCPM\` |
| Geo performance | \`Country\`, \`Region\` | \`Impressions\`, \`TotalCost\`, \`CTR\` |
| Video completion | \`CampaignName\`, \`AdGroupName\` | \`VideoStarted\`, \`VideoCompleted\`, \`VCR\` |
| Conversion analysis | \`CampaignName\` | \`TotalConversions\`, \`eCPA\`, \`ConversionRate\` |

> Fetch \`report-reference://all\` for the complete list of dimensions and metrics.

---

## Step 2: Select Date Range

| Value | Use When |
|-------|----------|
| \`Yesterday\` | Quick daily check |
| \`Last7Days\` | Weekly review |
| \`Last30Days\` | Monthly analysis |
| \`MonthToDate\` | Current month progress |
| \`Custom\` | Specific date range (add \`ReportStartDate\`/\`ReportEndDate\` to \`additionalConfig\`) |

---

## Step 3: Run the Report

\`\`\`
Tool: ttd_get_report
Input: {
  "reportName": "Campaign Performance - ${advertiserId}",
  "dateRange": "Last7Days",
  "dimensions": ["CampaignId", "CampaignName"],
  "metrics": ["Impressions", "Clicks", "CTR", "TotalCost", "eCPM"],
  "advertiserIds": ["${advertiserId}"]
}
\`\`\`

### Custom Date Range Example

\`\`\`
Tool: ttd_get_report
Input: {
  "reportName": "March Performance",
  "dateRange": "Custom",
  "dimensions": ["Date", "CampaignName"],
  "metrics": ["Impressions", "TotalCost"],
  "advertiserIds": ["${advertiserId}"],
  "additionalConfig": {
    "ReportStartDate": "2025-03-01T00:00:00",
    "ReportEndDate": "2025-03-31T23:59:59"
  }
}
\`\`\`

---

## Step 4: Download & Parse Results

\`ttd_get_report\` returns a \`downloadUrl\` pointing to a CSV file. Use \`ttd_download_report\` to fetch a bounded summary first:

\`\`\`
Tool: ttd_download_report
Input: {
  "downloadUrl": "{downloadUrl from Step 3}"
}
\`\`\`

The tool returns:
- \`headers\` — Column names from the CSV
- \`previewRows\` — Small parsed preview in summary mode
- \`rows\` — Parsed row page when \`mode: "rows"\`
- \`totalRows\` / \`returnedRows\` — Row counts
- \`truncated\` / \`nextOffset\` — Whether more rows are available
- \`selectedColumns\` — Columns included in row payloads

### Handling Large Reports

\`\`\`
Tool: ttd_download_report
Input: {
  "downloadUrl": "{downloadUrl from Step 3}",
  "mode": "rows",
  "columns": ["Site", "Impressions", "TotalCost"],
  "maxRows": 50,
  "offset": 0
}
\`\`\`

Use \`columns\` to project only the fields needed for the analysis. Use \`nextOffset\` for the next page. \`maxRows\` is capped at 200 to avoid MCP response-size failures.

⚠️ **GOTCHA**: If \`ttd_get_report\` returns no \`downloadUrl\`, the report may still be processing. Wait and retry the \`ttd_get_report\` call.

---

## Common Report Patterns

### Pacing Check
Compares daily spend to expected daily spend:
\`\`\`json
{
  "reportName": "Pacing Check",
  "dateRange": "Last7Days",
  "dimensions": ["Date", "CampaignId", "CampaignName"],
  "metrics": ["TotalCost", "Impressions"],
  "advertiserIds": ["${advertiserId}"]
}
\`\`\`
Compare daily \`TotalCost\` against \`Budget.Amount / flight_days\` from the campaign entity.

### Creative Performance
\`\`\`json
{
  "reportName": "Creative Performance",
  "dateRange": "Last14Days",
  "dimensions": ["CreativeId", "AdName", "CampaignName"],
  "metrics": ["Impressions", "Clicks", "CTR", "eCPM"],
  "advertiserIds": ["${advertiserId}"]
}
\`\`\`

---

## Tips

- Keep dimensions minimal — each additional dimension multiplies row count
- Always include \`advertiserIds\` filter to scope the report
- For large reports, use shorter date ranges
- Combine with entity tools: fetch campaign budget via \`ttd_get_entity\`, then run a report to check pacing

## Related Resources
- \`report-reference://all\` — Full list of dimensions, metrics, and date ranges
- \`entity-schema://campaign\` — Campaign fields for budget/pacing context
`;
}
