// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * pinterest_validate_entity — Client-side schema validation for Pinterest Ads entities.
 *
 * Pinterest Marketing API does not have a dry-run mode, so this tool
 * validates payloads against known required-field rules before hitting the API.
 * It is purely local — no API calls, no session services needed.
 */

import { z } from "zod";
import { getEntityTypeEnum, type PinterestEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import {
  type FieldRule,
  type ValidationIssue,
  validateRequiredFieldsStructured,
  checkReadOnlyFieldsStructured,
  validateEntityResponseFormatter,
} from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAME = "pinterest_validate_entity";
const TOOL_TITLE = "Pinterest Ads Entity Validation (Client-Side)";
const TOOL_DESCRIPTION = `Validate an entity payload against known Pinterest Ads requirements without calling the API.

Checks required fields, data types, and common configuration mistakes.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

This is a pure client-side check — it catches missing required fields and
obvious type errors. The Pinterest API may still reject payloads for business-rule
reasons (e.g., invalid objective/placement combinations).`;

// ---------------------------------------------------------------------------
// Required-field definitions per entity type (create mode)
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS_CREATE: Record<PinterestEntityType, FieldRule[]> = {
  campaign: [
    { field: "campaign_name", expectedType: "string" },
    {
      field: "objective_type",
      expectedType: "string",
      hint: "e.g., TRAFFIC, APP_INSTALLS, CONVERSIONS",
    },
    { field: "budget_mode", expectedType: "string", hint: "BUDGET_MODE_DAY or BUDGET_MODE_TOTAL" },
    { field: "budget", expectedType: "number", hint: "budget amount in account currency" },
  ],
  adGroup: [
    { field: "campaign_id", expectedType: "string" },
    { field: "adgroup_name", expectedType: "string" },
    {
      field: "placement_type",
      expectedType: "string",
      hint: "e.g., PLACEMENT_TYPE_NORMAL, PLACEMENT_TYPE_SEARCH",
    },
    { field: "budget_mode", expectedType: "string", hint: "BUDGET_MODE_DAY or BUDGET_MODE_TOTAL" },
    { field: "budget", expectedType: "number" },
    {
      field: "schedule_type",
      expectedType: "string",
      hint: "SCHEDULE_START_END or SCHEDULE_ALWAYS",
    },
    { field: "optimize_goal", expectedType: "string", hint: "e.g., CLICK, CONVERT, SHOW, REACH" },
  ],
  ad: [
    { field: "adgroup_id", expectedType: "string" },
    { field: "ad_name", expectedType: "string" },
    {
      field: "creative_type",
      expectedType: "string",
      hint: "e.g., SINGLE_VIDEO, SINGLE_IMAGE, CAROUSEL",
    },
  ],
  creative: [{ field: "display_name", expectedType: "string" }],
};

/** Fields that are always read-only and cannot be set via the API. */
const READ_ONLY_FIELDS = [
  "campaign_id",
  "adgroup_id",
  "ad_id",
  "creative_id",
  "created_time",
  "modify_time",
];

// ---------------------------------------------------------------------------
// Input / Output schemas
// ---------------------------------------------------------------------------

export const ValidateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to validate"),
    mode: z.enum(["create", "update"]).describe("Whether validating for creation or update"),
    data: z.record(z.any()).describe("Entity payload to validate"),
    adAccountId: z.string().optional().describe("Advertiser ID (recommended for create mode)"),
  })
  .describe("Parameters for validating a Pinterest Ads entity payload");

const ValidationIssueSchema = z.object({
  field: z.string(),
  code: z.enum(["missing", "wrongType", "invalidValue", "readOnly", "custom"]),
  message: z.string(),
  hint: z.string().optional(),
  suggestedValues: z.array(z.string()).optional(),
  severity: z.enum(["error", "warning"]).optional(),
});

export const ValidateEntityOutputSchema = z
  .object({
    valid: z.boolean().describe("Whether the payload passed validation"),
    entityType: z.string(),
    mode: z.string(),
    errors: z.array(z.string()).describe("Validation errors (empty if valid)"),
    warnings: z.array(z.string()).describe("Non-blocking warnings"),
    issues: z.array(ValidationIssueSchema),
    nextAction: z.string().optional(),
    timestamp: z.string().datetime(),
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
    const rules = REQUIRED_FIELDS_CREATE[entityType as PinterestEntityType] ?? [];
    issues.push(...validateRequiredFieldsStructured(data, rules));

    // Ad-specific: creative requires at least one of image_ids or video_id
    if (entityType === "ad") {
      if (!data.image_ids && !data.video_id) {
        issues.push({
          field: "image_ids",
          code: "missing",
          message: 'Ad creative requires either "image_ids" (array) or "video_id" (string)',
          suggestedValues: ["image_ids", "video_id"],
          severity: "warning",
        });
      }
    }
  }

  if (mode === "update") {
    if (Object.keys(data).length === 0) {
      issues.push({
        field: "data",
        code: "custom",
        message: "Update payload must contain at least one field to update",
        severity: "error",
      });
    }

    issues.push(
      ...checkReadOnlyFieldsStructured(
        data,
        READ_ONLY_FIELDS,
        (field) => `Field "${field}" is a system field and may be ignored by the API on update`
      )
    );
  }

  // Budget validation (both modes)
  const budgetValue = data.budget;
  if (budgetValue !== undefined && typeof budgetValue === "number") {
    if (budgetValue <= 0) {
      issues.push({
        field: "budget",
        code: "invalidValue",
        message: 'Field "budget" must be a positive number',
        severity: "error",
      });
    }
  }

  const errorIssues = issues.filter((i) => i.severity !== "warning");
  const warningIssues = issues.filter((i) => i.severity === "warning");

  return {
    valid: errorIssues.length === 0,
    entityType,
    mode,
    errors: errorIssues.map((i) => i.message),
    warnings: warningIssues.map((i) => i.message),
    issues,
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
        adAccountId: "1234567890",
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
        adAccountId: "1234567890",
        data: {
          adgroup_name: "Test Ad Group",
        },
      },
    },
  ],
  logic: validateEntityLogic,
  responseFormatter: validateEntityResponseFormatter,
};
