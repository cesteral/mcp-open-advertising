// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * amazon_dsp_validate_entity — Client-side schema validation for Amazon DSP entities.
 *
 * Amazon DSP API does not have a dry-run mode, so this tool validates payloads
 * against known required-field rules before hitting the API. Purely local.
 */

import { z } from "zod";
import {
  getEntityContract,
  getEntityTypeEnum,
  getCanonicalEntityType,
} from "../utils/entity-mapping.js";
import type { AmazonDspPublicEntityType } from "../../../services/amazon-dsp/amazon-dsp-api-contract.js";
import { type FieldRule, createValidateEntityTool } from "@cesteral/shared";

export const validateEntityTool = createValidateEntityTool<AmazonDspPublicEntityType>({
  toolName: "amazon_dsp_validate_entity",
  toolTitle: "AmazonDsp Ads Entity Validation (Client-Side)",
  toolDescription: `Validate an entity payload against known AmazonDsp Ads requirements without calling the API.

Checks required fields, data types, and common configuration mistakes.

**Supported entity types:** ${getEntityTypeEnum().join(", ")}

This is a pure client-side check — it catches missing required fields and
obvious type errors. The AmazonDsp API may still reject payloads for business-rule
reasons (e.g., invalid objective/placement combinations).`,
  entityTypeEnum: getEntityTypeEnum() as readonly [
    AmazonDspPublicEntityType,
    ...AmazonDspPublicEntityType[],
  ],
  getRules: (entityType) => getEntityContract(entityType).requiredOnCreate as FieldRule[],
  getReadOnlyFields: (entityType) => getEntityContract(entityType).readOnlyFields,
  extraInputSchema: {
    profileId: z.string().optional().describe("Advertiser ID (recommended for create mode)"),
  },
  extraValidate: ({ entityType, mode, data, issues }) => {
    const canonical = getCanonicalEntityType(entityType);

    if (mode === "create" && canonical === "creative" && !data.clickThroughUrl) {
      issues.push({
        field: "clickThroughUrl",
        code: "missing",
        message: 'Creative should include "clickThroughUrl" for click tracking',
        severity: "warning",
      });
    }

    const budgetValue = data.budget;
    if (budgetValue !== undefined) {
      if (typeof budgetValue === "number") {
        if (canonical === "lineItem") {
          issues.push({
            field: "budget",
            code: "wrongType",
            message:
              'Field "budget" for lineItem must be an object: { budgetType: "DAILY" | "LIFETIME", budget: number }',
            suggestedValues: ["DAILY", "LIFETIME"],
            severity: "error",
          });
        } else if (budgetValue <= 0) {
          issues.push({
            field: "budget",
            code: "invalidValue",
            message: 'Field "budget" must be a positive number',
            severity: "error",
          });
        }
      } else if (typeof budgetValue === "object" && budgetValue !== null) {
        const budgetObj = budgetValue as Record<string, unknown>;
        if (typeof budgetObj.budget !== "number" || (budgetObj.budget as number) <= 0) {
          issues.push({
            field: "budget.budget",
            code: "invalidValue",
            message: 'Field "budget.budget" must be a positive number',
            severity: "error",
          });
        }
        if (!budgetObj.budgetType) {
          issues.push({
            field: "budget.budgetType",
            code: "missing",
            message: 'Field "budget.budgetType" is required ("DAILY" or "LIFETIME")',
            suggestedValues: ["DAILY", "LIFETIME"],
            severity: "error",
          });
        }
      }
    }
  },
  inputExamples: [
    {
      label: "Valid order create",
      input: {
        entityType: "campaign",
        mode: "create",
        profileId: "1234567890",
        data: {
          name: "Summer Sale 2026",
          advertiserId: "adv_123",
          startDateTime: "2026-07-01T00:00:00Z",
          endDateTime: "2026-07-31T23:59:59Z",
        },
      },
    },
    {
      label: "Missing required fields (line item)",
      input: {
        entityType: "lineItem",
        mode: "create",
        profileId: "1234567890",
        data: { name: "Test Line Item" },
      },
    },
  ],
});

export const ValidateEntityInputSchema = validateEntityTool.inputSchema;
export const ValidateEntityOutputSchema = validateEntityTool.outputSchema;
export const validateEntityLogic = validateEntityTool.logic;
