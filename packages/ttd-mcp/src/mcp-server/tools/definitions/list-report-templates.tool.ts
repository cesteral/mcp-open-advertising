// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import type { McpTextContent, RequestContext, SdkContext } from "@cesteral/shared";

const TOOL_NAME = "ttd_list_report_templates";
const TOOL_TITLE = "List TTD Report Templates";
const TOOL_DESCRIPTION = `List report template headers from TTD MyReports.

Report templates define the structure of a report (dimensions, metrics, filters).
Templates can be created in the TTD UI or via the API using \`ttd_create_report_template\`.

Template IDs returned here can be used with:
- \`ttd_create_template_schedule\` — create a recurring or one-time report schedule from a template (GraphQL)
- \`additionalConfig.ReportTemplateId\` — legacy REST schedule creation via \`ttd_create_report_schedule\`

Use \`ttd_get_report_template\` to retrieve the full structure (fields, metrics, tabs) of a specific template.

**Note:** This returns template *headers* (metadata), not full template definitions.`;

export const ListReportTemplatesInputSchema = z
  .object({
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(50)
      .describe("Number of results per page (default 50, max 100)"),
    pageStartIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe("Zero-based start index for pagination"),
  })
  .describe("Parameters for listing TTD report templates");

export const ListReportTemplatesOutputSchema = z
  .object({
    templates: z.array(z.record(z.unknown())).describe("List of report template header objects"),
    totalCount: z.number().optional(),
    pageSize: z.number(),
    pageStartIndex: z.number(),
    timestamp: z.string().datetime(),
  })
  .describe("List of report template headers");

type ListReportTemplatesInput = z.infer<typeof ListReportTemplatesInputSchema>;
type ListReportTemplatesOutput = z.infer<typeof ListReportTemplatesOutputSchema>;

export async function listReportTemplatesLogic(
  input: ListReportTemplatesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListReportTemplatesOutput> {
  const { ttdReportingService } = resolveSessionServices(sdkContext);

  const pageSize = input.pageSize ?? 50;
  const pageStartIndex = input.pageStartIndex ?? 0;

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

export function listReportTemplatesResponseFormatter(
  result: ListReportTemplatesOutput
): McpTextContent[] {
  if (result.templates.length === 0) {
    return [
      {
        type: "text" as const,
        text: `No report templates found.\n\nTemplates must be created in the TTD UI at desk.thetradedesk.com/MyReports.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text:
        `Found ${result.templates.length} report template(s)` +
        (result.totalCount !== undefined ? ` (${result.totalCount} total)` : "") +
        `:\n\n${JSON.stringify(result.templates, null, 2)}\n\nTimestamp: ${result.timestamp}`,
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
      input: {},
    },
    {
      label: "Paginate templates",
      input: {
        pageSize: 10,
        pageStartIndex: 10,
      },
    },
  ],
  logic: listReportTemplatesLogic,
  responseFormatter: listReportTemplatesResponseFormatter,
};
