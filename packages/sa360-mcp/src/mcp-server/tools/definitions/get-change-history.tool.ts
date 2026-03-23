// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "sa360_get_change_history";
const TOOL_TITLE = "Get SA360 Change History";
const TOOL_DESCRIPTION = `Get change history for SA360 entities using the change_event resource.

Tracks entity modifications including what changed, when, and by which client. Useful for auditing campaign changes across engines.

**Filterable resource types:** CAMPAIGN, AD_GROUP, AD, KEYWORD, CRITERION`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const RESOURCE_TYPE_ENUM = [
  "CAMPAIGN",
  "AD_GROUP",
  "AD",
  "KEYWORD",
  "CRITERION",
] as const;

export const GetChangeHistoryInputSchema = z
  .object({
    customerId: z
      .string()
      .regex(/^\d+$/, "customerId must be numeric")
      .describe("SA360 customer ID (no dashes)"),
    startDate: z
      .string()
      .regex(DATE_PATTERN, "startDate must be YYYY-MM-DD")
      .describe("Start date for change history (YYYY-MM-DD)"),
    endDate: z
      .string()
      .regex(DATE_PATTERN, "endDate must be YYYY-MM-DD")
      .describe("End date for change history (YYYY-MM-DD)"),
    resourceType: z
      .enum(RESOURCE_TYPE_ENUM)
      .optional()
      .describe("Filter to a specific changed resource type"),
    limit: z
      .number()
      .min(1)
      .max(10000)
      .optional()
      .default(100)
      .describe("Max results to return (default 100)"),
  })
  .describe("Parameters for getting SA360 change history");

export const GetChangeHistoryOutputSchema = z
  .object({
    changes: z.array(z.record(z.any())).describe("Change event records"),
    totalChanges: z.number().describe("Number of changes returned"),
    timestamp: z.string().datetime(),
  })
  .describe("Change history results");

type GetChangeHistoryInput = z.infer<typeof GetChangeHistoryInputSchema>;
type GetChangeHistoryOutput = z.infer<typeof GetChangeHistoryOutputSchema>;

function buildChangeHistoryQuery(input: GetChangeHistoryInput): string {
  const selectFields = [
    "change_event.change_date_time",
    "change_event.change_resource_type",
    "change_event.changed_fields",
    "change_event.client_type",
    "change_event.old_resource",
    "change_event.new_resource",
    "change_event.resource_name",
  ].join(", ");

  const whereClauses: string[] = [
    `change_event.change_date_time >= '${input.startDate} 00:00:00'`,
    `change_event.change_date_time <= '${input.endDate} 23:59:59'`,
  ];

  if (input.resourceType) {
    whereClauses.push(
      `change_event.change_resource_type = '${input.resourceType}'`
    );
  }

  return `SELECT ${selectFields} FROM change_event WHERE ${whereClauses.join(" AND ")} ORDER BY change_event.change_date_time DESC LIMIT ${input.limit}`;
}

export async function getChangeHistoryLogic(
  input: GetChangeHistoryInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetChangeHistoryOutput> {
  const { sa360Service } = resolveSessionServices(sdkContext);

  const query = buildChangeHistoryQuery(input);

  const result = await sa360Service.sa360Search(
    input.customerId,
    query,
    input.limit,
    undefined,
    context
  );

  return {
    changes: result.results as unknown as Record<string, any>[],
    totalChanges: result.results.length,
    timestamp: new Date().toISOString(),
  };
}

export function getChangeHistoryResponseFormatter(result: GetChangeHistoryOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Change history: ${result.totalChanges} change(s) found\n\n${JSON.stringify(result.changes, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getChangeHistoryTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetChangeHistoryInputSchema,
  outputSchema: GetChangeHistoryOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Recent campaign changes",
      input: {
        customerId: "1234567890",
        startDate: "2026-03-01",
        endDate: "2026-03-16",
        resourceType: "CAMPAIGN",
        limit: 50,
      },
    },
    {
      label: "All changes in last week",
      input: {
        customerId: "1234567890",
        startDate: "2026-03-09",
        endDate: "2026-03-16",
      },
    },
  ],
  logic: getChangeHistoryLogic,
  responseFormatter: getChangeHistoryResponseFormatter,
};
