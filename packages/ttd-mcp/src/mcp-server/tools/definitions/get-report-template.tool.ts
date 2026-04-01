// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_get_report_template";
const TOOL_TITLE = "Get TTD Report Template Structure (GraphQL)";
const TOOL_DESCRIPTION = `Retrieve the full structure of a report template via TTD GraphQL (\`derivedReportTemplate\`).

Returns all resultSets (tabs), fields, metrics, and conversion metrics with their column IDs and ordering. Also indicates whether the template is **derived** (contains fields/metrics no longer available to you via \`isDerived\`).

Use this before \`ttd_update_report_template\` to see the current structure and re-include columns you want to keep.
Use \`ttd_list_report_templates\` to find the template ID.`;

export const GetReportTemplateInputSchema = z
  .object({
    id: z.string().min(1).describe("ID of the report template to retrieve"),
  })
  .describe("Parameters for retrieving a TTD report template structure");

const TemplateColumnOutputSchema = z.object({
  columnId: z.string().optional(),
  columnType: z.string().optional(),
  name: z.string().optional(),
  columnOrder: z.number().optional(),
  includedInPivot: z.boolean().optional(),
  isOverlapColumn: z.boolean().optional(),
});

const TemplateResultSetOutputSchema = z.object({
  name: z.string().optional(),
  reportTypeId: z.string().optional(),
  reportTypeName: z.string().optional(),
  filters: z.array(z.object({ name: z.string().optional() })).optional(),
  fields: z.array(TemplateColumnOutputSchema).optional(),
  metrics: z.array(TemplateColumnOutputSchema).optional(),
  conversionMetrics: z.array(TemplateColumnOutputSchema).optional(),
});

export const GetReportTemplateOutputSchema = z
  .object({
    requestedReportTemplateId: z.string().optional(),
    isDerived: z
      .boolean()
      .optional()
      .describe("True if template contains fields/metrics no longer available to you"),
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

const GET_REPORT_TEMPLATE_QUERY = `query GetReportTemplate($id: String!) {
  derivedReportTemplate(id: $id) {
    ... on MyReportsGetDerivedTemplateResponse {
      requestedReportTemplateId
      isDerived
      name
      reportFormatType
      resultSets {
        name
        reportType {
          id
          name
        }
        filters {
          name
        }
        fields {
          columnId
          columnType
          name
          columnOrder
          includedInPivot
          isOverlapColumn
        }
        metrics {
          columnId
          columnType
          name
          columnOrder
          includedInPivot
          isOverlapColumn
        }
        conversionMetrics {
          columnId
          columnType
          name
          columnOrder
          includedInPivot
          isOverlapColumn
        }
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

  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const templateData =
    (gqlData.derivedReportTemplate as Record<string, unknown> | undefined) ?? {};

  const resultSets = templateData.resultSets as
    | Array<{
        name?: string;
        reportType?: { id?: string; name?: string };
        filters?: Array<{ name?: string }>;
        fields?: Array<Record<string, unknown>>;
        metrics?: Array<Record<string, unknown>>;
        conversionMetrics?: Array<Record<string, unknown>>;
      }>
    | undefined;

  return {
    requestedReportTemplateId: templateData.requestedReportTemplateId as string | undefined,
    isDerived: templateData.isDerived as boolean | undefined,
    name: templateData.name as string | undefined,
    reportFormatType: templateData.reportFormatType as string | undefined,
    resultSets: resultSets?.map((rs) => ({
      name: rs.name,
      reportTypeId: rs.reportType?.id,
      reportTypeName: rs.reportType?.name,
      filters: rs.filters as TemplateResultSetItem["filters"],
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
    result.isDerived
      ? `WARNING: This template contains fields/metrics no longer available to you (isDerived: true).`
      : `isDerived: false`,
    "",
  ];

  if (result.resultSets?.length) {
    lines.push(`Tabs (${result.resultSets.length}):`);
    result.resultSets.forEach((rs, i) => {
      lines.push(
        `\n  Tab ${i + 1}: ${rs.name ?? rs.reportTypeName ?? "unknown report type"}`
      );
      if (rs.reportTypeId || rs.reportTypeName) {
        lines.push(
          `    Report Type: ${rs.reportTypeName ?? "unknown"} (${rs.reportTypeId ?? "unknown id"})`
        );
      }
      if (rs.fields?.length) {
        lines.push(
          `    Fields (${rs.fields.length}): ${rs.fields
            .map((f) => `${f.name ?? "unknown"} [${f.columnId ?? "unknown"}]`)
            .join(", ")}`
        );
      }
      if (rs.metrics?.length) {
        lines.push(
          `    Metrics (${rs.metrics.length}): ${rs.metrics
            .map((m) => `${m.name ?? "unknown"} [${m.columnId ?? "unknown"}]`)
            .join(", ")}`
        );
      }
      if (rs.conversionMetrics?.length) {
        lines.push(
          `    Conversion Metrics (${rs.conversionMetrics.length}): ${rs.conversionMetrics
            .map((m) => `${m.name ?? "unknown"} [${m.columnId ?? "unknown"}]`)
            .join(", ")}`
        );
      }
    });
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
