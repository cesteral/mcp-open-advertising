/**
 * Entity Schema Resource
 * Provides full JSON Schema for DV360 entity types with metadata
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import type { ResourceDefinition, ResourceContent, ResourceListItem } from "../utils/types.js";
import {
  getEntityConfigDynamic,
  getEntitySchemaForOperation,
  getSupportedEntityTypesDynamic,
  isEntityTypeSupported,
} from "../../tools/utils/entity-mapping-dynamic.js";
import { getRequiredFieldsFromSchema } from "../../tools/utils/entity-mapping-dynamic.js";
import { McpError, JsonRpcErrorCode } from "../../../utils/errors/index.js";
import { resourceCache } from "../utils/resource-cache.js";

const RESOURCE_NAME = "DV360 Entity Schema";
const RESOURCE_DESCRIPTION = "Full JSON Schema for DV360 entity types with operation metadata";
const URI_TEMPLATE = "entity-schema://{entityType}";

/**
 * Read entity schema resource
 */
async function readEntitySchema(params: Record<string, string>): Promise<ResourceContent> {
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

  const cacheKey = `entity-schema://${entityType}`;
  const cached = resourceCache.get(cacheKey);
  if (cached) {
    return { uri: cacheKey, mimeType: "application/json", text: cached };
  }

  const config = getEntityConfigDynamic(entityType);

  // Get Zod schema for entity (use update schema as it's the most complete)
  const zodSchema = getEntitySchemaForOperation(entityType, "update");

  // Convert to JSON Schema with rich descriptions
  const jsonSchema = zodToJsonSchema(zodSchema, {
    target: "jsonSchema7",
    markdownDescription: true,
    errorMessages: true,
  });

  // Extract required fields for different operations
  const requiredFields = getRequiredFieldsFromSchema(entityType);

  // Build comprehensive schema document
  const schemaDocument = {
    entityType,
    schema: jsonSchema,
    metadata: {
      requiredFields,
      supportedOperations: {
        create: config.supportsCreate,
        update: config.supportsUpdate,
        delete: config.supportsDelete,
        filter: config.supportsFilter,
      },
      filterFields: config.filterFields || [],
      parentIds: config.parentIds,
      relationships: config.relationships || [],
    },
    apiPath:
      typeof config.apiPath === "function"
        ? `Dynamic: requires ${config.parentIds.join(", ")}`
        : config.apiPath,
  };

  const text = JSON.stringify(schemaDocument, null, 2);
  resourceCache.set(cacheKey, text);

  return {
    uri: cacheKey,
    mimeType: "application/json",
    text,
  };
}

/**
 * List all available entity schemas
 */
async function listEntitySchemas(): Promise<ResourceListItem[]> {
  const entityTypes = getSupportedEntityTypesDynamic();

  return entityTypes.map((entityType) => ({
    uri: `entity-schema://${entityType}`,
    name: `${entityType} Schema`,
    description: `JSON Schema for ${entityType} entity type`,
    mimeType: "application/json",
  }));
}

/**
 * Entity Schema Resource Definition
 */
export const entitySchemaResource: ResourceDefinition = {
  uriTemplate: URI_TEMPLATE,
  name: RESOURCE_NAME,
  description: RESOURCE_DESCRIPTION,
  mimeType: "application/json",
  read: readEntitySchema,
  list: listEntitySchemas,
};
