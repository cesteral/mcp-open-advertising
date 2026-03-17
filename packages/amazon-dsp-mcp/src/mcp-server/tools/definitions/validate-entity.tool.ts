// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * amazon_dsp_validate_entity — Client-side schema validation for AmazonDsp Ads entities.
 *
 * AmazonDsp Marketing API does not have a dry-run mode, so this tool
 * validates payloads against known required-field rules before hitting the API.
 * It is purely local — no API calls, no session services needed.
 */

import { z } from "zod";
import { getEntityTypeEnum, type AmazonDspEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import {
  type FieldRule,
  validateRequiredFields,
  checkReadOnlyFields,
  validateEntityResponseFormatter,
} from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAME = "amazon_dsp_validate_entity";
const TOOL_TITLE = "AmazonDsp Ads Entity Validation (Client-Side)";
const TOOL_DESCRIPTION = `Validate an entity payload against known AmazonDsp Ads requirements without calling the API.

Checks required fields, data types, and common configuration mistakes.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

This is a pure client-side check — it catches missing required fields and
obvious type errors. The AmazonDsp API may still reject payloads for business-rule
reasons (e.g., invalid objective/placement combinations).`;

// ---------------------------------------------------------------------------
// Required-field definitions per entity type (create mode)
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS_CREATE: Record<AmazonDspEntityType, FieldRule[]> = {
  order: [
    { field: "name", expectedType: "string" },
    { field: "advertiserId", expectedType: "string" },
    { field: "budget", expectedType: "number", hint: "budget amount in account currency" },
    { field: "startDate", expectedType: "string", hint: "ISO date string (YYYY-MM-DD)" },
    { field: "endDate", expectedType: "string", hint: "ISO date string (YYYY-MM-DD)" },
  ],
  lineItem: [
    { field: "name", expectedType: "string" },
    { field: "orderId", expectedType: "string", hint: "Parent order ID" },
    { field: "budget", expectedType: "number" },
  ],
  creative: [
    { field: "name", expectedType: "string" },
    { field: "advertiserId", expectedType: "string" },
    { field: "creativeType", expectedType: "string", hint: "IMAGE, VIDEO, or RICH_MEDIA" },
  ],
};

/** Fields that are always read-only and cannot be set via the API. */
const READ_ONLY_FIELDS = [
  "orderId", "lineItemId", "creativeId",
  "createdTime", "modifiedTime",
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
    profileId: z
      .string()
      .optional()
      .describe("Advertiser ID (recommended for create mode)"),
  })
  .describe("Parameters for validating a AmazonDsp Ads entity payload");

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
    const rules = REQUIRED_FIELDS_CREATE[entityType as AmazonDspEntityType] ?? [];
    errors.push(...validateRequiredFields(data, rules));

    // Creative-specific: requires clickThroughUrl
    if (entityType === "creative") {
      if (!data.clickThroughUrl) {
        warnings.push('Creative should include "clickThroughUrl" for click tracking');
      }
    }
  }

  if (mode === "update") {
    if (Object.keys(data).length === 0) {
      errors.push("Update payload must contain at least one field to update");
    }

    warnings.push(
      ...checkReadOnlyFields(
        data,
        READ_ONLY_FIELDS,
        (field) => `Field "${field}" is a system field and may be ignored by the API on update`
      )
    );
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
      label: "Valid order create",
      input: {
        entityType: "order",
        mode: "create",
        profileId: "1234567890",
        data: {
          name: "Summer Sale 2026",
          advertiserId: "adv_123",
          budget: 10000,
          startDate: "2026-07-01",
          endDate: "2026-07-31",
        },
      },
    },
    {
      label: "Missing required fields (line item)",
      input: {
        entityType: "lineItem",
        mode: "create",
        profileId: "1234567890",
        data: {
          name: "Test Line Item",
        },
      },
    },
  ],
  logic: validateEntityLogic,
  responseFormatter: validateEntityResponseFormatter,
};