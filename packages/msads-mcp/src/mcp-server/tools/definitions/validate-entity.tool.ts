// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import {
  getEntityTypeEnum,
  getEntityConfig,
  type MsAdsEntityType,
} from "../utils/entity-mapping.js";
import type { RequestContext, SdkContext } from "@cesteral/shared";
import {
  validateEntityResponseFormatter,
  validateEnumFieldsStructured,
  type FieldRule,
  type ValidationIssue,
} from "@cesteral/shared";

// Microsoft Advertising REST API v13 enum reference:
// https://learn.microsoft.com/en-us/advertising/campaign-management-service/
const MSADS_ENUMS_BY_ENTITY: Record<string, FieldRule[]> = {
  campaign: [
    {
      field: "Status",
      expectedType: "string",
      hint: "Campaign status",
      suggestedValues: ["Active", "Paused", "BudgetPaused", "BudgetAndManualPaused", "Deleted", "Suspended"],
    },
    {
      field: "BudgetType",
      expectedType: "string",
      hint: "Budget type",
      suggestedValues: ["DailyBudgetStandard", "DailyBudgetAccelerated", "MonthlyBudgetSpendUntilDepleted"],
    },
    {
      field: "CampaignType",
      expectedType: "string",
      hint: "Campaign type",
      suggestedValues: [
        "Search",
        "Shopping",
        "DynamicSearchAds",
        "Audience",
        "PerformanceMax",
        "Hotel",
        "DisplayNetwork",
      ],
    },
  ],
  adGroup: [
    {
      field: "Status",
      expectedType: "string",
      suggestedValues: ["Active", "Paused", "Deleted", "Expired"],
    },
    {
      field: "Network",
      expectedType: "string",
      hint: "Distribution network",
      suggestedValues: [
        "OwnedAndOperatedAndSyndicatedSearch",
        "OwnedAndOperatedOnly",
        "SyndicatedSearchOnly",
        "ContentOnly",
      ],
    },
  ],
  ad: [
    {
      field: "Status",
      expectedType: "string",
      suggestedValues: ["Active", "Paused", "Deleted", "Disapproved"],
    },
    {
      field: "Type",
      expectedType: "string",
      suggestedValues: [
        "Text",
        "Product",
        "AppInstall",
        "ExpandedText",
        "DynamicSearch",
        "ResponsiveAd",
        "ResponsiveSearch",
      ],
    },
  ],
  keyword: [
    {
      field: "MatchType",
      expectedType: "string",
      hint: "Keyword match type",
      suggestedValues: ["Exact", "Phrase", "Broad", "Content"],
    },
    {
      field: "Status",
      expectedType: "string",
      suggestedValues: ["Active", "Paused", "Deleted"],
    },
  ],
  budget: [
    {
      field: "BudgetType",
      expectedType: "string",
      suggestedValues: ["DailyBudgetStandard", "DailyBudgetAccelerated"],
    },
  ],
};

const TOOL_NAME = "msads_validate_entity";
const TOOL_TITLE = "Validate Microsoft Ads Entity";
const TOOL_DESCRIPTION = `Dry-run validate a Microsoft Advertising entity payload without making any API calls.

Checks that the entity type is valid and required fields are present. Does NOT call the Microsoft Ads API.`;

export const ValidateEntityInputSchema = z
  .object({
    entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to validate"),
    mode: z
      .enum(["create", "update"])
      .describe("Validation mode — create requires more fields than update"),
    data: z.record(z.unknown()).describe("Entity data payload to validate"),
  })
  .describe("Parameters for validating a Microsoft Ads entity");

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
    valid: z.boolean(),
    entityType: z.string(),
    mode: z.string(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
    issues: z.array(ValidationIssueSchema),
    nextAction: z.string().optional(),
    timestamp: z.string().datetime(),
  })
  .describe("Validation result");

type ValidateEntityInput = z.infer<typeof ValidateEntityInputSchema>;
type ValidateEntityOutput = z.infer<typeof ValidateEntityOutputSchema>;

export async function validateEntityLogic(
  input: ValidateEntityInput,
  _context: RequestContext,
  _sdkContext?: SdkContext
): Promise<ValidateEntityOutput> {
  const issues: ValidationIssue[] = [];

  // Validate entity type exists
  try {
    getEntityConfig(input.entityType as MsAdsEntityType);
  } catch {
    issues.push({
      field: "entityType",
      code: "invalidValue",
      message: `Unknown entity type: ${input.entityType}`,
      severity: "error",
    });
  }

  // Check for data content
  if (!input.data || Object.keys(input.data).length === 0) {
    issues.push({
      field: "data",
      code: "missing",
      message: "Data payload is empty",
      severity: "error",
    });
  }

  // For updates, check that Id is present
  if (input.mode === "update") {
    const config = getEntityConfig(input.entityType as MsAdsEntityType);
    const entities = input.data[config.pluralName] as Record<string, unknown>[] | undefined;
    if (entities && Array.isArray(entities)) {
      for (let i = 0; i < entities.length; i++) {
        if (!entities[i]![config.idField]) {
          issues.push({
            field: `${config.pluralName}[${i}].${config.idField}`,
            code: "missing",
            message: `Item ${i}: missing required field '${config.idField}' for update`,
            severity: "error",
          });
        }
      }
    } else {
      issues.push({
        field: config.pluralName,
        code: "wrongType",
        message: `Expected data to contain '${config.pluralName}' array`,
        severity: "warning",
      });
    }
  }

  // Enum validation against published Microsoft Advertising enums. Walks the
  // `{pluralName}` array (Bulk-style payload) and runs enum checks on each item.
  const enumRules = MSADS_ENUMS_BY_ENTITY[input.entityType] ?? [];
  if (enumRules.length > 0) {
    try {
      const config = getEntityConfig(input.entityType as MsAdsEntityType);
      const entities = input.data[config.pluralName] as Record<string, unknown>[] | undefined;
      if (Array.isArray(entities)) {
        entities.forEach((entity, i) => {
          for (const issue of validateEnumFieldsStructured(entity, enumRules)) {
            issues.push({
              ...issue,
              field: `${config.pluralName}[${i}].${issue.field}`,
            });
          }
        });
      } else {
        // Fall back to single-object payload (some servers accept this shape).
        issues.push(...validateEnumFieldsStructured(input.data, enumRules));
      }
    } catch {
      // Unknown entity type — already reported above.
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
    idempotentHint: true,
    destructiveHint: false,
  },
  inputExamples: [
    {
      label: "Validate a campaign for creation",
      input: {
        entityType: "campaign",
        mode: "create",
        data: {
          Campaigns: [{ Name: "Test", BudgetType: "DailyBudgetStandard" }],
        },
      },
    },
  ],
  logic: validateEntityLogic,
  responseFormatter: validateEntityResponseFormatter,
};
