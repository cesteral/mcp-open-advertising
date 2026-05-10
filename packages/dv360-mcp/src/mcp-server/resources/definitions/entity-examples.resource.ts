// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Entity Examples Resource
 * Provides curated examples of common update patterns for DV360 entity types
 */

import type { ResourceDefinition, ResourceContent, ResourceListItem } from "../utils/types.js";
import {
  getSupportedEntityTypesDynamic,
  isEntityTypeSupported,
} from "../../tools/utils/entity-mapping-dynamic.js";
import {
  getEntityExamples,
  getExamplesByCategory,
  getEntityTypesWithExamples,
  type EntityExample,
} from "../../tools/utils/entity-examples.js";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import { resourceCache } from "../utils/resource-cache.js";

const RESOURCE_NAME = "DV360 Entity Examples";
const RESOURCE_DESCRIPTION = "Curated examples of common operations for DV360 entity types";
const URI_TEMPLATE = "entity-examples://{entityType}";

/**
 * Read entity examples resource
 */
async function readEntityExamples(params: Record<string, string>): Promise<ResourceContent> {
  const { entityType } = params;

  if (!entityType) {
    throw new McpError(JsonRpcErrorCode.InvalidParams, "Missing required parameter: entityType", {
      availableTypes: getSupportedEntityTypesDynamic(),
    });
  }

  if (!isEntityTypeSupported(entityType)) {
    throw new McpError(JsonRpcErrorCode.NotFound, `Unknown entity type: ${entityType}`, {
      entityType,
      availableTypes: getSupportedEntityTypesDynamic(),
    });
  }

  const cacheKey = `entity-examples://${entityType}`;
  const cached = resourceCache.get(cacheKey);
  if (cached) {
    return { uri: cacheKey, mimeType: "application/json", text: cached };
  }

  // Get examples for this entity type
  const examples = getEntityExamples(entityType);
  const groupedByCategory = getExamplesByCategory(entityType);
  const categoryCounts = Object.fromEntries(
    Object.entries(groupedByCategory).map(([category, entries]) => [category, entries.length])
  );

  // Build examples document
  const examplesDocument = {
    entityType,
    exampleCount: examples.length,
    categories: Object.keys(groupedByCategory),
    examples: examples.map((ex: EntityExample) => ({
      operation: ex.operation,
      description: ex.description,
      category: ex.category || "general",
      data: ex.data,
      updateMask: ex.updateMask,
      notes: ex.notes,
    })),
    categoryCounts,
    usage: {
      description: "Use these examples as templates for common DV360 entity updates",
      toolName: "dv360_update_entity",
      parameterFormat: {
        entityType: entityType,
        advertiserId: "<your-advertiser-id>",
        [`${entityType}Id`]: `<your-${entityType}-id>`,
        data: "<use-data-from-example>",
        updateMask: "<use-updateMask-from-example>",
        reason: "<optional-reason-for-audit-trail>",
      },
    },
  };

  const text = JSON.stringify(examplesDocument, null, 2);
  resourceCache.set(cacheKey, text);

  return {
    uri: cacheKey,
    mimeType: "application/json",
    text,
  };
}

/**
 * List all available entity examples resources
 */
async function listEntityExamples(): Promise<ResourceListItem[]> {
  const entityTypesWithExamples = getEntityTypesWithExamples();

  return entityTypesWithExamples.map((entityType) => {
    const examples = getEntityExamples(entityType);
    return {
      uri: `entity-examples://${entityType}`,
      name: `${entityType} Examples`,
      description: `${examples.length} curated example${examples.length === 1 ? "" : "s"} for ${entityType}`,
      mimeType: "application/json",
    };
  });
}

/**
 * Entity Examples Resource Definition
 */
export const entityExamplesResource: ResourceDefinition = {
  uriTemplate: URI_TEMPLATE,
  name: RESOURCE_NAME,
  description: RESOURCE_DESCRIPTION,
  mimeType: "application/json",
  read: readEntityExamples,
  list: listEntityExamples,
};
