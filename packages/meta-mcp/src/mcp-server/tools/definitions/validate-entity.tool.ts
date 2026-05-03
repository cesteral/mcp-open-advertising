// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * meta_validate_entity — Client-side schema validation for Meta Ads entities.
 *
 * Meta Marketing API has no dry-run / validateOnly mode, so this tool
 * validates payloads against known required-field rules before hitting the API.
 * It is purely local — no API calls, no session services needed.
 */

import { z } from "zod";
import { getEntityTypeEnum, type MetaEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import {
  type ValidationIssue,
  validateRequiredFieldsStructured,
  checkReadOnlyFieldsStructured,
  validateEntityResponseFormatter,
} from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import {
  REQUIRED_FIELDS_CREATE,
  READ_ONLY_FIELDS,
  BUDGET_FIELDS,
} from "../../resources/utils/field-rules.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAME = "meta_validate_entity";
const TOOL_TITLE = "Meta Ads Entity Validation (Client-Side)";
const TOOL_DESCRIPTION = `Validate an entity payload against known Meta Ads requirements without calling the API. Checks required fields, data types, and common configuration mistakes.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

This is a pure client-side check — it will catch missing required fields and
obvious type errors, but the Meta API may still reject payloads for
business-rule reasons (e.g., invalid objective/optimization_goal combinations).

Required-field tables, enum suggestions, and read-only field lists per entity type are also exposed as MCP resources. Valid values: see resource \`meta-field-rules://{entityType}\`.`;

// ---------------------------------------------------------------------------
// Input / Output schemas
// ---------------------------------------------------------------------------

export const ValidateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to validate"),
    mode: z.enum(["create", "update"]).describe("Whether validating for creation or update"),
    data: z.record(z.any()).describe("Entity payload to validate"),
    adAccountId: z.string().optional().describe("Ad Account ID (required for create mode)"),
  })
  .superRefine((val, ctx) => {
    if (val.mode === "create" && !val.adAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adAccountId"],
        message: "adAccountId is required when mode is 'create'",
      });
    }
  })
  .describe("Parameters for validating a Meta Ads entity payload");

const ValidationIssueSchema = z
  .object({
    field: z.string(),
    code: z.enum(["missing", "wrongType", "invalidValue", "readOnly", "custom"]),
    message: z.string(),
    hint: z.string().optional(),
    suggestedValues: z.array(z.string()).optional(),
    severity: z.enum(["error", "warning"]).optional(),
  })
  .describe("Structured validation issue");

export const ValidateEntityOutputSchema = z
  .object({
    valid: z.boolean().describe("Whether the payload passed validation"),
    entityType: z.string().describe("Entity type that was validated"),
    mode: z.string().describe("Validation mode (create or update)"),
    errors: z.array(z.string()).describe("Flat error messages (mirrors issues with severity=error)"),
    warnings: z
      .array(z.string())
      .describe("Flat warning messages (mirrors issues with severity=warning)"),
    issues: z
      .array(ValidationIssueSchema)
      .describe("Structured per-field issues with hints and suggested values"),
    nextAction: z
      .string()
      .optional()
      .describe("One-line guidance on what to do next when validation fails"),
    timestamp: z.string().datetime().describe("ISO-8601 timestamp of validation"),
  })
  .describe("Validation result");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ValidateEntityInput = z.infer<typeof ValidateEntityInputSchema>;
type ValidateEntityOutput = z.infer<typeof ValidateEntityOutputSchema>;

// ---------------------------------------------------------------------------
// Logic (pure — no API calls, no session services)
// ---------------------------------------------------------------------------

export async function validateEntityLogic(
  input: ValidateEntityInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<ValidateEntityOutput> {
  const { entityType, mode, data } = input;
  const issues: ValidationIssue[] = [];

  if (mode === "create") {
    // ── Required-field checks ──────────────────────────────────────────
    const rules = REQUIRED_FIELDS_CREATE[entityType as MetaEntityType] ?? [];
    issues.push(...validateRequiredFieldsStructured(data, rules));

    // ── Ad-specific: creative must contain creative_id ─────────────────
    if (
      entityType === "ad" &&
      data.creative &&
      typeof data.creative === "object" &&
      !Array.isArray(data.creative)
    ) {
      if (!(data.creative as Record<string, unknown>).creative_id) {
        issues.push({
          field: "creative.creative_id",
          code: "missing",
          message: 'Field "creative" object must contain "creative_id"',
          severity: "error",
        });
      }
    }
  }

  if (mode === "update") {
    // ── Data must not be empty ─────────────────────────────────────────
    if (Object.keys(data).length === 0) {
      issues.push({
        field: "data",
        code: "custom",
        message: "Update payload must contain at least one field to update",
        severity: "error",
      });
    }

    // ── Warn about read-only fields ────────────────────────────────────
    issues.push(...checkReadOnlyFieldsStructured(data, READ_ONLY_FIELDS));
  }

  // ── Budget warnings (both modes) ──────────────────────────────────────
  for (const field of BUDGET_FIELDS) {
    const value = data[field];
    if (value !== undefined && typeof value === "number") {
      if (value > 0 && value < 100) {
        issues.push({
          field,
          code: "invalidValue",
          message: `Field "${field}" is ${value} — budget values are in cents (e.g., 1000 = $10 USD). Did you mean ${value * 100}?`,
          severity: "warning",
        });
      }
    }
  }

  const errorIssues = issues.filter((i) => i.severity !== "warning");
  const warningIssues = issues.filter((i) => i.severity === "warning");

  let nextAction: string | undefined;
  if (errorIssues.length > 0) {
    if (entityType === "adSet" && errorIssues.some((i) => i.field === "campaign_id")) {
      nextAction =
        "Call meta_list_entities with entityType='campaign' to find a campaign_id for the parent campaign.";
    } else if (entityType === "ad" && errorIssues.some((i) => i.field === "adset_id")) {
      nextAction =
        "Call meta_list_entities with entityType='adSet' to find an adset_id for the parent ad set.";
    } else if (mode === "create" && !input.adAccountId) {
      nextAction = "Call meta_list_ad_accounts to discover available adAccountId values.";
    }
  }

  return {
    valid: errorIssues.length === 0,
    entityType,
    mode,
    errors: errorIssues.map((i) => i.message),
    warnings: warningIssues.map((i) => i.message),
    issues,
    ...(nextAction ? { nextAction } : {}),
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tool definition (exported for allTools array)
// ---------------------------------------------------------------------------

export const validateEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ValidateEntityInputSchema,
  outputSchema: ValidateEntityOutputSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Valid campaign create",
      input: {
        entityType: "campaign",
        mode: "create",
        adAccountId: "123456789",
        data: {
          name: "Summer Sale 2025",
          objective: "OUTCOME_AWARENESS",
          special_ad_categories: [],
        },
      },
    },
    {
      label: "Missing required fields (ad set)",
      input: {
        entityType: "adSet",
        mode: "create",
        adAccountId: "123456789",
        data: {
          name: "Test Ad Set",
        },
      },
    },
  ],
  logic: validateEntityLogic,
  responseFormatter: validateEntityResponseFormatter,
};
