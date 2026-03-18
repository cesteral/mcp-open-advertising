// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * client-validation-helpers — shared utilities for client-side entity validation.
 *
 * Used by Meta, LinkedIn, and TikTok validate-entity tools.
 * Pure functions — no API calls, no side effects.
 */

import type { McpTextContent } from "./tool-handler-factory.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FieldRule {
  field: string;
  expectedType?: "string" | "number" | "object" | "array" | "boolean";
  hint?: string;
}

/** Minimal shape of a validation result (used by the response formatter). */
export interface ValidateEntityResult {
  valid: boolean;
  entityType: string;
  mode: string;
  errors?: string[];
  warnings?: string[];
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether `value` matches the expected primitive type.
 * Distinguishes between array, object, and primitives correctly.
 */
export function checkType(
  value: unknown,
  expected: FieldRule["expectedType"]
): boolean {
  if (expected === "array") return Array.isArray(value);
  if (expected === "object")
    return (
      typeof value === "object" && value !== null && !Array.isArray(value)
    );
  return typeof value === expected;
}

/**
 * Check a data payload against a list of required-field rules.
 * Returns an array of error strings (empty = all required fields present and typed correctly).
 */
export function validateRequiredFields(
  data: Record<string, unknown>,
  rules: FieldRule[]
): string[] {
  const errors: string[] = [];

  for (const rule of rules) {
    const value = data[rule.field];

    if (value === undefined || value === null) {
      errors.push(
        rule.hint
          ? `Missing required field "${rule.field}" (${rule.hint})`
          : `Missing required field "${rule.field}"`
      );
      continue;
    }

    if (rule.expectedType && !checkType(value, rule.expectedType)) {
      const actual = Array.isArray(value) ? "array" : typeof value;
      errors.push(
        `Field "${rule.field}" should be ${rule.expectedType} but got ${actual}${rule.hint ? ` (${rule.hint})` : ""}`
      );
    }
  }

  return errors;
}

/**
 * Check a data payload for read-only fields that should not be sent to the API.
 * Returns an array of warning strings.
 *
 * @param messageTemplate - Optional custom message factory. Defaults to a generic
 *   "read-only and will be ignored" message. Pass a custom template when the
 *   platform's behaviour differs (e.g. TikTok uses "may be ignored").
 */
export function checkReadOnlyFields(
  data: Record<string, unknown>,
  readOnlyFields: string[],
  messageTemplate?: (field: string) => string
): string[] {
  return readOnlyFields
    .filter((field) => field in data)
    .map((field) =>
      messageTemplate
        ? messageTemplate(field)
        : `Field "${field}" is read-only and will be ignored by the API`
    );
}

/**
 * Format a validation result as an MCP text content block.
 * Shared across all servers with validate-entity tools.
 */
export function validateEntityResponseFormatter(
  result: ValidateEntityResult
): McpTextContent[] {
  const lines: string[] = [];
  const errors = result.errors ?? [];
  const warnings = result.warnings ?? [];

  if (result.valid) {
    lines.push(`Validation passed for ${result.entityType} (${result.mode})`);
  } else {
    lines.push(
      `Validation failed for ${result.entityType} (${result.mode}):`
    );
    for (const err of errors) {
      lines.push(`  - ${err}`);
    }
  }

  if (warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warn of warnings) {
      lines.push(`  - ${warn}`);
    }
  }

  lines.push("");
  lines.push(`Timestamp: ${result.timestamp}`);

  return [{ type: "text" as const, text: lines.join("\n") }];
}