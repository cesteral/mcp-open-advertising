// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const reportingWorkflowPrompt: Prompt = {
  name: "cm360_reporting_workflow",
  description: "Guide for generating async CM360 reports",
  arguments: [
    {
      name: "profileId",
      description: "CM360 User Profile ID",
      required: true,
    },
  ],
};

export function getReportingWorkflowMessage(args?: Record<string, string>): string {
  const profileId = args?.profileId || "{profileId}";
  return `# CM360 Reporting Workflow

## Profile ID: ${profileId}

CM360 reports are async: submit a report definition, wait for processing, then download results.

## Option A: Blocking (Recommended)

Use \`cm360_get_report\` which submits, polls, and returns results in one call:

\`\`\`json
{
  "tool": "cm360_get_report",
  "params": {
    "profileId": "${profileId}",
    "reportType": "STANDARD",
    "dateRange": { "startDate": "2026-01-01", "endDate": "2026-01-31" },
    "dimensions": ["campaign", "site"],
    "metrics": ["impressions", "clicks", "totalConversions"],
    "filters": {
      "advertiserId": "ADVERTISER_ID"
    }
  }
}
\`\`\`

## Option B: Non-Blocking (Advanced)

### Step 1: Submit report

\`\`\`json
{
  "tool": "cm360_submit_report",
  "params": {
    "profileId": "${profileId}",
    "reportType": "STANDARD",
    "dateRange": { "startDate": "2026-01-01", "endDate": "2026-01-31" },
    "dimensions": ["campaign"],
    "metrics": ["impressions", "clicks"]
  }
}
\`\`\`

### Step 2: Check status

\`\`\`json
{
  "tool": "cm360_check_report_status",
  "params": {
    "profileId": "${profileId}",
    "reportId": "REPORT_ID",
    "fileId": "FILE_ID"
  }
}
\`\`\`

### Step 3: Download results

\`\`\`json
{
  "tool": "cm360_download_report",
  "params": {
    "downloadUrl": "DOWNLOAD_URL",
    "maxRows": 1000
  }
}
\`\`\`

## Report Types

| Type | Description |
|------|-------------|
| STANDARD | Standard delivery report |
| REACH | Reach and frequency |
| FLOODLIGHT | Conversion (floodlight) report |
| PATH_TO_CONVERSION | Multi-touch attribution |
| CROSS_DIMENSION_REACH | Cross-dimension reach |

## Gotchas

| Issue | Solution |
|-------|----------|
| Reports are async | Use blocking \`cm360_get_report\` for simplicity |
| Large reports timeout | Use non-blocking flow for reports with millions of rows |
| Date format | Use YYYY-MM-DD format |
`;
}
