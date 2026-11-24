// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { assertAccountScope, buildPaginationOutput, PaginationOutputSchema } from "@cesteral/shared";
import type { RequestContext, McpTextContent, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "{{key}}_get_report";
const TOOL_TITLE = "Get {{displayName}} Report";
const TOOL_DESCRIPTION = `Get {{displayName}} performance rows for an account and date range, synchronously.

Pass \`pagination.nextCursor\` from a response as \`pageToken\` to read the next page.`;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const GetReportInputSchema = z
  .object({
    accountId: z.string().min(1).describe("{{displayName}} account ID"),
    startDate: z.string().regex(DATE).describe("First day, YYYY-MM-DD"),
    endDate: z.string().regex(DATE).describe("Last day, YYYY-MM-DD"),
    dimensions: z.array(z.string().min(1)).optional().describe("Dimensions to break rows down by"),
    metrics: z.array(z.string().min(1)).optional().describe("Metrics to return"),
    pageToken: z
      .string()
      .optional()
      .describe("Cursor for the next page (pagination.nextCursor of the previous response)"),
  })
  .describe("Parameters for a {{displayName}} report");

export const GetReportOutputSchema = z
  .object({
    rows: z.array(z.record(z.string(), z.any())).describe("Report rows"),
    pagination: PaginationOutputSchema,
    timestamp: z.string().datetime(),
  })
  .describe("Report result");

type GetReportInput = z.infer<typeof GetReportInputSchema>;
type GetReportOutput = z.infer<typeof GetReportOutputSchema>;

export async function getReportLogic(
  input: GetReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportOutput> {
  const { {{key}}Service, boundAccountId } = resolveSessionServices(sdkContext);
  assertAccountScope(input.accountId, boundAccountId, "accountId");
  const { accountId, ...query } = input;
  const result = await {{key}}Service.getReport(accountId, query, context);
  return {
    rows: result.items,
    pagination: buildPaginationOutput({
      nextCursor: result.nextPageToken,
      pageSize: result.items.length,
      nextPageInputKey: "pageToken",
    }),
    timestamp: new Date().toISOString(),
  };
}

export function getReportResponseFormatter(result: GetReportOutput): McpTextContent[] {
  return [
    {
      type: "text" as const,
      text: `Report: ${result.pagination.pageSize} rows\n\n${JSON.stringify(result.rows, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const getReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetReportInputSchema,
  outputSchema: GetReportOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Last week's totals",
      input: { accountId: "1234567890", startDate: "2026-11-01", endDate: "2026-11-07" },
    },
  ],
  logic: getReportLogic,
  responseFormatter: getReportResponseFormatter,
  untrustedContent: {
    structuredPaths: ["$.rows"],
    contentBlocks: [0],
  },
};
