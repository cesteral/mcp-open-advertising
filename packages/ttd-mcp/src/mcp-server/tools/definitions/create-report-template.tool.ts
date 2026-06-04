// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  McpTextContent,
  RequestContext,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  DryRunValidationError,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";
import { MYREPORTS_TEMPLATE_ACCESS_ERROR, throwIfGraphqlErrors } from "../utils/graphql-errors.js";

const TOOL_NAME = "ttd_create_report_template";
const TOOL_TITLE = "Create TTD Report Template (GraphQL)";
const TOOL_DESCRIPTION = `Create a user-defined report template via TTD GraphQL (\`myReportsTemplateCreate\`).

A report template defines the structure of a My Reports report — which report types to use and which columns/metrics to include. Templates can have up to 29 tabs (resultSets).

**Workflow:**
1. Use \`ttd_list_report_types\` to discover available report type IDs
2. Use \`ttd_get_report_type_schema\` to get field and metric IDs for a report type
3. Call this tool to create the template
4. Use the returned template ID to schedule reports (\`ttd_create_template_schedule\`)

Use \`ttd_list_report_templates\` to see existing templates.`;

const EFFECT_KIND = "report_template_created";

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
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the template definition and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be template creation) without calling the TTD API. No template is created."
      ),
  })
  .describe("Parameters for creating a TTD report template");

export const CreateReportTemplateOutputSchema = z
  .object({
    templateData: z.unknown().optional().describe("Raw data scalar returned by TTD"),
    templateId: z
      .string()
      .optional()
      .describe("ID of the newly created template (retrieved via follow-up query)"),
    templateName: z.string().optional().describe("Name of the newly created template"),
    errors: z
      .array(z.object({ field: z.string().optional(), message: z.string() }))
      .optional()
      .describe("Mutation errors from TTD"),
    rawResponse: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No template was created."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `report_template_created` + scalar audit summary). Present only on a confirmed create the mutation actually executed. Effect writes carry no canonical entity snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `manage` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Result of report template creation");

type CreateReportTemplateInput = z.infer<typeof CreateReportTemplateInputSchema>;
type CreateReportTemplateOutput = z.infer<typeof CreateReportTemplateOutputSchema>;

const CREATE_REPORT_TEMPLATE_MUTATION = `mutation CreateReportTemplate($input: MyReportsTemplateCreateInput!) {
  myReportsTemplateCreate(input: $input) {
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

const GET_NEWEST_TEMPLATE_QUERY = `query GetNewestTemplate {
  myReportsReportTemplates(last: 1) {
    nodes { id name format }
  }
}`;

export async function createReportTemplateLogic(
  input: CreateReportTemplateInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<CreateReportTemplateOutput> {
  // Effect-class write: a report template is not a canonical ad entity, so there
  // is no entity snapshot. The capability is `manage` with a null entity kind.
  const dispatchedCapability: DispatchedCapability = {
    operation: "manage",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the template definition and project the would-be
  // effect. No API call.
  if (input.dry_run === true) {
    const dryRun = buildEffectDryRun(input);
    return {
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

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
  const errors = mutationResult.errors as Array<{ field?: string; message: string }> | undefined;

  let templateId: string | undefined;
  let templateName: string | undefined;

  const mutationExecuted = Boolean(mutationResult.data) && !errors?.length;

  if (mutationExecuted) {
    try {
      const listRaw = (await ttdService.graphqlQuery(
        GET_NEWEST_TEMPLATE_QUERY,
        {},
        context
      )) as Record<string, unknown>;
      const listData = (listRaw.data as Record<string, unknown> | undefined) ?? {};
      const connection =
        (listData.myReportsReportTemplates as Record<string, unknown> | undefined) ?? {};
      const nodes = (connection.nodes as Array<Record<string, unknown>> | undefined) ?? [];
      if (nodes.length > 0) {
        templateId = nodes[0].id as string | undefined;
        templateName = nodes[0].name as string | undefined;
      }
    } catch {
      // Follow-up query failed — mutation still succeeded, just can't retrieve the ID
    }
  }

  // Effect emitted only when the mutation actually executed (data scalar present,
  // no mutation errors). The summary uses stable scalar identities only.
  const effect: EffectResult | undefined = mutationExecuted
    ? {
        effectKind: EFFECT_KIND,
        summary: {
          template_name: templateName ?? input.name,
          ...(templateId !== undefined && { template_id: templateId }),
        },
      }
    : undefined;

  return {
    templateData: mutationResult.data,
    templateId,
    templateName,
    errors: errors?.length ? errors : undefined,
    rawResponse: raw as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `create_report_template`. TTD GraphQL has no native
 * template validate/preview, so both axes are symbolic. Validates the template
 * name is non-empty and every result set carries a report type id, then projects
 * the scalar would-be effect. Pure (no I/O).
 */
function buildEffectDryRun(input: CreateReportTemplateInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (input.name.trim().length === 0) {
    validationErrors.push({
      code: "INVALID_TEMPLATE_NAME",
      message: "name must be a non-empty template name",
      field: "name",
    });
  }
  input.resultSets.forEach((rs, i) => {
    if (rs.reportTypeId.trim().length === 0) {
      validationErrors.push({
        code: "INVALID_REPORT_TYPE_ID",
        message: `resultSets[${i}].reportTypeId must reference a report type`,
        field: `resultSets[${i}].reportTypeId`,
      });
    }
  });

  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: { template_name: input.name },
  };

  return assertGovernedEffectDryRun(
    {
      wouldSucceed: validationErrors.length === 0,
      validationErrors,
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect,
    },
    TOOL_NAME,
    { requiresValidation: true, requiresSimulation: true }
  );
}

export function createReportTemplateResponseFormatter(
  result: CreateReportTemplateOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    const name = result.dryRun.expectedEffect?.summary.template_name ?? "template";
    return [
      {
        type: "text" as const,
        text:
          `Dry run: creating report template "${String(name)}" ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No template was created.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.errors?.length) {
    return [
      {
        type: "text" as const,
        text:
          `Report template creation failed:\n\n` +
          result.errors.map((e) => `- ${e.field ? `${e.field}: ` : ""}${e.message}`).join("\n") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (!result.templateData) {
    return [
      {
        type: "text" as const,
        text:
          `Report template creation returned no template data. The mutation may not have executed.\n\n` +
          `This usually means the API token lacks MyReports write access. ` +
          `Check the raw response for details:\n\n` +
          `${JSON.stringify(result.rawResponse, null, 2)}\n\n` +
          `Timestamp: ${result.timestamp}`,
      },
    ];
  }

  const lines = [`Report template created successfully.`];
  if (result.templateId) {
    lines.push(`\nTemplate ID: ${result.templateId}`);
  }
  if (result.templateName) {
    lines.push(`Template Name: ${result.templateName}`);
  }
  lines.push(
    `\nUse the template ID with \`ttd_create_template_schedule\` to schedule reports.`,
    `\nTimestamp: ${result.timestamp}`
  );

  return [{ type: "text" as const, text: lines.join("\n") }];
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
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "create_report_template",
      operation: ["manage"],
      // Effect-class: a report template has no canonical ad-entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "ttd.create_report_template.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
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
