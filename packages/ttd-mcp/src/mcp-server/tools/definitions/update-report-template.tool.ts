// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";
import {
  MYREPORTS_TEMPLATE_ACCESS_ERROR,
  throwIfGraphqlErrors,
} from "../utils/graphql-errors.js";

const TOOL_NAME = "ttd_update_report_template";
const TOOL_TITLE = "Update TTD Report Template (GraphQL)";
const TOOL_DESCRIPTION = `Update an existing report template via TTD GraphQL (\`myReportsTemplateUpdate\`).

**IMPORTANT:** The updated structure **completely replaces** the existing template. You must re-include all fields and metrics you want to keep — any omitted columns will be removed.

Use \`ttd_get_report_template\` first to retrieve the current template structure before updating.
Use \`ttd_list_report_templates\` to find the template ID.
Use \`ttd_list_report_types\` and \`ttd_get_report_type_schema\` to discover available fields and metrics.`;

const ReportTemplateColumnSchema = z.object({
  columnId: z.string().describe("Column or metric ID"),
  columnOrder: z.number().int().min(1).describe("Display order of this column in the report"),
  includedInPivot: z.boolean().describe("Whether to include this column in the Excel pivot table"),
});

const ReportTemplateResultSetSchema = z.object({
  name: z.string().describe("Tab name in the report"),
  reportTypeId: z.string().describe("Report type ID"),
  fields: z.array(ReportTemplateColumnSchema).describe("Dimension fields to include"),
  metrics: z.array(ReportTemplateColumnSchema).describe("Metric columns to include"),
  conversionMetrics: z
    .array(ReportTemplateColumnSchema)
    .optional()
    .describe("Conversion metric columns to include (optional)"),
});

export const UpdateReportTemplateInputSchema = z
  .object({
    id: z.string().min(1).describe("ID of the report template to update"),
    name: z.string().min(1).describe("New name for the report template"),
    resultSets: z
      .array(ReportTemplateResultSetSchema)
      .min(1)
      .max(29)
      .describe(
        "Complete new tab structure (up to 29 tabs). Replaces the existing structure entirely — re-include all columns you want to keep."
      ),
  })
  .describe("Parameters for updating a TTD report template");

export const UpdateReportTemplateOutputSchema = z
  .object({
    templateData: z.unknown().optional().describe("Raw data scalar returned by TTD"),
    errors: z
      .array(z.object({ field: z.string().optional(), message: z.string() }))
      .optional()
      .describe("Mutation errors from TTD"),
    rawResponse: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime(),
  })
  .describe("Result of report template update");

type UpdateReportTemplateInput = z.infer<typeof UpdateReportTemplateInputSchema>;
type UpdateReportTemplateOutput = z.infer<typeof UpdateReportTemplateOutputSchema>;

const UPDATE_REPORT_TEMPLATE_MUTATION = `mutation UpdateReportTemplate($input: MyReportsTemplateUpdateInput!) {
  myReportsTemplateUpdate(input: $input) {
    data
    errors {
      __typename
      ... on MutationError {
        field
        message
      }
    }
  }
}`;

export async function updateReportTemplateLogic(
  input: UpdateReportTemplateInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateReportTemplateOutput> {
  const { ttdService } = resolveSessionServices(sdkContext);

  const variables = {
    input: {
      id: input.id,
      name: input.name,
      resultSets: input.resultSets,
    },
  };

  const raw = (await ttdService.graphqlQuery(
    UPDATE_REPORT_TEMPLATE_MUTATION,
    variables,
    context
  )) as Record<string, unknown>;

  throwIfGraphqlErrors(raw, "GraphQL error updating report template", {
    unauthorizedMessage: MYREPORTS_TEMPLATE_ACCESS_ERROR,
  });

  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const mutationResult =
    (gqlData.myReportsTemplateUpdate as Record<string, unknown> | undefined) ?? {};
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

export function updateReportTemplateResponseFormatter(
  result: UpdateReportTemplateOutput
): McpTextContent[] {
  if (result.errors?.length) {
    return [
      {
        type: "text" as const,
        text:
          `Report template update failed:\n\n` +
          result.errors
            .map((e) => `- ${e.field ? `${e.field}: ` : ""}${e.message}`)
            .join("\n") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (!result.templateData) {
    return [
      {
        type: "text" as const,
        text:
          `Report template update returned no template data. The mutation may not have executed.\n\n` +
          `This usually means the API token lacks MyReports write access. ` +
          `Check the raw response for details:\n\n` +
          `${JSON.stringify(result.rawResponse, null, 2)}\n\n` +
          `Timestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text:
        `Report template updated successfully.\n\n` +
        `Template data: ${JSON.stringify(result.templateData, null, 2)}\n\n` +
        `Timestamp: ${result.timestamp}`,
    },
  ];
}

export const updateReportTemplateTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateReportTemplateInputSchema,
  outputSchema: UpdateReportTemplateOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: true,
    idempotentHint: false,
  },
  inputExamples: [
    {
      label: "Update a report template with new columns",
      input: {
        id: "template-id-placeholder",
        name: "Updated Weekly Report",
        resultSets: [
          {
            name: "Tab 1",
            reportTypeId: "60",
            fields: [
              { columnId: "10", columnOrder: 1, includedInPivot: true },
              { columnId: "1", columnOrder: 2, includedInPivot: false },
            ],
            metrics: [
              { columnId: "7", columnOrder: 3, includedInPivot: true },
              { columnId: "25", columnOrder: 4, includedInPivot: true },
              { columnId: "58", columnOrder: 5, includedInPivot: true },
            ],
          },
        ],
      },
    },
  ],
  logic: updateReportTemplateLogic,
  responseFormatter: updateReportTemplateResponseFormatter,
};
