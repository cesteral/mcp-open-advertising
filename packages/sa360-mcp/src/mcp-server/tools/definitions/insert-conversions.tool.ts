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

const TOOL_NAME = "sa360_insert_conversions";
const TOOL_TITLE = "Insert SA360 Conversions";
const TOOL_DESCRIPTION = `Insert offline conversions into SA360 via the legacy v2 API (DoubleClick Search).

Upload offline conversion data to attribute conversions to SA360-tracked clicks. Requires a click ID (clickId or gclid) and conversion timestamp for each conversion.

**Important:**
- Uses the legacy v2 API endpoint, not the Reporting API
- Maximum 200 conversions per request
- conversionTimestamp must be epoch milliseconds as a string
- revenueMicros is in the advertiser's currency (1,000,000 = 1 unit)`;

const EFFECT_KIND = "conversions_inserted";

const ConversionRowSchema = z.object({
  clickId: z.string().optional().describe("SA360 click ID"),
  gclid: z.string().optional().describe("Google click ID"),
  conversionTimestamp: z.string().describe("Conversion timestamp (epoch milliseconds as string)"),
  revenueMicros: z.string().optional().describe("Revenue in micros (1,000,000 = 1 currency unit)"),
  currencyCode: z.string().optional().describe("ISO 4217 currency code"),
  quantityMillis: z.string().optional().describe("Conversion quantity in millis (1000 = 1)"),
  segmentationType: z.string().default("FLOODLIGHT").describe("Segment type (default: FLOODLIGHT)"),
  segmentationName: z.string().optional().describe("Floodlight activity name"),
  floodlightActivityId: z.string().optional().describe("Floodlight activity ID"),
  type: z.string().optional().describe("Conversion type (e.g., ACTION, TRANSACTION)"),
  state: z.string().optional().describe("Conversion state (ACTIVE or REMOVED)"),
  customMetric: z
    .array(z.object({ name: z.string(), value: z.number() }))
    .optional()
    .describe("Custom metric values"),
  customDimension: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .optional()
    .describe("Custom dimension values"),
});

export const InsertConversionsInputSchema = z
  .object({
    agencyId: z.string().min(1).describe("SA360 agency ID"),
    advertiserId: z.string().min(1).describe("SA360 advertiser ID"),
    conversions: z
      .array(ConversionRowSchema)
      .min(1)
      .max(200)
      .describe("Conversion rows to insert (max 200)"),
    dry_run: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, validates the conversion rows and returns an EffectDryRunResult under `dryRun` (expected effect = the would-be conversion insert) without prompting for confirmation or calling the SA360 API. No conversions are inserted."
      ),
  })
  .describe("Parameters for inserting offline conversions");

export const InsertConversionsOutputSchema = z
  .object({
    confirmed: z.boolean(),
    declineReason: z.string().optional(),
    result: z.record(z.any()).describe("API response with inserted conversion details"),
    requestedCount: z.number().describe("Number of conversion rows submitted"),
    insertedCount: z
      .number()
      .describe("Number of conversions SA360 acknowledged as accepted (HTTP 200 + row acceptance)"),
    failedCount: z.number().describe("Number of submitted rows SA360 did not acknowledge"),
    timestamp: z.string().datetime(),
    dryRun: EffectDryRunResultSchema.optional().describe(
      "Present only when the request was made with `dry_run: true`. No conversions were inserted."
    ),
    effect: EffectResultSchema.optional().describe(
      "Effect-class result identity (effectKind `conversions_inserted` + scalar, non-PII audit summary with requested/succeeded/failed counts). Present only when SA360 accepted at least one row. Effect writes carry no canonical entity snapshot."
    ),
    dispatchedCapability: DispatchedCapabilitySchema.describe(
      "The concrete (operation, entityKind) this call resolved to — `upload_conversions` with `canonicalEntityKind: null` (effect class). Present on every response."
    ),
  })
  .describe("Conversion insert result");

type InsertConversionsInput = z.infer<typeof InsertConversionsInputSchema>;
type InsertConversionsOutput = z.infer<typeof InsertConversionsOutputSchema>;

export async function insertConversionsLogic(
  input: InsertConversionsInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<InsertConversionsOutput> {
  // Effect-class write: an offline conversion upload has no canonical ad-entity
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
      insertedCount: 0,
      failedCount: 0,
      timestamp: new Date().toISOString(),
      dryRun,
      dispatchedCapability,
    };
  }

  const confirmed = await elicitConversionUploadConfirmation({
    count: input.conversions.length,
    operation: "insert",
    impactPreview: input.conversions.map(
      (c) => c.clickId ?? c.gclid ?? c.segmentationName ?? "(unidentified)"
    ),
    sdkContext,
  });
  if (!confirmed) {
    return {
      confirmed: false,
      declineReason: "user_declined",
      result: {},
      requestedCount: 0,
      insertedCount: 0,
      failedCount: 0,
      timestamp: new Date().toISOString(),
      dispatchedCapability,
    };
  }

  const { conversionService } = resolveSessionServices(sdkContext);

  const result = await conversionService.insertConversions(
    input.agencyId,
    input.advertiserId,
    input.conversions,
    context
  );

  // Reconcile the API response against the request: SA360 can return HTTP 200
  // while rejecting individual rows. Only count rows the API acknowledged.
  const outcome = summarizeConversionOutcome(result, input.conversions.length);

  // Effect emitted ONLY when SA360 accepted at least one row. A fully-rejected
  // upload is not a completed conversion write — emitting an effect would record
  // a governance action that did not happen. The summary is scalar-only and
  // non-PII (no gclid/clickId/revenue rows or raw API payloads).
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
            operation: "insert",
          },
        }
      : undefined;

  return {
    confirmed: true,
    result: result as Record<string, any>,
    requestedCount: outcome.requested,
    insertedCount: outcome.succeeded,
    failedCount: outcome.failed,
    timestamp: new Date().toISOString(),
    effect,
    dispatchedCapability,
  };
}

/**
 * Symbolic effect dry-run for `insert_conversions`. SA360's legacy v2 API has no
 * native conversion validate/preview, so both axes are symbolic. Reuses the
 * canonical {@link validateConversionFields} validator (shared with
 * `sa360_validate_conversion`) per row, then projects the optimistic scalar
 * would-be effect (all rows accepted). Pure (no I/O).
 */
function buildEffectDryRun(input: InsertConversionsInput): EffectDryRunResult {
  const validationErrors: DryRunValidationError[] = [];
  input.conversions.forEach((c, i) => {
    for (const issue of validateConversionFields("insert", c).errors) {
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
      operation: "insert",
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

export function insertConversionsResponseFormatter(
  result: InsertConversionsOutput
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
          `Dry run: inserting ${String(count)} conversion(s) ${verdict} (validation: ${validationSource}, expected-effect: ${expectedEffectSource}). No conversions were inserted.` +
          (errs ? `\n${errs}` : "") +
          `\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  if (!result.confirmed) {
    return [
      {
        type: "text" as const,
        text: `Conversion insert cancelled by user.\n\nTimestamp: ${result.timestamp}`,
      },
    ];
  }
  const failedNote =
    result.failedCount > 0 ? ` (${result.failedCount} row(s) not acknowledged by SA360)` : "";
  return [
    {
      type: "text" as const,
      text: `Accepted ${result.insertedCount} of ${result.requestedCount} conversion(s)${failedNote}\n\n${JSON.stringify(result.result, null, 2)}\n\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const insertConversionsTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InsertConversionsInputSchema,
  outputSchema: InsertConversionsOutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
    idempotentHint: false,
    cesteral: {
      kind: "write",
      writeClass: "effect",
      executableArgsExclude: ["dry_run"],
      platform: "sa360",
      contractPlatformSlug: "sa360",
      contractToolSlug: "insert_conversions",
      operation: ["upload_conversions"],
      // Effect-class: an offline conversion upload has no canonical entity snapshot.
      entityKinds: [],
      entityIdArgs: [],
      schemaVersion: 1,
      contractId: "sa360.insert_conversions.v1",
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
      label: "Insert a single offline conversion",
      input: {
        agencyId: "12345",
        advertiserId: "67890",
        conversions: [
          {
            gclid: "EAIaIQobChMI...",
            conversionTimestamp: "1700000000000",
            revenueMicros: "5000000",
            currencyCode: "USD",
            segmentationType: "FLOODLIGHT",
            floodlightActivityId: "11111",
            type: "TRANSACTION",
          },
        ],
      },
    },
  ],
  logic: insertConversionsLogic,
  responseFormatter: insertConversionsResponseFormatter,
};
