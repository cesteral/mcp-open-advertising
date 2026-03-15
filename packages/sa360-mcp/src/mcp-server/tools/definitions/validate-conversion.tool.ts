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
import type { SdkContext } from "../../../types-global/mcp.js";

const TOOL_NAME = "sa360_validate_conversion";
const TOOL_TITLE = "Validate SA360 Conversion Payload";
const TOOL_DESCRIPTION = `Validate a conversion payload against SA360 requirements without calling the API.

Checks required fields, data formats, and common configuration mistakes for both insert and update operations. The SA360 API may still reject payloads for business-rule reasons.

**Validates:**
- Click ID presence (clickId or gclid required)
- conversionTimestamp format (epoch milliseconds)
- revenueMicros format (numeric string)
- segmentationType presence
- Floodlight activity identification (segmentationName or floodlightActivityId)
- conversionId presence for update mode
- state enum values`;

const VALID_STATES = ["ACTIVE", "REMOVED"];
const VALID_SEGMENTATION_TYPES = ["FLOODLIGHT"];
const VALID_CONVERSION_TYPES = ["ACTION", "TRANSACTION"];

const ConversionPayloadSchema = z.object({
  clickId: z.string().optional(),
  gclid: z.string().optional(),
  conversionId: z.string().optional(),
  conversionTimestamp: z.string().optional(),
  revenueMicros: z.string().optional(),
  currencyCode: z.string().optional(),
  quantityMillis: z.string().optional(),
  segmentationType: z.string().optional(),
  segmentationName: z.string().optional(),
  floodlightActivityId: z.string().optional(),
  type: z.string().optional(),
  state: z.string().optional(),
  customMetric: z.array(z.object({ name: z.string(), value: z.number() })).optional(),
  customDimension: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
});

export const ValidateConversionInputSchema = z
  .object({
    mode: z
      .enum(["insert", "update"])
      .describe("Whether validating for insert or update"),
    conversion: ConversionPayloadSchema
      .describe("Conversion payload to validate"),
  })
  .describe("Parameters for validating an SA360 conversion payload");

export const ValidateConversionOutputSchema = z
  .object({
    valid: z.boolean().describe("Whether the payload passed validation"),
    mode: z.string().describe("Validation mode (insert or update)"),
    errors: z.array(z.string()).describe("Validation errors (empty if valid)"),
    warnings: z.array(z.string()).describe("Non-blocking warnings"),
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
  const errors: string[] = [];
  const warnings: string[] = [];

  // Click ID: at least one of clickId or gclid required
  if (!conversion.clickId && !conversion.gclid) {
    errors.push("At least one of 'clickId' or 'gclid' is required to attribute the conversion to a click.");
  }

  // conversionTimestamp: required and must be valid epoch milliseconds
  if (!conversion.conversionTimestamp) {
    errors.push("'conversionTimestamp' is required (epoch milliseconds as a string, e.g., '1700000000000').");
  } else if (!/^\d+$/.test(conversion.conversionTimestamp)) {
    errors.push(`'conversionTimestamp' must be a numeric string (epoch milliseconds). Got: "${conversion.conversionTimestamp}"`);
  } else {
    const ts = Number(conversion.conversionTimestamp);
    // Sanity check: should be after 2000-01-01 and not absurdly far in the future
    if (ts < 946684800000) {
      warnings.push("'conversionTimestamp' appears to be before year 2000 — verify this is epoch milliseconds, not seconds.");
    }
  }

  // revenueMicros: must be numeric if present
  if (conversion.revenueMicros !== undefined) {
    if (!/^-?\d+$/.test(conversion.revenueMicros)) {
      errors.push(`'revenueMicros' must be a numeric string (1,000,000 = 1 currency unit). Got: "${conversion.revenueMicros}"`);
    }
  }

  // quantityMillis: must be numeric if present
  if (conversion.quantityMillis !== undefined) {
    if (!/^-?\d+$/.test(conversion.quantityMillis)) {
      errors.push(`'quantityMillis' must be a numeric string (1000 = 1). Got: "${conversion.quantityMillis}"`);
    }
  }

  // segmentationType: required
  if (!conversion.segmentationType) {
    errors.push("'segmentationType' is required (e.g., 'FLOODLIGHT').");
  } else if (!VALID_SEGMENTATION_TYPES.includes(conversion.segmentationType)) {
    warnings.push(`'segmentationType' value "${conversion.segmentationType}" is not a recognized type. Known types: ${VALID_SEGMENTATION_TYPES.join(", ")}`);
  }

  // Floodlight identification: need segmentationName or floodlightActivityId
  if (!conversion.segmentationName && !conversion.floodlightActivityId) {
    errors.push("Either 'segmentationName' or 'floodlightActivityId' is required to identify the Floodlight activity.");
  }

  // state: must be valid enum if present
  if (conversion.state !== undefined && !VALID_STATES.includes(conversion.state)) {
    errors.push(`'state' must be one of: ${VALID_STATES.join(", ")}. Got: "${conversion.state}"`);
  }

  // type: warn if unrecognized
  if (conversion.type !== undefined && !VALID_CONVERSION_TYPES.includes(conversion.type)) {
    warnings.push(`'type' value "${conversion.type}" is not a recognized conversion type. Known types: ${VALID_CONVERSION_TYPES.join(", ")}`);
  }

  // Update mode: conversionId required
  if (mode === "update") {
    if (!conversion.conversionId) {
      errors.push("'conversionId' is required for update mode (returned from the original insert response).");
    }
  }

  // Insert mode: conversionId should not be present
  if (mode === "insert" && conversion.conversionId) {
    warnings.push("'conversionId' is set but mode is 'insert'. conversionId is typically only used for updates.");
  }

  // currencyCode format warning
  if (conversion.currencyCode && !/^[A-Z]{3}$/.test(conversion.currencyCode)) {
    warnings.push(`'currencyCode' should be an ISO 4217 code (e.g., USD, EUR). Got: "${conversion.currencyCode}"`);
  }

  return {
    valid: errors.length === 0,
    mode,
    errors,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

export function validateConversionResponseFormatter(result: ValidateConversionOutput): McpTextContent[] {
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
          gclid: "EAIaIQobChMI...",
          conversionTimestamp: "1700000000000",
          revenueMicros: "5000000",
          segmentationType: "FLOODLIGHT",
          floodlightActivityId: "11111",
          type: "TRANSACTION",
        },
      },
    },
    {
      label: "Validate an update conversion (missing conversionId)",
      input: {
        mode: "update",
        conversion: {
          gclid: "EAIaIQobChMI...",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
          floodlightActivityId: "11111",
        },
      },
    },
  ],
  logic: validateConversionLogic,
  responseFormatter: validateConversionResponseFormatter,
};