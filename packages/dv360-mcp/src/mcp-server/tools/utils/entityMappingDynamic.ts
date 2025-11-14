import { z } from "zod";
import {
  getAvailableEntitySchemas,
  getEntitySchemaByType,
  extractRequiredFields,
  hasGeneratedSchema,
} from "./schemaIntrospection.js";

/**
 * Entity configuration for API mapping
 */
export interface EntityConfig {
  apiPath: string | ((ids: Record<string, string>) => string);
  parentIds: string[];
  supportsCreate: boolean;
  supportsUpdate: boolean;
  supportsDelete: boolean;
  supportsFilter: boolean;
  filterFields?: string[];
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
  parentResourceIds: string[]; // e.g., ["advertiserId"]
  isReadOnly?: boolean; // If true, only GET/LIST operations allowed
  supportsFilter?: boolean; // Whether LIST supports filtering
}

/**
 * Registry of entity API metadata
 * This is the ONLY place we need to manually configure entities
 */
const ENTITY_API_METADATA: Record<string, EntityApiMetadata> = {
  partner: {
    apiPathTemplate: "/partners",
    parentResourceIds: [],
    isReadOnly: true, // Partners managed by Google
    supportsFilter: false,
  },
  advertiser: {
    apiPathTemplate: "/advertisers",
    parentResourceIds: ["partnerId"],
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
    supportsFilter: true,
  },
  lineItem: {
    apiPathTemplate: "/advertisers/{advertiserId}/lineItems",
    parentResourceIds: ["advertiserId"],
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

/**
 * Build dynamic entity configuration from API metadata and schema introspection
 */
export function buildEntityConfig(entityType: string): EntityConfig | null {
  const apiMetadata = ENTITY_API_METADATA[entityType];
  if (!apiMetadata) {
    return null;
  }

  // Build API path (static or dynamic function)
  const apiPath = apiMetadata.apiPathTemplate.includes("{")
    ? (ids: Record<string, string>) => {
        let path = apiMetadata.apiPathTemplate;
        // Replace all {paramName} with ids[paramName]
        path = path.replace(/\{(\w+)\}/g, (_, key) => ids[key] || "");
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
    supportsCreate: !apiMetadata.isReadOnly,
    supportsUpdate: !apiMetadata.isReadOnly,
    supportsDelete: !apiMetadata.isReadOnly,
    supportsFilter: apiMetadata.supportsFilter ?? false,
    filterFields,
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

  for (const entityType of Object.keys(ENTITY_API_METADATA)) {
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
    const apiMetadata = ENTITY_API_METADATA[entityType];
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
  // Return entities that have API metadata (schema is optional with fallback)
  return Object.keys(ENTITY_API_METADATA);
}

/**
 * Validate entity type is supported
 */
export function isEntityTypeSupported(entityType: string): boolean {
  return ENTITY_API_METADATA[entityType] !== undefined;
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
  const configuredEntities = new Set(Object.keys(ENTITY_API_METADATA));

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
