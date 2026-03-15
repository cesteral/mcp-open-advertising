// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "snapchat_get_report_breakdowns";
const TOOL_TITLE = "Get Snapchat Ads Report with Breakdowns";
const TOOL_DESCRIPTION = `Submit and retrieve an async Snapchat Ads report with additional breakdown fields.

Like \`snapchat_get_report\` but adds extra breakdown fields for more granular data.

**Common breakdown fields:** country_code, platform, gender, age, interest_category, placement

Results include metrics with the additional breakdown field values.`;

export const GetReportBreakdownsInputSchema = z
  .object({
    adAccountId: z
      .string()
      .min(1)
      .describe("Snapchat Ad Account ID"),
    fields: z
      .array(z.string())
      .min(1)
      .describe("Base metric fields to include (e.g. ['impressions', 'swipes', 'spend'])"),
    breakdowns: z
      .array(z.string())
      .min(1)
      .describe("Additional breakdown fields to add (e.g. ['country_code', 'gender'])"),
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
    filters: z
      .array(z.object({
        field: z.string().describe("Filter field (e.g. campaign_id)"),
        operator: z.string().describe("Filter operator (e.g. IN)"),
        values: z.array(z.string()).describe("Filter values"),
      }))
      .optional()
      .describe("Optional filters for the report"),
  })
  .describe("Parameters for generating a Snapchat Ads report with breakdowns");

export const GetReportBreakdownsOutputSchema = z
  .object({
    taskId: z.string().describe("Report task ID"),
    headers: z.array(z.string()).describe("CSV column headers"),
    rows: z.array(z.array(z.string())).describe("CSV data rows"),
    totalRows: z.number().describe("Total number of data rows"),
    appliedFields: z.array(z.string()).describe("All fields used (base + breakdowns)"),
    timestamp: z.string().datetime(),
  })
  .describe("Report with breakdowns result");

type GetReportBreakdownsInput = z.infer<typeof GetReportBreakdownsInputSchema>;
type GetReportBreakdownsOutput = z.infer<typeof GetReportBreakdownsOutputSchema>;

export async function getReportBreakdownsLogic(
  input: GetReportBreakdownsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportBreakdownsOutput> {
  const { snapchatReportingService } = resolveSessionServices(sdkContext);

  const result = await snapchatReportingService.getReportBreakdowns(
    {
      fields: input.fields,
      granularity: input.granularity,
      start_time: input.startTime,
      end_time: input.endTime,
      ...(input.filters ? { filters: input.filters } : {}),
    },
    input.breakdowns,
    context
  );

  return {
    taskId: result.taskId,
    headers: result.headers,
    rows: result.rows,
    totalRows: result.totalRows,
    appliedFields: [...input.fields, ...input.breakdowns],
    timestamp: new Date().toISOString(),
  };
}

export function getReportBreakdownsResponseFormatter(result: GetReportBreakdownsOutput): McpTextContent[] {
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
        `Applied fields: ${result.appliedFields.join(", ")}`,
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

export const getReportBreakdownsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetReportBreakdownsInputSchema,
  outputSchema: GetReportBreakdownsOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    idempotentHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Campaign report broken down by country",
      input: {
        adAccountId: "1234567890",
        fields: ["impressions", "swipes", "spend"],
        breakdowns: ["country_code"],
        startTime: "2026-03-01T00:00:00Z",
        endTime: "2026-03-04T23:59:59Z",
        granularity: "DAY",
      },
    },
    {
      label: "Ad squad report broken down by gender and age",
      input: {
        adAccountId: "1234567890",
        fields: ["impressions", "swipes", "spend"],
        breakdowns: ["gender", "age"],
        startTime: "2026-03-01T00:00:00Z",
        endTime: "2026-03-04T23:59:59Z",
        granularity: "DAY",
      },
    },
  ],
  logic: getReportBreakdownsLogic,
  responseFormatter: getReportBreakdownsResponseFormatter,
};