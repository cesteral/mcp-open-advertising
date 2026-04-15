// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  createReportView,
  formatReportViewResponse,
  getReportViewFetchLimit,
  ReportViewInputSchema,
  ReportViewOutputSchema,
} from "@cesteral/shared";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

const TOOL_NAME = "sa360_search";
const TOOL_TITLE = "SA360 Query Search";
const TOOL_DESCRIPTION = `Execute a Search Ads 360 query language query against any SA360 resource. Supports resource fields, segment fields, and metrics with SQL-like syntax (same syntax as GAQL).

SA360 is read-only — queries return data across Google Ads, Microsoft Ads, Yahoo Japan, and Baidu engines.`;

export const SA360SearchInputSchema = z
  .object({
    customerId: z
      .string()
      .min(1)
      .describe("SA360 customer ID (no dashes, e.g., '1234567890')"),
    query: z
      .string()
      .min(1)
      .describe("SA360 query string (must include SELECT and FROM clauses)"),
    pageSize: z
      .number()
      .min(1)
      .max(10000)
      .optional()
      .describe("Deprecated. Use maxRows for the returned row count."),
    pageToken: z
      .string()
      .optional()
      .describe("Page token for pagination (from previous response)"),
  })
  .merge(ReportViewInputSchema)
  .describe("Parameters for executing an SA360 query");

export const SA360SearchOutputSchema = z
  .object({
    ...ReportViewOutputSchema.shape,
    totalResultsCount: z.number().optional().describe("Total results available"),
    nextPageToken: z.string().optional().describe("Token for next page"),
    has_more: z.boolean().describe("Whether more results are available via pagination"),
    timestamp: z.string().datetime(),
  })
  .describe("SA360 search results");

type SA360SearchInput = z.infer<typeof SA360SearchInputSchema>;
type SA360SearchOutput = z.infer<typeof SA360SearchOutputSchema>;

export async function sa360SearchLogic(
  input: SA360SearchInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<SA360SearchOutput> {
  const { sa360Service } = resolveSessionServices(sdkContext);
  const viewInput = input.maxRows === undefined && input.pageSize !== undefined
    ? { ...input, maxRows: input.pageSize }
    : input;

  const result = await sa360Service.sa360Search(
    input.customerId,
    input.query,
    getReportViewFetchLimit(viewInput),
    input.pageToken,
    context
  );
  const rows = result.results as unknown as Record<string, unknown>[];

  return {
    ...createReportView({
      rows,
      totalRows: result.totalResultsCount ?? rows.length + (result.nextPageToken ? 1 : 0),
      input: viewInput,
      warnings: result.nextPageToken ? ["More rows are available. Call again with pageToken set to nextPageToken to continue."] : [],
    }),
    totalResultsCount: result.totalResultsCount,
    nextPageToken: result.nextPageToken,
    has_more: !!result.nextPageToken,
    timestamp: new Date().toISOString(),
  };
}

export function sa360SearchResponseFormatter(result: SA360SearchOutput): McpTextContent[] {
  const summary = `SA360 query returned ${result.returnedRows} result(s)${
    result.totalResultsCount ? ` (${result.totalResultsCount} total)` : ""
  }${result.nextPageToken ? " — more pages available" : ""}`;

  return [
    {
      type: "text" as const,
      text: `${summary}\n\n${formatReportViewResponse(result, "Query data")}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const sa360SearchTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: SA360SearchInputSchema,
  outputSchema: SA360SearchOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Campaign performance metrics",
      input: {
        customerId: "1234567890",
        query: "SELECT campaign.id, campaign.name, campaign.engine_id, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.impressions DESC LIMIT 50",
      },
    },
    {
      label: "Cross-engine ad group performance",
      input: {
        customerId: "1234567890",
        query: "SELECT ad_group.id, ad_group.name, ad_group.engine_id, metrics.impressions, metrics.conversions FROM ad_group WHERE campaign.id = 123456789 AND segments.date DURING LAST_7_DAYS",
        mode: "rows",
        maxRows: 50,
      },
    },
  ],
  logic: sa360SearchLogic,
  responseFormatter: sa360SearchResponseFormatter,
};
