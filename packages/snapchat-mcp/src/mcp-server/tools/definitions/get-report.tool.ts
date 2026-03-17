// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "snapchat_get_report";
const TOOL_TITLE = "Get Snapchat Ads Report";
const TOOL_DESCRIPTION = `Submit and retrieve an async Snapchat Ads performance report.

Follows the async polling pattern: submit task → poll until COMPLETE → download CSV.
This may take 30s–5 minutes depending on the data volume.

**Common fields:** impressions, swipes, spend, video_views, conversion_purchases, reach, frequency, cpm, cpsu
**Granularity:** DAY (default), HOUR, LIFETIME
**start_time/end_time:** ISO 8601 format (e.g. 2024-01-01T00:00:00Z)`;

export const GetReportInputSchema = z
  .object({
    adAccountId: z
      .string()
      .min(1)
      .describe("Snapchat Ad Account ID"),
    fields: z
      .array(z.string())
      .min(1)
      .describe("Metric fields to include (e.g. ['impressions', 'swipes', 'spend'])"),
    startTime: z
      .string()
      .describe("Start time in ISO 8601 format (e.g. 2024-01-01T00:00:00Z)"),
    endTime: z
      .string()
      .describe("End time in ISO 8601 format (e.g. 2024-01-31T23:59:59Z)"),
    granularity: z
      .enum(["DAY", "HOUR", "LIFETIME"])
      .optional()
      .default("DAY")
      .describe("Time granularity (default: DAY)"),
    dimensionType: z
      .enum(["CAMPAIGN", "AD_SQUAD", "AD"])
      .optional()
      .describe("Entity level for stats breakdown (default: account-level aggregate)"),
    filters: z
      .array(z.object({
        field: z.string().describe("Filter field (e.g. campaign_id)"),
        operator: z.string().describe("Filter operator (e.g. IN)"),
        values: z.array(z.string()).describe("Filter values"),
      }))
      .optional()
      .describe("Optional filters for the report"),
  })
  .describe("Parameters for generating a Snapchat Ads report");

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
  const { snapchatReportingService } = resolveSessionServices(sdkContext);

  const result = await snapchatReportingService.getReport(
    {
      fields: input.fields,
      granularity: input.granularity,
      start_time: input.startTime,
      end_time: input.endTime,
      ...(input.dimensionType ? { dimension_type: input.dimensionType } : {}),
      ...(input.filters ? { filters: input.filters } : {}),
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
        fields: ["impressions", "swipes", "spend", "cpm"],
        startTime: "2026-02-24T00:00:00Z",
        endTime: "2026-03-04T23:59:59Z",
        granularity: "DAY",
        filters: [{ field: "campaign_id", operator: "IN", values: ["camp_123"] }],
      },
    },
    {
      label: "Ad squad performance report",
      input: {
        adAccountId: "1234567890",
        fields: ["impressions", "swipes", "spend", "conversion_purchases"],
        startTime: "2026-03-01T00:00:00Z",
        endTime: "2026-03-04T23:59:59Z",
        granularity: "DAY",
      },
    },
  ],
  logic: getReportLogic,
  responseFormatter: getReportResponseFormatter,
};