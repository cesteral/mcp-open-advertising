// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";
import { throwIfGraphqlErrors } from "../utils/graphql-errors.js";

const TOOL_NAME = "ttd_get_report_type_schema";
const TOOL_TITLE = "Get TTD Report Type Schema (GraphQL)";
const TOOL_DESCRIPTION = `Get the full field and metric schema for a TTD report type.

Returns all available dimension fields and metrics with their IDs and names. Use these IDs when building report templates with \`ttd_create_report_template\` or \`ttd_update_report_template\`.

Auto-paginates to return ALL fields and metrics (the GraphQL API paginates by default).

Use \`ttd_list_report_types\` first to discover available report type IDs.`;

export const GetReportTypeSchemaInputSchema = z
  .object({
    reportTypeId: z.string().min(1).describe("Report type ID (from ttd_list_report_types)"),
    format: z
      .enum(["EXCEL"])
      .default("EXCEL")
      .describe("Report format (currently only EXCEL is supported)"),
  })
  .describe("Parameters for getting a TTD report type schema");

const SchemaColumnSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const GetReportTypeSchemaOutputSchema = z
  .object({
    reportTypeId: z.string(),
    reportTypeName: z.string(),
    fields: z.array(SchemaColumnSchema).describe("Dimension fields available for this report type"),
    metrics: z.array(SchemaColumnSchema).describe("Metrics available for this report type"),
    timestamp: z.string().datetime(),
  })
  .describe("Full field and metric schema for a TTD report type");

type GetReportTypeSchemaInput = z.infer<typeof GetReportTypeSchemaInputSchema>;
type GetReportTypeSchemaOutput = z.infer<typeof GetReportTypeSchemaOutputSchema>;

const PAGE_SIZE = 100;

const GET_REPORT_TYPE_SCHEMA_QUERY = `query GetReportTypeSchema(
  $input: ReportTypeInput!,
  $fieldsFirst: Int,
  $fieldsAfter: String,
  $metricsFirst: Int,
  $metricsAfter: String
) {
  reportType(input: $input) {
    id
    name
    fields(first: $fieldsFirst, after: $fieldsAfter) {
      pageInfo { hasNextPage endCursor }
      nodes { id name }
    }
    metrics(first: $metricsFirst, after: $metricsAfter) {
      pageInfo { hasNextPage endCursor }
      nodes { id name }
    }
  }
}`;

const PAGINATE_FIELDS_QUERY = `query PaginateFields($input: ReportTypeInput!, $first: Int, $after: String) {
  reportType(input: $input) {
    fields(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id name }
    }
  }
}`;

const PAGINATE_METRICS_QUERY = `query PaginateMetrics($input: ReportTypeInput!, $first: Int, $after: String) {
  reportType(input: $input) {
    metrics(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id name }
    }
  }
}`;

interface ConnectionPage {
  pageInfo?: { hasNextPage?: boolean; endCursor?: string };
  nodes?: Array<{ id: string; name: string }>;
}

export async function getReportTypeSchemaLogic(
  input: GetReportTypeSchemaInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportTypeSchemaOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const gqlInput = { format: input.format, reportTypeId: input.reportTypeId };

  // First request: get report type info + first page of both fields and metrics
  const raw = (await ttdService.graphqlQuery(
    GET_REPORT_TYPE_SCHEMA_QUERY,
    {
      input: gqlInput,
      fieldsFirst: PAGE_SIZE,
      fieldsAfter: null,
      metricsFirst: PAGE_SIZE,
      metricsAfter: null,
    },
    context
  )) as Record<string, unknown>;

  throwIfGraphqlErrors(raw, "GraphQL error fetching report type schema");

  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const reportType = (gqlData.reportType as Record<string, unknown> | undefined) ?? {};

  const reportTypeId = (reportType.id as string) ?? input.reportTypeId;
  const reportTypeName = (reportType.name as string) ?? "Unknown";

  // Collect fields with pagination
  const fieldsConnection = (reportType.fields as ConnectionPage) ?? {};
  const allFields: Array<{ id: string; name: string }> = [
    ...(fieldsConnection.nodes ?? []),
  ];
  let fieldsHasNext = fieldsConnection.pageInfo?.hasNextPage ?? false;
  let fieldsAfter = fieldsConnection.pageInfo?.endCursor;

  while (fieldsHasNext && fieldsAfter) {
    const page = (await ttdService.graphqlQuery(
      PAGINATE_FIELDS_QUERY,
      { input: gqlInput, first: PAGE_SIZE, after: fieldsAfter },
      context
    )) as Record<string, unknown>;
    throwIfGraphqlErrors(page, "GraphQL error paginating report type fields");
    const pageData = (page.data as Record<string, unknown> | undefined) ?? {};
    const pageReportType = (pageData.reportType as Record<string, unknown> | undefined) ?? {};
    const conn = (pageReportType.fields as ConnectionPage) ?? {};
    allFields.push(...(conn.nodes ?? []));
    fieldsHasNext = conn.pageInfo?.hasNextPage ?? false;
    fieldsAfter = conn.pageInfo?.endCursor;
  }

  // Collect metrics with pagination
  const metricsConnection = (reportType.metrics as ConnectionPage) ?? {};
  const allMetrics: Array<{ id: string; name: string }> = [
    ...(metricsConnection.nodes ?? []),
  ];
  let metricsHasNext = metricsConnection.pageInfo?.hasNextPage ?? false;
  let metricsAfter = metricsConnection.pageInfo?.endCursor;

  while (metricsHasNext && metricsAfter) {
    const page = (await ttdService.graphqlQuery(
      PAGINATE_METRICS_QUERY,
      { input: gqlInput, first: PAGE_SIZE, after: metricsAfter },
      context
    )) as Record<string, unknown>;
    throwIfGraphqlErrors(page, "GraphQL error paginating report type metrics");
    const pageData = (page.data as Record<string, unknown> | undefined) ?? {};
    const pageReportType = (pageData.reportType as Record<string, unknown> | undefined) ?? {};
    const conn = (pageReportType.metrics as ConnectionPage) ?? {};
    allMetrics.push(...(conn.nodes ?? []));
    metricsHasNext = conn.pageInfo?.hasNextPage ?? false;
    metricsAfter = conn.pageInfo?.endCursor;
  }

  return {
    reportTypeId,
    reportTypeName,
    fields: allFields,
    metrics: allMetrics,
    timestamp: new Date().toISOString(),
  };
}

export function getReportTypeSchemaResponseFormatter(
  result: GetReportTypeSchemaOutput
): McpTextContent[] {
  const fieldLines = result.fields
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => `  - ${f.name} (ID: ${f.id})`);

  const metricLines = result.metrics
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => `  - ${m.name} (ID: ${m.id})`);

  return [
    {
      type: "text" as const,
      text:
        `Report Type: ${result.reportTypeName} (ID: ${result.reportTypeId})\n\n` +
        `Fields (${result.fields.length} dimensions):\n${fieldLines.join("\n")}\n\n` +
        `Metrics (${result.metrics.length}):\n${metricLines.join("\n")}\n\n` +
        `Use these IDs with \`ttd_create_report_template\` or \`ttd_update_report_template\` ` +
        `to build report templates.\n\n` +
        `Timestamp: ${result.timestamp}`,
    },
  ];
}

export const getReportTypeSchemaTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetReportTypeSchemaInputSchema,
  outputSchema: GetReportTypeSchemaOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Get schema for Performance (100 days) report type",
      input: { reportTypeId: "1", format: "EXCEL" },
    },
    {
      label: "Get schema for Data Element report type",
      input: { reportTypeId: "2" },
    },
  ],
  logic: getReportTypeSchemaLogic,
  responseFormatter: getReportTypeSchemaResponseFormatter,
};
