// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "amazon_dsp_get_report";
const TOOL_TITLE = "Get Amazon DSP Report";
const TOOL_DESCRIPTION = `Submit and retrieve an async Amazon DSP performance report.

Follows the async polling pattern: submit task → poll until COMPLETED → download data.
This may take 30s–5 minutes depending on the data volume.

**Report type IDs:** dspLineItem, dspOrder, dspCreative, dspAudience
**Common columns:** impressions, clickThroughs, totalCost, dpv14d, purchases14d
**Common groupBy:** order, lineItem, creative, audience, date`;

export const GetReportInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("Amazon DSP Profile/Advertiser ID"),
    name: z
      .string()
      .optional()
      .describe("Report name (optional)"),
    startDate: z
      .string()
      .regex(/^\d{8}$/)
      .describe("Start date (YYYYMMDD format, e.g. 20240101)"),
    endDate: z
      .string()
      .regex(/^\d{8}$/)
      .describe("End date (YYYYMMDD format, e.g. 20240131)"),
    reportTypeId: z
      .string()
      .min(1)
      .describe("Report type ID (e.g. dspLineItem, dspOrder, dspCreative)"),
    groupBy: z
      .array(z.string())
      .min(1)
      .describe("Dimensions to group by (e.g. ['order', 'lineItem'])"),
    columns: z
      .array(z.string())
      .min(1)
      .describe("Metrics/columns to include (e.g. ['impressions', 'clickThroughs', 'totalCost'])"),
    timeUnit: z
      .enum(["DAILY", "SUMMARY"])
      .optional()
      .default("DAILY")
      .describe("Time unit for the report (default: DAILY)"),
    adProduct: z
      .string()
      .optional()
      .default("DSP")
      .describe("Ad product type (default: DSP)"),
  })
  .describe("Parameters for generating an Amazon DSP report");

export const GetReportOutputSchema = z
  .object({
    taskId: z.string().describe("Report task ID"),
    headers: z.array(z.string()).describe("CSV column headers"),
    rows: z.array(z.array(z.string())).describe("CSV data rows"),
    totalRows: z.number().describe("Total number of data rows"),
    timestamp: z.string().datetime(),
  })
  .describe("Report result");

type GetReportInput = z.infer<typeof GetReportInputSchema>;
type GetReportOutput = z.infer<typeof GetReportOutputSchema>;

export async function getReportLogic(
  input: GetReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportOutput> {
  const { amazonDspReportingService } = resolveSessionServices(sdkContext);

  const result = await amazonDspReportingService.getReport(
    {
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      configuration: {
        adProduct: input.adProduct,
        groupBy: input.groupBy,
        columns: input.columns,
        reportTypeId: input.reportTypeId,
        timeUnit: input.timeUnit,
      },
    },
    context
  );

  return {
    taskId: result.taskId,
    headers: result.headers,
    rows: result.rows,
    totalRows: result.totalRows,
    timestamp: new Date().toISOString(),
  };
}

export function getReportResponseFormatter(result: GetReportOutput): McpTextContent[] {
  const headerLine = result.headers.join(", ");
  const previewRows = result.rows.slice(0, 5).map((row) => row.join(", "));
  const truncated = result.rows.length > 5
    ? `\n... and ${result.rows.length - 5} more rows`
    : "";

  return [
    {
      type: "text" as const,
      text: [
        `Report task: ${result.taskId}`,
        `Total rows: ${result.totalRows}`,
        "",
        `Headers: ${headerLine}`,
        "",
        "Sample rows:",
        ...previewRows,
        truncated,
        "",
        `Timestamp: ${result.timestamp}`,
      ].filter((line) => line !== undefined).join("\n"),
    },
  ];
}

export const getReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetReportInputSchema,
  outputSchema: GetReportOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Line item delivery report for last 7 days",
      input: {
        profileId: "1234567890",
        startDate: "20260224",
        endDate: "20260304",
        reportTypeId: "dspLineItem",
        groupBy: ["order", "lineItem"],
        columns: ["impressions", "clickThroughs", "totalCost"],
        timeUnit: "DAILY",
      },
    },
    {
      label: "Order performance report",
      input: {
        profileId: "1234567890",
        startDate: "20260301",
        endDate: "20260304",
        reportTypeId: "dspOrder",
        groupBy: ["order"],
        columns: ["impressions", "clickThroughs", "totalCost", "dpv14d", "purchases14d"],
        timeUnit: "SUMMARY",
      },
    },
  ],
  logic: getReportLogic,
  responseFormatter: getReportResponseFormatter,
};