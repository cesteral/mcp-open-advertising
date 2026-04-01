// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * ttd_validate_entity — Client-side schema validation for TTD entities.
 *
 * TTD has no native dry-run / validate-only mode, so this tool
 * validates payloads against known required-field rules before hitting the API.
 * It is purely local — no API calls, no session services needed.
 */

import { z } from "zod";
import { getEntityTypeEnum, type TtdEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import {
  type FieldRule,
  validateRequiredFields,
  checkReadOnlyFields,
  validateEntityResponseFormatter,
} from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import {
  mergeParentIdsIntoData,
} from "../utils/parent-id-validation.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAME = "ttd_validate_entity";
const TOOL_TITLE = "TTD Entity Validation (Client-Side)";
const TOOL_DESCRIPTION = `Validate an entity payload against known TTD requirements without calling the API. Checks required fields, data types, and common configuration mistakes.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

This is a pure client-side check — it catches missing required fields and
obvious type errors. The TTD API may still reject payloads for business-rule
reasons (e.g., invalid pacing mode / budget combinations).`;

// ---------------------------------------------------------------------------
// Required-field definitions per entity type (create mode)
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS_CREATE: Record<TtdEntityType, FieldRule[]> = {
  advertiser: [
    { field: "PartnerId", expectedType: "string" },
    { field: "AdvertiserName", expectedType: "string" },
    { field: "CurrencyCode", expectedType: "string", hint: "e.g., USD, EUR, GBP" },
  ],
  campaign: [
    { field: "AdvertiserId", expectedType: "string" },
    { field: "CampaignName", expectedType: "string" },
    { field: "Budget", expectedType: "object", hint: "{ Amount, CurrencyCode }" },
    { field: "StartDate", expectedType: "string", hint: "ISO-8601 datetime" },
    { field: "PacingMode", expectedType: "string", hint: "e.g., PaceEvenly, PaceAhead, PaceAsap" },
  ],
  adGroup: [
    { field: "AdvertiserId", expectedType: "string" },
    { field: "CampaignId", expectedType: "string" },
    { field: "AdGroupName", expectedType: "string" },
    { field: "RTBAttributes", expectedType: "object", hint: "must contain BudgetSettings and BaseBidCPM" },
  ],
  ad: [
    { field: "AdvertiserId", expectedType: "string" },
    { field: "AdGroupId", expectedType: "string" },
    { field: "CreativeIds", expectedType: "array", hint: "array of creative IDs to associate" },
  ],
  creative: [
    { field: "AdvertiserId", expectedType: "string" },
    { field: "CreativeName", expectedType: "string" },
  ],
  siteList: [
    { field: "AdvertiserId", expectedType: "string" },
    { field: "SiteListName", expectedType: "string" },
  ],
  deal: [
    { field: "AdvertiserId", expectedType: "string" },
    { field: "DealName", expectedType: "string" },
  ],
  conversionTracker: [
    { field: "AdvertiserId", expectedType: "string" },
    { field: "TrackingTagName", expectedType: "string" },
  ],
  bidList: [
    { field: "AdvertiserId", expectedType: "string" },
    { field: "BidListName", expectedType: "string" },
  ],
};

/** Fields that are always read-only and cannot be set via the API. */
const READ_ONLY_FIELDS = [
  "CreatedAtUtc", "LastUpdatedAtUtc",
];

/** Budget-related fields — warn if values look suspiciously low. */
const BUDGET_FIELDS = ["Amount"];

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
    entityId: z
      .string()
      .optional()
      .describe("Entity ID (recommended for update mode)"),
    partnerId: z
      .string()
      .optional()
      .describe("Partner ID (merged into data as PartnerId before validation, mirrors create tool)"),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (merged into data before validation, mirrors create/update tools)"),
    campaignId: z
      .string()
      .optional()
      .describe("Campaign ID (merged into data before validation)"),
    adGroupId: z
      .string()
      .optional()
      .describe("Ad group ID (merged into data before validation)"),
    data: z
      .record(z.any())
      .describe("Entity payload to validate"),
  })
  .describe("Parameters for validating a TTD entity payload");

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
// Logic (pure — no API calls, no session services)
// ---------------------------------------------------------------------------

export async function validateEntityLogic(
  input: ValidateEntityInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<ValidateEntityOutput> {
  const { entityType, mode } = input;
  // Merge top-level parent IDs into data — mirrors the create/update tool behaviour
  const data = mergeParentIdsIntoData(input.data, input as Record<string, unknown>);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (mode === "create") {
    // Required-field checks
    const rules = REQUIRED_FIELDS_CREATE[entityType as TtdEntityType] ?? [];
    errors.push(...validateRequiredFields(data, rules));

    // Campaign-specific: Budget must have Amount and CurrencyCode
    if (entityType === "campaign" && data.Budget && typeof data.Budget === "object") {
      const budget = data.Budget as Record<string, unknown>;
      if (budget.Amount === undefined) {
        errors.push('Field "Budget.Amount" is required');
      }
      if (!budget.CurrencyCode) {
        errors.push('Field "Budget.CurrencyCode" is required');
      }
    }

    // AdGroup-specific: RTBAttributes must contain BudgetSettings and BaseBidCPM
    if (entityType === "adGroup" && data.RTBAttributes && typeof data.RTBAttributes === "object") {
      const rtb = data.RTBAttributes as Record<string, unknown>;
      if (!rtb.BudgetSettings) {
        warnings.push('Field "RTBAttributes.BudgetSettings" is recommended for ad group creation');
      }
      if (!rtb.BaseBidCPM) {
        warnings.push('Field "RTBAttributes.BaseBidCPM" is recommended for ad group creation');
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

  // Budget warnings (both modes) — check nested Budget.Amount
  const budgetObj = data.Budget;
  if (budgetObj && typeof budgetObj === "object") {
    const amount = (budgetObj as Record<string, unknown>).Amount;
    if (amount !== undefined && typeof amount === "number" && amount <= 0) {
      errors.push('Field "Budget.Amount" must be a positive number');
    }
  }

  // Top-level Amount fields (e.g., in BaseBidCPM objects)
  for (const field of BUDGET_FIELDS) {
    const value = data[field];
    if (value !== undefined && typeof value === "number" && value <= 0) {
      errors.push(`Field "${field}" must be a positive number`);
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
      label: "Valid campaign create",
      input: {
        entityType: "campaign",
        mode: "create",
        data: {
          AdvertiserId: "adv123abc",
          CampaignName: "Q1 2025 Brand Awareness",
          Budget: { Amount: 50000, CurrencyCode: "USD" },
          StartDate: "2025-01-01T00:00:00Z",
          EndDate: "2025-03-31T23:59:59Z",
          PacingMode: "PaceEvenly",
        },
      },
    },
    {
      label: "Missing required fields (ad group)",
      input: {
        entityType: "adGroup",
        mode: "create",
        data: {
          AdGroupName: "Prospecting - Display",
        },
      },
    },
  ],
  logic: validateEntityLogic,
  responseFormatter: validateEntityResponseFormatter,
};