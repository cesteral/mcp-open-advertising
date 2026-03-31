// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { resolveDatePreset, DATE_PRESET_VALUES } from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "cm360_get_report_breakdowns";
const TOOL_TITLE = "Get CM360 Report with Breakdowns";
const TOOL_DESCRIPTION = `Create and run a CM360 report with additional breakdown dimensions (blocking).

Like \`cm360_get_report\` but merges \`breakdownDimensions\` into the report criteria alongside any
dimensions already specified in \`criteria\`. Use this to segment results by device, date, geography,
creative, or any other CM360 dimension.

**Common breakdown dimensions:** date, campaign, advertiser, site, creative, creativeType, device, country

This may take 30-120 seconds depending on report complexity.

Returns a \`downloadUrl\`. Use \`cm360_download_report\` with \`includeComputedMetrics: true\` to fetch the CSV data with computed CPA, ROAS, CPM, CTR, CPC appended.`;

export const GetReportBreakdownsInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("CM360 User Profile ID"),
    name: z
      .string()
      .describe("Name for the report"),
    type: z
      .enum(["STANDARD", "REACH", "PATH_TO_CONVERSION", "CROSS_DIMENSION_REACH", "FLOODLIGHT"])
      .describe("Report type"),
    breakdownDimensions: z
      .array(z.string().min(1))
      .min(1)
      .describe(
        "Dimension names to break down by (e.g., ['date', 'device', 'country']). These are merged into criteria.dimensions."
      ),
    datePreset: z
      .enum(DATE_PRESET_VALUES)
      .optional()
      .describe("Preset date range. Injected into criteria.dateRange if criteria.dateRange is not set. Use this OR set dateRange inside criteria (not both)"),
    criteria: z
      .record(z.any())
      .optional()
      .describe("Base report criteria (dateRange, metricNames, dimensionFilters). Dimensions from breakdownDimensions are appended automatically."),
    additionalConfig: z
      .record(z.any())
      .optional()
      .describe("Additional report configuration fields (schedule, delivery, etc.)"),
  })
  .describe("Parameters for generating a CM360 report with breakdown dimensions");

export const GetReportBreakdownsOutputSchema = z
  .object({
    reportId: z.string().describe("Report ID"),
    fileId: z.string().describe("Report file ID"),
    file: z.record(z.any()).describe("Report file details"),
    downloadUrl: z.string().optional().describe("URL to download report results"),
    appliedDimensions: z.array(z.string()).describe("All dimension names used in the report"),
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
  const { cm360ReportingService } = resolveSessionServices(sdkContext);

  // Resolve datePreset into criteria.dateRange if no dateRange already in criteria
  let baseCriteria = input.criteria;
  if (input.datePreset && !input.criteria?.dateRange) {
    const { startDate, endDate } = resolveDatePreset(input.datePreset);
    baseCriteria = { ...(input.criteria ?? {}), dateRange: { startDate, endDate } };
  }

  // Merge breakdownDimensions into criteria.dimensions
  const existingDimensions: { name: string }[] =
    (baseCriteria?.dimensions as { name: string }[] | undefined) ?? [];
  const existingDimensionNames = new Set(existingDimensions.map((d) => d.name));

  // Append breakdown dimensions not already present
  const breakdownDimensionObjects = input.breakdownDimensions
    .filter((d) => !existingDimensionNames.has(d))
    .map((d) => ({ name: d }));

  const mergedDimensions = [...existingDimensions, ...breakdownDimensionObjects];

  const mergedCriteria = {
    ...(baseCriteria ?? {}),
    dimensions: mergedDimensions,
  };

  const { name: _n, type: _t, criteria: _c, ...safeAdditionalConfig } = input.additionalConfig ?? {};
  const reportConfig = {
    ...safeAdditionalConfig,
    name: input.name,
    type: input.type,
    criteria: mergedCriteria,
  };

  const result = (await cm360ReportingService.runReport(
    input.profileId,
    reportConfig,
    context
  )) as Record<string, unknown>;

  return {
    reportId: result.reportId as string,
    fileId: result.fileId as string,
    file: (result.file as Record<string, any>) || {},
    downloadUrl: result.downloadUrl as string | undefined,
    appliedDimensions: mergedDimensions.map((d) => d.name),
    timestamp: new Date().toISOString(),
  };
}

export function getReportBreakdownsResponseFormatter(result: GetReportBreakdownsOutput): McpTextContent[] {
  const downloadInfo = result.downloadUrl
    ? `\n\nDownload URL: ${result.downloadUrl}`
    : "\n\nNo download URL available yet.";

  return [
    {
      type: "text" as const,
      text: `Report generated: ${result.reportId} (file: ${result.fileId})\nApplied dimensions: ${result.appliedDimensions.join(", ")}${downloadInfo}\n\nFile details:\n${JSON.stringify(result.file, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Standard report broken down by date and device using datePreset",
      input: {
        profileId: "123456",
        name: "Campaign Performance by Device - Last 7 Days",
        type: "STANDARD",
        breakdownDimensions: ["date", "device"],
        datePreset: "LAST_7_DAYS",
        criteria: {
          metricNames: ["impressions", "clicks", "mediaCost"],
        },
      },
    },
    {
      label: "Floodlight report broken down by country and creative",
      input: {
        profileId: "123456",
        name: "Floodlight by Country - MTD",
        type: "FLOODLIGHT",
        breakdownDimensions: ["country", "creative"],
        criteria: {
          dateRange: { relativeDateRange: "MONTH_TO_DATE" },
          metricNames: ["floodlightImpressions", "floodlightClicks", "floodlightRevenue"],
        },
      },
    },
  ],
  logic: getReportBreakdownsLogic,
  responseFormatter: getReportBreakdownsResponseFormatter,
};
