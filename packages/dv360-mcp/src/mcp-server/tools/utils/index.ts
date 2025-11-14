/**
 * Tool utilities barrel export
 * Dynamic entity system - schema-driven with minimal configuration
 */

// Dynamic entity system
export * from "./schemaIntrospection.js";
export * from "./entityMappingDynamic.js";
export * from "./entityIdExtraction.js";
export * from "./entityExamples.js";

/**
 * Usage Guide
 *
 * The dynamic system automatically discovers entities from generated schemas
 * and requires minimal manual configuration.
 *
 * Key Features:
 * - Only configure API metadata (path template, parent IDs) - ~5 lines per entity
 * - Schemas auto-discovered from generated/schemas/zod.ts
 * - Required fields extracted from Zod schemas
 * - Filter fields inferred from schema structure
 * - Entity ID extraction utilities eliminate code duplication
 *
 * Main Functions:
 * - `getEntityConfigDynamic()` - Get entity configuration
 * - `getEntitySchemaForOperation()` - Get schema for operation
 * - `getSupportedEntityTypesDynamic()` - List all supported entities
 * - `extractEntityIds()` - Extract IDs from tool input
 * - `extractParentIds()` - Extract only parent IDs
 * - `getEntityExamples()` - Get curated examples for entity type
 * - `getEntityExamplesByCategory()` - Get examples by category (bid, budget, status, etc.)
 * - `formatEntityExamplesAsText()` - Format examples as human-readable text
 *
 * Example:
 * ```typescript
 * import {
 *   getEntityConfigDynamic,
 *   getEntitySchemaForOperation,
 *   extractEntityIds,
 *   getEntityExamples,
 *   formatEntityExamplesAsText
 * } from './utils';
 *
 * const config = getEntityConfigDynamic('lineItem');
 * const schema = getEntitySchemaForOperation('lineItem', 'create');
 * const ids = extractEntityIds(input, 'lineItem');
 * const examples = getEntityExamples('lineItem');
 * const examplesText = formatEntityExamplesAsText('lineItem');
 * ```
 */
