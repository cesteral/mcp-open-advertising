/**
 * Entity ID extraction utilities
 * Removes duplicate ID extraction logic across tool definitions
 */

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

  // Check all ID fields in input and map to entity ID field
  const idFieldMappings: Record<string, string> = {
    campaignId: "campaignId",
    insertionOrderId: "insertionOrderId",
    lineItemId: "lineItemId",
    adGroupId: "adGroupId",
    adId: "adId",
    creativeId: "creativeId",
    partnerId: "partnerId",
    advertiserId: "advertiserId",
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
