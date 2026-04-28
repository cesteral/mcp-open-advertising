// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import { getEntityTypeEnum } from "../utils/entity-mapping.js";
import type { RequestContext } from "@cesteral/shared";
import {
  validateEntityResponseFormatter,
  validateEnumFieldsStructured,
  type FieldRule,
  type ValidationIssue,
} from "@cesteral/shared";

// CM360 API v5 enum reference: https://developers.google.com/doubleclick-advertisers/rest
const CM360_ENUMS_BY_ENTITY: Record<string, FieldRule[]> = {
  campaign: [
    {
      field: "archived",
      hint: "Archive flag (boolean — represented as string in some payloads)",
    },
  ],
  placement: [
    {
      field: "compatibility",
      expectedType: "string",
      hint: "Placement compatibility platform",
      suggestedValues: ["DISPLAY", "DISPLAY_INTERSTITIAL", "APP", "APP_INTERSTITIAL", "IN_STREAM_VIDEO", "IN_STREAM_AUDIO"],
    },
    {
      field: "paymentSource",
      expectedType: "string",
      hint: "Who pays for this placement",
      suggestedValues: ["PLACEMENT_AGENCY_PAID", "PLACEMENT_PUBLISHER_PAID"],
    },
    {
      field: "pricingSchedule.pricingType",
      expectedType: "string",
      hint: "Cost structure",
      suggestedValues: [
        "PRICING_TYPE_CPM",
        "PRICING_TYPE_CPC",
        "PRICING_TYPE_CPA",
        "PRICING_TYPE_FLAT_RATE_IMPRESSIONS",
        "PRICING_TYPE_FLAT_RATE_CLICKS",
        "PRICING_TYPE_CPM_ACTIVEVIEW",
      ],
    },
  ],
  ad: [
    {
      field: "type",
      expectedType: "string",
      hint: "Ad type",
      suggestedValues: [
        "AD_SERVING_STANDARD_AD",
        "AD_SERVING_DEFAULT_AD",
        "AD_SERVING_CLICK_TRACKER",
        "AD_SERVING_TRACKING",
        "AD_SERVING_BRAND_SAFE_AD",
      ],
    },
  ],
  creative: [
    {
      field: "type",
      expectedType: "string",
      hint: "Creative format",
      suggestedValues: [
        "DISPLAY",
        "DISPLAY_IMAGE_GALLERY",
        "FLASH_INPAGE",
        "HTML5_BANNER",
        "IMAGE",
        "INSTREAM_VIDEO",
        "INSTREAM_AUDIO",
        "REDIRECT",
        "RICH_MEDIA_DISPLAY_BANNER",
        "RICH_MEDIA_DISPLAY_EXPANDING",
        "RICH_MEDIA_INPAGE_FLOATING",
        "VPAID_LINEAR_VIDEO",
        "VPAID_NON_LINEAR_VIDEO",
        "TRACKING_TEXT",
      ],
    },
  ],
  floodlightActivity: [
    {
      field: "countingMethod",
      expectedType: "string",
      hint: "How conversions are counted",
      suggestedValues: [
        "STANDARD_COUNTING",
        "UNIQUE_COUNTING",
        "SESSION_COUNTING",
        "TRANSACTIONS_COUNTING",
        "ITEMS_SOLD_COUNTING",
      ],
    },
  ],
};

const TOOL_NAME = "cm360_validate_entity";
const TOOL_TITLE = "Validate CM360 Entity";
const TOOL_DESCRIPTION = `Dry-run validate a CM360 entity payload without making an API call.

Checks that the data object has the expected structure for the given entity type and mode (create or update). No credentials or profileId required.`;

export const ValidateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to validate"),
    mode: z
      .enum(["create", "update"])
      .describe(
        "Validation mode — create checks for required fields, update checks for id presence"
      ),
    data: z.record(z.any()).describe("Entity data to validate"),
  })
  .describe("Parameters for validating a CM360 entity");

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
    valid: z.boolean().describe("Whether the entity data is valid"),
    entityType: z.string(),
    mode: z.string(),
    errors: z.array(z.string()).describe("Validation error messages"),
    warnings: z.array(z.string()).describe("Validation warnings"),
    issues: z.array(ValidationIssueSchema),
    nextAction: z.string().optional(),
    timestamp: z.string().datetime(),
  })
  .describe("Entity validation result");

type ValidateEntityInput = z.infer<typeof ValidateEntityInputSchema>;
type ValidateEntityOutput = z.infer<typeof ValidateEntityOutputSchema>;

export async function validateEntityLogic(
  input: ValidateEntityInput,
  _context: RequestContext
): Promise<ValidateEntityOutput> {
  const issues: ValidationIssue[] = [];
  const err = (field: string, code: ValidationIssue["code"], message: string) =>
    issues.push({ field, code, message, severity: "error" });
  const warn = (field: string, code: ValidationIssue["code"], message: string) =>
    issues.push({ field, code, message, severity: "warning" });

  // Check string-typed enum fields against the published CM360 v5 enums.
  const enumRules = CM360_ENUMS_BY_ENTITY[input.entityType] ?? [];
  if (enumRules.length > 0) {
    issues.push(...validateEnumFieldsStructured(input.data, enumRules));
    // Also check nested pricingSchedule.pricingType for placements.
    if (input.entityType === "placement" && input.data.pricingSchedule) {
      const ps = input.data.pricingSchedule as Record<string, unknown>;
      const nestedRule = enumRules.find((r) => r.field === "pricingSchedule.pricingType");
      if (nestedRule?.suggestedValues && typeof ps.pricingType === "string") {
        if (!nestedRule.suggestedValues.includes(ps.pricingType)) {
          issues.push({
            field: "pricingSchedule.pricingType",
            code: "invalidValue",
            message: `Field "pricingSchedule.pricingType" value "${ps.pricingType}" is not a recognized enum value.`,
            hint: nestedRule.hint,
            suggestedValues: [...nestedRule.suggestedValues],
            severity: "error",
          });
        }
      }
    }
  }

  if (input.mode === "update" && !input.data.id) {
    err("id", "missing", "id field is required for update mode (CM360 uses PUT semantics)");
  }

  if (input.mode === "create" && input.data.id) {
    warn("id", "readOnly", "id field is typically auto-generated on create — it will be ignored");
  }

  if (
    !input.data.name &&
    ["campaign", "placement", "ad", "creative", "site", "floodlightActivity"].includes(
      input.entityType
    )
  ) {
    warn("name", "missing", `name field is typically required for ${input.entityType} entities`);
  }

  if (input.entityType === "campaign") {
    if (!input.data.advertiserId && input.mode === "create") {
      err("advertiserId", "missing", "advertiserId is required when creating a campaign");
    }
  }

  if (input.entityType === "placement") {
    if (!input.data.campaignId && input.mode === "create") {
      err("campaignId", "missing", "campaignId is required when creating a placement");
    }
    if (!input.data.siteId && input.mode === "create") {
      warn("siteId", "missing", "siteId is typically required when creating a placement");
    }
  }

  if (input.entityType === "ad") {
    if (!input.data.campaignId && input.mode === "create") {
      err("campaignId", "missing", "campaignId is required when creating an ad");
    }
  }

  if (input.entityType === "floodlightActivity") {
    if (!input.data.floodlightConfigurationId && input.mode === "create") {
      err(
        "floodlightConfigurationId",
        "missing",
        "floodlightConfigurationId is required when creating a floodlight activity"
      );
    }
  }

  const errorIssues = issues.filter((i) => i.severity !== "warning");
  const warningIssues = issues.filter((i) => i.severity === "warning");

  return {
    valid: errorIssues.length === 0,
    entityType: input.entityType,
    mode: input.mode,
    errors: errorIssues.map((i) => i.message),
    warnings: warningIssues.map((i) => i.message),
    issues,
    timestamp: new Date().toISOString(),
  };
}

export const validateEntityTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ValidateEntityInputSchema,
  outputSchema: ValidateEntityOutputSchema,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  inputExamples: [
    {
      label: "Validate a campaign for creation",
      input: {
        entityType: "campaign",
        mode: "create",
        data: {
          name: "Q1 Brand Campaign",
          advertiserId: "789012",
        },
      },
    },
    {
      label: "Validate entity for update",
      input: {
        entityType: "placement",
        mode: "update",
        data: {
          id: "111222",
          name: "Updated Placement",
        },
      },
    },
  ],
  logic: validateEntityLogic,
  responseFormatter: validateEntityResponseFormatter,
};
