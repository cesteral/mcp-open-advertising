// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * linkedin_validate_entity — Client-side schema validation for LinkedIn Ads entities.
 *
 * Validates payloads against known required-field rules before hitting the API.
 * Purely local — no API calls, no session services needed.
 */

import { getEntityTypeEnum, type LinkedInEntityType } from "../utils/entity-mapping.js";
import { type FieldRule, createValidateEntityTool } from "@cesteral/shared";

const ACCOUNT_STATUSES = ["ACTIVE", "CANCELED", "DRAFT", "PENDING_DELETION", "REMOVED"] as const;
const CAMPAIGN_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
  "COMPLETED",
  "CANCELED",
  "DRAFT",
  "PENDING_DELETION",
  "REMOVED",
] as const;
const CREATIVE_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
  "DRAFT",
  "PENDING_DELETION",
  "CANCELED",
  "REMOVED",
] as const;
const CAMPAIGN_TYPES = [
  "TEXT_AD",
  "SPONSORED_UPDATES",
  "SPONSORED_INMAILS",
  "DYNAMIC",
  "STANDARD_UPDATE",
] as const;
const OBJECTIVE_TYPES = [
  "BRAND_AWARENESS",
  "WEBSITE_VISIT",
  "ENGAGEMENT",
  "VIDEO_VIEW",
  "LEAD_GENERATION",
  "WEBSITE_CONVERSION",
  "JOB_APPLICANT",
  "TALENT_LEAD",
] as const;
const CONVERSION_TYPES = [
  "ADD_TO_CART",
  "DOWNLOAD",
  "INSTALL",
  "KEY_PAGE_VIEW",
  "LEAD",
  "PURCHASE",
  "SIGN_UP",
  "OTHER",
] as const;
const ACCOUNT_TYPES = ["BUSINESS", "ENTERPRISE"] as const;

const REQUIRED_FIELDS_CREATE: Record<LinkedInEntityType, FieldRule[]> = {
  adAccount: [
    { field: "name", expectedType: "string" },
    { field: "type", expectedType: "string", hint: "Account type", suggestedValues: ACCOUNT_TYPES },
    { field: "currency", expectedType: "string", hint: "ISO 4217 currency code (e.g., USD)" },
  ],
  campaignGroup: [
    { field: "name", expectedType: "string" },
    {
      field: "account",
      expectedType: "string",
      hint: "Ad account URN (e.g., urn:li:sponsoredAccount:123)",
    },
    {
      field: "status",
      expectedType: "string",
      hint: "Campaign group lifecycle status",
      suggestedValues: ACCOUNT_STATUSES,
    },
  ],
  campaign: [
    { field: "name", expectedType: "string" },
    { field: "campaignGroup", expectedType: "string", hint: "Campaign group URN" },
    { field: "account", expectedType: "string", hint: "Ad account URN" },
    {
      field: "type",
      expectedType: "string",
      hint: "Campaign creative format",
      suggestedValues: CAMPAIGN_TYPES,
    },
    {
      field: "objectiveType",
      expectedType: "string",
      hint: "Campaign optimization objective",
      suggestedValues: OBJECTIVE_TYPES,
    },
    {
      field: "status",
      expectedType: "string",
      hint: "Campaign lifecycle status",
      suggestedValues: CAMPAIGN_STATUSES,
    },
  ],
  creative: [
    { field: "campaign", expectedType: "string", hint: "Campaign URN" },
    {
      field: "status",
      expectedType: "string",
      hint: "Creative lifecycle status",
      suggestedValues: CREATIVE_STATUSES,
    },
    { field: "reference", expectedType: "string", hint: "Content reference URN" },
  ],
  conversionRule: [
    { field: "name", expectedType: "string" },
    {
      field: "type",
      expectedType: "string",
      hint: "Conversion event type",
      suggestedValues: CONVERSION_TYPES,
    },
    { field: "account", expectedType: "string", hint: "Ad account URN" },
    {
      field: "status",
      expectedType: "string",
      hint: "Conversion rule status",
      suggestedValues: ["ACTIVE", "PAUSED"],
    },
  ],
};

const READ_ONLY_FIELDS = ["id", "changeAuditStamps", "created", "lastModified", "review"];

export const validateEntityTool = createValidateEntityTool<LinkedInEntityType>({
  toolName: "linkedin_validate_entity",
  toolTitle: "LinkedIn Ads Entity Validation (Client-Side)",
  toolDescription: `Validate an entity payload against known LinkedIn Ads requirements without calling the API.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

Checks required fields, data types, and common configuration mistakes.
The LinkedIn API may still reject payloads for business-rule reasons.`,
  entityTypeEnum: getEntityTypeEnum() as readonly [LinkedInEntityType, ...LinkedInEntityType[]],
  rulesByEntity: REQUIRED_FIELDS_CREATE,
  readOnlyFields: READ_ONLY_FIELDS,
  extraValidate: ({ mode, data, issues }) => {
    if (mode === "create") {
      // URN format check
      for (const field of ["account", "campaignGroup", "campaign"]) {
        const value = data[field];
        if (value && typeof value === "string" && !value.startsWith("urn:li:")) {
          issues.push({
            field,
            code: "invalidValue",
            message: `Field "${field}" value "${value}" doesn't look like a LinkedIn URN. Expected format: urn:li:{type}:{id}`,
            severity: "warning",
          });
        }
      }
    }

    if (mode === "update" && Object.keys(data).length === 0) {
      issues.push({
        field: "data",
        code: "custom",
        message: "Update payload must contain at least one field to update",
        severity: "error",
      });
    }

    // Budget object format warnings (both modes)
    for (const field of ["dailyBudget", "totalBudget", "unitCost"]) {
      const value = data[field];
      if (value !== undefined && typeof value === "object" && value !== null) {
        const budgetObj = value as Record<string, unknown>;
        if (!budgetObj.amount || !budgetObj.currencyCode) {
          issues.push({
            field,
            code: "wrongType",
            message: `Field "${field}" should be an object with "amount" (string) and "currencyCode" (e.g., USD). Got: ${JSON.stringify(value)}`,
            severity: "warning",
          });
        }
      }
    }
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
        data: { name: "Test Campaign Group" },
      },
    },
  ],
});

// Re-exports for backwards-compatible imports inside this package.
export const ValidateEntityInputSchema = validateEntityTool.inputSchema;
export const ValidateEntityOutputSchema = validateEntityTool.outputSchema;
export const validateEntityLogic = validateEntityTool.logic;
