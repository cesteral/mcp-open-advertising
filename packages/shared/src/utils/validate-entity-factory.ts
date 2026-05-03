// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Shared factory for `<platform>_validate_entity` tools.
 *
 * Tools across servers shared the same input/output schemas and a near-identical
 * "enum-check + required-check + read-only-check + custom-extras" body. This
 * factory absorbs all of that. Servers whose validation walks a bulk-style payload
 * (e.g. `data.Campaigns[]`) keep their own hand-rolled tool — pass `extraValidate`
 * to handle anything beyond the flat-data common path.
 */

import { z } from "zod";
import {
  type FieldRule,
  type ValidationIssue,
  validateRequiredFieldsStructured,
  validateEnumFieldsStructured,
  checkReadOnlyFieldsStructured,
  validateEntityResponseFormatter,
} from "./client-validation-helpers.js";
import type { RequestContext } from "./request-context.js";
import type { SdkContext } from "../types/tool-types.js";

const ValidationIssueSchema = z.object({
  field: z.string(),
  code: z.enum(["missing", "wrongType", "invalidValue", "readOnly", "custom"]),
  message: z.string(),
  hint: z.string().optional(),
  suggestedValues: z.array(z.string()).optional(),
  severity: z.enum(["error", "warning"]).optional(),
});

const ValidateEntityOutputSchema = z
  .object({
    valid: z.boolean().describe("Whether the payload passed validation"),
    entityType: z.string().describe("Entity type that was validated"),
    mode: z.string().describe("Validation mode (create or update)"),
    errors: z.array(z.string()).describe("Validation errors (empty if valid)"),
    warnings: z.array(z.string()).describe("Non-blocking warnings"),
    issues: z.array(ValidationIssueSchema),
    nextAction: z.string().optional(),
    timestamp: z.string().datetime().describe("ISO-8601 timestamp of validation"),
  })
  .describe("Validation result");

export type ValidateEntityOutput = z.infer<typeof ValidateEntityOutputSchema>;

export interface ValidateEntityToolOptions<E extends string> {
  toolName: string;
  toolTitle: string;
  toolDescription: string;
  entityTypeEnum: readonly [E, ...E[]];
  /** Required-field rules per entity (used by required + enum checks). */
  rulesByEntity?: Record<E, FieldRule[]>;
  /** Function variant of `rulesByEntity` for platforms that derive rules at runtime. */
  getRules?: (entityType: E) => readonly FieldRule[];
  /** Fields that may not be set on update. Defaults to none. */
  readOnlyFields?: readonly string[];
  /** Function variant of `readOnlyFields` for platforms that derive them per-entity. */
  getReadOnlyFields?: (entityType: E) => readonly string[];
  /**
   * Hook for platform-specific extra checks (URN format, budget object shape,
   * etc). Push directly into `issues`. Runs after rules-driven checks. May
   * return a `nextAction` hint to attach when validation fails.
   */
  extraValidate?: (args: {
    entityType: E;
    mode: "create" | "update";
    data: Record<string, unknown>;
    extra: Record<string, unknown>;
    issues: ValidationIssue[];
  }) => void | { nextAction?: string };
  /**
   * Optional additional input fields beyond the standard `entityType/mode/data`.
   * Provided as a Zod object whose shape is merged into the tool's input schema.
   */
  extraInputSchema?: z.ZodRawShape;
  inputExamples?: Array<{ label: string; input: Record<string, unknown> }>;
  annotations?: {
    readOnlyHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
    destructiveHint?: boolean;
  };
}

/**
 * Build a validate-entity tool from per-platform rules and an optional hook
 * for platform-specific extras.
 */
export function createValidateEntityTool<E extends string>(opts: ValidateEntityToolOptions<E>) {
  const baseShape = {
    entityType: z.enum(opts.entityTypeEnum).describe("Type of entity to validate"),
    mode: z.enum(["create", "update"]).describe("Whether validating for creation or update"),
    data: z.record(z.any()).describe("Entity payload to validate"),
    ...(opts.extraInputSchema ?? {}),
  };
  const InputSchema = z
    .object(baseShape)
    .describe(`Parameters for validating a ${opts.toolTitle} entity payload`);

  type Input = z.infer<typeof InputSchema>;

  async function logic(
    input: Input,
    _context: RequestContext,
    _sdkContext?: SdkContext
  ): Promise<ValidateEntityOutput> {
    const { entityType, mode, data, ...extra } = input as Input & Record<string, unknown>;
    const issues: ValidationIssue[] = [];
    const rules = (opts.getRules?.(entityType as E) ??
      opts.rulesByEntity?.[entityType as E] ??
      []) as FieldRule[];
    const readOnly =
      opts.getReadOnlyFields?.(entityType as E) ?? opts.readOnlyFields ?? [];

    issues.push(...validateEnumFieldsStructured(data as Record<string, unknown>, rules));
    if (mode === "create") {
      issues.push(...validateRequiredFieldsStructured(data as Record<string, unknown>, rules));
    } else if (readOnly.length > 0) {
      issues.push(
        ...checkReadOnlyFieldsStructured(data as Record<string, unknown>, [...readOnly])
      );
    }

    const extraResult =
      opts.extraValidate?.({
        entityType: entityType as E,
        mode: mode as "create" | "update",
        data: data as Record<string, unknown>,
        extra: extra as Record<string, unknown>,
        issues,
      }) ?? undefined;

    const errorIssues = issues.filter((i) => i.severity !== "warning");
    const warningIssues = issues.filter((i) => i.severity === "warning");

    return {
      valid: errorIssues.length === 0,
      entityType: entityType as string,
      mode: mode as string,
      errors: errorIssues.map((i) => i.message),
      warnings: warningIssues.map((i) => i.message),
      issues,
      ...(extraResult?.nextAction ? { nextAction: extraResult.nextAction } : {}),
      timestamp: new Date().toISOString(),
    };
  }

  return {
    name: opts.toolName,
    title: opts.toolTitle,
    description: opts.toolDescription,
    inputSchema: InputSchema,
    outputSchema: ValidateEntityOutputSchema,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
      destructiveHint: false,
      ...opts.annotations,
    },
    inputExamples: opts.inputExamples ?? [],
    logic,
    responseFormatter: validateEntityResponseFormatter,
  };
}
