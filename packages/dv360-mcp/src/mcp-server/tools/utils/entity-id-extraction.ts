// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { z } from "zod";

/**
 * Entity ID extraction utilities
 * Removes duplicate ID extraction logic across tool definitions
 */

/**
 * Shared schema fragment for every DV360 entity ID field a tool might accept.
 *
 * Spread this into tool input schemas (`...EntityIdFieldsSchema`) so new entity
 * types only need to be added in one place — otherwise zod silently strips
 * unknown ID fields and validation reports them as missing.
 */
export const EntityIdFieldsSchema = {
  partnerId: z.string().optional().describe("Partner ID (if required for entity type)"),
  advertiserId: z.string().optional().describe("Advertiser ID (if required for entity type)"),
  campaignId: z.string().optional().describe("Campaign ID (if entity type is campaign)"),
  insertionOrderId: z
    .string()
    .optional()
    .describe("Insertion Order ID (if entity type is insertionOrder)"),
  lineItemId: z.string().optional().describe("Line Item ID (if entity type is lineItem)"),
  adGroupId: z.string().optional().describe("Ad Group ID (if entity type is adGroup)"),
  adGroupAdId: z.string().optional().describe("Ad Group Ad ID (if entity type is adGroupAd)"),
  adId: z.string().optional().describe("Ad ID (if entity type is ad)"),
  creativeId: z.string().optional().describe("Creative ID (if entity type is creative)"),
  customBiddingAlgorithmId: z
    .string()
    .optional()
    .describe("Custom Bidding Algorithm ID (if entity type is customBiddingAlgorithm)"),
  inventorySourceId: z
    .string()
    .optional()
    .describe("Inventory Source ID (if entity type is inventorySource)"),
  inventorySourceGroupId: z
    .string()
    .optional()
    .describe("Inventory Source Group ID (if entity type is inventorySourceGroup)"),
  locationListId: z
    .string()
    .optional()
    .describe("Location List ID (if entity type is locationList)"),
} as const;

/**
 * Extract entity IDs from tool input for API calls
 * Handles both parent IDs (advertiserId, partnerId) and entity-specific IDs
 *
 * @param input - Tool input containing various ID fields
 * @param entityType - Type of entity (e.g., "lineItem", "campaign")
 * @returns Record of extracted IDs suitable for DV360Service calls
 *
 * @example
 * ```typescript
 * const input = {
 *   advertiserId: "123",
 *   lineItemId: "456",
 *   entityType: "lineItem"
 * };
 * const ids = extractEntityIds(input, "lineItem");
 * // Returns: { advertiserId: "123", lineItemId: "456" }
 * ```
 */
export function extractEntityIds(
  input: Record<string, unknown>,
  entityType: string
): Record<string, string> {
  const entityIds: Record<string, string> = {};

  // Known parent ID fields (hierarchical order)
  const parentIdFields = [
    "partnerId",
    "advertiserId",
    "campaignId",
    "insertionOrderId",
    "lineItemId",
    "adGroupId",
  ];

  // Extract all parent IDs that are present
  for (const field of parentIdFields) {
    if (input[field] && typeof input[field] === "string") {
      entityIds[field] = input[field] as string;
    }
  }

  // Extract entity-specific ID (e.g., campaignId for campaign, lineItemId for lineItem)
  // This maps from the various ID fields in input to the canonical entity ID
  const entityIdField = `${entityType}Id`;

  // Check all ID fields in input and map to entity ID field. Add new entity
  // types here when they're introduced to STATIC_ENTITY_API_METADATA — missing
  // a mapping makes update/delete fail with "Missing required identifier".
  const idFieldMappings: Record<string, string> = {
    campaignId: "campaignId",
    insertionOrderId: "insertionOrderId",
    lineItemId: "lineItemId",
    adGroupId: "adGroupId",
    adGroupAdId: "adGroupAdId",
    adId: "adId",
    creativeId: "creativeId",
    partnerId: "partnerId",
    advertiserId: "advertiserId",
    customBiddingAlgorithmId: "customBiddingAlgorithmId",
    inventorySourceId: "inventorySourceId",
    inventorySourceGroupId: "inventorySourceGroupId",
    locationListId: "locationListId",
  };

  for (const [inputField, canonicalField] of Object.entries(idFieldMappings)) {
    if (input[inputField] && canonicalField === entityIdField) {
      entityIds[entityIdField] = input[inputField] as string;
      break;
    }
  }

  return entityIds;
}

/**
 * Extract parent resource IDs only (for create/list operations)
 * Excludes the entity-specific ID
 *
 * @param input - Tool input containing parent ID fields
 * @returns Record of parent IDs only
 *
 * @example
 * ```typescript
 * const input = { advertiserId: "123", campaignId: "456" };
 * const parentIds = extractParentIds(input);
 * // Returns: { advertiserId: "123", campaignId: "456" }
 * ```
 */
export function extractParentIds(input: Record<string, unknown>): Record<string, string> {
  const parentIds: Record<string, string> = {};

  const parentIdFields = [
    "partnerId",
    "advertiserId",
    "campaignId",
    "insertionOrderId",
    "lineItemId",
    "adGroupId",
  ];

  for (const field of parentIdFields) {
    if (input[field] && typeof input[field] === "string") {
      parentIds[field] = input[field] as string;
    }
  }

  return parentIds;
}

/**
 * Validate that entity ID is present for operations that require it
 * Throws descriptive error if missing
 *
 * @param ids - Extracted entity IDs
 * @param entityType - Type of entity
 * @param operation - Operation being performed (for error message)
 * @throws Error if entity ID is missing
 */
export function validateEntityIdPresent(
  ids: Record<string, string>,
  entityType: string,
  operation: string
): void {
  const entityIdField = `${entityType}Id`;

  if (!ids[entityIdField]) {
    throw new Error(
      `[EntityIDValidation] Missing ${entityIdField} for ${entityType} ${operation} operation. ` +
        `Provided IDs: ${Object.keys(ids).join(", ")}`
    );
  }
}
