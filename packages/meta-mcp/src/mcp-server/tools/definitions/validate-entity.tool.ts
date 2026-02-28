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
import type { SdkContext } from "../../../types-global/mcp.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAME = "meta_validate_entity";
const TOOL_TITLE = "Meta Ads Entity Validation (Client-Side)";
const TOOL_DESCRIPTION = `Validate an entity payload against known Meta Ads requirements without calling the API. Checks required fields, data types, and common configuration mistakes.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

This is a pure client-side check — it will catch missing required fields and
obvious type errors, but the Meta API may still reject payloads for
business-rule reasons (e.g., invalid objective/optimization_goal combinations).`;

// ---------------------------------------------------------------------------
// Required-field definitions per entity type (create mode)
// ---------------------------------------------------------------------------

interface FieldRule {
  /** Human-readable field name */
  field: string;
  /** Optional type check (typeof result or "array") */
  expectedType?: "string" | "number" | "object" | "array" | "boolean";
  /** Extra detail shown in the error message */
  hint?: string;
}

const REQUIRED_FIELDS_CREATE: Record<MetaEntityType, FieldRule[]> = {
  campaign: [
    { field: "name", expectedType: "string" },
    { field: "objective", expectedType: "string", hint: "e.g., OUTCOME_AWARENESS, OUTCOME_TRAFFIC" },
    { field: "special_ad_categories", expectedType: "array", hint: "must be an array (can be empty [])" },
  ],
  adSet: [
    { field: "name", expectedType: "string" },
    { field: "campaign_id", expectedType: "string" },
    { field: "optimization_goal", expectedType: "string", hint: "e.g., LINK_CLICKS, IMPRESSIONS" },
    { field: "billing_event", expectedType: "string", hint: "e.g., IMPRESSIONS, LINK_CLICKS" },
    { field: "targeting", expectedType: "object", hint: "must be an object with targeting spec" },
    { field: "status", expectedType: "string", hint: "e.g., PAUSED, ACTIVE" },
  ],
  ad: [
    { field: "name", expectedType: "string" },
    { field: "adset_id", expectedType: "string" },
    { field: "creative", expectedType: "object", hint: "must be an object with creative_id" },
  ],
  adCreative: [
    { field: "name", expectedType: "string" },
  ],
  customAudience: [
    { field: "name", expectedType: "string" },
    { field: "subtype", expectedType: "string", hint: "e.g., CUSTOM, LOOKALIKE, WEBSITE" },
  ],
};

/** Fields that are always read-only and cannot be written via the API. */
const READ_ONLY_FIELDS = ["id", "created_time", "updated_time", "time_created", "time_updated"];

/** Fields whose values are in cents — warn if they look suspiciously low. */
const BUDGET_FIELDS = ["daily_budget", "lifetime_budget", "bid_amount"];

// ---------------------------------------------------------------------------
// Input / Output schemas
// ---------------------------------------------------------------------------

export const ValidateEntityInputSchema = z
  .object({
    entityType: z
      .enum(getEntityTypeEnum())
      .describe("Type of entity to validate"),
    mode: z
      .enum(["create", "update"])
      .describe("Whether validating for creation or update"),
    data: z
      .record(z.any())
      .describe("Entity payload to validate"),
    adAccountId: z
      .string()
      .optional()
      .describe("Ad Account ID (required for create mode, except customAudience)"),
  })
  .superRefine((val, ctx) => {
    if (
      val.mode === "create" &&
      val.entityType !== "customAudience" &&
      !val.adAccountId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adAccountId"],
        message: "adAccountId is required when mode is 'create' (except for customAudience)",
      });
    }
  })
  .describe("Parameters for validating a Meta Ads entity payload");

export const ValidateEntityOutputSchema = z
  .object({
    valid: z.boolean().describe("Whether the payload passed validation"),
    entityType: z.string().describe("Entity type that was validated"),
    mode: z.string().describe("Validation mode (create or update)"),
    errors: z.array(z.string()).describe("Validation errors (empty if valid)"),
    warnings: z.array(z.string()).describe("Non-blocking warnings"),
    timestamp: z.string().datetime().describe("ISO-8601 timestamp of validation"),
  })
  .describe("Validation result");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ValidateEntityInput = z.infer<typeof ValidateEntityInputSchema>;
type ValidateEntityOutput = z.infer<typeof ValidateEntityOutputSchema>;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function checkType(value: unknown, expected: FieldRule["expectedType"]): boolean {
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
  return typeof value === expected;
}

// ---------------------------------------------------------------------------
// Logic (pure — no API calls, no session services)
// ---------------------------------------------------------------------------

export async function validateEntityLogic(
  input: ValidateEntityInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<ValidateEntityOutput> {
  const { entityType, mode, data } = input;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (mode === "create") {
    // ── Required-field checks ──────────────────────────────────────────
    const rules = REQUIRED_FIELDS_CREATE[entityType as MetaEntityType] ?? [];

    for (const rule of rules) {
      const value = data[rule.field];

      if (value === undefined || value === null) {
        const msg = rule.hint
          ? `Missing required field "${rule.field}" (${rule.hint})`
          : `Missing required field "${rule.field}"`;
        errors.push(msg);
        continue;
      }

      if (rule.expectedType && !checkType(value, rule.expectedType)) {
        const actual = Array.isArray(value) ? "array" : typeof value;
        errors.push(
          `Field "${rule.field}" should be ${rule.expectedType} but got ${actual}${rule.hint ? ` (${rule.hint})` : ""}`
        );
      }
    }

    // ── Ad-specific: creative must contain creative_id ─────────────────
    if (entityType === "ad" && data.creative && typeof data.creative === "object" && !Array.isArray(data.creative)) {
      if (!data.creative.creative_id) {
        errors.push('Field "creative" object must contain "creative_id"');
      }
    }
  }

  if (mode === "update") {
    // ── Data must not be empty ─────────────────────────────────────────
    if (Object.keys(data).length === 0) {
      errors.push("Update payload must contain at least one field to update");
    }

    // ── Warn about read-only fields ────────────────────────────────────
    for (const field of READ_ONLY_FIELDS) {
      if (field in data) {
        warnings.push(`Field "${field}" is read-only and will be ignored by the API`);
      }
    }
  }

  // ── Budget warnings (both modes) ──────────────────────────────────────
  for (const field of BUDGET_FIELDS) {
    const value = data[field];
    if (value !== undefined && typeof value === "number") {
      if (value > 0 && value < 100) {
        warnings.push(
          `Field "${field}" is ${value} — budget values are in cents (e.g., 1000 = $10 USD). Did you mean ${value * 100}?`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    entityType,
    mode,
    errors,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Response formatter
// ---------------------------------------------------------------------------

export function validateEntityResponseFormatter(result: ValidateEntityOutput): unknown[] {
  const lines: string[] = [];

  if (result.valid) {
    lines.push(`Validation passed for ${result.entityType} (${result.mode})`);
  } else {
    lines.push(`Validation failed for ${result.entityType} (${result.mode}):`);
    for (const err of result.errors) {
      lines.push(`  - ${err}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warn of result.warnings) {
      lines.push(`  - ${warn}`);
    }
  }

  lines.push("");
  lines.push(`Timestamp: ${result.timestamp}`);

  return [
    {
      type: "text" as const,
      text: lines.join("\n"),
    },
  ];
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
