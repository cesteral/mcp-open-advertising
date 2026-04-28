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
  /**
   * Optional enum values the API will accept. Surfaced verbatim in the
   * formatter so the model sees the legal options without having to consult
   * an external resource.
   */
  suggestedValues?: readonly string[];
}

/** A single structured validation issue. */
export interface ValidationIssue {
  /** Field that failed validation. */
  field: string;
  /** Discriminator describing why validation failed. */
  code: "missing" | "wrongType" | "invalidValue" | "readOnly" | "custom";
  /** Human-readable single-line message. */
  message: string;
  /** Optional natural-language hint copied from the rule (e.g. "ACTIVE or PAUSED"). */
  hint?: string;
  /** Optional list of legal values the field accepts. */
  suggestedValues?: string[];
  /** Severity. Defaults to "error" — "warning" is non-blocking. */
  severity?: "error" | "warning";
}

/** Minimal shape of a validation result (used by the response formatter). */
export interface ValidateEntityResult {
  valid: boolean;
  entityType: string;
  mode: string;
  /** Legacy flat string errors. New code should populate `issues` instead. */
  errors?: string[];
  /** Legacy flat string warnings. New code should populate `issues` with `severity="warning"`. */
  warnings?: string[];
  /**
   * Structured issues (errors + warnings together). When present, the formatter
   * renders these and ignores `errors`/`warnings`. Carries hint + suggestedValues
   * so clients can offer corrections rather than re-prompting blindly.
   */
  issues?: ValidationIssue[];
  /**
   * Optional one-line next-action hint when validation fails (e.g. "Call
   * snapchat_list_advertisers first to discover available adAccountId values.")
   */
  nextAction?: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether `value` matches the expected primitive type.
 * Distinguishes between array, object, and primitives correctly.
 */
export function checkType(value: unknown, expected: FieldRule["expectedType"]): boolean {
  if (expected === "array") return Array.isArray(value);
  if (expected === "object")
    return typeof value === "object" && value !== null && !Array.isArray(value);
  return typeof value === expected;
}

/**
 * Structured variant of {@link validateRequiredFields}. Returns one
 * {@link ValidationIssue} per failing rule, preserving the rule's `hint` and
 * `suggestedValues` so the formatter can surface them to the model.
 */
export function validateRequiredFieldsStructured(
  data: Record<string, unknown>,
  rules: FieldRule[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const rule of rules) {
    const value = data[rule.field];

    if (value === undefined || value === null) {
      issues.push({
        field: rule.field,
        code: "missing",
        message: rule.hint
          ? `Missing required field "${rule.field}" (${rule.hint})`
          : `Missing required field "${rule.field}"`,
        ...(rule.hint ? { hint: rule.hint } : {}),
        ...(rule.suggestedValues ? { suggestedValues: [...rule.suggestedValues] } : {}),
        severity: "error",
      });
      continue;
    }

    if (rule.expectedType && !checkType(value, rule.expectedType)) {
      const actual = Array.isArray(value) ? "array" : typeof value;
      issues.push({
        field: rule.field,
        code: "wrongType",
        message: `Field "${rule.field}" should be ${rule.expectedType} but got ${actual}${rule.hint ? ` (${rule.hint})` : ""}`,
        ...(rule.hint ? { hint: rule.hint } : {}),
        ...(rule.suggestedValues ? { suggestedValues: [...rule.suggestedValues] } : {}),
        severity: "error",
      });
    }
  }

  return issues;
}

/**
 * Check a data payload against a list of required-field rules.
 * Returns an array of error strings (empty = all required fields present and typed correctly).
 *
 * For richer output (hints + suggested values), use {@link validateRequiredFieldsStructured}.
 */
export function validateRequiredFields(
  data: Record<string, unknown>,
  rules: FieldRule[]
): string[] {
  return validateRequiredFieldsStructured(data, rules).map((issue) => issue.message);
}

/**
 * Structured variant of {@link checkReadOnlyFields}. Each present read-only
 * field becomes a `severity="warning"` issue with `code="readOnly"`.
 */
export function checkReadOnlyFieldsStructured(
  data: Record<string, unknown>,
  readOnlyFields: string[],
  messageTemplate?: (field: string) => string
): ValidationIssue[] {
  return readOnlyFields
    .filter((field) => field in data)
    .map<ValidationIssue>((field) => ({
      field,
      code: "readOnly",
      message: messageTemplate
        ? messageTemplate(field)
        : `Field "${field}" is read-only and will be ignored by the API`,
      severity: "warning",
    }));
}

/**
 * Check a data payload for read-only fields that should not be sent to the API.
 * Returns an array of warning strings.
 *
 * @param messageTemplate - Optional custom message factory. Defaults to a generic
 *   "read-only and will be ignored" message. Pass a custom template when the
 *   platform's behaviour differs (e.g. TikTok uses "may be ignored").
 *
 * For richer output, use {@link checkReadOnlyFieldsStructured}.
 */
export function checkReadOnlyFields(
  data: Record<string, unknown>,
  readOnlyFields: string[],
  messageTemplate?: (field: string) => string
): string[] {
  return checkReadOnlyFieldsStructured(data, readOnlyFields, messageTemplate).map(
    (issue) => issue.message
  );
}

function renderIssue(issue: ValidationIssue): string[] {
  const out: string[] = [`  - ${issue.message}`];
  if (issue.suggestedValues && issue.suggestedValues.length > 0) {
    out.push(`      Suggested values: ${issue.suggestedValues.join(", ")}`);
  }
  return out;
}

/**
 * Format a validation result as an MCP text content block.
 * Shared across all servers with validate-entity tools.
 *
 * Prefers `result.issues` when present (renders hints + suggestedValues per issue),
 * falls back to legacy flat `result.errors`/`result.warnings` arrays otherwise.
 */
export function validateEntityResponseFormatter(result: ValidateEntityResult): McpTextContent[] {
  const lines: string[] = [];

  // Partition structured issues by severity if present; else fall back to legacy arrays.
  let errorMessages: string[] = [];
  let warningMessages: string[] = [];
  let errorIssues: ValidationIssue[] = [];
  let warningIssues: ValidationIssue[] = [];

  if (result.issues && result.issues.length > 0) {
    for (const issue of result.issues) {
      if (issue.severity === "warning") {
        warningIssues.push(issue);
      } else {
        errorIssues.push(issue);
      }
    }
    errorMessages = errorIssues.map((i) => i.message);
    warningMessages = warningIssues.map((i) => i.message);
  } else {
    errorMessages = result.errors ?? [];
    warningMessages = result.warnings ?? [];
  }

  if (result.valid && errorMessages.length === 0) {
    lines.push(`Validation passed for ${result.entityType} (${result.mode})`);
  } else {
    lines.push(`Validation failed for ${result.entityType} (${result.mode}):`);
    if (errorIssues.length > 0) {
      for (const issue of errorIssues) {
        lines.push(...renderIssue(issue));
      }
    } else {
      for (const err of errorMessages) {
        lines.push(`  - ${err}`);
      }
    }
  }

  if (warningMessages.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    if (warningIssues.length > 0) {
      for (const issue of warningIssues) {
        lines.push(...renderIssue(issue));
      }
    } else {
      for (const warn of warningMessages) {
        lines.push(`  - ${warn}`);
      }
    }
  }

  if (result.nextAction) {
    lines.push("");
    lines.push(`Next action: ${result.nextAction}`);
  }

  lines.push("");
  lines.push(`Timestamp: ${result.timestamp}`);

  return [{ type: "text" as const, text: lines.join("\n") }];
}
