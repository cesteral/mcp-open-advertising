# Generated Schema Examples

This document shows what the generated TypeScript types and Zod schemas will look like after running the extraction pipeline. This helps visualize the end goal of Phase 1.

---

## Example: InsertionOrder Schema

### Input: Discovery Document (Excerpt)

```json
{
  "schemas": {
    "InsertionOrder": {
      "id": "InsertionOrder",
      "type": "object",
      "description": "A single insertion order.",
      "properties": {
        "insertionOrderId": {
          "type": "string",
          "description": "Output only. The unique ID of the insertion order. Assigned by the system."
        },
        "displayName": {
          "type": "string",
          "description": "Required. The display name of the insertion order. Must be UTF-8 encoded with a maximum length of 240 bytes."
        },
        "advertiserId": {
          "type": "string",
          "description": "Output only. The unique ID of the advertiser the insertion order belongs to."
        },
        "budget": {
          "$ref": "InsertionOrderBudget",
          "description": "The budget allocation settings of the insertion order."
        },
        "pacing": {
          "$ref": "Pacing",
          "description": "Required. The pacing setting of the insertion order."
        },
        "entityStatus": {
          "type": "string",
          "description": "Required. The entity status of the insertion order.",
          "enum": [
            "ENTITY_STATUS_UNSPECIFIED",
            "ENTITY_STATUS_ACTIVE",
            "ENTITY_STATUS_ARCHIVED",
            "ENTITY_STATUS_DRAFT",
            "ENTITY_STATUS_PAUSED",
            "ENTITY_STATUS_SCHEDULED_FOR_DELETION"
          ],
          "enumDescriptions": [
            "Default value when status is not specified.",
            "The entity is enabled to bid and spend budget.",
            "The entity is archived. Bidding and budget spending are disabled.",
            "The entity is under draft. Bidding and budget spending are disabled.",
            "The entity is paused. Bidding and budget spending are disabled.",
            "The entity is scheduled to be deleted."
          ]
        }
      }
    },
    "InsertionOrderBudget": {
      "id": "InsertionOrderBudget",
      "type": "object",
      "description": "Settings that control the budget of a single insertion order.",
      "properties": {
        "budgetSegments": {
          "type": "array",
          "description": "Required. The list of budget segments.",
          "items": {
            "$ref": "InsertionOrderBudgetSegment"
          }
        },
        "automationType": {
          "type": "string",
          "description": "Required. The automation type of the insertion order.",
          "enum": [
            "INSERTION_ORDER_AUTOMATION_TYPE_UNSPECIFIED",
            "INSERTION_ORDER_AUTOMATION_TYPE_NONE",
            "INSERTION_ORDER_AUTOMATION_TYPE_BUDGET",
            "INSERTION_ORDER_AUTOMATION_TYPE_BID_BUDGET"
          ]
        }
      }
    }
  }
}
```

---

## Output 1: OpenAPI 3.0 Spec (Intermediate)

**File:** `.tmp-specs/dv360-minimal-v4.yaml`

```yaml
openapi: 3.0.0
info:
  title: DV360 API Minimal Schema
  version: v4
  description: Auto-generated minimal schema extraction for DV360 MCP Server
  x-extraction-metadata:
    extractedAt: "2025-01-16T10:30:00Z"
    totalSchemas: 47
    rootSchemas: 8
    resolvedDependencies: 39

components:
  schemas:
    InsertionOrder:
      type: object
      description: A single insertion order.
      properties:
        insertionOrderId:
          type: string
          description: Output only. The unique ID of the insertion order. Assigned by the system.
        displayName:
          type: string
          description: Required. The display name of the insertion order. Must be UTF-8 encoded with a maximum length of 240 bytes.
        advertiserId:
          type: string
          description: Output only. The unique ID of the advertiser the insertion order belongs to.
        budget:
          $ref: '#/components/schemas/InsertionOrderBudget'
        pacing:
          $ref: '#/components/schemas/Pacing'
        entityStatus:
          type: string
          description: Required. The entity status of the insertion order.
          enum:
            - ENTITY_STATUS_UNSPECIFIED
            - ENTITY_STATUS_ACTIVE
            - ENTITY_STATUS_ARCHIVED
            - ENTITY_STATUS_DRAFT
            - ENTITY_STATUS_PAUSED
            - ENTITY_STATUS_SCHEDULED_FOR_DELETION
          x-enumDescriptions:
            - Default value when status is not specified.
            - The entity is enabled to bid and spend budget.
            - The entity is archived. Bidding and budget spending are disabled.
            - The entity is under draft. Bidding and budget spending are disabled.
            - The entity is paused. Bidding and budget spending are disabled.
            - The entity is scheduled to be deleted.

    InsertionOrderBudget:
      type: object
      description: Settings that control the budget of a single insertion order.
      properties:
        budgetSegments:
          type: array
          description: Required. The list of budget segments.
          items:
            $ref: '#/components/schemas/InsertionOrderBudgetSegment'
        automationType:
          type: string
          description: Required. The automation type of the insertion order.
          enum:
            - INSERTION_ORDER_AUTOMATION_TYPE_UNSPECIFIED
            - INSERTION_ORDER_AUTOMATION_TYPE_NONE
            - INSERTION_ORDER_AUTOMATION_TYPE_BUDGET
            - INSERTION_ORDER_AUTOMATION_TYPE_BID_BUDGET

    # ... additional schemas (Pacing, InsertionOrderBudgetSegment, etc.)
```

---

## Output 2: TypeScript Types (Generated by openapi-typescript)

**File:** `src/generated/schemas/types.ts`

```typescript
/**
 * This file was auto-generated by openapi-typescript.
 * Do not make direct changes to the file.
 */

export interface components {
  schemas: {
    /** A single insertion order. */
    InsertionOrder: {
      /** Output only. The unique ID of the insertion order. Assigned by the system. */
      insertionOrderId?: string;
      /** Required. The display name of the insertion order. Must be UTF-8 encoded with a maximum length of 240 bytes. */
      displayName?: string;
      /** Output only. The unique ID of the advertiser the insertion order belongs to. */
      advertiserId?: string;
      /** The budget allocation settings of the insertion order. */
      budget?: components['schemas']['InsertionOrderBudget'];
      /** Required. The pacing setting of the insertion order. */
      pacing?: components['schemas']['Pacing'];
      /** Required. The entity status of the insertion order. */
      entityStatus?:
        | 'ENTITY_STATUS_UNSPECIFIED'
        | 'ENTITY_STATUS_ACTIVE'
        | 'ENTITY_STATUS_ARCHIVED'
        | 'ENTITY_STATUS_DRAFT'
        | 'ENTITY_STATUS_PAUSED'
        | 'ENTITY_STATUS_SCHEDULED_FOR_DELETION';
    };
    /** Settings that control the budget of a single insertion order. */
    InsertionOrderBudget: {
      /** Required. The list of budget segments. */
      budgetSegments?: components['schemas']['InsertionOrderBudgetSegment'][];
      /** Required. The automation type of the insertion order. */
      automationType?:
        | 'INSERTION_ORDER_AUTOMATION_TYPE_UNSPECIFIED'
        | 'INSERTION_ORDER_AUTOMATION_TYPE_NONE'
        | 'INSERTION_ORDER_AUTOMATION_TYPE_BUDGET'
        | 'INSERTION_ORDER_AUTOMATION_TYPE_BID_BUDGET';
    };
    // ... additional schemas
  };
}

// Convenience type exports
export type InsertionOrder = components['schemas']['InsertionOrder'];
export type InsertionOrderBudget = components['schemas']['InsertionOrderBudget'];
```

---

## Output 3: Zod Schemas (Generated by openapi-zod-client)

**File:** `src/generated/schemas/zod.ts`

```typescript
/**
 * This file was auto-generated by openapi-zod-client.
 * Do not make direct changes to the file.
 */

import { z } from 'zod';

/**
 * Entity status enum schema
 */
export const EntityStatusSchema = z.enum([
  'ENTITY_STATUS_UNSPECIFIED',
  'ENTITY_STATUS_ACTIVE',
  'ENTITY_STATUS_ARCHIVED',
  'ENTITY_STATUS_DRAFT',
  'ENTITY_STATUS_PAUSED',
  'ENTITY_STATUS_SCHEDULED_FOR_DELETION',
]);

/**
 * Insertion order automation type enum schema
 */
export const InsertionOrderAutomationTypeSchema = z.enum([
  'INSERTION_ORDER_AUTOMATION_TYPE_UNSPECIFIED',
  'INSERTION_ORDER_AUTOMATION_TYPE_NONE',
  'INSERTION_ORDER_AUTOMATION_TYPE_BUDGET',
  'INSERTION_ORDER_AUTOMATION_TYPE_BID_BUDGET',
]);

/**
 * Insertion order budget segment schema
 */
export const InsertionOrderBudgetSegmentSchema = z.object({
  budgetAmountMicros: z.string().optional(),
  dateRange: z
    .object({
      startDate: z
        .object({
          year: z.number().int(),
          month: z.number().int(),
          day: z.number().int(),
        })
        .optional(),
      endDate: z
        .object({
          year: z.number().int(),
          month: z.number().int(),
          day: z.number().int(),
        })
        .optional(),
    })
    .optional(),
  campaignBudgetId: z.string().optional(),
});

/**
 * Insertion order budget schema
 */
export const InsertionOrderBudgetSchema = z.object({
  budgetSegments: z.array(InsertionOrderBudgetSegmentSchema).optional(),
  automationType: InsertionOrderAutomationTypeSchema.optional(),
});

/**
 * Pacing schema
 */
export const PacingSchema = z.object({
  pacingPeriod: z
    .enum(['PACING_PERIOD_UNSPECIFIED', 'PACING_PERIOD_DAILY', 'PACING_PERIOD_FLIGHT'])
    .optional(),
  pacingType: z.enum(['PACING_TYPE_UNSPECIFIED', 'PACING_TYPE_AHEAD', 'PACING_TYPE_ASAP']).optional(),
  dailyMaxMicros: z.string().optional(),
  dailyMaxImpressions: z.string().optional(),
});

/**
 * Insertion order schema
 */
export const InsertionOrderSchema = z.object({
  insertionOrderId: z.string().optional(),
  displayName: z.string().optional(),
  advertiserId: z.string().optional(),
  budget: InsertionOrderBudgetSchema.optional(),
  pacing: PacingSchema.optional(),
  entityStatus: EntityStatusSchema.optional(),
});

/**
 * List insertion orders response schema
 */
export const ListInsertionOrdersResponseSchema = z.object({
  insertionOrders: z.array(InsertionOrderSchema).optional(),
  nextPageToken: z.string().optional(),
});

// Type inference exports
export type InsertionOrder = z.infer<typeof InsertionOrderSchema>;
export type InsertionOrderBudget = z.infer<typeof InsertionOrderBudgetSchema>;
export type InsertionOrderBudgetSegment = z.infer<typeof InsertionOrderBudgetSegmentSchema>;
export type Pacing = z.infer<typeof PacingSchema>;
export type EntityStatus = z.infer<typeof EntityStatusSchema>;
export type ListInsertionOrdersResponse = z.infer<typeof ListInsertionOrdersResponseSchema>;
```

---

## Usage Example: MCP Tool with Generated Schemas

**File:** `src/mcp-server/tools/definitions/get-insertion-orders.tool.ts`

```typescript
import { z } from 'zod';
import {
  InsertionOrderSchema,
  ListInsertionOrdersResponseSchema,
  type InsertionOrder,
  type ListInsertionOrdersResponse,
} from '@/generated/schemas/zod';

/**
 * Tool parameters schema
 */
export const getInsertionOrdersParamsSchema = z.object({
  advertiserId: z.string().min(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  pageToken: z.string().optional(),
});

/**
 * Tool definition for MCP
 */
export const getInsertionOrdersTool = {
  name: 'get_insertion_orders',
  description: 'Fetch insertion orders for an advertiser from DV360',
  inputSchema: {
    type: 'object',
    properties: {
      advertiserId: {
        type: 'string',
        description: 'Advertiser ID',
      },
      pageSize: {
        type: 'number',
        description: 'Number of results per page (1-200)',
        default: 50,
      },
      pageToken: {
        type: 'string',
        description: 'Optional pagination token from previous response',
      },
    },
    required: ['advertiserId'],
  },
};

/**
 * Tool handler with runtime validation
 */
export async function handleGetInsertionOrders(
  params: z.infer<typeof getInsertionOrdersParamsSchema>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // 1. Validate input parameters
  const validated = getInsertionOrdersParamsSchema.parse(params);

  // 2. Call DV360 API (mock for now)
  const response = await fetchFromDv360Api({
    path: `/v4/advertisers/${validated.advertiserId}/insertionOrders`,
    params: {
      pageSize: validated.pageSize,
      pageToken: validated.pageToken,
    },
  });

  // 3. Runtime validation of API response using generated Zod schema
  const validatedResponse = ListInsertionOrdersResponseSchema.parse(response.data);

  // 4. Type-safe access to validated data
  const insertionOrders: InsertionOrder[] = validatedResponse.insertionOrders ?? [];

  // 5. Extract key metrics for summary
  const summary = insertionOrders.map((io) => ({
    id: io.insertionOrderId,
    name: io.displayName,
    status: io.entityStatus,
    budgetSegments: io.budget?.budgetSegments?.length ?? 0,
  }));

  // 6. Return formatted response
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            summary,
            totalResults: insertionOrders.length,
            nextPageToken: validatedResponse.nextPageToken,
            fullData: insertionOrders,
          },
          null,
          2
        ),
      },
    ],
  };
}
```

---

## Benefits Demonstrated

### 1. ✅ **Type Safety**
```typescript
// TypeScript knows the shape of InsertionOrder
const order: InsertionOrder = validatedResponse.insertionOrders?.[0];
console.log(order.insertionOrderId); // ✅ Type-safe
console.log(order.invalidField);     // ❌ Compile error
```

### 2. ✅ **Runtime Validation**
```typescript
// Zod catches unexpected API response shapes
try {
  const validated = ListInsertionOrdersResponseSchema.parse(response.data);
} catch (error) {
  // Error with detailed path: "insertionOrders[2].budget.budgetSegments expected array, got string"
  console.error(error);
}
```

### 3. ✅ **Auto-Complete in IDE**
```typescript
const order: InsertionOrder = { ... };
order. // <-- IDE shows: insertionOrderId, displayName, advertiserId, budget, pacing, entityStatus
order.budget?. // <-- IDE shows: budgetSegments, automationType
```

### 4. ✅ **Self-Documenting Code**
```typescript
// Enum types from DV360 API are preserved
const status: EntityStatus = 'ENTITY_STATUS_ACTIVE';
// ✅ Valid values auto-suggested by IDE
// ❌ Typos caught at compile time
```

### 5. ✅ **Minimal Bundle Size**
- Only extracted schemas are included (not entire googleapis package)
- Tree-shakeable: unused schemas are eliminated by bundler
- Estimated size: ~80KB (vs ~450KB for full googleapis)

---

## Comparison: Before vs After

### Before (Manual Types)
```typescript
// Manual type definition (no validation)
interface InsertionOrder {
  insertionOrderId?: string;
  displayName?: string;
  // ... manually maintained, prone to drift from API
}

// No runtime validation
const order = await dv360Client.advertisers.insertionOrders.get({ ... });
// Hope the API returns what we expect 🤞
```

### After (Generated Types + Zod)
```typescript
// Auto-generated from Discovery Document (always up-to-date)
import { InsertionOrderSchema, type InsertionOrder } from '@/generated/schemas/zod';

// Runtime validation ensures API contract is upheld
const order = InsertionOrderSchema.parse(apiResponse);
// ✅ Type-safe + runtime-safe
```

---

## Extraction Report Example

**File:** `.tmp-specs/extraction-report.json`

```json
{
  "extractionMetadata": {
    "timestamp": "2025-01-16T10:30:00.000Z",
    "apiVersion": "v4",
    "discoveryDocUrl": "https://displayvideo.googleapis.com/$discovery/rest?version=v4",
    "discoveryDocSize": 1294701,
    "durationMs": 2341
  },
  "configuration": {
    "rootSchemas": ["Partner", "Advertiser", "InsertionOrder", "LineItem", "AdGroup"],
    "includeCommonTypes": true,
    "excludePatterns": ["*Deprecated*", "Internal*"],
    "resolutionMaxDepth": 10
  },
  "results": {
    "totalSchemas": 47,
    "rootSchemas": [
      "Partner",
      "Advertiser",
      "InsertionOrder",
      "LineItem",
      "AdGroup",
      "ListPartnersResponse",
      "ListAdvertisersResponse",
      "ListInsertionOrdersResponse",
      "ListLineItemsResponse"
    ],
    "resolvedDependencies": [
      "InsertionOrderBudget",
      "InsertionOrderBudgetSegment",
      "DateRange",
      "Date",
      "BiddingStrategy",
      "MaximizeSpendBidStrategy",
      "PerformanceGoalBidStrategy",
      "Pacing",
      "FrequencyCap"
    ],
    "commonTypesAdded": ["Date", "Money", "Status", "EntityStatus"],
    "excludedSchemas": ["InternalTestType", "DeprecatedField"],
    "circularReferences": [],
    "warnings": []
  },
  "sizeAnalysis": {
    "originalDiscoverySize": 1294701,
    "extractedSpecSize": 156234,
    "compressionRatio": 0.88,
    "estimatedGeneratedCodeSize": 234567
  },
  "dependencyGraph": {
    "InsertionOrder": ["InsertionOrderBudget", "Pacing", "FrequencyCap", "BiddingStrategy"],
    "InsertionOrderBudget": ["InsertionOrderBudgetSegment"],
    "InsertionOrderBudgetSegment": ["DateRange"],
    "DateRange": ["Date"]
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}
```

---

## Key Takeaways

1. **88% Size Reduction** - From 1.3MB Discovery doc to 156KB extracted spec
2. **47 Schemas Extracted** - From 5 root schemas + auto-resolved dependencies
3. **Type-Safe + Runtime-Safe** - Compile-time and runtime validation
4. **Self-Documenting** - Descriptions and enum values preserved from API
5. **Maintainable** - Single command regenerates everything when API changes

---

**Ready for implementation!** 🚀
