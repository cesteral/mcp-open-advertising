// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "sa360_submit_report";
const TOOL_TITLE = "Submit SA360 Async Report";
const TOOL_DESCRIPTION = `Submit an asynchronous report request via the SA360 legacy v2 API.

Returns a report ID that can be used with \`sa360_check_report_status\` to poll for completion, then \`sa360_download_report\` to retrieve results.

**Report types:** campaign, adGroup, keyword, ad, advertiser, productGroup, floodlightActivity, productLeadAndCrossSell
**Workflow:** submit_report → check_report_status (poll) → download_report`;

const REPORT_TYPE_ENUM = [
  "campaign",
  "adGroup",
  "keyword",
  "ad",
  "advertiser",
  "productGroup",
  "floodlightActivity",
  "productLeadAndCrossSell",
] as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ColumnSchema = z.object({
  columnName: z.string().min(1).describe("Column name (e.g., 'impressions', 'clicks', 'cost')"),
  headerText: z.string().optional().describe("Custom header text for the column in the output"),
});

const FilterSchema = z.object({
  column: z.object({
    columnName: z.string().min(1),
  }),
  operator: z
    .string()
    .min(1)
    .describe("Filter operator (e.g., 'equals', 'greaterThan', 'contains')"),
  values: z.array(z.string()).min(1).describe("Filter values"),
});

export const SubmitReportInputSchema = z
  .object({
    agencyId: z.string().min(1).describe("SA360 agency ID"),
    advertiserId: z
      .string()
      .optional()
      .describe("SA360 advertiser ID (optional — omit for agency-level reports)"),
    reportType: z.enum(REPORT_TYPE_ENUM).describe("Type of report to generate"),
    columns: z.array(ColumnSchema).min(1).describe("Columns to include in the report"),
    startDate: z
      .string()
      .regex(DATE_PATTERN, "startDate must be YYYY-MM-DD")
      .describe("Report start date (YYYY-MM-DD)"),
    endDate: z
      .string()
      .regex(DATE_PATTERN, "endDate must be YYYY-MM-DD")
      .describe("Report end date (YYYY-MM-DD)"),
    filters: z.array(FilterSchema).optional().describe("Optional filters to apply to the report"),
    includeRemovedEntities: z
      .boolean()
      .optional()
      .describe("Include removed/deleted entities in results"),
    statisticsCurrency: z
      .string()
      .optional()
      .describe("Currency for monetary metrics (default: 'agency')"),
  })
  .describe("Parameters for submitting an async SA360 report");

export const SubmitReportOutputSchema = z
  .object({
    reportId: z.string().describe("Report ID for status polling"),
    timestamp: z.string().datetime(),
  })
  .describe("Submitted report confirmation");

type SubmitReportInput = z.infer<typeof SubmitReportInputSchema>;
type SubmitReportOutput = z.infer<typeof SubmitReportOutputSchema>;

export async function submitReportLogic(
  input: SubmitReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<SubmitReportOutput> {
  const { reportingService } = resolveSessionServices(sdkContext);

  const result = await reportingService.submitReport(
    {
      reportType: input.reportType,
      columns: input.columns,
      timeRange: { startDate: input.startDate, endDate: input.endDate },
      reportScope: {
        agencyId: input.agencyId,
        ...(input.advertiserId && { advertiserId: input.advertiserId }),
      },
      filters: input.filters,
      includeRemovedEntities: input.includeRemovedEntities,
      statisticsCurrency: input.statisticsCurrency,
    },
    context
  );

  return {
    reportId: result.id,
    timestamp: new Date().toISOString(),
  };
}

export function submitReportResponseFormatter(result: SubmitReportOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report submitted successfully.\nReport ID: ${result.reportId}\n\nUse sa360_check_report_status with this ID to poll for completion.\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const submitReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: SubmitReportInputSchema,
  outputSchema: SubmitReportOutputSchema,
  annotations: {
    readOnlyHint: false,
    idempotentHint: false,
    openWorldHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Submit campaign performance report",
      input: {
        agencyId: "12345",
        advertiserId: "67890",
        reportType: "campaign",
        columns: [
          { columnName: "campaignId" },
          { columnName: "campaign" },
          { columnName: "impressions" },
          { columnName: "clicks" },
          { columnName: "cost" },
          { columnName: "conversions" },
        ],
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};
