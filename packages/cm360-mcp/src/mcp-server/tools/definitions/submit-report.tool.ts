// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import {
  buildTypedReportConfig,
  CM360DatePresetSchema,
  CM360ReportTypeSchema,
  genericCriteriaSchema,
  validateTypedCriteriaUsage,
} from "../utils/report-config.js";
import type { CM360ReportConfig } from "../../../services/cm360/cm360-reporting-service.js";

const TOOL_NAME = "cm360_submit_report";
const TOOL_TITLE = "Submit CM360 Report";
const TOOL_DESCRIPTION = `Submit a CM360 report without waiting for completion (non-blocking).

Creates the report definition and triggers execution, then returns immediately with the reportId and fileId. Use cm360_check_report_status to poll for completion, then cm360_download_report to fetch results.

Three-step async workflow:
1. cm360_submit_report -> get reportId + fileId
2. cm360_check_report_status -> check status
3. cm360_download_report -> download when REPORT_AVAILABLE`;

export const SubmitReportInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("CM360 User Profile ID"),
    name: z
      .string()
      .describe("Name for the report"),
    type: CM360ReportTypeSchema.describe("Report type"),
    datePreset: CM360DatePresetSchema
      .optional()
      .describe("Preset date range. Injected into the correct report criteria dateRange when not already set"),
    criteria: genericCriteriaSchema
      .optional()
      .describe("Criteria for STANDARD reports"),
    reachCriteria: genericCriteriaSchema
      .optional()
      .describe("Criteria for REACH reports"),
    pathToConversionCriteria: genericCriteriaSchema
      .optional()
      .describe("Criteria for PATH_TO_CONVERSION reports"),
    floodlightCriteria: genericCriteriaSchema
      .optional()
      .describe("Criteria for FLOODLIGHT reports"),
    crossMediaReachCriteria: genericCriteriaSchema
      .optional()
      .describe("Criteria for CROSS_MEDIA_REACH reports"),
    additionalConfig: z
      .record(z.any())
      .optional()
      .describe("Additional report configuration fields"),
  })
  .superRefine(validateTypedCriteriaUsage)
  .describe("Parameters for submitting a CM360 report");

export const SubmitReportOutputSchema = z
  .object({
    reportId: z.string().describe("Report ID for status polling"),
    fileId: z.string().describe("File ID for status polling"),
    timestamp: z.string().datetime(),
  })
  .describe("Report submission result");

type SubmitReportInput = z.infer<typeof SubmitReportInputSchema>;
type SubmitReportOutput = z.infer<typeof SubmitReportOutputSchema>;

export async function submitReportLogic(
  input: SubmitReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<SubmitReportOutput> {
  const { cm360ReportingService } = resolveSessionServices(sdkContext);

  const reportConfig = buildTypedReportConfig(input) as CM360ReportConfig;

  const result = await cm360ReportingService.createReport(
    input.profileId,
    reportConfig,
    context
  ) as Record<string, string>;

  return {
    reportId: result.reportId,
    fileId: result.fileId,
    timestamp: new Date().toISOString(),
  };
}

export function submitReportResponseFormatter(result: SubmitReportOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report submitted: ${result.reportId} (file: ${result.fileId})\n\nUse cm360_check_report_status with reportId="${result.reportId}" and fileId="${result.fileId}" to check status.\nOnce REPORT_AVAILABLE, use cm360_download_report with the download URL.\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Submit a standard report using datePreset (non-blocking)",
      input: {
        profileId: "123456",
        name: "Campaign Performance Report",
        type: "STANDARD",
        datePreset: "LAST_30_DAYS",
        criteria: {
          dimensions: [{ name: "campaign" }],
          metricNames: ["impressions", "clicks", "mediaCost"],
        },
      },
    },
    {
      label: "Submit a cross-media reach report",
      input: {
        profileId: "123456",
        name: "Cross Media Reach",
        type: "CROSS_MEDIA_REACH",
        crossMediaReachCriteria: {
          dateRange: { relativeDateRange: "LAST_30_DAYS" },
          dimensions: [{ name: "campaign" }],
          metricNames: ["uniqueReach"],
          dimensionFilters: [],
        },
      },
    },
  ],
  logic: submitReportLogic,
  responseFormatter: submitReportResponseFormatter,
};
