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

const TOOL_NAME = "ttd_update_report_template";
const TOOL_TITLE = "Update TTD Report Template (GraphQL)";
const TOOL_DESCRIPTION = `Update an existing report template via TTD GraphQL (\`myReportsTemplateUpdate\`).

**IMPORTANT:** The updated structure **completely replaces** the existing template. You must re-include all fields and metrics you want to keep — any omitted columns will be removed.

Use \`ttd_get_report_template\` first to retrieve the current template structure before updating.
Use \`ttd_list_report_templates\` to find the template ID.
Use \`ttd_list_report_types\` and \`ttd_get_report_type_schema\` to discover available fields and metrics.`;

const EFFECT_KIND = "report_template_updated";

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
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the template definition and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be template update) without calling the TTD API. No template is modified."
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
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No template was modified."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `report_template_updated` + scalar audit summary). Present only on a confirmed update the mutation actually executed. Effect writes carry no canonical entity snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `manage` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
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
  const errors = mutationResult.errors as Array<{ field?: string; message: string }> | undefined;

  // Effect emitted only when the mutation actually executed (data scalar present,
  // no mutation errors). The summary uses stable scalar identities only.
  const mutationExecuted = Boolean(mutationResult.data) && !errors?.length;
  const effect: EffectResult | undefined = mutationExecuted
    ? {
        effectKind: EFFECT_KIND,
        summary: { template_id: input.id, template_name: input.name },
      }
    : undefined;

  return {
    templateData: mutationResult.data,
    errors: errors?.length ? errors : undefined,
    rawResponse: raw as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `update_report_template`. TTD GraphQL has no native
 * template validate/preview, so both axes are symbolic. Validates the template id
 * and name are non-empty and every result set carries a report type id, then
 * projects the scalar would-be effect. Pure (no I/O).
 */
function buildEffectDryRun(input: UpdateReportTemplateInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (input.id.trim().length === 0) {
    validationErrors.push({
      code: "INVALID_TEMPLATE_ID",
      message: "id must be a non-empty report-template id",
      field: "id",
    });
  }
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
    summary: { template_id: input.id, template_name: input.name },
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

export function updateReportTemplateResponseFormatter(
  result: UpdateReportTemplateOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    const id = result.dryRun.expectedEffect?.summary.template_id ?? "template";
    return [
      {
        type: "text" as const,
        text:
          `Dry run: updating report template ${String(id)} ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No template was modified.` +
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
          `Report template update failed:\n\n` +
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
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "ttd",
      contractPlatformSlug: "ttd",
      contractToolSlug: "update_report_template",
      operation: ["manage"],
      // Effect-class: a report template has no canonical ad-entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "ttd.update_report_template.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
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
