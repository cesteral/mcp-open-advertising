import { z } from "zod";
import {
  getAvailableEntitySchemas,
  getEntitySchemaByType,
  extractRequiredFields,
  hasGeneratedSchema,
} from "./schemaIntrospection.js";

/**
 * Entity relationship metadata
 * Defines parent-child relationships between entities
 */
export interface EntityRelationship {
  parentEntityType: string; // e.g., "campaign" for insertionOrder
  parentFieldName: string; // Field name in child entity schema (e.g., "campaignId")
  required: boolean; // Whether this relationship is required
  description: string; // Human-readable relationship description
}

/**
 * Entity configuration for API mapping
 */
export interface EntityConfig {
  apiPath: string | ((ids: Record<string, string>) => string);
  parentIds: string[]; // IDs required for validation (for API path construction)
  queryParamIds: string[]; // IDs that should be passed as query parameters (not in path)
  filterParamIds: string[]; // IDs that should be converted to filter expressions (e.g., campaignId for insertionOrders)
  supportsCreate: boolean;
  supportsUpdate: boolean;
  supportsDelete: boolean;
  supportsFilter: boolean;
  filterFields?: string[];
  relationships?: EntityRelationship[]; // Parent-child relationships in entity data
}

/**
 * Dynamic Entity Mapping
 * Auto-discovers entity configurations from generated schemas
 */

/**
 * Entity API metadata derived from DV360 API patterns
 * This is the minimal configuration needed - everything else can be inferred
 */
interface EntityApiMetadata {
  apiPathTemplate: string; // e.g., "/partners" or "/advertisers/{advertiserId}/campaigns"
  parentResourceIds: string[]; // e.g., ["advertiserId"] - IDs required for this entity
  queryParamIds?: string[]; // IDs that go in query params instead of path (e.g., ["partnerId"] for advertisers)
  filterParamIds?: string[]; // IDs that become filter expressions (e.g., ["campaignId"] for insertionOrders)
  isReadOnly?: boolean; // If true, only GET/LIST operations allowed
  supportsFilter?: boolean; // Whether LIST supports filtering
}

/**
 * Registry of entity API metadata
 * This is the ONLY place we need to manually configure entities
 */
export const STATIC_ENTITY_API_METADATA: Record<string, EntityApiMetadata> = {
  partner: {
    apiPathTemplate: "/partners",
    parentResourceIds: [],
    isReadOnly: true, // Partners managed by Google
    supportsFilter: false,
  },
  advertiser: {
    apiPathTemplate: "/advertisers",
    parentResourceIds: ["partnerId"],
    queryParamIds: ["partnerId"], // partnerId goes in query params, not path
    supportsFilter: true,
  },
  campaign: {
    apiPathTemplate: "/advertisers/{advertiserId}/campaigns",
    parentResourceIds: ["advertiserId"],
    supportsFilter: true,
  },
  insertionOrder: {
    apiPathTemplate: "/advertisers/{advertiserId}/insertionOrders",
    parentResourceIds: ["advertiserId"],
    filterParamIds: ["campaignId"], // campaignId is optional filter, not required parent
    supportsFilter: true,
  },
  lineItem: {
    apiPathTemplate: "/advertisers/{advertiserId}/lineItems",
    parentResourceIds: ["advertiserId"],
    filterParamIds: ["insertionOrderId"], // insertionOrderId is optional filter, not required parent
    supportsFilter: true,
  },
  adGroup: {
    apiPathTemplate: "/advertisers/{advertiserId}/adGroups",
    parentResourceIds: ["advertiserId"],
    supportsFilter: true,
  },
  adGroupAd: {
    apiPathTemplate: "/advertisers/{advertiserId}/adGroupAds",
    parentResourceIds: ["advertiserId"],
    isReadOnly: true, // AdGroupAds only support GET/LIST operations
    supportsFilter: true,
  },
  creative: {
    apiPathTemplate: "/advertisers/{advertiserId}/creatives",
    parentResourceIds: ["advertiserId"],
    supportsFilter: true,
  },
  customBiddingAlgorithm: {
    apiPathTemplate: "/customBiddingAlgorithms",
    parentResourceIds: [],
    supportsFilter: true,
  },
  inventorySource: {
    apiPathTemplate: "/inventorySources",
    parentResourceIds: [],
    supportsFilter: true,
  },
  inventorySourceGroup: {
    apiPathTemplate: "/inventorySourceGroups",
    parentResourceIds: [],
    supportsFilter: true,
  },
  locationList: {
    apiPathTemplate: "/advertisers/{advertiserId}/locationLists",
    parentResourceIds: ["advertiserId"],
    supportsFilter: false,
  },
};

const ENTITY_API_METADATA_CACHE = new Map<string, EntityApiMetadata>();

function getEntityApiMetadata(entityType: string): EntityApiMetadata | undefined {
  if (STATIC_ENTITY_API_METADATA[entityType]) {
    return STATIC_ENTITY_API_METADATA[entityType];
  }

  if (ENTITY_API_METADATA_CACHE.has(entityType)) {
    return ENTITY_API_METADATA_CACHE.get(entityType);
  }

  if (hasGeneratedSchema(entityType)) {
    const suggestion = suggestApiMetadata(entityType);
    ENTITY_API_METADATA_CACHE.set(entityType, suggestion);
    return suggestion;
  }

  return undefined;
}

/**
 * Entity Relationship Registry
 * Defines parent-child relationships in entity data payloads
 * This is auto-discovered from schemas but can be overridden here
 */
const RELATIONSHIP_OVERRIDES: Record<string, EntityRelationship[]> = {
  // Campaign belongs to Advertiser (via advertiserId in data)
  campaign: [
    {
      parentEntityType: "advertiser",
      parentFieldName: "advertiserId",
      required: true,
      description: "Campaign must belong to an advertiser",
    },
  ],

  // InsertionOrder belongs to Campaign and Advertiser
  insertionOrder: [
    {
      parentEntityType: "advertiser",
      parentFieldName: "advertiserId",
      required: true,
      description: "Insertion order must belong to an advertiser",
    },
    {
      parentEntityType: "campaign",
      parentFieldName: "campaignId",
      required: true,
      description: "Insertion order must be linked to a campaign",
    },
  ],

  // LineItem belongs to InsertionOrder and Advertiser
  lineItem: [
    {
      parentEntityType: "advertiser",
      parentFieldName: "advertiserId",
      required: true,
      description: "Line item must belong to an advertiser",
    },
    {
      parentEntityType: "insertionOrder",
      parentFieldName: "insertionOrderId",
      required: true,
      description: "Line item must be linked to an insertion order",
    },
  ],

  // AdGroup belongs to Advertiser
  adGroup: [
    {
      parentEntityType: "advertiser",
      parentFieldName: "advertiserId",
      required: true,
      description: "Ad group must belong to an advertiser",
    },
  ],

  // Creative belongs to Advertiser
  creative: [
    {
      parentEntityType: "advertiser",
      parentFieldName: "advertiserId",
      required: true,
      description: "Creative must belong to an advertiser",
    },
  ],

  // Advertiser belongs to Partner
  advertiser: [
    {
      parentEntityType: "partner",
      parentFieldName: "partnerId",
      required: true,
      description: "Advertiser must belong to a partner",
    },
  ],
};

function buildEntityRelationships(
  entityType: string,
  metadata?: EntityApiMetadata
): EntityRelationship[] {
  const overrides = RELATIONSHIP_OVERRIDES[entityType] || [];
  if (!metadata) {
    return overrides;
  }

  const relationships = [...overrides];
  for (const parentField of metadata.parentResourceIds) {
    if (relationships.some((rel) => rel.parentFieldName === parentField)) {
      continue;
    }

    relationships.push({
      parentEntityType: inferParentEntityType(parentField),
      parentFieldName: parentField,
      required: true,
      description: `${entityType} must reference ${parentField} to resolve its API path`,
    });
  }

  return relationships;
}

function inferParentEntityType(fieldName: string): string {
  if (fieldName.endsWith("Id")) {
    return fieldName.slice(0, -2);
  }
  return fieldName;
}

/**
 * Build dynamic entity configuration from API metadata and schema introspection
 */
export function buildEntityConfig(entityType: string): EntityConfig | null {
  const apiMetadata = getEntityApiMetadata(entityType);
  if (!apiMetadata) {
    return null;
  }

  // Build API path (static or dynamic function)
  const apiPath = apiMetadata.apiPathTemplate.includes("{")
    ? (ids: Record<string, string>) => {
        let path = apiMetadata.apiPathTemplate;

        // Extract required parameters from template
        const requiredParams = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

        // Validate all required parameters are present (defense-in-depth)
        const missingParams = requiredParams.filter((param) => !ids[param]);
        if (missingParams.length > 0) {
          throw new Error(
            `[PathBuilder] Missing required path parameter(s) for ${entityType}: ${missingParams.join(", ")}. ` +
              `Template: ${apiMetadata.apiPathTemplate}, Provided IDs: ${Object.keys(ids).join(", ")}`
          );
        }

        // Replace all {paramName} with ids[paramName]
        path = path.replace(/\{(\w+)\}/g, (_, key) => ids[key]);
        return path;
      }
    : apiMetadata.apiPathTemplate;

  // Determine filter fields from schema (look for common filterable fields)
  const filterFields = apiMetadata.supportsFilter
    ? inferFilterableFields(entityType)
    : undefined;

  return {
    apiPath,
    parentIds: apiMetadata.parentResourceIds,
    queryParamIds: apiMetadata.queryParamIds || [],
    filterParamIds: apiMetadata.filterParamIds || [],
    supportsCreate: !apiMetadata.isReadOnly,
    supportsUpdate: !apiMetadata.isReadOnly,
    supportsDelete: !apiMetadata.isReadOnly,
    supportsFilter: apiMetadata.supportsFilter ?? false,
    filterFields,
    relationships: buildEntityRelationships(entityType, apiMetadata),
  };
}

/**
 * Infer filterable fields from schema
 * Common filterable fields in DV360: entityStatus, partnerId, advertiserId, etc.
 */
function inferFilterableFields(entityType: string): string[] {
  const commonFilterFields = [
    "entityStatus",
    "partnerId",
    "advertiserId",
    "campaignId",
    "insertionOrderId",
    "lineItemId",
    "adGroupId",
    "lineItemType",
    "creativeType",
  ];

  // Get schema and check which common fields exist
  if (!hasGeneratedSchema(entityType)) {
    return commonFilterFields; // Return all as fallback
  }

  const schema = getEntitySchemaByType(entityType);
  const availableFields: string[] = [];

  if (schema instanceof z.ZodObject) {
    const shape = (schema as z.ZodObject<any>).shape;
    for (const field of commonFilterFields) {
      if (shape[field]) {
        availableFields.push(field);
      }
    }
  }

  return availableFields.length > 0 ? availableFields : ["entityStatus"];
}

/**
 * Get all entity configs (dynamically generated)
 */
export function getAllEntityConfigs(): Map<string, EntityConfig> {
  const configs = new Map<string, EntityConfig>();

  const entityTypes = new Set([
    ...Object.keys(STATIC_ENTITY_API_METADATA),
    ...getAvailableEntitySchemas().keys(),
  ]);

  for (const entityType of entityTypes) {
    const config = buildEntityConfig(entityType);
    if (config) {
      configs.set(entityType, config);
    }
  }

  return configs;
}

/**
 * Get required fields for create operation (from schema introspection)
 */
export function getRequiredFieldsFromSchema(entityType: string): string[] {
  if (!hasGeneratedSchema(entityType)) {
    // Fallback to minimal requirements
    const apiMetadata = getEntityApiMetadata(entityType);
    return [
      ...(apiMetadata?.parentResourceIds || []),
      "displayName",
      "entityStatus",
    ];
  }

  const schema = getEntitySchemaByType(entityType);
  return extractRequiredFields(schema);
}

/**
 * Get supported entity types (from schema introspection + API metadata)
 */
export function getSupportedEntityTypesDynamic(): string[] {
  return Array.from(getAllEntityConfigs().keys()).sort();
}

/**
 * Validate entity type is supported
 */
export function isEntityTypeSupported(entityType: string): boolean {
  return getEntityApiMetadata(entityType) !== undefined;
}

/**
 * Get entity configuration with fallback
 */
export function getEntityConfigDynamic(entityType: string): EntityConfig {
  const config = buildEntityConfig(entityType);
  if (!config) {
    throw new Error(
      `Unknown entity type: ${entityType}. Supported types: ${getSupportedEntityTypesDynamic().join(", ")}`
    );
  }
  return config;
}

/**
 * Get entity schema with list wrapper
 */
export function getEntitySchemaForOperation(
  entityType: string,
  operation: "list" | "get" | "create" | "update"
): z.ZodTypeAny {
  const schema = getEntitySchemaByType(entityType);

  // For list operations, wrap in array response
  if (operation === "list") {
    return z.object({
      [entityType + "s"]: z.array(schema),
      nextPageToken: z.string().optional(),
    });
  }

  return schema;
}

/**
 * Auto-discover new entities from generated schemas
 * Returns entities that have schemas but no API metadata yet
 */
export function discoverNewEntities(): string[] {
  const availableSchemas = getAvailableEntitySchemas();
  const configuredEntities = new Set([
    ...Object.keys(STATIC_ENTITY_API_METADATA),
    ...ENTITY_API_METADATA_CACHE.keys(),
  ]);

  const newEntities: string[] = [];
  for (const entityType of availableSchemas.keys()) {
    if (!configuredEntities.has(entityType)) {
      newEntities.push(entityType);
    }
  }

  return newEntities;
}

/**
 * Generate API metadata suggestion for a new entity
 * (Helper for developers adding new entities)
 */
export function suggestApiMetadata(entityType: string): EntityApiMetadata {
  // Guess API path based on common patterns
  const pluralEntity = entityType + "s";

  // Most DV360 entities are under /advertisers/{advertiserId}
  const guessedPath = `/advertisers/{advertiserId}/${pluralEntity}`;

  return {
    apiPathTemplate: guessedPath,
    parentResourceIds: ["advertiserId"],
    supportsFilter: true,
  };
}

/**
 * Get entity relationships for a given entity type
 */
export function getEntityRelationships(entityType: string): EntityRelationship[] {
  const metadata = getEntityApiMetadata(entityType);
  return buildEntityRelationships(entityType, metadata);
}

/**
 * Get all parent entities for a given entity type
 * Returns entities in hierarchical order (closest parent first)
 */
export function getParentEntityTypes(entityType: string): string[] {
  const relationships = getEntityRelationships(entityType);
  return relationships.map((rel) => rel.parentEntityType);
}

/**
 * Get full entity hierarchy path
 * Example: lineItem -> [advertiser, campaign, insertionOrder, lineItem]
 */
export function getEntityHierarchyPath(entityType: string): string[] {
  const path: string[] = [];
  const visited = new Set<string>();

  function traverse(currentType: string) {
    // Prevent circular dependencies
    if (visited.has(currentType)) {
      return;
    }
    visited.add(currentType);

    // Get parent relationships
    const relationships = getEntityRelationships(currentType);

    // Add parents first (recursive)
    for (const rel of relationships) {
      traverse(rel.parentEntityType);
    }

    // Add current entity
    if (!path.includes(currentType)) {
      path.push(currentType);
    }
  }

  traverse(entityType);
  return path;
}

/**
 * Generate human-readable relationship description for an entity
 * Used for tool descriptions and error messages
 */
export function generateRelationshipDescription(entityType: string): string {
  const relationships = getEntityRelationships(entityType);

  if (relationships.length === 0) {
    return `${entityType} is a top-level entity with no parent requirements.`;
  }

  const requiredRelationships = relationships.filter((rel) => rel.required);

  if (requiredRelationships.length === 0) {
    return `${entityType} has optional parent relationships.`;
  }

  const descriptions = requiredRelationships.map((rel) => {
    return `- Must include '${rel.parentFieldName}' in data to link to ${rel.parentEntityType}`;
  });

  return `${entityType} requires:\n${descriptions.join("\n")}`;
}

/**
 * Validate that entity data includes all required parent field references
 * Returns array of missing required fields
 */
export function validateEntityRelationships(
  entityType: string,
  data: Record<string, any>
): string[] {
  const relationships = getEntityRelationships(entityType);
  const missingFields: string[] = [];

  for (const rel of relationships) {
    if (rel.required && !hasNestedValue(data, rel.parentFieldName)) {
      missingFields.push(rel.parentFieldName);
    }
  }

  return missingFields;
}

/**
 * Get suggested parent IDs for creating a new entity
 * Returns a helpful message for the AI about what IDs are needed
 */
export function getCreateRequirements(entityType: string): {
  pathIds: string[]; // IDs needed for API path
  dataFields: string[]; // Parent ID fields needed in data payload
  description: string;
} {
  const config = getEntityConfigDynamic(entityType);
  const relationships = getEntityRelationships(entityType);

  const requiredDataFields = relationships
    .filter((rel) => rel.required)
    .map((rel) => rel.parentFieldName);

  const hierarchy = getEntityHierarchyPath(entityType);

  return {
    pathIds: config.parentIds,
    dataFields: requiredDataFields,
    description: `To create ${entityType}:
- Provide ${config.parentIds.join(", ")} as parameters (for API path)
- Include ${requiredDataFields.join(", ")} in the data payload (to establish relationships)
- Hierarchy: ${hierarchy.join(" > ")}`,
  };
}

function hasNestedValue(data: Record<string, any>, path: string): boolean {
  const parts = path.split(".");

  const traverse = (current: any, index: number): boolean => {
    if (index >= parts.length) {
      return current !== undefined && current !== null && current !== "";
    }

    if (Array.isArray(current)) {
      return current.some((item) => traverse(item, index));
    }

    if (current && typeof current === "object") {
      return traverse((current as Record<string, any>)[parts[index]], index + 1);
    }

    return false;
  };

  return traverse(data, 0);
}
