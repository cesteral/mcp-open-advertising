// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Amazon DSP Reporting Reference Resource
 */
import type { Resource } from "../types.js";
import { AMAZON_DSP_REPORTING_CONTRACT } from "../../../services/amazon-dsp/amazon-dsp-api-contract.js";

let cachedContent: string | undefined;

function formatReportingReferenceMarkdown(): string {
  return `# Amazon DSP Reporting Reference

## Reporting v3 Contract
- Submit endpoint: \`POST ${AMAZON_DSP_REPORTING_CONTRACT.submitPathTemplate}\`
- Status endpoint: \`GET ${AMAZON_DSP_REPORTING_CONTRACT.statusPathTemplate}\`
- Submit Accept header: \`${AMAZON_DSP_REPORTING_CONTRACT.submitAcceptMediaType}\`
- Status Accept header: \`${AMAZON_DSP_REPORTING_CONTRACT.statusAcceptMediaType}\`
- Status values: ${AMAZON_DSP_REPORTING_CONTRACT.statuses.join(", ")}
- Default format: \`${AMAZON_DSP_REPORTING_CONTRACT.defaultFormat}\`

## Common Report Type IDs
${AMAZON_DSP_REPORTING_CONTRACT.commonReportTypeIds.map((id) => `- \`${id}\``).join("\n")}

## Common groupBy Values
${AMAZON_DSP_REPORTING_CONTRACT.commonGroupBy.map((value) => `- \`${value}\``).join("\n")}

## Common Columns
${AMAZON_DSP_REPORTING_CONTRACT.commonColumns.map((value) => `- \`${value}\``).join("\n")}

## Notes
${AMAZON_DSP_REPORTING_CONTRACT.notes.map((note) => `- ${note}`).join("\n")}

## Example Request
\`\`\`json
{
  "name": "DSP line item report",
  "startDate": "2026-03-01",
  "endDate": "2026-03-04",
  "configuration": {
    "adProduct": "${AMAZON_DSP_REPORTING_CONTRACT.defaultAdProduct}",
    "groupBy": ["order", "lineItem"],
    "columns": ["impressions", "clickThroughs", "totalCost", "date"],
    "reportTypeId": "dspLineItem",
    "timeUnit": "DAILY",
    "format": "${AMAZON_DSP_REPORTING_CONTRACT.defaultFormat}"
  }
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
