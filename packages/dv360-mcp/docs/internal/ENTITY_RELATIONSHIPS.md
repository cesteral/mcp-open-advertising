# Entity Relationship System

## Overview

The DV360 MCP server uses a **generic, metadata-driven relationship system** that automatically understands entity hierarchies without hardcoding workflow-specific logic. This ensures the AI always knows the correct parent-child relationships when creating, updating, or querying entities.

## Key Features

✅ **Generic & Extensible** - Relationships defined declaratively in one place
✅ **Automatic Validation** - Validates parent field presence in entity data
✅ **Helpful Error Messages** - Shows hierarchy and missing fields
✅ **Tool Integration** - Descriptions automatically include relationship info
✅ **Type-Safe** - Full TypeScript support with Zod validation

## Entity Hierarchy

```
partner
  └── advertiser
      ├── campaign
      │   └── insertionOrder
      │       └── lineItem
      ├── creative
      └── adGroup
```

## How It Works

### 1. Relationship Metadata

Relationships are defined in `entityMappingDynamic.ts`:

```typescript
const ENTITY_RELATIONSHIPS: Record<string, EntityRelationship[]> = {
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
  // ... more entities
};
```

### 2. Automatic Validation

When creating entities, the system validates that required parent fields are present:

```typescript
// ❌ Will FAIL - missing campaignId
dv360_create_entity({
  entityType: "insertionOrder",
  advertiserId: "123",
  data: {
    displayName: "My IO",
    // Missing campaignId!
  }
})

// ✅ Will SUCCEED
dv360_create_entity({
  entityType: "insertionOrder",
  advertiserId: "123",
  data: {
    displayName: "My IO",
    campaignId: "456", // ← Required parent field
  }
})
```

### 3. Dynamic Tool Descriptions

Tool descriptions automatically include hierarchy information:

```
Create a new DV360 entity. Supports all entity types with automatic relationship validation.

Entity Hierarchy (parent > child):
- partner > advertiser > campaign > insertionOrder > lineItem
- advertiser > creative
- advertiser > adGroup

Important: When creating child entities, you must include parent ID fields in the data payload.

Examples:
- To create an insertionOrder: include 'campaignId' in data (not just as a parameter)
- To create a lineItem: include 'insertionOrderId' in data
- To create a campaign: include 'advertiserId' in data
```

### 4. Helpful Error Messages

When validation fails, the error includes:

- Missing field names
- Full hierarchy path
- Relationship requirements

```json
{
  "error": "Missing required parent relationship field(s) in data: campaignId",
  "entityType": "insertionOrder",
  "missingFields": ["campaignId"],
  "hierarchy": "partner > advertiser > campaign > insertionOrder",
  "hint": "insertionOrder requires:\n- Must include 'advertiserId' in data to link to advertiser\n- Must include 'campaignId' in data to link to campaign"
}
```

## API vs Data Relationships

**Important distinction:**

1. **API Path IDs** (`parentIds`) - Required for constructing the API endpoint
   - Example: `advertiserId` for `/advertisers/{advertiserId}/campaigns`

2. **Data Relationship Fields** (`relationships`) - Required in the entity data payload
   - Example: `campaignId` in insertion order data to link it to a campaign

Both are required but serve different purposes:

```typescript
// Creating an insertion order
{
  // API Path ID (for URL construction)
  advertiserId: "123",  // → /advertisers/123/insertionOrders

  // Data (request body)
  data: {
    advertiserId: "123",  // ← Data relationship field
    campaignId: "456",     // ← Data relationship field
    displayName: "My IO"
  }
}
```

## Utility Functions

### `getEntityHierarchyPath(entityType)`

Returns full hierarchy path for an entity:

```typescript
getEntityHierarchyPath('lineItem')
// → ['partner', 'advertiser', 'campaign', 'insertionOrder', 'lineItem']
```

### `validateEntityRelationships(entityType, data)`

Returns array of missing required fields:

```typescript
validateEntityRelationships('insertionOrder', { advertiserId: '123' })
// → ['campaignId']

validateEntityRelationships('insertionOrder', {
  advertiserId: '123',
  campaignId: '456'
})
// → []
```

### `generateRelationshipDescription(entityType)`

Generates human-readable description:

```typescript
generateRelationshipDescription('insertionOrder')
// → "insertionOrder requires:
//    - Must include 'advertiserId' in data to link to advertiser
//    - Must include 'campaignId' in data to link to campaign"
```

### `getCreateRequirements(entityType)`

Returns comprehensive create requirements:

```typescript
getCreateRequirements('insertionOrder')
// → {
//     pathIds: ['advertiserId'],
//     dataFields: ['advertiserId', 'campaignId'],
//     description: "To create insertionOrder:
//       - Provide advertiserId as parameters (for API path)
//       - Include advertiserId, campaignId in the data payload
//       - Hierarchy: partner > advertiser > campaign > insertionOrder"
//   }
```

## Adding New Entities

To add a new entity with relationships:

1. Add API metadata in `ENTITY_API_METADATA`
2. Add relationships in `ENTITY_RELATIONSHIPS`
3. Relationships are automatically validated and included in tool descriptions

Example:

```typescript
// 1. Add API metadata
const ENTITY_API_METADATA = {
  // ... existing entities

  newEntity: {
    apiPathTemplate: "/advertisers/{advertiserId}/newEntities",
    parentResourceIds: ["advertiserId"],
    supportsFilter: true,
  },
};

// 2. Add relationships
const ENTITY_RELATIONSHIPS = {
  // ... existing relationships

  newEntity: [
    {
      parentEntityType: "advertiser",
      parentFieldName: "advertiserId",
      required: true,
      description: "New entity must belong to an advertiser",
    },
  ],
};
```

That's it! The system automatically:
- Validates relationships on create/update
- Includes hierarchy in tool descriptions
- Provides helpful error messages

## Benefits for AI Agents

1. **No Workflow Hardcoding** - Relationships are discovered from metadata
2. **Self-Documenting** - Tool descriptions explain requirements
3. **Fail-Fast** - Validation happens before API calls
4. **Consistent Errors** - All relationship errors follow same format
5. **Extensible** - Adding new entities doesn't require workflow changes

## Example: Creating a Complete Campaign Structure

```typescript
// 1. Create Campaign
const campaign = await dv360_create_entity({
  entityType: "campaign",
  advertiserId: "123",
  data: {
    advertiserId: "123",
    displayName: "Sweden Campaign",
    entityStatus: "ENTITY_STATUS_ACTIVE"
  }
});
// Returns: { campaignId: "456", ... }

// 2. Create Insertion Order
const io = await dv360_create_entity({
  entityType: "insertionOrder",
  advertiserId: "123",
  data: {
    advertiserId: "123",
    campaignId: "456",  // ← Links to campaign
    displayName: "Sweden IO"
  }
});
// Returns: { insertionOrderId: "789", ... }

// 3. Create Line Item
const lineItem = await dv360_create_entity({
  entityType: "lineItem",
  advertiserId: "123",
  data: {
    advertiserId: "123",
    insertionOrderId: "789",  // ← Links to insertion order
    displayName: "Sweden Targeting",
    geoTargeting: {
      countries: ["SE"]  // Sweden
    }
  }
});
```

The system ensures:
- Each step has the correct parent fields
- Error messages show what's missing
- Tool descriptions explain the hierarchy
- No hardcoded workflow logic needed
