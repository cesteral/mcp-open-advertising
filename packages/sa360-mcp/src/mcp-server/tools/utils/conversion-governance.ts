// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Shared SA360 offline-conversion governance helpers.
 *
 * Two concerns live here so the governed write tools and the standalone
 * `sa360_validate_conversion` tool stay in lockstep:
 *
 * 1. {@link validateConversionFields} — the canonical client-side payload
 *    validator. `sa360_validate_conversion` renders its `errors`/`warnings`;
 *    the governed `insert`/`update` dry-runs map the same `errors` into
 *    per-row `DryRunValidationError`s. A single source means a governed dry-run
 *    can never report `wouldSucceed: true` for a payload the validator rejects.
 *
 * 2. {@link summarizeConversionOutcome} — parses the SA360 v2 `/conversion`
 *    response so an effect is only emitted for rows the API actually accepted.
 *    SA360 can return HTTP 200 while echoing rows that carry a non-`SUCCESS`
 *    status or row-level errors; counting every requested row as written would
 *    record a governance effect for conversions that were rejected.
 */

export type ConversionMode = "insert" | "update";

/** Subset of a conversion row the client-side validator inspects. */
export interface ConversionFieldsInput {
  clickId?: string;
  gclid?: string;
  conversionId?: string;
  conversionTimestamp?: string;
  revenueMicros?: string;
  currencyCode?: string;
  quantityMillis?: string;
  segmentationType?: string;
  segmentationName?: string;
  floodlightActivityId?: string;
  type?: string;
  state?: string;
}

/** A blocking validation failure with a stable code and the field it attaches to. */
export interface ConversionFieldError {
  code: string;
  message: string;
  field: string;
}

export interface ConversionValidationResult {
  errors: ConversionFieldError[];
  warnings: string[];
}

const VALID_STATES = ["ACTIVE", "REMOVED"];
const VALID_SEGMENTATION_TYPES = ["FLOODLIGHT"];
const VALID_CONVERSION_TYPES = ["ACTION", "TRANSACTION"];

/**
 * Canonical client-side validation for a single SA360 conversion payload.
 * Pure (no I/O). Messages are kept identical to what
 * `sa360_validate_conversion` historically rendered so both surfaces agree.
 */
export function validateConversionFields(
  mode: ConversionMode,
  c: ConversionFieldsInput
): ConversionValidationResult {
  const errors: ConversionFieldError[] = [];
  const warnings: string[] = [];

  // Click ID: at least one of clickId or gclid required.
  if (!c.clickId && !c.gclid) {
    errors.push({
      code: "MISSING_CLICK_ID",
      field: "clickId",
      message:
        "At least one of 'clickId' or 'gclid' is required to attribute the conversion to a click.",
    });
  }

  // conversionTimestamp: required and must be valid epoch milliseconds.
  if (!c.conversionTimestamp) {
    errors.push({
      code: "MISSING_TIMESTAMP",
      field: "conversionTimestamp",
      message:
        "'conversionTimestamp' is required (epoch milliseconds as a string, e.g., '1700000000000').",
    });
  } else if (!/^\d+$/.test(c.conversionTimestamp)) {
    errors.push({
      code: "INVALID_TIMESTAMP",
      field: "conversionTimestamp",
      message: `'conversionTimestamp' must be a numeric string (epoch milliseconds). Got: "${c.conversionTimestamp}"`,
    });
  } else if (Number(c.conversionTimestamp) < 946684800000) {
    warnings.push(
      "'conversionTimestamp' appears to be before year 2000 — verify this is epoch milliseconds, not seconds."
    );
  }

  // revenueMicros: numeric if present.
  if (c.revenueMicros !== undefined && !/^-?\d+$/.test(c.revenueMicros)) {
    errors.push({
      code: "INVALID_REVENUE",
      field: "revenueMicros",
      message: `'revenueMicros' must be a numeric string (1,000,000 = 1 currency unit). Got: "${c.revenueMicros}"`,
    });
  }

  // quantityMillis: numeric if present.
  if (c.quantityMillis !== undefined && !/^-?\d+$/.test(c.quantityMillis)) {
    errors.push({
      code: "INVALID_QUANTITY",
      field: "quantityMillis",
      message: `'quantityMillis' must be a numeric string (1000 = 1). Got: "${c.quantityMillis}"`,
    });
  }

  // segmentationType: required.
  if (!c.segmentationType) {
    errors.push({
      code: "MISSING_SEGMENTATION_TYPE",
      field: "segmentationType",
      message: "'segmentationType' is required (e.g., 'FLOODLIGHT').",
    });
  } else if (!VALID_SEGMENTATION_TYPES.includes(c.segmentationType)) {
    warnings.push(
      `'segmentationType' value "${c.segmentationType}" is not a recognized type. Known types: ${VALID_SEGMENTATION_TYPES.join(", ")}`
    );
  }

  // Floodlight identification: need segmentationName or floodlightActivityId.
  if (!c.segmentationName && !c.floodlightActivityId) {
    errors.push({
      code: "MISSING_FLOODLIGHT_ID",
      field: "floodlightActivityId",
      message:
        "Either 'segmentationName' or 'floodlightActivityId' is required to identify the Floodlight activity.",
    });
  }

  // state: must be a valid enum if present.
  if (c.state !== undefined && !VALID_STATES.includes(c.state)) {
    errors.push({
      code: "INVALID_STATE",
      field: "state",
      message: `'state' must be one of: ${VALID_STATES.join(", ")}. Got: "${c.state}"`,
    });
  }

  // type: warn if unrecognized.
  if (c.type !== undefined && !VALID_CONVERSION_TYPES.includes(c.type)) {
    warnings.push(
      `'type' value "${c.type}" is not a recognized conversion type. Known types: ${VALID_CONVERSION_TYPES.join(", ")}`
    );
  }

  // Update mode: conversionId required.
  if (mode === "update" && !c.conversionId) {
    errors.push({
      code: "MISSING_CONVERSION_ID",
      field: "conversionId",
      message:
        "'conversionId' is required for update mode (returned from the original insert response).",
    });
  }

  // Insert mode: conversionId should not be present.
  if (mode === "insert" && c.conversionId) {
    warnings.push(
      "'conversionId' is set but mode is 'insert'. conversionId is typically only used for updates."
    );
  }

  // currencyCode format warning.
  if (c.currencyCode && !/^[A-Z]{3}$/.test(c.currencyCode)) {
    warnings.push(
      `'currencyCode' should be an ISO 4217 code (e.g., USD, EUR). Got: "${c.currencyCode}"`
    );
  }

  return { errors, warnings };
}

/** Result of reconciling an SA360 `/conversion` response against the request. */
export interface ConversionOutcome {
  /** Rows the caller submitted. */
  requested: number;
  /** Rows the API acknowledged as accepted. */
  succeeded: number;
  /** Rows that were rejected or not acknowledged. */
  failed: number;
}

function extractConversionRows(result: unknown): Array<Record<string, unknown>> | null {
  if (!result || typeof result !== "object") return null;
  const conversion = (result as Record<string, unknown>).conversion;
  if (!Array.isArray(conversion)) return null;
  return conversion.filter(
    (row): row is Record<string, unknown> => typeof row === "object" && row !== null
  );
}

/**
 * A returned row counts as accepted unless it carries explicit failure signals:
 * a row-level `errors` array, or a `status` that is anything other than
 * `SUCCESS`. SA360's happy-path echo (no status field) is treated as accepted.
 */
function isRowAccepted(row: Record<string, unknown>): boolean {
  const rowErrors = row.errors;
  if (Array.isArray(rowErrors) && rowErrors.length > 0) return false;
  const status = row.status;
  if (typeof status === "string" && status.toUpperCase() !== "SUCCESS") return false;
  return true;
}

/**
 * Reconcile the SA360 v2 `/conversion` response against the submitted rows.
 *
 * When the response echoes a `conversion` array, each row is checked for
 * acceptance and any rows the API did not acknowledge are counted as failed.
 * When the response carries no parseable per-row data, there is no evidence of
 * failure, so the request is treated as fully accepted (HTTP success is the only
 * signal available). Pure (no I/O).
 */
export function summarizeConversionOutcome(
  result: unknown,
  requestedCount: number
): ConversionOutcome {
  const rows = extractConversionRows(result);
  if (rows === null) {
    return { requested: requestedCount, succeeded: requestedCount, failed: 0 };
  }
  const accepted = rows.filter(isRowAccepted).length;
  const succeeded = Math.min(accepted, requestedCount);
  return { requested: requestedCount, succeeded, failed: Math.max(0, requestedCount - succeeded) };
}
