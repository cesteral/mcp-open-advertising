/**
 * Simplified schemas for MCP tools
 *
 * PROBLEM: Full entity schemas are too large for stdio transport, causing EPIPE errors.
 * When using discriminated unions with all entity types, schemas exceed ~1MB (stdio limit).
 *
 * SOLUTION: This module provides simplified schemas for tool registration while maintaining
 * full validation server-side.
 *
 * ARCHITECTURE:
 * - Tool registration: Uses simplified schemas (~2KB) with generic object types
 * - Descriptions: Guide AI to fetch full schemas via MCP Resources
 * - Server-side validation: Still uses complete Zod discriminated union schemas
 * - MCP Resources: Claude fetches detailed schemas via entity-schema://{entityType}
 *
 * FULLY DYNAMIC:
 * - Both simplified and full schemas use getSupportedEntityTypesDynamic()
 * - Single source of truth: schemaIntrospection.ts auto-discovers entity types
 * - Adding new entity types requires ZERO manual updates to this file
 *
 * WORKFLOW FOR AI AGENTS:
 * 1. See entityType enum in tool schema (e.g., "lineItem", "campaign")
 * 2. Fetch entity-schema://{entityType} to see full schema with required fields
 * 3. Review entity-examples://{entityType} for common patterns
 * 4. Build data payload and call tool
 * 5. Server validates with FullCreateEntityInputSchema (complete validation)
 *
 * See CLAUDE.md "Dynamic Schema Pattern" section for full documentation.
 */

import { getSupportedEntityTypesDynamic } from "./entity-mapping-dynamic.js";

/**
 * Generate simplified schema for create_entity tool
 *
 * Instead of a massive anyOf with all entity types (1MB+), we use:
 * - Single object with entityType enum (auto-discovered, fully dynamic!)
 * - Generic data object (z.record(z.any()) - no nested schemas)
 * - Descriptions pointing to MCP Resources for full schema details
 *
 * IMPORTANT: This function is FULLY DYNAMIC:
 * - getSupportedEntityTypesDynamic() introspects generated/schemas/zod.js at runtime
 * - New entity types are automatically included in enum
 * - No hardcoded entity types anywhere
 */
export function getSimplifiedCreateEntitySchema() {
  // Auto-discovers all entity types from generated schemas (fully dynamic!)
  const supportedTypes = getSupportedEntityTypesDynamic();

  return {
    type: "object",
    properties: {
      entityType: {
        type: "string",
        enum: supportedTypes,
        description:
          "Type of entity to create. For full schema details, use the entity-schema://{entityType} MCP resource.",
      },
      partnerId: {
        type: "string",
        description: "Partner ID (required for partner-scoped entities like advertisers)",
      },
      advertiserId: {
        type: "string",
        description: "Advertiser ID (required for advertiser-scoped entities)",
      },
      campaignId: {
        type: "string",
        description: "Campaign ID (for campaign-scoped entities)",
      },
      insertionOrderId: {
        type: "string",
        description: "Insertion Order ID (for IO-scoped entities)",
      },
      lineItemId: {
        type: "string",
        description: "Line Item ID (for line item-scoped entities)",
      },
      data: {
        type: "object",
        description:
          "Entity data to create. Required fields vary by entityType. " +
          "Use the entity-schema://{entityType} resource to see the full schema and required fields. " +
          "Use entity-examples://{entityType} for example payloads.",
        additionalProperties: true,
      },
    },
    required: ["entityType", "data"],
    additionalProperties: false,
    description:
      `Create a new DV360 entity. Supported types: ${supportedTypes.join(", ")}. ` +
      "For detailed schemas and required fields, use MCP resources: " +
      "entity-schema://{entityType} (full JSON Schema), " +
      "entity-fields://{entityType} (field list), " +
      "entity-examples://{entityType} (example payloads).",
  };
}

/**
 * Generate simplified schema for update_entity tool
 *
 * Same pattern as create_entity: simplified for stdio, full validation server-side.
 * Uses same getSupportedEntityTypesDynamic() - FULLY DYNAMIC.
 */
export function getSimplifiedUpdateEntitySchema() {
  // Auto-discovers all entity types from generated schemas (fully dynamic!)
  const supportedTypes = getSupportedEntityTypesDynamic();

  return {
    type: "object",
    properties: {
      entityType: {
        type: "string",
        enum: supportedTypes,
        description:
          "Type of entity to update. For full schema details, use the entity-schema://{entityType} MCP resource.",
      },
      partnerId: {
        type: "string",
        description: "Partner ID (if required for this entity type)",
      },
      advertiserId: {
        type: "string",
        description: "Advertiser ID (if required for this entity type)",
      },
      campaignId: {
        type: "string",
        description: "Campaign ID (if updating a campaign)",
      },
      insertionOrderId: {
        type: "string",
        description: "Insertion Order ID (if updating an insertion order)",
      },
      lineItemId: {
        type: "string",
        description: "Line Item ID (if updating a line item)",
      },
      adGroupId: {
        type: "string",
        description: "Ad Group ID (if updating an ad group)",
      },
      creativeId: {
        type: "string",
        description: "Creative ID (if updating a creative)",
      },
      data: {
        type: "object",
        description:
          "Partial entity data to update (only fields being changed). " +
          "Use entity-examples://{entityType} to see common update patterns.",
        additionalProperties: true,
      },
      updateMask: {
        type: "string",
        description:
          "Comma-separated list of field paths to update (e.g., 'displayName,entityStatus'). " +
          "Use entity-fields://{entityType} to see all available field paths. " +
          "IMPORTANT: Only fields in updateMask will be modified.",
      },
      reason: {
        type: "string",
        description: "Optional reason for the update (for audit trail)",
      },
    },
    required: ["entityType", "data", "updateMask"],
    additionalProperties: false,
    description:
      `Update a DV360 entity. Supported types: ${supportedTypes.join(", ")}. ` +
      "For detailed schemas and field paths, use MCP resources: " +
      "entity-schema://{entityType} (full JSON Schema), " +
      "entity-fields://{entityType} (available field paths), " +
      "entity-examples://{entityType} (common update examples).",
  };
}

/**
 * Get estimated schema size (for testing/monitoring)
 */
export function estimateSchemaSize(schema: any): number {
  return JSON.stringify(schema).length;
}

/**
 * Validate that schema is under size limit
 * MCP stdio transport can handle ~1MB, but we want to stay well under that
 */
export function validateSchemaSize(schema: any, maxSize: number = 100_000): boolean {
  const size = estimateSchemaSize(schema);
  return size <= maxSize;
}

/**
 * Get schema size report for all tools
 */
export function getSchemasSizeReport(): {
  createEntity: { size: number; valid: boolean };
  updateEntity: { size: number; valid: boolean };
} {
  const createSchema = getSimplifiedCreateEntitySchema();
  const updateSchema = getSimplifiedUpdateEntitySchema();

  return {
    createEntity: {
      size: estimateSchemaSize(createSchema),
      valid: validateSchemaSize(createSchema),
    },
    updateEntity: {
      size: estimateSchemaSize(updateSchema),
      valid: validateSchemaSize(updateSchema),
    },
  };
}
