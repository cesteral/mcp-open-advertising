// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_get_report_executions";
const TOOL_TITLE = "Get TTD Report Schedule Executions (GraphQL)";
const TOOL_DESCRIPTION = `Primary tool for checking TTD report schedule status and retrieving download links via GraphQL.

Use this after \`ttd_create_template_schedule\` or \`ttd_rerun_report_schedule\` to check whether a report is ready and get the download link.

**Two modes:**
- **Single schedule** (provide \`scheduleId\`): Uses \`myReportsReportSchedule\` — fastest when you know the schedule ID. Returns status, filters, and all executions.
- **List mode** (omit \`scheduleId\`): Uses \`myReportsReportSchedules\` — supports pagination and optional filtering by recent execution activity via \`lastStatusChangeAfter\`.

**Download links** appear in \`delivery.downloadLink\` when an execution's \`state\` is \`COMPLETED\`.`;

export const GetReportExecutionsInputSchema = z
  .object({
    scheduleId: z
      .string()
      .optional()
      .describe(
        "If provided, fetch a single schedule by ID using myReportsReportSchedule"
      ),
    lastStatusChangeAfter: z
      .string()
      .optional()
      .describe(
        "ISO date filter for executions, e.g. 2025-07-01 (only used when scheduleId is not provided)"
      ),
    first: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10)
      .optional()
      .describe("Number of schedules to return (list mode only, default 10)"),
    after: z
      .string()
      .optional()
      .describe("Cursor for pagination (list mode only)"),
  })
  .describe("Parameters for retrieving TTD report schedule executions");

export const GetReportExecutionsOutputSchema = z
  .object({
    mode: z.enum(["single", "list"]),
    scheduleId: z.string().optional(),
    schedule: z.record(z.unknown()).optional(),
    schedules: z.array(z.record(z.unknown())).optional(),
    hasNextPage: z.boolean().optional(),
    endCursor: z.string().optional(),
    rawResponse: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime(),
  })
  .describe("Report schedule executions result");

type GetReportExecutionsInput = z.infer<typeof GetReportExecutionsInputSchema>;
type GetReportExecutionsOutput = z.infer<typeof GetReportExecutionsOutputSchema>;

const SINGLE_QUERY = `query GetReportSchedule($id: ID!) {
  myReportsReportSchedule(id: $id) {
    status
    filters {
      advertiserFilters { name }
      partnerFilters { name }
    }
    executions {
      nodes {
        reportStartDateInclusive
        reportEndDateExclusive
        lastStatusChangeDate
        state
        delivery {
          downloadLink
          deliveredDate
        }
      }
    }
  }
}`;

const LIST_QUERY = `query GetReportSchedules($where: MyReportsReportScheduleFilterInput, $first: Int, $after: String) {
  myReportsReportSchedules(where: $where, first: $first, after: $after) {
    nodes {
      name
      status
      filters {
        advertiserFilters { name }
        partnerFilters { name }
      }
      timezone
      executions {
        nodes {
          reportStartDateInclusive
          reportEndDateExclusive
          lastStatusChangeDate
          state
          delivery {
            downloadLink
            deliveredDate
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;

export async function getReportExecutionsLogic(
  input: GetReportExecutionsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportExecutionsOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  if (input.scheduleId) {
    const raw = (await ttdService.graphqlQuery(
      SINGLE_QUERY,
      { id: input.scheduleId },
      context
    )) as Record<string, unknown>;

    const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
    const schedule =
      (gqlData.myReportsReportSchedule as Record<string, unknown> | undefined) ?? {};

    return {
      mode: "single",
      scheduleId: input.scheduleId,
      schedule,
      rawResponse: raw,
      timestamp: new Date().toISOString(),
    };
  }

  // List mode
  let where: Record<string, unknown> | undefined;
  if (input.lastStatusChangeAfter) {
    where = {
      executions: {
        some: {
          lastStatusChangeDate: { gte: input.lastStatusChangeAfter },
        },
      },
    };
  }

  const raw = (await ttdService.graphqlQuery(
    LIST_QUERY,
    { where, first: input.first ?? 10, after: input.after },
    context
  )) as Record<string, unknown>;

  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const listResult =
    (gqlData.myReportsReportSchedules as Record<string, unknown> | undefined) ?? {};
  const nodes = (listResult.nodes as Array<Record<string, unknown>> | undefined) ?? [];
  const pageInfo = (listResult.pageInfo as Record<string, unknown> | undefined) ?? {};

  return {
    mode: "list",
    schedules: nodes,
    hasNextPage: pageInfo.hasNextPage as boolean | undefined,
    endCursor: pageInfo.endCursor as string | undefined,
    rawResponse: raw,
    timestamp: new Date().toISOString(),
  };
}

type ExecutionNode = {
  state?: string;
  reportStartDateInclusive?: string;
  reportEndDateExclusive?: string;
  lastStatusChangeDate?: string;
  delivery?: {
    downloadLink?: string;
    deliveredDate?: string;
  };
};

function formatExecutions(executions: ExecutionNode[]): string[] {
  if (!executions.length) return ["  (no executions)"];
  return executions.map((ex, i) => {
    const dateRange =
      ex.reportStartDateInclusive && ex.reportEndDateExclusive
        ? `${ex.reportStartDateInclusive} → ${ex.reportEndDateExclusive}`
        : "(date range unknown)";
    const downloadLink =
      ex.state === "COMPLETED" && ex.delivery?.downloadLink
        ? ex.delivery.downloadLink
        : "not available";
    return `  [${i + 1}] ${ex.state ?? "UNKNOWN"} | ${dateRange} | Download: ${downloadLink}`;
  });
}

function formatFilters(filters: Record<string, unknown> | undefined): string {
  if (!filters) return "(none)";
  const parts: string[] = [];
  const advertiserFilters = filters.advertiserFilters as Array<{ name?: string }> | undefined;
  const partnerFilters = filters.partnerFilters as Array<{ name?: string }> | undefined;
  if (advertiserFilters?.length) {
    parts.push(`Advertisers: ${advertiserFilters.map((f) => f.name ?? "?").join(", ")}`);
  }
  if (partnerFilters?.length) {
    parts.push(`Partners: ${partnerFilters.map((f) => f.name ?? "?").join(", ")}`);
  }
  return parts.length ? parts.join(" | ") : "(none)";
}

export function getReportExecutionsResponseFormatter(
  result: GetReportExecutionsOutput
): McpTextContent[] {
  if (result.mode === "single") {
    const schedule = result.schedule ?? {};

    if (!schedule || Object.keys(schedule).length === 0) {
      return [
        {
          type: "text" as const,
          text: `No report schedule found for ID: ${result.scheduleId ?? "(unknown)"}\n\nRaw response:\n${JSON.stringify(result.rawResponse, null, 2)}\n\nTimestamp: ${result.timestamp}`,
        },
      ];
    }

    const executionsData = schedule.executions as
      | { nodes?: ExecutionNode[] }
      | undefined;
    const executions = executionsData?.nodes ?? [];
    const filters = schedule.filters as Record<string, unknown> | undefined;

    const lines: string[] = [
      `Schedule ID: ${result.scheduleId ?? "(unknown)"}`,
      `Status: ${(schedule.status as string | undefined) ?? "unknown"}`,
      `Filters: ${formatFilters(filters)}`,
      "",
      `Executions (${executions.length}):`,
      ...formatExecutions(executions),
      "",
      `Timestamp: ${result.timestamp}`,
    ];

    return [{ type: "text" as const, text: lines.join("\n") }];
  }

  // List mode
  const schedules = result.schedules ?? [];

  if (!schedules.length) {
    return [
      {
        type: "text" as const,
        text: `No report schedules found.\n\nRaw response:\n${JSON.stringify(result.rawResponse, null, 2)}\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  const lines: string[] = [`Report Schedules (${schedules.length}):`, ""];

  schedules.forEach((sched, i) => {
    const executionsData = sched.executions as { nodes?: ExecutionNode[] } | undefined;
    const execNodes = executionsData?.nodes ?? [];
    const latest = execNodes[0];
    const latestState = latest?.state ?? "no executions";
    const latestDownload =
      latest?.state === "COMPLETED" && latest?.delivery?.downloadLink
        ? latest.delivery.downloadLink
        : "pending";

    lines.push(`  [${i + 1}] ${(sched.name as string | undefined) ?? "(unnamed)"} — ${(sched.status as string | undefined) ?? "unknown"}`);
    lines.push(`      Latest: ${latestState} | Download: ${latestDownload}`);
    lines.push("");
  });

  lines.push(
    `hasNextPage: ${result.hasNextPage ?? false} | cursor: ${result.endCursor ?? "(none)"}`
  );
  lines.push(`\nTimestamp: ${result.timestamp}`);

  return [{ type: "text" as const, text: lines.join("\n") }];
}

export const getReportExecutionsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetReportExecutionsInputSchema,
  outputSchema: GetReportExecutionsOutputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputExamples: [
    {
      label: "Check executions for a known schedule",
      input: {
        scheduleId: "sched-abc123",
      },
    },
    {
      label: "List schedules with recent activity",
      input: {
        lastStatusChangeAfter: "2025-07-01",
        first: 10,
      },
    },
    {
      label: "List all schedules (first page)",
      input: {
        first: 20,
      },
    },
  ],
  logic: getReportExecutionsLogic,
  responseFormatter: getReportExecutionsResponseFormatter,
};
