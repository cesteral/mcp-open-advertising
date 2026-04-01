// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";
import { McpError, JsonRpcErrorCode } from "../../../utils/errors/index.js";

const TOOL_NAME = "ttd_list_report_templates";
const TOOL_TITLE = "List TTD Report Templates (GraphQL)";
const TOOL_DESCRIPTION = `List report template headers from TTD MyReports via GraphQL (\`myReportsReportTemplates\`).

This is the docs-aligned way to discover template IDs before retrieving structure with \`ttd_get_report_template\` or scheduling runs with \`ttd_create_template_schedule\`.

For backward compatibility, the legacy \`pageSize\` / \`pageStartIndex\` inputs remain available. GraphQL cursor pagination is preferred.

**Note:** If you receive an \`UNAUTHORIZED_FIELD_OR_TYPE\` error, your TTD account does not have MyReports API access enabled. Contact your TTD Account Manager or Technical Account Manager (TAM) to request this entitlement. Use \`GET /v3/myreports/reporttemplate/facets\` or \`POST /v3/myreports/reporttemplateheader/query\` once enabled.`;

export const ListReportTemplatesInputSchema = z
  .object({
    first: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(50)
      .describe("GraphQL page size (default 50, max 100)"),
    after: z
      .string()
      .optional()
      .describe("GraphQL end cursor from a previous call"),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Deprecated alias for first"),
    pageStartIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Deprecated REST-style offset. Only use when matching older callers."),
  })
  .describe("Parameters for listing TTD report templates");

export const ListReportTemplatesOutputSchema = z
  .object({
    templates: z.array(z.record(z.unknown())).describe("List of report template header objects"),
    totalCount: z.number().optional(),
    pageSize: z.number(),
    pageStartIndex: z.number().optional(),
    hasNextPage: z.boolean().optional(),
    endCursor: z.string().optional(),
    timestamp: z.string().datetime(),
  })
  .describe("List of report template headers");

type ListReportTemplatesInput = z.infer<typeof ListReportTemplatesInputSchema>;
type ListReportTemplatesOutput = z.infer<typeof ListReportTemplatesOutputSchema>;

const LIST_REPORT_TEMPLATES_QUERY = `query GetReportTemplates($first: Int, $after: String) {
  myReportsReportTemplates(first: $first, after: $after) {
    pageInfo {
      startCursor
      hasNextPage
      endCursor
    }
    totalCount
    nodes {
      id
      name
      userGenerated
      createdBy
      format
    }
  }
}`;

export async function listReportTemplatesLogic(
  input: ListReportTemplatesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListReportTemplatesOutput> {
  const { ttdReportingService, ttdService } = resolveSessionServices(sdkContext);

  const pageSize = input.first ?? input.pageSize ?? 50;
  const pageStartIndex = input.pageStartIndex;

  if (pageStartIndex !== undefined && pageStartIndex > 0 && !input.after) {
    const query = {
      PageSize: pageSize,
      PageStartIndex: pageStartIndex,
    };

    const result = (await ttdReportingService.listReportTemplates(query, context)) as Record<
      string,
      unknown
    >;

    const templates = (result.Result as Array<Record<string, unknown>>) ?? [];
    const totalCount = result.TotalFilteredCount as number | undefined;

    return {
      templates,
      totalCount,
      pageSize,
      pageStartIndex,
      timestamp: new Date().toISOString(),
    };
  }

  const raw = (await ttdService.graphqlQuery(
    LIST_REPORT_TEMPLATES_QUERY,
    { first: pageSize, after: input.after },
    context
  )) as Record<string, unknown>;

  const gqlErrors = raw.errors as Array<{ message: string; extensions?: { code?: string } }> | undefined;
  if (gqlErrors && gqlErrors.length > 0) {
    const unauthorized = gqlErrors.find(e => e.extensions?.code === "UNAUTHORIZED_FIELD_OR_TYPE");
    if (unauthorized) {
      throw new McpError(
        JsonRpcErrorCode.Forbidden,
        "TTD account does not have access to MyReports report templates (UNAUTHORIZED_FIELD_OR_TYPE). " +
        "This feature requires the MyReports permission in The Trade Desk. " +
        "Contact your TTD account manager or use ttd_graphql_query to verify your account's capabilities."
      );
    }
    throw new McpError(
      JsonRpcErrorCode.InternalError,
      `GraphQL error listing report templates: ${gqlErrors.map(e => e.message).join("; ")}`
    );
  }

  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const connection =
    (gqlData.myReportsReportTemplates as Record<string, unknown> | undefined) ?? {};
  const pageInfo = (connection.pageInfo as Record<string, unknown> | undefined) ?? {};

  return {
    templates: (connection.nodes as Array<Record<string, unknown>>) ?? [],
    totalCount: connection.totalCount as number | undefined,
    pageSize,
    pageStartIndex,
    hasNextPage: pageInfo.hasNextPage as boolean | undefined,
    endCursor: pageInfo.endCursor as string | undefined,
    timestamp: new Date().toISOString(),
  };
}

export function listReportTemplatesResponseFormatter(
  result: ListReportTemplatesOutput
): McpTextContent[] {
  if (result.templates.length === 0) {
    return [
      {
        type: "text" as const,
        text: `No report templates found.\n\nUse \`ttd_create_report_template\` to create one or verify access to existing MyReports templates.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  const cursorNotice =
    result.hasNextPage === true
      ? `\nNext page cursor: ${result.endCursor ?? "(missing endCursor)"}`
      : "";

  return [
    {
      type: "text" as const,
      text:
        `Found ${result.templates.length} report template(s)` +
        (result.totalCount !== undefined ? ` (${result.totalCount} total)` : "") +
        `:\n\n${JSON.stringify(result.templates, null, 2)}${cursorNotice}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const listReportTemplatesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListReportTemplatesInputSchema,
  outputSchema: ListReportTemplatesOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "List all templates",
      input: { first: 25 },
    },
    {
      label: "Continue from a cursor",
      input: {
        first: 10,
        after: "opaque-cursor-placeholder",
      },
    },
  ],
  logic: listReportTemplatesLogic,
  responseFormatter: listReportTemplatesResponseFormatter,
};
