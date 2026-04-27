// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";
import {
  getSupportedTargetingParentTypes,
  getTargetingParentConfig,
  type TargetingParentType,
} from "./targeting-metadata.js";

/**
 * Build a Zod object shape containing all possible required ID fields for targeting tools.
 *
 * This keeps tool input schemas config-driven: adding a new parent type (and required IDs)
 * to `TARGETING_PARENT_TYPES` automatically updates the tool input schema shape.
 */
export function getTargetingRequiredIdInputShape(): Record<string, z.ZodOptional<z.ZodString>> {
  const requiredIdToParentTypes = new Map<string, string[]>();

  for (const parentType of getSupportedTargetingParentTypes()) {
    const config = getTargetingParentConfig(parentType);
    for (const requiredId of config.requiredIds) {
      if (requiredId === "advertiserId") continue;

      const parentTypes = requiredIdToParentTypes.get(requiredId) ?? [];
      parentTypes.push(parentType);
      requiredIdToParentTypes.set(requiredId, parentTypes);
    }
  }

  const shape: Record<string, z.ZodOptional<z.ZodString>> = {};
  for (const [requiredId, parentTypes] of requiredIdToParentTypes.entries()) {
    const parentTypeLabel =
      parentTypes.length === 1
        ? `parentType=${parentTypes[0]}`
        : `parentType in (${parentTypes.join(" | ")})`;

    shape[requiredId] = z
      .string()
      .optional()
      .describe(`${requiredId} (required if ${parentTypeLabel})`);
  }

  return shape;
}

/**
 * Build a Zod object shape for validate-targeting-config tool with `{parentType}Ids` arrays.
 *
 * Generates fields like `insertionOrderIds`, `lineItemIds`, `adGroupIds` dynamically
 * from TARGETING_PARENT_TYPES config.
 *
 * Example output:
 * {
 *   insertionOrderIds: z.array(z.string()).optional().describe('Insertion Order IDs to validate'),
 *   lineItemIds: z.array(z.string()).optional().describe('Line Item IDs to validate'),
 *   adGroupIds: z.array(z.string()).optional().describe('Ad Group IDs to validate'),
 * }
 */
export function getValidateInputShape(): Record<string, z.ZodOptional<z.ZodArray<z.ZodString>>> {
  const shape: Record<string, z.ZodOptional<z.ZodArray<z.ZodString>>> = {};

  for (const parentType of getSupportedTargetingParentTypes()) {
    const fieldName = `${parentType}Ids`;
    // Convert camelCase to Title Case for description (e.g., "insertionOrder" -> "Insertion Order")
    const displayName = parentType
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();

    shape[fieldName] = z.array(z.string()).optional().describe(`${displayName} IDs to validate`);
  }

  return shape;
}

/**
 * Get the entity IDs field name for a parent type (e.g., 'insertionOrder' -> 'insertionOrderIds')
 */
export function getValidateIdsFieldName(parentType: TargetingParentType): string {
  return `${parentType}Ids`;
}

/**
 * Check if any entity ID arrays are provided in the input.
 * Used for Zod refinement validation.
 */
export function hasAnyEntityIds(data: Record<string, unknown>): boolean {
  for (const parentType of getSupportedTargetingParentTypes()) {
    const fieldName = getValidateIdsFieldName(parentType);
    const value = data[fieldName];
    if (Array.isArray(value) && value.length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Get the validation error message listing all entity ID field names.
 */
export function getEntityIdsValidationError(): { message: string; path: string[] } {
  const fieldNames = getSupportedTargetingParentTypes().map(getValidateIdsFieldName);
  return {
    message: `At least one entity ID array must be provided (${fieldNames.join(", ")})`,
    path: [fieldNames[0]],
  };
}
