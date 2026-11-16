// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Entity Fields Resource
 * Provides flat list of all field paths for a DV360 entity type
 */

import type { TemplatedResourceDefinition, TemplatedResourceListing } from "@cesteral/shared";
import {
  getEntitySchemaForOperation,
  getSupportedEntityTypesDynamic,
  isEntityTypeSupported,
} from "../../tools/utils/entity-mapping-dynamic.js";
import {
  extractFieldsFromSchema,
  getCommonUpdateMasks,
  type FieldInfo,
} from "../../tools/utils/schema-introspection.js";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import { resourceCache } from "../utils/resource-cache.js";

const RESOURCE_NAME = "DV360 Entity Fields";
const RESOURCE_DESCRIPTION = "Flat list of all field paths for DV360 entity types";
const URI_TEMPLATE = "entity-fields://{entityType}";

/**
 * Read entity fields resource
 */
async function readEntityFields(params: Record<string, string>): Promise<string> {
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

  const cacheKey = `entity-fields://${entityType}`;
  const cached = resourceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Get schema for the entity type (use update schema as it's the most complete)
  const zodSchema = getEntitySchemaForOperation(entityType, "update");

  // Extract all fields from the schema
  const fields = extractFieldsFromSchema(zodSchema);

  // Get common update masks for this entity type
  const commonUpdateMasks = getCommonUpdateMasks(entityType);

  // Build field list document
  const fieldsDocument = {
    entityType,
    fieldCount: fields.length,
    fields: fields.map((field: FieldInfo) => ({
      path: field.name,
      type: field.type,
      optional: field.optional,
      description: field.description,
      enum: field.enum,
      format: field.format,
    })),
    commonUpdateMasks,
    usage: {
      description: "Use these field paths for updateMask parameter in update operations",
      example: `updateMask: "${commonUpdateMasks[0] || "entityStatus"}"`,
    },
  };

  const text = JSON.stringify(fieldsDocument, null, 2);
  resourceCache.set(cacheKey, text);

  return text;
}

/**
 * List all available entity fields resources
 */
async function listEntityFields(): Promise<TemplatedResourceListing[]> {
  const entityTypes = getSupportedEntityTypesDynamic();

  return entityTypes.map((entityType) => ({
    uri: `entity-fields://${entityType}`,
    name: `${entityType} Fields`,
    description: `Field paths for ${entityType} entity type`,
    mimeType: "application/json",
  }));
}

/**
 * Entity Fields Resource Definition
 */
export const entityFieldsResource: TemplatedResourceDefinition = {
  uriTemplate: URI_TEMPLATE,
  name: RESOURCE_NAME,
  description: RESOURCE_DESCRIPTION,
  mimeType: "application/json",
  resolveContent: (_uri, variables) => readEntityFields(variables as Record<string, string>),
  list: listEntityFields,
};
