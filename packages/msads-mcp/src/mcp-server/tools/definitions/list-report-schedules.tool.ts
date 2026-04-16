// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "msads_list_report_schedules";
const TOOL_TITLE = "List Microsoft Ads Report Schedules";
const TOOL_DESCRIPTION = `List scheduled reports in Microsoft Advertising.

Note: The Microsoft Advertising API v13 JSON endpoints do not provide an endpoint to programmatically list all scheduled reports. This tool returns guidance on how to find existing schedules.

If Microsoft Advertising exposed such an endpoint, this tool would return an array of canonical \`ReportScheduleSummary\` entries (the same cross-platform shape used by \`ttd_list_report_schedules\` and \`cm360_list_report_schedules\`), mapped via the shared \`fromMsAdsSchedule\` normalizer, with the raw Microsoft Advertising envelopes preserved on a sibling \`raw\` field for platform-specific debugging.

To view scheduled reports: visit app.ads.microsoft.com → Reports → Scheduled Reports.
To manage schedules programmatically, track the scheduleIds returned by msads_create_report_schedule.`;

export const ListReportSchedulesInputSchema = z
  .object({})
  .describe("No parameters required");

export const ListReportSchedulesOutputSchema = z
  .object({
    note: z.string().describe("Guidance on how to list schedules"),
    timestamp: z.string().datetime(),
  })
  .describe("List schedules response");

type ListReportSchedulesInput = z.infer<typeof ListReportSchedulesInputSchema>;
type ListReportSchedulesOutput = z.infer<typeof ListReportSchedulesOutputSchema>;

export async function listReportSchedulesLogic(
  _input: ListReportSchedulesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListReportSchedulesOutput> {
  const { msadsReportingService } = resolveSessionServices(sdkContext);

  const result = await msadsReportingService.listReportSchedules(context);

  return {
    note: result.note,
    timestamp: new Date().toISOString(),
  };
}

export function listReportSchedulesResponseFormatter(result: ListReportSchedulesOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `${result.note}\n\nTimestamp: ${result.timestamp}`,
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
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "List all report schedules",
      input: {},
    },
  ],
  logic: listReportSchedulesLogic,
  responseFormatter: listReportSchedulesResponseFormatter,
};
