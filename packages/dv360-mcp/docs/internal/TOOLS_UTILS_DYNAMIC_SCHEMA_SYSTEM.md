# Tool Utilities - Dynamic Schema System

This directory contains utilities for managing DV360 entity operations with a **dynamic, schema-driven approach**.

## Overview

The system is designed to minimize manual configuration by leveraging the auto-generated Zod schemas from the OpenAPI specification.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: Schema Generation (Automated)                     │
│  - OpenAPI spec → TypeScript types                          │
│  - OpenAPI spec → Zod schemas                               │
│  - Output: src/generated/schemas/                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: Schema Introspection (New!)                       │
│  - Auto-discover entity schemas                             │
│  - Extract field metadata (type, required, description)     │
│  - Extract required fields from Zod schemas                 │
│  File: schemaIntrospection.ts                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 3: Dynamic Entity Mapping (New!)                     │
│  - Minimal API metadata (path template + parent IDs)        │
│  - Auto-infer capabilities from metadata                    │
│  - Auto-infer filter fields from schema                     │
│  File: entityMappingDynamic.ts                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 4: Tool Implementation                               │
│  - Generic CRUD tools work with any entity                  │
│  - Required fields validated from schema                    │
│  - Update masks suggested from common patterns              │
└─────────────────────────────────────────────────────────────┘
```

## Files

### 1. `schemaIntrospection.ts` (New! 🆕)

**Purpose**: Extract metadata from generated Zod schemas

**Key Functions**:

- `getAvailableEntitySchemas()` - Auto-discover all entity schemas
- `extractFieldsFromSchema()` - Get all fields with metadata
- `extractRequiredFields()` - Get required fields for validation
- `hasGeneratedSchema()` - Check if entity has a schema
- `getCommonUpdateMasks()` - Suggest common update field paths

**Example**:

```typescript
import { getAvailableEntitySchemas, extractRequiredFields } from "./schemaIntrospection";

// Discover all available entities
const schemas = getAvailableEntitySchemas();
console.log(Array.from(schemas.keys()));
// Output: ['partner', 'advertiser', 'lineItem', 'campaign', ...]

// Extract required fields for creating a line item
const lineItemSchema = schemas.get("lineItem");
const requiredFields = extractRequiredFields(lineItemSchema);
console.log(requiredFields);
// Output: ['displayName', 'lineItemType', 'entityStatus', 'flight', ...]
```

### 2. `entityMappingDynamic.ts` (New! 🆕)

**Purpose**: Build entity configurations dynamically with minimal manual setup

**Key Concept**: You only configure API metadata (path + parent IDs), everything else is inferred.

**Configuration Example**:

```typescript
const ENTITY_API_METADATA = {
  lineItem: {
    apiPathTemplate: "/advertisers/{advertiserId}/lineItems",
    parentResourceIds: ["advertiserId"],
    supportsFilter: true,
  },
};
```

**Key Functions**:

- `buildEntityConfig()` - Generate full EntityConfig from minimal metadata
- `getEntityConfigDynamic()` - Get config with validation
- `getSupportedEntityTypesDynamic()` - List all supported entities
- `discoverNewEntities()` - Find entities with schemas but no config
- `suggestApiMetadata()` - Auto-suggest config for new entities

**Example**:

```typescript
import { getEntityConfigDynamic, discoverNewEntities } from "./entityMappingDynamic";

// Get config (auto-built from metadata + schema)
const config = getEntityConfigDynamic("lineItem");
console.log(config);
// {
//   apiPath: (ids) => `/advertisers/${ids.advertiserId}/lineItems`,
//   parentIds: ['advertiserId'],
//   supportsCreate: true,
//   supportsUpdate: true,
//   supportsDelete: true,
//   supportsFilter: true,
//   filterFields: ['entityStatus', 'campaignId', 'insertionOrderId', ...]
// }

// Discover new entities that need configuration
const newEntities = discoverNewEntities();
console.log(newEntities);
// Output: ['customBiddingAlgorithm', 'inventorySource', ...]
```

### 3. `entityMapping.ts` (Legacy)

**Purpose**: Original hardcoded entity configuration

**Status**: Kept for backward compatibility. New code should use `entityMappingDynamic.ts`.

**Limitations**:

- Every entity manually configured
- Required fields hardcoded
- Filter fields manually specified
- Schema mappings manually maintained

### 4. `requiredFields.ts` (Legacy)

**Purpose**: Hardcoded required fields for entity operations

**Status**: Superseded by `getRequiredFieldsFromSchema()` in `schemaIntrospection.ts`.

## Adding a New Entity

### Old Approach (Manual)

1. Add entry to `ENTITY_TYPE_CONFIG` in `entityMapping.ts`
2. Add schema mapping in `getEntitySchema()`
3. Add required fields in `requiredFields.ts`
4. Update `getSupportedEntityTypes()`

**~40 lines of code per entity**

### New Approach (Dynamic)

1. Add entry to `ENTITY_API_METADATA` in `entityMappingDynamic.ts`:

```typescript
customBiddingAlgorithm: {
  apiPathTemplate: '/customBiddingAlgorithms',
  parentResourceIds: [],
  supportsFilter: true,
},
```

**~5 lines of code per entity** ✅

Everything else is auto-discovered from the generated schema!

## Migration Guide

### Step 1: Update Imports

```typescript
// Old
import { getEntityConfig, getEntitySchema } from "./entityMapping";

// New
import { getEntityConfigDynamic, getEntitySchemaForOperation } from "./entityMappingDynamic";
```

### Step 2: Update Function Calls

```typescript
// Old
const config = getEntityConfig("lineItem");
const schema = getEntitySchema("lineItem", "create");
const types = getSupportedEntityTypes();

// New
const config = getEntityConfigDynamic("lineItem");
const schema = getEntitySchemaForOperation("lineItem", "create");
const types = getSupportedEntityTypesDynamic();
```

### Step 3: Use Schema Introspection

```typescript
// Old - hardcoded required fields
const required = ['displayName', 'entityStatus', 'flight', ...];

// New - extracted from schema
import { getRequiredFieldsFromSchema } from './schemaIntrospection';
const required = getRequiredFieldsFromSchema('lineItem');
```

## Benefits of Dynamic System

### 1. **Auto-Discovery**

When you regenerate schemas from a new OpenAPI spec, new entities are automatically discovered:

```typescript
const newEntities = discoverNewEntities();
// ['newEntity1', 'newEntity2']
```

### 2. **Always in Sync**

Required fields are extracted from the schema at runtime, so they're always correct:

```typescript
// If OpenAPI spec changes required fields, no code update needed!
const required = getRequiredFieldsFromSchema("lineItem");
```

### 3. **Rich Metadata**

Extract field descriptions, types, enums directly from schema:

```typescript
const fields = extractFieldsFromSchema(schema);
fields.forEach((field) => {
  console.log(`${field.name}: ${field.type} (${field.description})`);
});
```

### 4. **Intelligent Inference**

Filter fields are inferred by checking which common fields exist in the schema:

```typescript
// Automatically detects: entityStatus, advertiserId, campaignId, etc.
const config = buildEntityConfig("lineItem");
console.log(config.filterFields);
```

### 5. **Developer Tools**

Helper functions make it easy to add new entities:

```typescript
// Get suggestion for new entity
const suggestion = suggestApiMetadata("newEntity");
console.log(suggestion);
// {
//   apiPathTemplate: '/advertisers/{advertiserId}/newEntitys',
//   parentResourceIds: ['advertiserId'],
//   supportsFilter: true
// }
```

## Future Enhancements

### Planned Features

1. **Auto-generate API metadata from OpenAPI paths**
   - Parse OpenAPI spec to extract path templates
   - No manual configuration needed at all!

2. **Schema-based validation helpers**
   - Auto-validate update masks against schema
   - Suggest corrections for typos in field names

3. **MCP Resource integration**
   - Use introspection to generate `entity-schema://` resources
   - Auto-generate `entity-examples://` from schema

4. **Field-level documentation**
   - Extract JSDoc from TypeScript types
   - Include in MCP tool descriptions

## Testing

```bash
# Run tests for schema introspection
pnpm test src/mcp-server/tools/utils/schemaIntrospection.test.ts

# Discover new entities
pnpm run discover-entities
```

## API Reference

See individual file documentation:

- [schemaIntrospection.ts](./schemaIntrospection.ts)
- [entityMappingDynamic.ts](./entityMappingDynamic.ts)

## Questions?

The dynamic system is designed to be intuitive. Key principle:

**"Configure the API, infer everything else from the schema"**

If you're adding a new entity and you know:

1. The API path (e.g., `/advertisers/{advertiserId}/campaigns`)
2. The parent resource IDs (e.g., `['advertiserId']`)

That's all you need! Add those 2 lines to `ENTITY_API_METADATA` and everything else works automatically.
