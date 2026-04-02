// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";
import {
  MYREPORTS_TEMPLATE_ACCESS_ERROR,
  throwIfGraphqlErrors,
} from "../utils/graphql-errors.js";

const TOOL_NAME = "ttd_create_report_template";
const TOOL_TITLE = "Create TTD Report Template (GraphQL)";
const TOOL_DESCRIPTION = `Create a user-defined report template via TTD GraphQL (\`myReportsTemplateCreate\`).

A report template defines the structure of a My Reports report — which report types to use and which columns/metrics to include. Templates can have up to 29 tabs (resultSets).

**Workflow:**
1. Use \`ttd_graphql_query\` with \`reportTypes\` to discover available report type IDs
2. Use \`ttd_graphql_query\` with \`reportType\` to get column/metric IDs for a report type
3. Call this tool to create the template
4. Use the returned template ID to schedule reports (\`ttd_create_template_schedule\`)

Use \`ttd_list_report_templates\` to see existing templates.`;

const ReportTemplateColumnSchema = z.object({
  columnId: z.string().describe("Column or metric ID (from reportType query)"),
  columnOrder: z.number().int().min(1).describe("Display order of this column in the report"),
  includedInPivot: z.boolean().describe("Whether to include this column in the Excel pivot table"),
});

const ReportTemplateResultSetSchema = z.object({
  name: z.string().describe("Tab name in the report"),
  reportTypeId: z.string().describe("Report type ID (from reportTypes query)"),
  fields: z.array(ReportTemplateColumnSchema).describe("Dimension fields to include"),
  metrics: z.array(ReportTemplateColumnSchema).describe("Metric columns to include"),
  conversionMetrics: z
    .array(ReportTemplateColumnSchema)
    .optional()
    .describe("Conversion metric columns to include (optional)"),
});

export const CreateReportTemplateInputSchema = z
  .object({
    name: z.string().min(1).describe("Name for the report template"),
    format: z
      .enum(["EXCEL"])
      .default("EXCEL")
      .describe("Report format (currently only EXCEL is supported)"),
    resultSets: z
      .array(ReportTemplateResultSetSchema)
      .min(1)
      .max(29)
      .describe("One or more tabs (up to 29) defining the report structure"),
  })
  .describe("Parameters for creating a TTD report template");

export const CreateReportTemplateOutputSchema = z
  .object({
    templateData: z.unknown().optional().describe("Raw data scalar returned by TTD (contains template ID)"),
    errors: z
      .array(z.object({ field: z.string().optional(), message: z.string() }))
      .optional()
      .describe("Mutation errors from TTD"),
    rawResponse: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime(),
  })
  .describe("Result of report template creation");

type CreateReportTemplateInput = z.infer<typeof CreateReportTemplateInputSchema>;
type CreateReportTemplateOutput = z.infer<typeof CreateReportTemplateOutputSchema>;


const CREATE_REPORT_TEMPLATE_MUTATION = `mutation CreateReportTemplate($input: MyReportsTemplateCreateInput!) {
  myReportsTemplateCreate(input: $input) {
    data { id }
    errors {
      ... on MyReportsTemplateCreateValidationError {
        message
      }
    }
  }
}`;

export async function createReportTemplateLogic(
  input: CreateReportTemplateInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateReportTemplateOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const variables = {
    input: {
      name: input.name,
      format: input.format,
      resultSets: input.resultSets,
    },
  };

  const raw = (await ttdService.graphqlQuery(
    CREATE_REPORT_TEMPLATE_MUTATION,
    variables,
    context
  )) as Record<string, unknown>;

  throwIfGraphqlErrors(raw, "GraphQL error creating report template", {
    unauthorizedMessage: MYREPORTS_TEMPLATE_ACCESS_ERROR,
  });

  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const mutationResult =
    (gqlData.myReportsTemplateCreate as Record<string, unknown> | undefined) ?? {};
  const errors = mutationResult.errors as
    | Array<{ field?: string; message: string }>
    | undefined;

  return {
    templateData: mutationResult.data,
    errors: errors?.length ? errors : undefined,
    rawResponse: raw as Record<string, unknown>,
    timestamp: new Date().toISOString(),
  };
}

export function createReportTemplateResponseFormatter(
  result: CreateReportTemplateOutput
): McpTextContent[] {
  if (result.errors?.length) {
    return [
      {
        type: "text" as const,
        text:
          `Report template creation failed:\n\n` +
          result.errors
            .map((e) => `- ${e.field ? `${e.field}: ` : ""}${e.message}`)
            .join("\n") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text:
        `Report template created successfully.\n\n` +
        `Template data: ${JSON.stringify(result.templateData, null, 2)}\n\n` +
        `Use the template ID with \`ttd_create_template_schedule\` to schedule reports.\n\n` +
        `Timestamp: ${result.timestamp}`,
    },
  ];
}

export const createReportTemplateTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: CreateReportTemplateInputSchema,
  outputSchema: CreateReportTemplateOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Create a single-tab performance report template",
      input: {
        name: "Weekly Performance Report",
        format: "EXCEL",
        resultSets: [
          {
            name: "Performance",
            reportTypeId: "60",
            fields: [
              { columnId: "21", columnOrder: 1, includedInPivot: true },
              { columnId: "1", columnOrder: 2, includedInPivot: false },
            ],
            metrics: [
              { columnId: "7", columnOrder: 3, includedInPivot: true },
              { columnId: "25", columnOrder: 4, includedInPivot: true },
            ],
          },
        ],
      },
    },
    {
      label: "Create a two-tab report template",
      input: {
        name: "Campaign + Data Element Report",
        format: "EXCEL",
        resultSets: [
          {
            name: "Performance",
            reportTypeId: "60",
            fields: [
              { columnId: "21", columnOrder: 1, includedInPivot: true },
              { columnId: "1", columnOrder: 2, includedInPivot: false },
            ],
            metrics: [
              { columnId: "4158", columnOrder: 3, includedInPivot: true },
              { columnId: "7", columnOrder: 4, includedInPivot: true },
            ],
          },
          {
            name: "Data Elements",
            reportTypeId: "2",
            fields: [
              { columnId: "10", columnOrder: 1, includedInPivot: false },
              { columnId: "49", columnOrder: 2, includedInPivot: false },
            ],
            metrics: [
              { columnId: "19", columnOrder: 3, includedInPivot: false },
              { columnId: "160", columnOrder: 4, includedInPivot: false },
            ],
          },
        ],
      },
    },
  ],
  logic: createReportTemplateLogic,
  responseFormatter: createReportTemplateResponseFormatter,
};
