// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_create_report_schedule";
const TOOL_TITLE = "Create Microsoft Ads Report Schedule";
const TOOL_DESCRIPTION = `Create a scheduled report request in Microsoft Advertising.

Submits a report request with a Schedule object, which Microsoft Advertising will re-run on the configured frequency. Returns a scheduleId to reference this schedule.

**Frequency values:** Daily, Weekly, Monthly

**Example schedule:**
\`\`\`json
{
  "StartDate": "2026-04-07",
  "EndDate": "2026-12-31",
  "Frequency": "Weekly"
}
\`\`\`

Note: Microsoft Advertising's API has limited schedule management. Use the UI at app.ads.microsoft.com to view, edit, or delete existing schedules.`;

export const CreateReportScheduleInputSchema = z
  .object({
    accountId: z.string().describe("Microsoft Ads Account ID"),
    scheduleName: z.string().min(1).describe("Name for the scheduled report"),
    reportType: z.string().describe("Report type (e.g., CampaignPerformanceReportRequest)"),
    columns: z.array(z.string()).min(1).describe("Report columns to include"),
    startDate: z.string().describe("Report data start date (YYYY-MM-DD)"),
    endDate: z.string().describe("Report data end date (YYYY-MM-DD)"),
    aggregation: z
      .string()
      .optional()
      .describe("Time aggregation (Daily, Weekly, Monthly). Default: Daily"),
    schedule: z
      .object({
        StartDate: z.string().describe("Schedule start date (YYYY-MM-DD)"),
        EndDate: z.string().optional().describe("Schedule end date (YYYY-MM-DD)"),
        Frequency: z.enum(["Daily", "Weekly", "Monthly"]).describe("How often the report runs"),
      })
      .describe("Schedule configuration"),
  })
  .describe("Parameters for creating a scheduled Microsoft Ads report");

export const CreateReportScheduleOutputSchema = z
  .object({
    scheduleId: z.string().describe("Schedule ID (ReportRequestId of first scheduled run)"),
    scheduleName: z.string(),
    timestamp: z.string().datetime(),
  })
  .describe("Created report schedule");

type CreateReportScheduleInput = z.infer<typeof CreateReportScheduleInputSchema>;
type CreateReportScheduleOutput = z.infer<typeof CreateReportScheduleOutputSchema>;

export async function createReportScheduleLogic(
  input: CreateReportScheduleInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateReportScheduleOutput> {
  const { msadsReportingService } = resolveSessionServices(sdkContext);

  const result = await msadsReportingService.createReportSchedule(
    {
      reportType: input.reportType,
      accountId: input.accountId,
      columns: input.columns,
      dateRange: { startDate: input.startDate, endDate: input.endDate },
      aggregation: input.aggregation,
      scheduleName: input.scheduleName,
      schedule: input.schedule as Record<string, unknown>,
    },
    context
  );

  return {
    scheduleId: result.scheduleId,
    scheduleName: result.scheduleName,
    timestamp: new Date().toISOString(),
  };
}

export function createReportScheduleResponseFormatter(
  result: CreateReportScheduleOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Scheduled report created: ${result.scheduleId}\nName: ${result.scheduleName}\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const createReportScheduleTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateReportScheduleInputSchema,
  outputSchema: CreateReportScheduleOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Weekly campaign performance schedule",
      input: {
        accountId: "123456789",
        scheduleName: "Weekly Campaign Report",
        reportType: "CampaignPerformanceReportRequest",
        columns: ["CampaignName", "Impressions", "Clicks", "Spend", "Conversions"],
        startDate: "2026-04-07",
        endDate: "2026-04-13",
        aggregation: "Daily",
        schedule: {
          StartDate: "2026-04-07",
          EndDate: "2026-12-31",
          Frequency: "Weekly",
        },
      },
    },
  ],
  logic: createReportScheduleLogic,
  responseFormatter: createReportScheduleResponseFormatter,
};
