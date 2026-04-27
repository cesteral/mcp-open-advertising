// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Targeting Types Resource
 * Provides list of all DV360 targeting types with descriptions and metadata
 */

import type { ResourceDefinition, ResourceContent, ResourceListItem } from "../utils/types.js";
import {
  ALL_TARGETING_TYPES,
  TARGETING_TYPE_DESCRIPTIONS,
  TARGETING_CATEGORIES,
  getSupportedTargetingParentTypes,
  type TargetingType,
} from "../../tools/utils/targeting-metadata.js";
import { resourceCache } from "../utils/resource-cache.js";

const RESOURCE_NAME = "DV360 Targeting Types";
const RESOURCE_DESCRIPTION =
  "List of all available DV360 targeting types with descriptions and categories";
const URI_TEMPLATE = "targeting-types://";

/**
 * Get supported parent types for a targeting type
 * Most targeting types support all parent types, but some are entity-specific
 */
function getSupportedParentTypes(_targetingType: TargetingType): string[] {
  // All targeting types support the configured parent types in DV360.
  // Note: In the future, some types may have entity-specific restrictions.
  return getSupportedTargetingParentTypes();
}

/**
 * Read targeting types resource
 */
async function readTargetingTypes(): Promise<ResourceContent> {
  const cacheKey = "targeting-types://";
  const cached = resourceCache.get(cacheKey);
  if (cached) {
    return { uri: cacheKey, mimeType: "application/json", text: cached };
  }

  const categorizedTypes: Record<
    string,
    Array<{
      type: TargetingType;
      description: string;
      supportedParents: string[];
    }>
  > = {};

  // Build categorized list
  for (const [category, types] of Object.entries(TARGETING_CATEGORIES)) {
    categorizedTypes[category] = types.map((type) => ({
      type: type as TargetingType,
      description: TARGETING_TYPE_DESCRIPTIONS[type as TargetingType],
      supportedParents: getSupportedParentTypes(type as TargetingType),
    }));
  }

  // Build full list
  const allTypes = ALL_TARGETING_TYPES.map((type) => ({
    type,
    description: TARGETING_TYPE_DESCRIPTIONS[type],
    supportedParents: getSupportedParentTypes(type),
  }));

  const document = {
    totalCount: ALL_TARGETING_TYPES.length,
    categorized: categorizedTypes,
    allTypes,
    usage: {
      listTool: "dv360_list_assigned_targeting",
      getTool: "dv360_get_assigned_targeting",
      createTool: "dv360_create_assigned_targeting",
      deleteTool: "dv360_delete_assigned_targeting",
      validateTool: "dv360_validate_targeting_config",
    },
    schemaResource: "targeting-schema://{targetingType}",
    documentation:
      "https://developers.google.com/display-video/api/reference/rest/v4/TargetingType",
  };

  const text = JSON.stringify(document, null, 2);
  resourceCache.set(cacheKey, text);

  return {
    uri: cacheKey,
    mimeType: "application/json",
    text,
  };
}

/**
 * List available targeting type resources (returns single resource for the full list)
 */
async function listTargetingTypes(): Promise<ResourceListItem[]> {
  return [
    {
      uri: "targeting-types://",
      name: "All DV360 Targeting Types",
      description: `Complete list of ${ALL_TARGETING_TYPES.length} targeting types with descriptions and categories`,
      mimeType: "application/json",
    },
  ];
}

/**
 * Targeting Types Resource Definition
 */
export const targetingTypesResource: ResourceDefinition = {
  uriTemplate: URI_TEMPLATE,
  name: RESOURCE_NAME,
  description: RESOURCE_DESCRIPTION,
  mimeType: "application/json",
  read: readTargetingTypes,
  list: listTargetingTypes,
};
