// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "cm360_list_report_schedules";
const TOOL_TITLE = "List CM360 Report Schedules";
const TOOL_DESCRIPTION = `List CM360 reports that have an active schedule.

Returns all reports in the profile that contain an active schedule object. Use the returned reportId as a handle for cm360_delete_report_schedule.`;

export const ListReportSchedulesInputSchema = z
  .object({
    profileId: z
      .string()
      .min(1)
      .describe("CM360 User Profile ID"),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe("Maximum number of reports to return (default: all)"),
    pageToken: z
      .string()
      .optional()
      .describe("Pagination token from a previous response"),
  })
  .describe("Parameters for listing CM360 report schedules");

export const ListReportSchedulesOutputSchema = z
  .object({
    reports: z
      .array(
        z.object({
          reportId: z.string(),
          reportName: z.string(),
          type: z.string(),
          schedule: z.record(z.any()),
        })
      )
      .describe("Reports with active schedules"),
    nextPageToken: z.string().optional().describe("Token to fetch the next page"),
    total: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("List of scheduled reports");

type ListReportSchedulesInput = z.infer<typeof ListReportSchedulesInputSchema>;
type ListReportSchedulesOutput = z.infer<typeof ListReportSchedulesOutputSchema>;

export async function listReportSchedulesLogic(
  input: ListReportSchedulesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListReportSchedulesOutput> {
  const { cm360ReportingService } = resolveSessionServices(sdkContext);

  const result = await cm360ReportingService.listReportSchedules(
    input.profileId,
    { maxResults: input.maxResults, pageToken: input.pageToken },
    context
  );

  const reports = result.reports.map((r) => ({
    reportId: r.id as string,
    reportName: r.name as string,
    type: r.type as string,
    schedule: r.schedule as Record<string, unknown>,
  }));

  return {
    reports,
    nextPageToken: result.nextPageToken,
    total: reports.length,
    timestamp: new Date().toISOString(),
  };
}

export function listReportSchedulesResponseFormatter(result: ListReportSchedulesOutput): McpTextContent[] {
  const lines = result.reports.map(
    (r) => `  ${r.reportId}: ${r.reportName} (${r.type}) — repeats: ${(r.schedule as Record<string, unknown>).repeats ?? "unknown"}`
  );

  return [
    {
      type: "text" as const,
      text: `${result.total} scheduled report(s):\n${lines.join("\n") || "  (none)"}${result.nextPageToken ? `\n\nnextPageToken: ${result.nextPageToken}` : ""}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const listReportSchedulesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListReportSchedulesInputSchema,
  outputSchema: ListReportSchedulesOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "List all scheduled reports for a profile",
      input: {
        profileId: "123456",
      },
    },
  ],
  logic: listReportSchedulesLogic,
  responseFormatter: listReportSchedulesResponseFormatter,
};
