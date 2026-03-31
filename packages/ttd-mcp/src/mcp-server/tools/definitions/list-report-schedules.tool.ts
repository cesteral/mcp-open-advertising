// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_list_report_schedules";
const TOOL_TITLE = "List TTD Report Schedules";
const TOOL_DESCRIPTION = `List report schedules (saved recurring or one-time reports).

Returns all report schedules accessible to the authenticated partner.
Filter by advertiser IDs to narrow results.

Use \`ttd_get_report_schedule\` to fetch full details for a specific schedule.
Use \`ttd_delete_report_schedule\` to remove a schedule.`;

export const ListReportSchedulesInputSchema = z
  .object({
    advertiserIds: z
      .array(z.string())
      .optional()
      .describe("Filter to schedules belonging to these advertiser IDs"),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(50)
      .describe("Number of results per page (default 50, max 100)"),
    pageStartIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe("Zero-based start index for pagination"),
  })
  .describe("Parameters for listing TTD report schedules");

export const ListReportSchedulesOutputSchema = z
  .object({
    schedules: z.array(z.record(z.unknown())).describe("List of report schedule objects"),
    totalCount: z.number().optional(),
    pageSize: z.number(),
    pageStartIndex: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("List of report schedules");

type ListReportSchedulesInput = z.infer<typeof ListReportSchedulesInputSchema>;
type ListReportSchedulesOutput = z.infer<typeof ListReportSchedulesOutputSchema>;

export async function listReportSchedulesLogic(
  input: ListReportSchedulesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListReportSchedulesOutput> {
  const { ttdReportingService } = resolveSessionServices(sdkContext);

  const pageSize = input.pageSize ?? 50;
  const pageStartIndex = input.pageStartIndex ?? 0;

  const query: Record<string, unknown> = {
    PageSize: pageSize,
    PageStartIndex: pageStartIndex,
  };

  if (input.advertiserIds && input.advertiserIds.length > 0) {
    query.AdvertiserFilters = input.advertiserIds.map((id) => ({
      Type: "AdvertiserId",
      Value: id,
    }));
  }

  const result = (await ttdReportingService.listReportSchedules(query, context)) as Record<
    string,
    unknown
  >;

  const schedules = (result.Result as Array<Record<string, unknown>>) ?? [];
  const totalCount = result.TotalFilteredCount as number | undefined;

  return {
    schedules,
    totalCount,
    pageSize,
    pageStartIndex,
    timestamp: new Date().toISOString(),
  };
}

export function listReportSchedulesResponseFormatter(
  result: ListReportSchedulesOutput
): McpTextContent[] {
  if (result.schedules.length === 0) {
    return [
      {
        type: "text" as const,
        text: `No report schedules found.\n\nUse \`ttd_create_report_schedule\` to create one.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text:
        `Found ${result.schedules.length} report schedule(s)` +
        (result.totalCount !== undefined ? ` (${result.totalCount} total)` : "") +
        `:\n\n${JSON.stringify(result.schedules, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      label: "List all schedules",
      input: {},
    },
    {
      label: "Filter by advertiser",
      input: {
        advertiserIds: ["adv123"],
        pageSize: 25,
      },
    },
  ],
  logic: listReportSchedulesLogic,
  responseFormatter: listReportSchedulesResponseFormatter,
};
