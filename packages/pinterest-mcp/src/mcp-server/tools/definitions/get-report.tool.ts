// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "pinterest_get_report";
const TOOL_TITLE = "Get Pinterest Ads Report";
const TOOL_DESCRIPTION = `Submit and retrieve an async Pinterest Ads performance report.

Follows the async polling pattern: submit task → poll until FINISHED → download CSV.
This may take 30s–5 minutes depending on the data volume.

**Common columns:** IMPRESSION_1, CLICKTHROUGH_1, SPEND_IN_DOLLAR, CTR, CPM, CPC, TOTAL_CONVERSIONS, REACH
**Report types:** CAMPAIGN (default), AD_GROUP, AD, KEYWORD, ACCOUNT
**Granularity:** DAY (default), TOTAL, HOUR, WEEK, MONTH`;

export const GetReportInputSchema = z
  .object({
    adAccountId: z
      .string()
      .min(1)
      .describe("Pinterest Ad Account ID"),
    type: z
      .enum(["CAMPAIGN", "AD_GROUP", "AD", "KEYWORD", "ACCOUNT"])
      .optional()
      .default("CAMPAIGN")
      .describe("Report type (default: CAMPAIGN)"),
    columns: z
      .array(z.string())
      .min(1)
      .describe("Columns/metrics to include (e.g. ['IMPRESSION_1', 'CLICKTHROUGH_1', 'SPEND_IN_DOLLAR'])"),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Start date (YYYY-MM-DD)"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("End date (YYYY-MM-DD)"),
    granularity: z
      .enum(["TOTAL", "DAY", "HOUR", "WEEK", "MONTH"])
      .optional()
      .default("DAY")
      .describe("Time granularity for the report (default: DAY)"),
    campaignIds: z
      .array(z.string())
      .optional()
      .describe("Filter by campaign IDs"),
    adGroupIds: z
      .array(z.string())
      .optional()
      .describe("Filter by ad group IDs"),
    adIds: z
      .array(z.string())
      .optional()
      .describe("Filter by ad IDs"),
  })
  .describe("Parameters for generating a Pinterest Ads report");

export const GetReportOutputSchema = z
  .object({
    taskId: z.string().describe("Report token/task ID"),
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
  const { pinterestReportingService } = resolveSessionServices(sdkContext);

  const result = await pinterestReportingService.getReport(
    {
      type: input.type,
      columns: input.columns,
      start_date: input.startDate,
      end_date: input.endDate,
      granularity: input.granularity,
      ...(input.campaignIds ? { campaign_ids: input.campaignIds } : {}),
      ...(input.adGroupIds ? { ad_group_ids: input.adGroupIds } : {}),
      ...(input.adIds ? { ad_ids: input.adIds } : {}),
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
      label: "Campaign delivery report for last 7 days",
      input: {
        adAccountId: "1234567890",
        type: "CAMPAIGN",
        columns: ["IMPRESSION_1", "CLICKTHROUGH_1", "SPEND_IN_DOLLAR", "CTR", "CPM"],
        startDate: "2026-02-24",
        endDate: "2026-03-04",
        granularity: "DAY",
      },
    },
    {
      label: "Ad group performance report",
      input: {
        adAccountId: "1234567890",
        type: "AD_GROUP",
        columns: ["IMPRESSION_1", "CLICKTHROUGH_1", "SPEND_IN_DOLLAR", "TOTAL_CONVERSIONS"],
        startDate: "2026-03-01",
        endDate: "2026-03-04",
        granularity: "TOTAL",
      },
    },
  ],
  logic: getReportLogic,
  responseFormatter: getReportResponseFormatter,
};