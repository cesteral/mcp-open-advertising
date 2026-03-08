/**
 * tiktok_validate_entity — Client-side schema validation for TikTok Ads entities.
 *
 * TikTok Marketing API does not have a dry-run mode, so this tool
 * validates payloads against known required-field rules before hitting the API.
 * It is purely local — no API calls, no session services needed.
 */

import { z } from "zod";
import { getEntityTypeEnum, type TikTokEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAME = "tiktok_validate_entity";
const TOOL_TITLE = "TikTok Ads Entity Validation (Client-Side)";
const TOOL_DESCRIPTION = `Validate an entity payload against known TikTok Ads requirements without calling the API.

Checks required fields, data types, and common configuration mistakes.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

This is a pure client-side check — it catches missing required fields and
obvious type errors. The TikTok API may still reject payloads for business-rule
reasons (e.g., invalid objective/placement combinations).`;

// ---------------------------------------------------------------------------
// Required-field definitions per entity type (create mode)
// ---------------------------------------------------------------------------

interface FieldRule {
  field: string;
  expectedType?: "string" | "number" | "object" | "array" | "boolean";
  hint?: string;
}

const REQUIRED_FIELDS_CREATE: Record<TikTokEntityType, FieldRule[]> = {
  campaign: [
    { field: "campaign_name", expectedType: "string" },
    { field: "objective_type", expectedType: "string", hint: "e.g., TRAFFIC, APP_INSTALLS, CONVERSIONS" },
    { field: "budget_mode", expectedType: "string", hint: "BUDGET_MODE_DAY or BUDGET_MODE_TOTAL" },
    { field: "budget", expectedType: "number", hint: "budget amount in account currency" },
  ],
  adGroup: [
    { field: "campaign_id", expectedType: "string" },
    { field: "adgroup_name", expectedType: "string" },
    { field: "placement_type", expectedType: "string", hint: "e.g., PLACEMENT_TYPE_NORMAL, PLACEMENT_TYPE_SEARCH" },
    { field: "budget_mode", expectedType: "string", hint: "BUDGET_MODE_DAY or BUDGET_MODE_TOTAL" },
    { field: "budget", expectedType: "number" },
    { field: "schedule_type", expectedType: "string", hint: "SCHEDULE_START_END or SCHEDULE_ALWAYS" },
    { field: "optimize_goal", expectedType: "string", hint: "e.g., CLICK, CONVERT, SHOW, REACH" },
  ],
  ad: [
    { field: "adgroup_id", expectedType: "string" },
    { field: "ad_name", expectedType: "string" },
    { field: "creative_type", expectedType: "string", hint: "e.g., SINGLE_VIDEO, SINGLE_IMAGE, CAROUSEL" },
  ],
  creative: [
    { field: "display_name", expectedType: "string" },
  ],
};

/** Fields that are always read-only and cannot be set via the API. */
const READ_ONLY_FIELDS = [
  "campaign_id", "adgroup_id", "ad_id", "creative_id",
  "created_time", "modify_time",
];

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
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (recommended for create mode)"),
  })
  .describe("Parameters for validating a TikTok Ads entity payload");

export const ValidateEntityOutputSchema = z
  .object({
    valid: z.boolean().describe("Whether the payload passed validation"),
    entityType: z.string(),
    mode: z.string(),
    errors: z.array(z.string()).describe("Validation errors (empty if valid)"),
    warnings: z.array(z.string()).describe("Non-blocking warnings"),
    timestamp: z.string().datetime(),
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
    const rules = REQUIRED_FIELDS_CREATE[entityType as TikTokEntityType] ?? [];

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

    // Ad-specific: creative requires at least one of image_ids or video_id
    if (entityType === "ad") {
      if (!data.image_ids && !data.video_id) {
        warnings.push('Ad creative requires either "image_ids" (array) or "video_id" (string)');
      }
    }
  }

  if (mode === "update") {
    if (Object.keys(data).length === 0) {
      errors.push("Update payload must contain at least one field to update");
    }

    for (const field of READ_ONLY_FIELDS) {
      if (field in data) {
        warnings.push(`Field "${field}" is a system field and may be ignored by the API on update`);
      }
    }
  }

  // Budget warnings (both modes)
  const budgetValue = data.budget;
  if (budgetValue !== undefined && typeof budgetValue === "number") {
    if (budgetValue <= 0) {
      errors.push('Field "budget" must be a positive number');
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

  return [{ type: "text" as const, text: lines.join("\n") }];
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
        advertiserId: "1234567890",
        data: {
          campaign_name: "Summer Sale 2026",
          objective_type: "TRAFFIC",
          budget_mode: "BUDGET_MODE_DAY",
          budget: 100,
        },
      },
    },
    {
      label: "Missing required fields (ad group)",
      input: {
        entityType: "adGroup",
        mode: "create",
        advertiserId: "1234567890",
        data: {
          adgroup_name: "Test Ad Group",
        },
      },
    },
  ],
  logic: validateEntityLogic,
  responseFormatter: validateEntityResponseFormatter,
};
