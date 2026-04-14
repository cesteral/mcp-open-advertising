// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";
import { throwIfGraphqlErrors } from "../utils/graphql-errors.js";

const TOOL_NAME = "ttd_list_report_types";
const TOOL_TITLE = "List TTD Report Types (GraphQL)";
const TOOL_DESCRIPTION = `List all available report types from the TTD GraphQL API.

Returns the ID and name of each report type. Use the returned report type ID with \`ttd_get_report_type_schema\` to discover the available fields and metrics for that report type, then use those IDs when building a report template with \`ttd_create_report_template\`.`;

export const ListReportTypesInputSchema = z
  .object({
    format: z
      .enum(["EXCEL"])
      .default("EXCEL")
      .describe("Report format (currently only EXCEL is supported)"),
  })
  .describe("Parameters for listing TTD report types");

const ReportTypeItemSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const ListReportTypesOutputSchema = z
  .object({
    reportTypes: z.array(ReportTypeItemSchema).describe("Available report types"),
    count: z.number().describe("Number of report types returned"),
    timestamp: z.string().datetime(),
  })
  .describe("List of available TTD report types");

type ListReportTypesInput = z.infer<typeof ListReportTypesInputSchema>;
type ListReportTypesOutput = z.infer<typeof ListReportTypesOutputSchema>;

const LIST_REPORT_TYPES_QUERY = `query ListReportTypes($input: ReportTypesInput!) {
  reportTypes(input: $input) {
    id
    name
  }
}`;

export async function listReportTypesLogic(
  input: ListReportTypesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListReportTypesOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const raw = (await ttdService.graphqlQuery(
    LIST_REPORT_TYPES_QUERY,
    { input: { format: input.format ?? "EXCEL" } },
    context
  )) as Record<string, unknown>;

  throwIfGraphqlErrors(raw, "GraphQL error listing report types");

  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const reportTypes = (gqlData.reportTypes as Array<{ id: string; name: string }>) ?? [];

  return {
    reportTypes,
    count: reportTypes.length,
    timestamp: new Date().toISOString(),
  };
}

export function listReportTypesResponseFormatter(
  result: ListReportTypesOutput
): McpTextContent[] {
  if (result.reportTypes.length === 0) {
    return [
      {
        type: "text" as const,
        text: `No report types found for the specified format.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  const lines = result.reportTypes
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((rt) => `- ${rt.name} (ID: ${rt.id})`);

  return [
    {
      type: "text" as const,
      text:
        `Found ${result.count} report types:\n\n` +
        lines.join("\n") +
        `\n\nUse \`ttd_get_report_type_schema\` with a report type ID to see its available fields and metrics.\n\n` +
        `Timestamp: ${result.timestamp}`,
    },
  ];
}

export const listReportTypesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListReportTypesInputSchema,
  outputSchema: ListReportTypesOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "List all available report types",
      input: { format: "EXCEL" },
    },
  ],
  logic: listReportTypesLogic,
  responseFormatter: listReportTypesResponseFormatter,
};
