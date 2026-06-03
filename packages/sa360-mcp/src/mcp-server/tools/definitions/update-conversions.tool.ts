// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import {
  elicitConversionUploadConfirmation,
  assertGovernedEffectDryRun,
  EffectResultSchema,
  EffectDryRunResultSchema,
  DispatchedCapabilitySchema,
} from "@cesteral/shared";
import type {
  RequestContext,
  McpTextContent,
  SdkContext,
  EffectResult,
  EffectDryRunResult,
  DispatchedCapability,
  DryRunValidationError,
  CesteralWriteToolAnnotations,
} from "@cesteral/shared";
import {
  validateConversionFields,
  summarizeConversionOutcome,
} from "../utils/conversion-governance.js";

const TOOL_NAME = "sa360_update_conversions";
const TOOL_TITLE = "Update SA360 Conversions";
const TOOL_DESCRIPTION = `Update existing conversions in SA360 via the legacy v2 API (DoubleClick Search).

Modify previously uploaded offline conversion data. Each conversion must be identified by its conversionId and conversionTimestamp.

**Important:**
- Uses the legacy v2 API endpoint (PUT), not the Reporting API
- Maximum 200 conversions per request
- conversionId is required for updates (returned from insert)
- conversionTimestamp must match the original value exactly`;

const EFFECT_KIND = "conversions_updated";

const ConversionUpdateRowSchema = z.object({
  clickId: z.string().optional().describe("SA360 click ID"),
  gclid: z.string().optional().describe("Google click ID"),
  conversionId: z.string().describe("Conversion ID (from original insert response)"),
  conversionTimestamp: z.string().describe("Original conversion timestamp (epoch milliseconds)"),
  revenueMicros: z.string().optional().describe("Updated revenue in micros"),
  currencyCode: z.string().optional().describe("ISO 4217 currency code"),
  quantityMillis: z.string().optional().describe("Updated conversion quantity in millis"),
  segmentationType: z.string().default("FLOODLIGHT").describe("Segment type"),
  segmentationName: z.string().optional().describe("Floodlight activity name"),
  floodlightActivityId: z.string().optional().describe("Floodlight activity ID"),
  type: z.string().optional().describe("Conversion type"),
  state: z.string().optional().describe("Set to REMOVED to delete the conversion"),
  customMetric: z
    .array(z.object({ name: z.string(), value: z.number() }))
    .optional()
    .describe("Updated custom metric values"),
  customDimension: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .optional()
    .describe("Updated custom dimension values"),
});

export const UpdateConversionsInputSchema = z
  .object({
    agencyId: z.string().min(1).describe("SA360 agency ID"),
    advertiserId: z.string().min(1).describe("SA360 advertiser ID"),
    conversions: z
      .array(ConversionUpdateRowSchema)
      .min(1)
      .max(200)
      .describe("Conversion rows to update (max 200)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the conversion rows and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be conversion update) without prompting for confirmation or calling the SA360 API. No conversions are updated."
      ),
  })
  .describe("Parameters for updating existing conversions");

export const UpdateConversionsOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    result: z.record(z.any()).describe("API response with updated conversion details"),
    requestedCount: z.number().describe("Number of conversion rows submitted for update"),
    updatedCount: z
      .number()
      .describe("Number of conversions SA360 acknowledged as accepted (HTTP 200 + row acceptance)"),
    failedCount: z.number().describe("Number of submitted rows SA360 did not acknowledge"),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No conversions were updated."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `conversions_updated` + scalar, non-PII audit summary with requested/succeeded/failed counts). Present only when SA360 accepted at least one row. Effect writes carry no canonical entity snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `upload_conversions` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Conversion update result");

type UpdateConversionsInput = z.infer<typeof UpdateConversionsInputSchema>;
type UpdateConversionsOutput = z.infer<typeof UpdateConversionsOutputSchema>;

export async function updateConversionsLogic(
  input: UpdateConversionsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<UpdateConversionsOutput> {
  // Effect-class write: an offline conversion update has no canonical ad-entity
  // snapshot. The capability is `upload_conversions` with a null entity kind.
  const dispatchedCapability: DispatchedCapability = {
    operation: "upload_conversions",
    canonicalEntityKind: null,
  };

  // Symbolic dry-run: validate the conversion rows and project the would-be
  // effect. No confirmation prompt, no API call.
  if (input.dry_run === true) {
    const dryRun = buildEffectDryRun(input);
    return {
      confirmed: true,
      result: {},
      requestedCount: 0,
      updatedCount: 0,
      failedCount: 0,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const confirmed = await elicitConversionUploadConfirmation({
    count: input.conversions.length,
    operation: "update",
    impactPreview: input.conversions.map((c) => c.conversionId),
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      result: {},
      requestedCount: 0,
      updatedCount: 0,
      failedCount: 0,
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { conversionService } = resolveSessionServices(sdkContext);

  const result = await conversionService.updateConversions(
    input.agencyId,
    input.advertiserId,
    input.conversions,
    context
  );

  // Reconcile the API response against the request: SA360 can return HTTP 200
  // while rejecting individual rows. Only count rows the API acknowledged.
  const outcome = summarizeConversionOutcome(result, input.conversions.length);

  // Effect emitted ONLY when SA360 accepted at least one row. A fully-rejected
  // update is not a completed conversion write — emitting an effect would record
  // a governance action that did not happen. The summary is scalar-only and
  // non-PII (no conversionId/gclid/revenue rows or raw payloads).
  const effect: EffectResult | undefined =
    outcome.succeeded > 0
      ? {
          effectKind: EFFECT_KIND,
          summary: {
            agency_id: input.agencyId,
            advertiser_id: input.advertiserId,
            requested_count: outcome.requested,
            succeeded_count: outcome.succeeded,
            failed_count: outcome.failed,
            operation: "update",
          },
        }
      : undefined;

  return {
    confirmed: true,
    result: result as Record<string, any>,
    requestedCount: outcome.requested,
    updatedCount: outcome.succeeded,
    failedCount: outcome.failed,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `update_conversions`. SA360's legacy v2 API has no
 * native conversion validate/preview, so both axes are symbolic. Reuses the
 * canonical {@link validateConversionFields} validator (shared with
 * `sa360_validate_conversion`) per row, then projects the optimistic scalar
 * would-be effect (all rows accepted). Pure (no I/O).
 */
function buildEffectDryRun(input: UpdateConversionsInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  input.conversions.forEach((c, i) => {
    for (const issue of validateConversionFields("update", c).errors) {
      validationErrors.push({
        code: issue.code,
        message: `conversion[${i}]: ${issue.message}`,
        field: `conversions[${i}].${issue.field}`,
      });
    }
  });

  const requested = input.conversions.length;
  const expectedEffect: EffectResult = {
    effectKind: EFFECT_KIND,
    summary: {
      agency_id: input.agencyId,
      advertiser_id: input.advertiserId,
      requested_count: requested,
      succeeded_count: requested,
      failed_count: 0,
      operation: "update",
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

export function updateConversionsResponseFormatter(
  result: UpdateConversionsOutput
): McpTextContent[] {
  if (result.dryRun) {
    const { wouldSucceed, validationErrors, validationSource, expectedEffectSource } =
      result.dryRun;
    const verdict = wouldSucceed ? "would succeed" : "would FAIL";
    const errs = validationErrors.map((e) => `  - [${e.code}] ${e.message}`).join("\n");
    const count = result.dryRun.expectedEffect?.summary.requested_count ?? 0;
    return [
      {
        type: "text" as const,
        text:
          `Dry run: updating ${String(count)} conversion(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No conversions were updated.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Conversion update cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  const failedNote =
    result.failedCount > 0 ? ` (${result.failedCount} row(s) not acknowledged by SA360)` : "";
  return [
    {
      type: "text" as const,
      text: `Accepted ${result.updatedCount} of ${result.requestedCount} conversion(s)${failedNote}\n\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateConversionsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: UpdateConversionsInputSchema,
  outputSchema: UpdateConversionsOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: true,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "sa360",
      contractPlatformSlug: "sa360",
      contractToolSlug: "update_conversions",
      operation: ["upload_conversions"],
      // Effect-class: an offline conversion update has no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "sa360.update_conversions.v1",
      // `dry_run` = symbolic validate + symbolic effect projection. SA360's legacy
      // v2 API has no native conversion validate/preview, so both axes are symbolic.
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    } satisfies CesteralWriteToolAnnotations,
  },
  inputExamples: [
    {
      label: "Update a conversion's revenue",
      input: {
        agencyId: "12345",
        advertiserId: "67890",
        conversions: [
          {
            conversionId: "conv_abc123",
            conversionTimestamp: "1700000000000",
            revenueMicros: "10000000",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
          },
        ],
      },
    },
    {
      label: "Remove a conversion",
      input: {
        agencyId: "12345",
        advertiserId: "67890",
        conversions: [
          {
            conversionId: "conv_abc123",
            conversionTimestamp: "1700000000000",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
            state: "REMOVED",
          },
        ],
      },
    },
  ],
  logic: updateConversionsLogic,
  responseFormatter: updateConversionsResponseFormatter,
};
