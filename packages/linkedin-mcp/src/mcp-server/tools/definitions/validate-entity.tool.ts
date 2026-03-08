/**
 * linkedin_validate_entity — Client-side schema validation for LinkedIn Ads entities.
 *
 * Validates payloads against known required-field rules before hitting the API.
 * Purely local — no API calls, no session services needed.
 */

import { z } from "zod";
import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import {
  type FieldRule,
  validateRequiredFields,
  checkReadOnlyFields,
  validateEntityResponseFormatter,
} from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_NAME = "linkedin_validate_entity";
const TOOL_TITLE = "LinkedIn Ads Entity Validation (Client-Side)";
const TOOL_DESCRIPTION = `Validate an entity payload against known LinkedIn Ads requirements without calling the API.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Checks required fields, data types, and common configuration mistakes.
The LinkedIn API may still reject payloads for business-rule reasons.`;

// ---------------------------------------------------------------------------
// Required-field definitions per entity type (create mode)
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS_CREATE: Record<LinkedInEntityType, FieldRule[]> = {
  adAccount: [
    { field: "name", expectedType: "string" },
    { field: "type", expectedType: "string", hint: "e.g., BUSINESS, ENTERPRISE" },
    { field: "currency", expectedType: "string", hint: "ISO 4217 currency code (e.g., USD)" },
  ],
  campaignGroup: [
    { field: "name", expectedType: "string" },
    { field: "account", expectedType: "string", hint: "Ad account URN (e.g., urn:li:sponsoredAccount:123)" },
    { field: "status", expectedType: "string", hint: "e.g., DRAFT, ACTIVE, PAUSED" },
  ],
  campaign: [
    { field: "name", expectedType: "string" },
    { field: "campaignGroup", expectedType: "string", hint: "Campaign group URN" },
    { field: "account", expectedType: "string", hint: "Ad account URN" },
    { field: "type", expectedType: "string", hint: "e.g., SPONSORED_UPDATES, TEXT_AD, DYNAMIC" },
    { field: "objectiveType", expectedType: "string", hint: "e.g., BRAND_AWARENESS, WEBSITE_TRAFFIC" },
    { field: "status", expectedType: "string", hint: "e.g., DRAFT, ACTIVE, PAUSED" },
  ],
  creative: [
    { field: "campaign", expectedType: "string", hint: "Campaign URN" },
    { field: "status", expectedType: "string", hint: "e.g., DRAFT, ACTIVE, PAUSED" },
    { field: "reference", expectedType: "string", hint: "Content reference URN" },
  ],
  conversionRule: [
    { field: "name", expectedType: "string" },
    { field: "type", expectedType: "string", hint: "e.g., PURCHASE, ADD_TO_CART, DOWNLOAD, SIGN_UP" },
    { field: "account", expectedType: "string", hint: "Ad account URN" },
    { field: "status", expectedType: "string", hint: "e.g., ACTIVE, PAUSED" },
  ],
};

const READ_ONLY_FIELDS = ["id", "changeAuditStamps", "created", "lastModified", "review"];

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
  })
  .describe("Parameters for validating a LinkedIn Ads entity payload");

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
  const { entityType, mode, data } = input;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (mode === "create") {
    const rules = REQUIRED_FIELDS_CREATE[entityType as LinkedInEntityType] ?? [];
    errors.push(...validateRequiredFields(data, rules));

    // Validate URN format for known URN fields
    const urnFields = ["account", "campaignGroup", "campaign"];
    for (const field of urnFields) {
      const value = data[field];
      if (value && typeof value === "string" && !value.startsWith("urn:li:")) {
        warnings.push(
          `Field "${field}" value "${value}" doesn't look like a LinkedIn URN. Expected format: urn:li:{type}:{id}`
        );
      }
    }
  }

  if (mode === "update") {
    if (Object.keys(data).length === 0) {
      errors.push("Update payload must contain at least one field to update");
    }

    warnings.push(...checkReadOnlyFields(data, READ_ONLY_FIELDS));
  }

  // Budget amount format warnings (both modes)
  const budgetFields = ["dailyBudget", "totalBudget", "unitCost"];
  for (const field of budgetFields) {
    const value = data[field];
    if (value !== undefined && typeof value === "object" && value !== null) {
      const budgetObj = value as Record<string, unknown>;
      if (!budgetObj.amount || !budgetObj.currencyCode) {
        warnings.push(
          `Field "${field}" should be an object with "amount" (string) and "currencyCode" (e.g., USD). Got: ${JSON.stringify(value)}`
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
          name: "Q1 LinkedIn Campaign",
          campaignGroup: "urn:li:sponsoredCampaignGroup:987654321",
          account: "urn:li:sponsoredAccount:123456789",
          type: "SPONSORED_UPDATES",
          objectiveType: "BRAND_AWARENESS",
          status: "DRAFT",
        },
      },
    },
    {
      label: "Missing required fields (campaign group)",
      input: {
        entityType: "campaignGroup",
        mode: "create",
        data: {
          name: "Test Campaign Group",
        },
      },
    },
  ],
  logic: validateEntityLogic,
  responseFormatter: validateEntityResponseFormatter,
};
