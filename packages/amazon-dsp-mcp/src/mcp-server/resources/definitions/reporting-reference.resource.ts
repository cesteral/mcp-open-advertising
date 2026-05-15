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

## Legacy /dsp/reports Contract
- Submit endpoint: \`POST ${AMAZON_DSP_REPORTING_CONTRACT.submitPathTemplate}\`
- Status endpoint: \`GET ${AMAZON_DSP_REPORTING_CONTRACT.statusPathTemplate}\`
- Content-Type: \`application/json\` (no vendor media type)
- Status values: ${AMAZON_DSP_REPORTING_CONTRACT.statuses.join(", ")}
- Default timeUnit: \`${AMAZON_DSP_REPORTING_CONTRACT.defaultTimeUnit}\`

## Allowed \`type\` Values
${AMAZON_DSP_REPORTING_CONTRACT.reportTypes.map((id) => `- \`${id}\``).join("\n")}

## Allowed \`dimensions\` (per type, where known)
${Object.entries(AMAZON_DSP_REPORTING_CONTRACT.dimensionsByType)
  .map(
    ([type, dims]) =>
      `- \`${type}\`: ${(dims as readonly string[]).map((d) => `\`${d}\``).join(", ")}`
  )
  .join("\n")}

## Known Metric Names (incomplete — the API returns an authoritative invalid-list in 422 errors)
${AMAZON_DSP_REPORTING_CONTRACT.knownMetrics.map((m) => `- \`${m}\``).join("\n")}

## Notes
${AMAZON_DSP_REPORTING_CONTRACT.notes.map((note) => `- ${note}`).join("\n")}

## Example Request
\`\`\`json
{
  "startDate": "20260301",
  "endDate": "20260304",
  "type": "CAMPAIGN",
  "dimensions": ["ORDER", "LINE_ITEM"],
  "metrics": "impressions,totalCost",
  "timeUnit": "DAILY"
}
\`\`\`
`;
}

export const reportingReferenceResource: Resource = {
  uri: "reporting-reference://amazonDsp",
  name: "Amazon DSP Reporting Reference",
  description:
    "Available dimensions, metrics, report types, and example configurations for Amazon DSP reporting",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatReportingReferenceMarkdown();
    return cachedContent;
  },
};
