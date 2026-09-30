// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * sa360_validate_conversion — Client-side validation for SA360 conversion payloads.
 *
 * Validates conversion data against known requirements before hitting the API.
 * Purely local — no API calls, no session services needed.
 */

import { z } from "zod";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import { validateConversionFields } from "../utils/conversion-governance.js";

const TOOL_NAME = "sa360_validate_conversion";
const TOOL_TITLE = "Validate SA360 Conversion Payload";
const TOOL_DESCRIPTION = `Validate a conversion payload against SA360 requirements without calling the API.

Checks required fields, data formats, and common configuration mistakes for both insert and update operations. The SA360 API may still reject payloads for business-rule reasons.

**Validates:**
- Click ID presence (clickId required)
- conversionId presence (advertiser-provided; required for insert and update)
- conversionTimestamp format (epoch milliseconds)
- revenueMicros format (numeric string)
- segmentationType presence
- Floodlight activity identification (segmentationId or segmentationName)
- state enum values`;

const ConversionPayloadSchema = z.object({
  clickId: z.string().optional(),
  conversionId: z.string().optional(),
  conversionTimestamp: z.string().optional(),
  revenueMicros: z.string().optional(),
  currencyCode: z.string().optional(),
  quantityMillis: z.string().optional(),
  segmentationType: z.string().optional(),
  segmentationName: z.string().optional(),
  segmentationId: z.string().optional(),
  type: z.string().optional(),
  state: z.string().optional(),
  customMetric: z.array(z.object({ name: z.string(), value: z.number() })).optional(),
  customDimension: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
});

export const ValidateConversionInputSchema = z
  .object({
    mode: z.enum(["insert", "update"]).describe("Whether validating for insert or update"),
    conversion: ConversionPayloadSchema.describe("Conversion payload to validate"),
  })
  .describe("Parameters for validating an SA360 conversion payload");

export const ValidateConversionOutputSchema = z
  .object({
    valid: z.boolean().describe("Whether the payload passed validation"),
    mode: z.string().describe("Validation mode (insert or update)"),
    errors: z.array(z.string()).describe("Validation errors (empty if valid)"),
    warnings: z.array(z.string()).describe("Non-blocking warnings"),
    nextAction: z
      .string()
      .optional()
      .describe("One-line guidance for resolving validation failures."),
    timestamp: z.string().datetime().describe("ISO-8601 timestamp of validation"),
  })
  .describe("Conversion validation result");

type ValidateConversionInput = z.infer<typeof ValidateConversionInputSchema>;
type ValidateConversionOutput = z.infer<typeof ValidateConversionOutputSchema>;

export async function validateConversionLogic(
  input: ValidateConversionInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<ValidateConversionOutput> {
  const { mode, conversion } = input;

  // Canonical client-side validation shared with the governed insert/update
  // dry-runs (see conversion-governance.ts) so both surfaces agree exactly.
  const { errors: fieldErrors, warnings } = validateConversionFields(mode, conversion);
  const errors = fieldErrors.map((e) => e.message);

  let nextAction: string | undefined;
  if (errors.length > 0) {
    if (!conversion.conversionId) {
      nextAction =
        mode === "update"
          ? "Set conversionId to the advertiser-assigned ID the conversion was inserted with (the value you sent to sa360_insert_conversions)."
          : "Set conversionId to an ID of your choosing (e.g. your order ID), unique within the request.";
    } else if (!conversion.segmentationName && !conversion.segmentationId) {
      // `floodlightActivity` is not an sa360_list_entities entity type; the
      // Floodlight settings live on v0 `conversion_action.floodlight_settings`.
      nextAction =
        "Set segmentationName (Floodlight activity name) or segmentationId (numeric Floodlight activity ID). " +
        "To look them up, call sa360_gaql_search with: SELECT conversion_action.name, " +
        "conversion_action.floodlight_settings.activity_id FROM conversion_action";
    }
  }

  return {
    valid: errors.length === 0,
    mode,
    errors,
    warnings,
    ...(nextAction ? { nextAction } : {}),
    timestamp: new Date().toISOString(),
  };
}

export function validateConversionResponseFormatter(
  result: ValidateConversionOutput
): McpTextContent[] {
  const statusIcon = result.valid ? "VALID" : "INVALID";
  const parts = [`Validation: ${statusIcon} (mode: ${result.mode})`];

  if (result.errors.length > 0) {
    parts.push(`\nErrors:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  if (result.warnings.length > 0) {
    parts.push(`\nWarnings:\n${result.warnings.map((w) => `  - ${w}`).join("\n")}`);
  }
  if (result.valid && result.warnings.length === 0) {
    parts.push("\nPayload looks good — ready to submit.");
  }

  parts.push(`\nTimestamp: ${result.timestamp}`);

  return [{ type: "text" as const, text: parts.join("\n") }];
}

export const validateConversionTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ValidateConversionInputSchema,
  outputSchema: ValidateConversionOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Validate a valid insert conversion",
      input: {
        mode: "insert",
        conversion: {
          clickId: "EAIaIQobChMI...",
          conversionId: "order-10001",
          conversionTimestamp: "1700000000000",
          revenueMicros: "5000000",
          segmentationType: "FLOODLIGHT",
          segmentationId: "11111",
          type: "TRANSACTION",
        },
      },
    },
    {
      label: "Validate an update conversion (missing conversionId)",
      input: {
        mode: "update",
        conversion: {
          clickId: "EAIaIQobChMI...",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
          segmentationId: "11111",
        },
      },
    },
  ],
  logic: validateConversionLogic,
  responseFormatter: validateConversionResponseFormatter,
};
