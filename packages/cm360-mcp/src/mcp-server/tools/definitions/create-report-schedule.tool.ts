// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";
import {
  buildTypedReportConfig,
  CM360ReportTypeSchema,
  CM360ScheduleSchema,
  genericCriteriaSchema,
  getReportCriteriaFromConfig,
  validateScheduleCompatibility,
  validateTypedCriteriaUsage,
} from "../utils/report-config.js";

const TOOL_NAME = "cm360_create_report_schedule";
const TOOL_TITLE = "Create CM360 Report Schedule";
const TOOL_DESCRIPTION = `Create a CM360 report with a recurring schedule.

CM360 schedules are embedded in the report resource itself. The returned reportId is your schedule handle — use it with cm360_list_report_schedules and cm360_delete_report_schedule.

**Schedule frequency values:** DAILY, WEEKLY, MONTHLY, QUARTERLY, YEARLY

**Example schedule object:**
\`\`\`json
{
  "active": true,
  "every": 1,
  "repeats": "WEEKLY",
  "repeatsOnWeekDays": ["MONDAY"],
  "startDate": "2026-04-01",
  "expirationDate": "2026-12-31"
}
\`\`\``;

export const CreateReportScheduleInputSchema = z
  .object({
    profileId: z.string().min(1).describe("CM360 User Profile ID"),
    name: z.string().min(1).describe("Name for the scheduled report"),
    type: CM360ReportTypeSchema.describe("Report type"),
    schedule: CM360ScheduleSchema.describe("Schedule configuration"),
    criteria: genericCriteriaSchema.optional().describe("Criteria for STANDARD reports"),
    reachCriteria: genericCriteriaSchema.optional().describe("Criteria for REACH reports"),
    pathToConversionCriteria: genericCriteriaSchema
      .optional()
      .describe("Criteria for PATH_TO_CONVERSION reports"),
    floodlightCriteria: genericCriteriaSchema
      .optional()
      .describe("Criteria for FLOODLIGHT reports"),
    crossMediaReachCriteria: genericCriteriaSchema
      .optional()
      .describe("Criteria for CROSS_MEDIA_REACH reports"),
    delivery: z
      .record(z.any())
      .optional()
      .describe("Delivery configuration (emailOwner, recipients, etc.)"),
    additionalConfig: z
      .record(z.any())
      .optional()
      .describe("Additional report configuration fields"),
  })
  .superRefine((input, ctx) => {
    validateTypedCriteriaUsage(input as Parameters<typeof validateTypedCriteriaUsage>[0], ctx);
    validateScheduleCompatibility(input.type, getReportCriteriaFromConfig(input, input.type), ctx);
  })
  .describe("Parameters for creating a scheduled CM360 report");

export const CreateReportScheduleOutputSchema = z
  .object({
    reportId: z.string().describe("Report ID (use as schedule handle)"),
    reportName: z.string(),
    schedule: z.record(z.any()).describe("Schedule as returned by CM360"),
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
  const { cm360ReportingService } = resolveSessionServices(sdkContext);

  const reportConfig = {
    ...buildTypedReportConfig(input),
    schedule: input.schedule as Record<string, unknown>,
    ...(input.delivery ? { delivery: input.delivery } : {}),
  };

  const result = await cm360ReportingService.createReportSchedule(
    input.profileId,
    reportConfig as Parameters<typeof cm360ReportingService.createReportSchedule>[1],
    context
  );

  return {
    reportId: result.reportId,
    reportName: result.reportName,
    schedule: result.schedule,
    timestamp: new Date().toISOString(),
  };
}

export function createReportScheduleResponseFormatter(
  result: CreateReportScheduleOutput
): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Scheduled report created: ${result.reportId}\nName: ${result.reportName}\nSchedule: ${JSON.stringify(result.schedule, null, 2)}\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Weekly standard report every Monday",
      input: {
        profileId: "123456",
        name: "Weekly Campaign Performance",
        type: "STANDARD",
        schedule: {
          active: true,
          every: 1,
          repeats: "WEEKLY",
          repeatsOnWeekDays: ["MONDAY"],
          startDate: "2026-04-07",
          expirationDate: "2026-12-31",
        },
        criteria: {
          dateRange: { relativeDateRange: "LAST_7_DAYS" },
          metricNames: ["impressions", "clicks", "mediaCost"],
        },
      },
    },
    {
      label: "Monthly floodlight report",
      input: {
        profileId: "123456",
        name: "Monthly Floodlight Summary",
        type: "FLOODLIGHT",
        schedule: {
          active: true,
          every: 1,
          repeats: "MONTHLY",
          runsOnDayOfMonth: "DAY_OF_MONTH",
          startDate: "2026-04-01",
        },
        floodlightCriteria: {
          dateRange: { relativeDateRange: "LAST_MONTH" },
          metricNames: ["floodlightImpressions", "floodlightRevenue"],
        },
      },
    },
  ],
  logic: createReportScheduleLogic,
  responseFormatter: createReportScheduleResponseFormatter,
};
