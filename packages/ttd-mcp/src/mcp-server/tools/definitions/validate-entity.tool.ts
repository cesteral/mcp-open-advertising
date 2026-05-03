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
  type ValidationIssue,
  validateRequiredFieldsStructured,
  validateEnumFieldsStructured,
  checkReadOnlyFieldsStructured,
  validateEntityResponseFormatter,
  buildNextAction,
} from "@cesteral/shared";
import type { SdkContext } from "@cesteral/shared";
import { mergeParentIdsIntoData } from "../utils/parent-id-validation.js";

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

// TTD REST API enum reference: https://api.thetradedesk.com/v3/portal/api/doc/
const PACING_MODES = ["PaceEvenly", "PaceAhead", "PaceAsap"] as const;
const AVAILABILITY = ["Available", "Archived"] as const;
const TRACKING_TAG_TYPES = [
  "Universal",
  "Standard",
  "Pixel",
  "JavaScript",
  "ServerToServer",
] as const;
const COMMON_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "SGD",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "MXN",
  "BRL",
  "INR",
  "CNY",
  "HKD",
  "NZD",
  "ZAR",
] as const;

const REQUIRED_FIELDS_CREATE: Record<TtdEntityType, FieldRule[]> = {
  advertiser: [
    { field: "PartnerId", expectedType: "string" },
    { field: "AdvertiserName", expectedType: "string" },
    {
      field: "CurrencyCode",
      expectedType: "string",
      hint: "ISO 4217 currency code",
      suggestedValues: COMMON_CURRENCIES,
    },
  ],
  campaign: [
    { field: "AdvertiserId", expectedType: "string" },
    { field: "CampaignName", expectedType: "string" },
    { field: "Budget", expectedType: "object", hint: "{ Amount, CurrencyCode }" },
    { field: "StartDate", expectedType: "string", hint: "ISO-8601 datetime" },
    {
      field: "PacingMode",
      expectedType: "string",
      hint: "Budget pacing strategy",
      suggestedValues: PACING_MODES,
    },
  ],
  adGroup: [
    { field: "AdvertiserId", expectedType: "string" },
    { field: "CampaignId", expectedType: "string" },
    { field: "AdGroupName", expectedType: "string" },
    {
      field: "RTBAttributes",
      expectedType: "object",
      hint: "must contain BudgetSettings and BaseBidCPM",
    },
  ],
  creative: [
    { field: "AdvertiserId", expectedType: "string" },
    { field: "CreativeName", expectedType: "string" },
  ],
  conversionTracker: [
    { field: "AdvertiserId", expectedType: "string" },
    { field: "TrackingTagName", expectedType: "string" },
  ],
};

/** Optional enum-typed fields validated when present (write-time fields, not required). */
const OPTIONAL_ENUM_FIELDS: Record<TtdEntityType, FieldRule[]> = {
  advertiser: [
    {
      field: "Availability",
      expectedType: "string",
      hint: "Advertiser availability state",
      suggestedValues: AVAILABILITY,
    },
  ],
  campaign: [
    {
      field: "Availability",
      expectedType: "string",
      hint: "Campaign availability state",
      suggestedValues: AVAILABILITY,
    },
  ],
  adGroup: [
    {
      field: "Availability",
      expectedType: "string",
      hint: "Ad group availability state",
      suggestedValues: AVAILABILITY,
    },
  ],
  creative: [],
  conversionTracker: [
    {
      field: "TrackingTagType",
      expectedType: "string",
      hint: "Conversion tracker tag type",
      suggestedValues: TRACKING_TAG_TYPES,
    },
  ],
};

/** Fields that are always read-only and cannot be set via the API. */
const READ_ONLY_FIELDS = ["CreatedAtUtc", "LastUpdatedAtUtc"];

/** Budget-related fields — warn if values look suspiciously low. */
const BUDGET_FIELDS = ["Amount"];

// ---------------------------------------------------------------------------
// Input / Output schemas
// ---------------------------------------------------------------------------

export const ValidateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to validate"),
    mode: z.enum(["create", "update"]).describe("Whether validating for creation or update"),
    entityId: z.string().optional().describe("Entity ID (recommended for update mode)"),
    partnerId: z
      .string()
      .optional()
      .describe(
        "Partner ID (merged into data as PartnerId before validation, mirrors create tool)"
      ),
    advertiserId: z
      .string()
      .optional()
      .describe("Advertiser ID (merged into data before validation, mirrors create/update tools)"),
    campaignId: z.string().optional().describe("Campaign ID (merged into data before validation)"),
    adGroupId: z.string().optional().describe("Ad group ID (merged into data before validation)"),
    data: z.record(z.any()).describe("Entity payload to validate"),
  })
  .describe("Parameters for validating a TTD entity payload");

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
    entityType: z.string().describe("Entity type that was validated"),
    mode: z.string().describe("Validation mode (create or update)"),
    errors: z.array(z.string()).describe("Validation errors (empty if valid)"),
    warnings: z.array(z.string()).describe("Non-blocking warnings"),
    issues: z.array(ValidationIssueSchema),
    nextAction: z.string().optional(),
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
  const issues: ValidationIssue[] = [];

  const rules = REQUIRED_FIELDS_CREATE[entityType as TtdEntityType] ?? [];
  const optionalRules = OPTIONAL_ENUM_FIELDS[entityType as TtdEntityType] ?? [];

  // Enum validation runs in both modes — invalid enum values are equally
  // invalid on update.
  issues.push(...validateEnumFieldsStructured(data, [...rules, ...optionalRules]));

  if (mode === "create") {
    issues.push(...validateRequiredFieldsStructured(data, rules));

    // Campaign-specific: Budget must have Amount and CurrencyCode
    if (entityType === "campaign" && data.Budget && typeof data.Budget === "object") {
      const budget = data.Budget as Record<string, unknown>;
      if (budget.Amount === undefined) {
        issues.push({
          field: "Budget.Amount",
          code: "missing",
          message: 'Field "Budget.Amount" is required',
          severity: "error",
        });
      }
      if (!budget.CurrencyCode) {
        issues.push({
          field: "Budget.CurrencyCode",
          code: "missing",
          message: 'Field "Budget.CurrencyCode" is required',
          severity: "error",
        });
      }
    }

    // AdGroup-specific: RTBAttributes must contain BudgetSettings and BaseBidCPM
    if (entityType === "adGroup" && data.RTBAttributes && typeof data.RTBAttributes === "object") {
      const rtb = data.RTBAttributes as Record<string, unknown>;
      if (!rtb.BudgetSettings) {
        issues.push({
          field: "RTBAttributes.BudgetSettings",
          code: "missing",
          message: 'Field "RTBAttributes.BudgetSettings" is recommended for ad group creation',
          severity: "warning",
        });
      }
      if (!rtb.BaseBidCPM) {
        issues.push({
          field: "RTBAttributes.BaseBidCPM",
          code: "missing",
          message: 'Field "RTBAttributes.BaseBidCPM" is recommended for ad group creation',
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

  // Budget validation (both modes) — check nested Budget.Amount
  const budgetObj = data.Budget;
  if (budgetObj && typeof budgetObj === "object") {
    const amount = (budgetObj as Record<string, unknown>).Amount;
    if (amount !== undefined && typeof amount === "number" && amount <= 0) {
      issues.push({
        field: "Budget.Amount",
        code: "invalidValue",
        message: 'Field "Budget.Amount" must be a positive number',
        severity: "error",
      });
    }
  }

  // Top-level Amount fields (e.g., in BaseBidCPM objects)
  for (const field of BUDGET_FIELDS) {
    const value = data[field];
    if (value !== undefined && typeof value === "number" && value <= 0) {
      issues.push({
        field,
        code: "invalidValue",
        message: `Field "${field}" must be a positive number`,
        severity: "error",
      });
    }
  }

  const errorIssues = issues.filter((i) => i.severity !== "warning");
  const warningIssues = issues.filter((i) => i.severity === "warning");

  let nextAction: string | undefined;
  if (errorIssues.length > 0) {
    const parentMissing = errorIssues.find((i) =>
      ["AdvertiserId", "CampaignId", "AdGroupId", "PartnerId"].includes(i.field)
    );
    if (parentMissing) {
      nextAction = buildNextAction({
        kind: "list-entity",
        tool: "ttd_list_entities",
        field: parentMissing.field,
      });
    } else {
      nextAction = buildNextAction({
        kind: "read-resource",
        uri: `ttd-field-rules://${entityType}`,
        purpose: `the ${entityType} required-field reference`,
      });
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
