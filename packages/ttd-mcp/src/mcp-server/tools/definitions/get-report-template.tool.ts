// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";
import { MYREPORTS_TEMPLATE_ACCESS_ERROR, throwIfGraphqlErrors } from "../utils/graphql-errors.js";

const TOOL_NAME = "ttd_get_report_template";
const TOOL_TITLE = "Get TTD Report Template Structure (GraphQL)";
const TOOL_DESCRIPTION = `Retrieve the full structure of a report template via TTD GraphQL (\`derivedReportTemplate\`).

Returns all resultSets (tabs), fields, metrics, and conversion metrics with their column ordering and pivot settings. Note: the API does not return column IDs or names — only \`columnOrder\`, \`includedInPivot\`, and \`isOverlapColumn\`. Use \`ttd_get_report_type_schema\` to map column positions back to field/metric definitions.

Use this before \`ttd_update_report_template\` to see the current structure and re-include columns you want to keep.
Use \`ttd_list_report_templates\` to find the template ID.`;

export const GetReportTemplateInputSchema = z
  .object({
    id: z.string().min(1).describe("ID of the report template to retrieve"),
  })
  .describe("Parameters for retrieving a TTD report template structure");

const TemplateColumnOutputSchema = z.object({
  columnOrder: z.number().optional(),
  includedInPivot: z.boolean().optional(),
  isOverlapColumn: z.boolean().optional(),
});

const TemplateResultSetOutputSchema = z.object({
  reportTypeName: z.string().optional(),
  fields: z.array(TemplateColumnOutputSchema).optional(),
  metrics: z.array(TemplateColumnOutputSchema).optional(),
  conversionMetrics: z.array(TemplateColumnOutputSchema).optional(),
});

export const GetReportTemplateOutputSchema = z
  .object({
    requestedReportTemplateId: z.string().optional(),
    name: z.string().optional(),
    reportFormatType: z.string().optional(),
    resultSets: z.array(TemplateResultSetOutputSchema).optional(),
    rawResponse: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime(),
  })
  .describe("Report template structure");

type GetReportTemplateInput = z.infer<typeof GetReportTemplateInputSchema>;
type GetReportTemplateOutput = z.infer<typeof GetReportTemplateOutputSchema>;
type TemplateResultSetItem = NonNullable<GetReportTemplateOutput["resultSets"]>[number];

const GET_REPORT_TEMPLATE_QUERY = `query GetReportTemplate($id: ID!) {
  derivedReportTemplate(id: $id) {
    ... on MyReportsGetDerivedTemplateResponse {
      requestedReportTemplateId
      name
      reportFormatType
      resultSets {
        reportType { name }
        fields { columnOrder includedInPivot isOverlapColumn }
        metrics { columnOrder includedInPivot isOverlapColumn }
        conversionMetrics { columnOrder includedInPivot isOverlapColumn }
      }
    }
  }
}`;

export async function getReportTemplateLogic(
  input: GetReportTemplateInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<GetReportTemplateOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const raw = (await ttdService.graphqlQuery(
    GET_REPORT_TEMPLATE_QUERY,
    { id: input.id },
    context
  )) as Record<string, unknown>;

  throwIfGraphqlErrors(raw, "GraphQL error retrieving report template", {
    unauthorizedMessage: MYREPORTS_TEMPLATE_ACCESS_ERROR,
  });

  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const templateData = (gqlData.derivedReportTemplate as Record<string, unknown> | undefined) ?? {};

  const resultSets = templateData.resultSets as
    | Array<{
        reportType?: { name?: string };
        fields?: Array<Record<string, unknown>>;
        metrics?: Array<Record<string, unknown>>;
        conversionMetrics?: Array<Record<string, unknown>>;
      }>
    | undefined;

  return {
    requestedReportTemplateId: templateData.requestedReportTemplateId as string | undefined,
    name: templateData.name as string | undefined,
    reportFormatType: templateData.reportFormatType as string | undefined,
    resultSets: resultSets?.map((rs) => ({
      reportTypeName: rs.reportType?.name,
      fields: rs.fields as TemplateResultSetItem["fields"],
      metrics: rs.metrics as TemplateResultSetItem["metrics"],
      conversionMetrics: rs.conversionMetrics as TemplateResultSetItem["conversionMetrics"],
    })),
    rawResponse: raw as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  };
}

export function getReportTemplateResponseFormatter(
  result: GetReportTemplateOutput
): McpTextContent[] {
  if (!result.requestedReportTemplateId && !result.name) {
    return [
      {
        type: "text" as const,
        text: `Report template response:\n\n${JSON.stringify(result.rawResponse, null, 2)}\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  const lines: string[] = [
    `Report Template: ${result.name ?? "(unnamed)"}`,
    `ID: ${result.requestedReportTemplateId ?? "unknown"}`,
    `Format: ${result.reportFormatType ?? "unknown"}`,
    "",
  ];

  if (result.resultSets?.length) {
    lines.push(`Tabs (${result.resultSets.length}):`);
    result.resultSets.forEach((rs, i) => {
      lines.push(`\n  Tab ${i + 1}: ${rs.reportTypeName ?? "unknown report type"}`);
      if (rs.fields?.length) {
        lines.push(
          `    Fields (${rs.fields.length}): ${rs.fields
            .map((f) => `order=${f.columnOrder ?? "?"}, pivot=${f.includedInPivot ?? "?"}`)
            .join("; ")}`
        );
      }
      if (rs.metrics?.length) {
        lines.push(
          `    Metrics (${rs.metrics.length}): ${rs.metrics
            .map((m) => `order=${m.columnOrder ?? "?"}, pivot=${m.includedInPivot ?? "?"}`)
            .join("; ")}`
        );
      }
      if (rs.conversionMetrics?.length) {
        lines.push(
          `    Conversion Metrics (${rs.conversionMetrics.length}): ${rs.conversionMetrics
            .map((m) => `order=${m.columnOrder ?? "?"}, pivot=${m.includedInPivot ?? "?"}`)
            .join("; ")}`
        );
      }
    });
    lines.push(
      `\nNote: Column IDs/names are not available from this endpoint. Use \`ttd_get_report_type_schema\` to map column positions.`
    );
  }

  lines.push(`\nTimestamp: ${result.timestamp}`);

  return [{ type: "text" as const, text: lines.join("\n") }];
}

export const getReportTemplateTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: GetReportTemplateInputSchema,
  outputSchema: GetReportTemplateOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Get full structure of a report template",
      input: {
        id: "template-id-placeholder",
      },
    },
  ],
  logic: getReportTemplateLogic,
  responseFormatter: getReportTemplateResponseFormatter,
};
