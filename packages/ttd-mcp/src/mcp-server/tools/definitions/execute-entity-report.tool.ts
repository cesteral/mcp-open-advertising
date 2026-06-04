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
import { throwIfGraphqlErrors } from "../utils/graphql-errors.js";

const TOOL_NAME = "ttd_execute_entity_report";
const TOOL_TITLE = "Execute TTD Entity Report (GraphQL)";
const TOOL_DESCRIPTION = `Execute an immediate dimension-specific report for an entity via TTD GraphQL.

Returns a **direct download URL** with no polling required — unlike the MyReports async flow.
These are pre-built report types tied to specific entities (ad group, campaign, or advertiser).

**Report types** vary by entity. Use \`ttd_get_entity_report_types\` to discover available types
for a given entity and Kokai tile (e.g. AD_GROUP, SITE, GEO, DEVICE_TYPE, AD_FORMAT).

**vs. ttd_get_report:** This tool uses the GraphQL API and returns immediately.
\`ttd_get_report\` uses the MyReports REST API with fully custom dimensions/metrics.`;

const EFFECT_KIND = "entity_report_executed";

export const ExecuteEntityReportInputSchema = z
  .object({
    entityType: z
      .enum(["adGroup", "campaign", "advertiser"])
      .describe("The type of entity to generate the report for"),
    entityId: z.string().min(1).describe("ID of the entity (ad group, campaign, or advertiser)"),
    reportType: z
      .string()
      .min(1)
      .describe(
        "Report type enum value (e.g. AD_GROUP, SITE, GEO, DEVICE_TYPE, AD_FORMAT, VIDEO_CREATIVE). " +
          "Use ttd_get_entity_report_types to discover available values for your entity."
      ),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the request and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be report execution) without calling the TTD API. No report is executed."
      ),
  })
  .describe("Parameters for executing an entity-level report via TTD GraphQL");

export const ExecuteEntityReportOutputSchema = z
  .object({
    entityType: z.string(),
    entityId: z.string(),
    reportType: z.string(),
    reportId: z.string().nullable().optional().describe("Report ID if returned"),
    downloadUrl: z.string().optional().describe("Direct download URL for the report CSV"),
    hasSampleData: z.boolean().optional().describe("Whether the report contains sample data"),
    userErrors: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional()
      .describe("Validation errors from TTD"),
    rawResponse: z.record(z.unknown()).optional(),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No report was executed."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `entity_report_executed` + scalar audit summary — entity/report identity only, no download URL). Present only when the report actually executed (no user errors). Effect writes carry no canonical entity snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `submit_report` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Entity report execution result");

type ExecuteEntityReportInput = z.infer<typeof ExecuteEntityReportInputSchema>;
type ExecuteEntityReportOutput = z.infer<typeof ExecuteEntityReportOutputSchema>;

const MUTATION_KEYS: Record<string, string> = {
  adGroup: "adGroupReportExecute",
  campaign: "campaignReportExecute",
  advertiser: "advertiserReportExecute",
};

export async function executeEntityReportLogic(
  input: ExecuteEntityReportInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ExecuteEntityReportOutput> {
  // Effect-class write: executing a report has no canonical ad-entity snapshot.
  // The capability is `submit_report` with a null entity kind.
  const dispatchedCapability: DispatchedCapability = {
    operation: "submit_report",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the request and project the would-be effect. No
  // API call.
  if (input.dry_run === true) {
    const dryRun = buildEffectDryRun(input);
    return {
      entityType: input.entityType,
      entityId: input.entityId,
      reportType: input.reportType,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const { ttdService } = resolveSessionServices(sdkContext);

  const raw = (await ttdService.executeEntityReport(
    input.entityType,
    input.entityId,
    input.reportType,
    context
  )) as Record<string, unknown>;

  throwIfGraphqlErrors(raw, "GraphQL error executing entity report");

  const mutationKey = MUTATION_KEYS[input.entityType];
  const gqlData = (raw.data as Record<string, unknown> | undefined) ?? {};
  const mutationResult = (gqlData[mutationKey] as Record<string, unknown> | undefined) ?? {};
  const reportData = (mutationResult.data as Record<string, unknown> | undefined) ?? {};
  const userErrors = mutationResult.userErrors as
    | Array<{ field: string; message: string }>
    | undefined;

  const reportId = (reportData.id as string | null) ?? null;
  const downloadUrl = reportData.url as string | undefined;
  const hasSampleData = reportData.hasSampleData as boolean | undefined;

  // Effect emitted only when the report actually executed: no user errors and a
  // report artifact (download URL or report id) was produced. The summary uses
  // entity/report scalar identity only — never the download URL.
  const reportProduced = downloadUrl !== undefined || reportId !== null;
  const effect: EffectResult | undefined =
    !userErrors?.length && reportProduced
      ? {
          effectKind: EFFECT_KIND,
          summary: {
            entity_type: input.entityType,
            entity_id: input.entityId,
            report_type: input.reportType,
            report_id: reportId,
            ...(hasSampleData !== undefined && { has_sample_data: hasSampleData }),
          },
        }
      : undefined;

  return {
    entityType: input.entityType,
    entityId: input.entityId,
    reportType: input.reportType,
    reportId,
    downloadUrl,
    hasSampleData,
    userErrors: userErrors?.length ? userErrors : undefined,
    rawResponse: raw as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `execute_entity_report`. TTD GraphQL has no native
 * validate/preview, so both axes are symbolic. Validates the entity id and report
 * type are non-empty and projects the scalar would-be effect (entity/report
 * identity only). Pure (no I/O).
 */
function buildEffectDryRun(input: ExecuteEntityReportInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  if (input.entityId.trim().length === 0) {
    validationErrors.push({
      code: "INVALID_ENTITY_ID",
      message: "entityId must be a non-empty entity id",
      field: "entityId",
    });
  }
  if (input.reportType.trim().length === 0) {
    validationErrors.push({
      code: "INVALID_REPORT_TYPE",
      message: "reportType must be a non-empty report type",
      field: "reportType",
    });
  }

  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      entity_type: input.entityType,
      entity_id: input.entityId,
      report_type: input.reportType,
    },
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

export function executeEntityReportResponseFormatter(
  result: ExecuteEntityReportOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    return [
      {
        type: "text" as const,
        text:
          `Dry run: executing a ${result.reportType} report for ${result.entityType} ${result.entityId} ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No report was executed.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.userErrors?.length) {
    return [
      {
        type: "text" as const,
        text:
          `Report execution failed for ${result.entityType} ${result.entityId}:\n\n` +
          result.userErrors.map((e) => `- ${e.field}: ${e.message}`).join("\n") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }

  if (result.downloadUrl) {
    return [
      {
        type: "text" as const,
        text:
          `Report ready for ${result.entityType} ${result.entityId} (${result.reportType}):\n\n` +
          `Download URL: ${result.downloadUrl}\n` +
          (result.hasSampleData ? `⚠ Contains sample data only.\n` : "") +
          `\nUse \`ttd_download_report\` with this URL to fetch a bounded summary or paged row slice.\n\n` +
          `Timestamp: ${result.timestamp}`,
      },
    ];
  }

  return [
    {
      type: "text" as const,
      text: `Report execution result:\n\n${JSON.stringify(result.rawResponse, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const executeEntityReportTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ExecuteEntityReportInputSchema,
  outputSchema: ExecuteEntityReportOutputSchema,
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
      contractToolSlug: "execute_entity_report",
      operation: ["submit_report"],
      // Effect-class: executing a report has no canonical ad-entity snapshot.
      // `entityId` scopes the report (like submit_report's advertiserIds) — it
      // pairs with no snapshot read partner, so entityIdArgs stays empty.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "ttd.execute_entity_report.v1",
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Execute ad group report",
      input: {
        entityType: "adGroup",
        entityId: "ag123456",
        reportType: "AD_GROUP",
      },
    },
    {
      label: "Execute campaign geo report",
      input: {
        entityType: "campaign",
        entityId: "c789012",
        reportType: "GEO",
      },
    },
  ],
  logic: executeEntityReportLogic,
  responseFormatter: executeEntityReportResponseFormatter,
};
