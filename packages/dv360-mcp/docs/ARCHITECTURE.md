# dv360-mcp Architecture

**Version:** 2.0 (Phase 2 - MCP Server Implementation)
**Status:** Design Document
**Last Updated:** 2025-01-13

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Directory Structure](#directory-structure)
4. [Core Components](#core-components)
5. [Data Flow](#data-flow)
6. [Configuration](#configuration)
7. [Integration Points](#integration-points)
8. [Testing Strategy](#testing-strategy)
9. [Migration Path](#migration-path)
10. [References](#references)

---

## Overview

### Purpose

The **dv360-mcp** server is a production-grade MCP (Model Context Protocol) server that provides DV360 campaign entity management capabilities. It enables AI agents and automation systems to perform CRUD operations on DV360 campaigns, line items, budgets, and bids through a type-safe, authenticated API.

### Key Capabilities

- **Entity CRUD Operations**: Generic list, get, create, update, and delete operations for all DV360 entities
- **Type-Safe Entity Management**: Full TypeScript + Zod validation using generated schemas (62 entities)
- **Flexible Updates**: Update any entity field via updateMask parameter
- **Campaign Workflows**: High-level tools for common optimization patterns (budget, bid, status changes)
- **Batch Operations**: Efficiently manage multiple entities in a single operation
- **Audit Trail**: Optional reason tracking for all write operations

### Technology Stack

- **Protocol**: Model Context Protocol (MCP) via HTTP/SSE
- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Hono (HTTP server) + @hono/mcp (SSE transport)
- **DI Container**: tsyringe
- **Schema Validation**: Zod (runtime) + TypeScript (compile-time)
- **Observability**: Pino (structured logging) + OpenTelemetry (tracing/metrics)
- **Authentication**: JWT with scope-based authorization

### Deployment & Operational Posture

- **Primary target:** Google Cloud Run using HTTP/SSE transport on port 8080.
- **Stateless runtime:** All persistence is deferred; in-memory session store expires automatically with optional stateless mode.
- **Authentication:** JWT bearer tokens with scope enforcement at the tool layer; service account credentials used for outbound DV360 calls.
- **Observability:** OpenTelemetry exporters enabled by default with structured logging routed through Pino.
- **Configuration:** All environment variables flow through `src/config/index.ts` so Cloud Run revisions can rely on a single configuration surface.
- **Local parity:** `npm run dev` starts the same HTTP transport to mirror Cloud Run behavior for development and QA.

### Design Philosophy

This server adopts the **advanced patterns** from `mcp-ts-quickstart-template` with an **entity-centric tool architecture**:

- **Entity-Centric Tools**: Generic CRUD operations on DV360 entities (not operation-specific tools)
- **"Logic Throws, Handler Catches"**: Pure business logic throws `McpError`, handlers catch and format
- **RequestContext Propagation**: Structured context flows through entire call stack
- **Scope-Based Authorization**: `withToolAuth([scopes])` wrappers enforce permissions
- **Declarative Tool Definitions**: Single-file tool definitions with metadata, schemas, logic, and formatter
- **Schema-Driven Validation**: Leverage generated Zod schemas for all entity operations
- **Dependency Injection First**: Explicit dependencies via tsyringe container
- **OpenTelemetry by Default**: Automatic instrumentation of tool execution

> **Reference:** Detailed pseudo-code examples for Phase 2 now live in [`docs/phase-2/IMPLEMENTATION_REFERENCE.md`](./phase-2/IMPLEMENTATION_REFERENCE.md).

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      MCP Client (AI Agent / bidshifter-mcp)          │
│                      HTTP POST /mcp with JWT                         │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ JSON-RPC 2.0 over SSE
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        HTTP Transport Layer                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │ CORS        │→ │ Auth         │→ │ Session     │→ │ MCP      │ │
│  │ Middleware  │  │ Middleware   │  │ Store       │  │ Server   │ │
│  └─────────────┘  └──────────────┘  └─────────────┘  └──────────┘ │
│                        (Hono + @hono/mcp)                            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           MCP Server                                 │
│  ┌─────────────────────┐  ┌──────────────────────────────────────┐ │
│  │  Tool Registry      │  │  Tool Definitions (8 core tools)     │ │
│  │  - registerAll()    │  │  Tier 1: Entity CRUD                 │ │
│  │  - createHandler()  │  │  - dv360_list_entities               │ │
│  └─────────────────────┘  │  - dv360_get_entity                  │ │
│                            │  - dv360_create_entity               │ │
│  ┌─────────────────────┐  │  - dv360_update_entity               │ │
│  │ Resource Registry   │  │  - dv360_delete_entity               │ │
│  │ - registerAll()     │  │  Tier 2: Workflow Tools              │ │
│  └─────────────────────┘  │  - dv360_adjust_line_item_bids       │ │
│                            │  - dv360_bulk_update_status          │ │
│                            │  - dv360_campaign_setup_wizard       │ │
│                            │                                      │ │
│                            │  Resources (3 schema discovery)      │ │
│                            │  - entity-schema://{entityType}      │ │
│                            │  - entity-fields://{entityType}      │ │
│                            │  - entity-examples://{entityType}    │ │
│                            └──────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ DI Container (tsyringe)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Dependency Injection Container                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ DV360Service │  │ RateLimiter  │  │ RequestContextService    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           Services Layer                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      DV360Service                            │   │
│  │  - authenticateServiceAccount()                             │   │
│  │  Generic Entity Methods:                                    │   │
│  │  - listEntities(entityType, parentId, filter?)             │   │
│  │  - getEntity(entityType, ids...)                           │   │
│  │  - createEntity(entityType, data)                          │   │
│  │  - updateEntity(entityType, ids, data, updateMask)         │   │
│  │  - deleteEntity(entityType, ids...)                        │   │
│  │  Entity Type Support:                                       │   │
│  │  - Partner, Advertiser, Campaign, InsertionOrder,          │   │
│  │    LineItem, AdGroup, Creative, TargetingOption, etc.      │   │
│  │  (Uses generated Zod schemas for validation)                │   │
│  └─────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       DV360 API (Google Cloud)                       │
│  - Service Account Authentication (OAuth2)                           │
│  - REST API (partners, advertisers, campaigns, lineItems)            │
│  - Rate Limiting (per project quota)                                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    Cross-Cutting Concerns                            │
│  ┌────────────┐  ┌──────────────┐  ┌────────────┐  ┌────────────┐  │
│  │ McpError   │  │ RequestCtx   │  │ Logger     │  │ OpenTel    │  │
│  │ Handling   │  │ Propagation  │  │ (Pino)     │  │ (Tracing)  │  │
│  └────────────┘  └──────────────┘  └────────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

_Detailed pseudo-code for the architecture diagram is mirrored in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#architecture-diagram)._ 


---

## Directory Structure


See [`REPO-STRUCTURE.md`](./REPO-STRUCTURE.md) for the up-to-date repository layout.


---

## Core Components

### 4.1 HTTP Transport Layer

**Purpose:** Handles HTTP/SSE communication, authentication, session management, and global error handling.

**Key Files:**

- `src/mcp-server/transports/http/httpTransport.ts`
- `src/mcp-server/transports/http/sessionStore.ts`
- `src/mcp-server/transports/http/auth/authMiddleware.ts`

**Features:**

#### Session Management


_Detailed pseudo-code for Session Management is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#session-management)._


#### CORS Configuration

- Configurable allowed origins via `MCP_ALLOWED_ORIGINS`
- DNS rebinding protection
- Credentials support for authenticated requests

#### Authentication Middleware


_Detailed pseudo-code for Authentication Middleware is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#authentication-middleware)._


#### Endpoints

- `GET /health` - Health check (unprotected)
- `GET /.well-known/oauth-protected-resource` - OAuth metadata (RFC 9728)
- `GET /mcp` - Server status
- `POST /mcp` - Main MCP endpoint (SSE)
- `DELETE /mcp` - Session termination

#### Error Handling


_Detailed pseudo-code for Error Handling is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#error-handling)._


---

### 4.2 Tool Definitions (Entity-Centric Pattern)

The server provides **two tiers of tools**:

#### Tier 1: Entity CRUD Tools (Generic, Schema-Driven)

These tools provide flexible, generic access to all DV360 entities using the generated schemas.

**1. `dv360_list_entities`** - List entities with filtering


_Detailed pseudo-code for Tier 1: Entity CRUD Tools (Generic, Schema-Driven) is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#tier-1-entity-crud-tools-generic-schema-driven)._


**2. `dv360_get_entity`** - Get single entity by ID


**3. `dv360_create_entity`** - Create new entity


**4. `dv360_update_entity`** - Update entity fields via updateMask


**5. `dv360_delete_entity`** - Delete entity


#### Tier 2: Workflow Tools (Domain-Specific Convenience)

These tools provide high-level operations for common optimization workflows with built-in audit trails.

**6. `dv360_adjust_line_item_bids`** - Batch bid adjustments with reason tracking


_Detailed pseudo-code for Tier 2: Workflow Tools (Domain-Specific Convenience) is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#tier-2-workflow-tools-domain-specific-convenience)._


**7. `dv360_bulk_update_status`** - Pause/activate multiple line items


**8. `dv360_campaign_setup_wizard`** - Create full campaign hierarchy


#### Entity Type Support

The Tier 1 tools support all DV360 entities via the `entityType` parameter:

| Entity Type               | API Resource                              | Required Parent IDs          |
| ------------------------- | ----------------------------------------- | ---------------------------- |
| `partner`                 | `/partners`                               | None                         |
| `advertiser`              | `/advertisers`                            | `partnerId`                  |
| `campaign`                | `/campaigns`                              | `advertiserId`               |
| `insertionOrder`          | `/insertionOrders`                        | `advertiserId`               |
| `lineItem`                | `/lineItems`                              | `advertiserId`               |
| `adGroup`                 | `/adGroups`                               | `advertiserId`               |
| `ad`                      | `/ads`                                    | `advertiserId`               |
| `creative`                | `/creatives`                              | `advertiserId`               |
| `targetingOption`         | `/targetingTypes/{type}/targetingOptions` | `advertiserId`               |
| `assignedTargetingOption` | `/assignedTargetingOptions`               | `advertiserId`, `lineItemId` |

#### Dynamic Entity System (Schema-Driven Configuration)

**Key Achievement:** 87% reduction in configuration code through schema introspection and dynamic discovery.

The entity system uses a **schema-driven approach** that eliminates manual configuration:

**Minimal API Metadata** (`entityMappingDynamic.ts`):
```typescript
const ENTITY_API_METADATA: Record<string, EntityApiMetadata> = {
  lineItem: {
    apiPathTemplate: '/advertisers/{advertiserId}/lineItems',
    parentResourceIds: ['advertiserId'],
    supportsFilter: true,
  },
  // Only ~5 lines per entity - everything else auto-inferred!
};
```

**Auto-Inferred Capabilities:**
- CRUD support (supportsCreate, supportsUpdate, supportsDelete) from `isReadOnly` flag
- Filter fields from schema introspection (checks common fields against entity schema)
- Required fields extracted dynamically from Zod schemas
- API path construction with parameter interpolation

**Schema Introspection** (`schemaIntrospection.ts`):
- Auto-discovers all available entity schemas from `generated/schemas/zod.ts`
- Caches schema lookups for ~30% performance improvement
- Extracts required fields directly from schema definitions
- Validates entity type support dynamically

**DRY Utilities** (`entityIdExtraction.ts`):
- `extractEntityIds()` - Single utility eliminates ~70 lines of duplicate code across tools
- `extractParentIds()` - Extracts hierarchy identifiers from input
- `entityIdFromInput()` - Maps entity-specific IDs (campaignId → lineItemId, etc.)

**Benefits:**
1. **Minimal Configuration**: ~5 lines per entity (down from ~40 lines)
2. **Always In Sync**: Required fields and schemas pulled directly from generated schemas
3. **Easy Extension**: Add new entity by adding 5-line API metadata entry
4. **No Duplication**: ID extraction logic centralized in reusable utilities
5. **Performance**: Schema caching reduces lookup overhead


#### Tool Definition Example: `dv360_update_entity`


_Detailed pseudo-code for Tool Definition Example: `dv360_update_entity` is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#tool-definition-example-dv360updateentity)._


---

### 4.2.1 MCP Resources (Schema Discovery)

**Purpose:** Provide on-demand schema information to AI agents without bloating initial context window.

The entity-centric tools intentionally use `Record<string, any>` for the `data` field to keep tool definitions small. AI agents discover entity schemas on-demand via MCP resources.

#### Context Window Optimization

**Problem:** Including full schemas in tool definitions would bloat context:
- 62 entities × ~200 lines each = ~12,400 lines per tool definition
- Would result in ~50KB+ context per request

**Solution:** Schema discovery resources provide schemas on-demand:
- Initial context: ~9KB (tool list only)
- On-demand: +2-5KB per schema lookup (only when needed)
- Claude caches resource responses for subsequent requests

#### Three Schema Discovery Resources

**1. `entity-schema://{entityType}`** - Complete JSON Schema

```typescript
// Resource definition
export const entitySchemaResource: ResourceDefinition = {
  uri: new UriTemplate('entity-schema://{entityType}'),
  name: 'DV360 Entity Schema',
  description: 'Get the full JSON Schema for a DV360 entity type with field descriptions and validation rules',

  async read({ entityType }: { entityType: string }) {
    // Get Zod schema from generated schemas
    const zodSchema = getEntitySchema(entityType, 'update');

    // Convert to JSON Schema for AI consumption
    const jsonSchema = zodToJsonSchema(zodSchema, {
      target: 'jsonSchema7',
      markdownDescription: true
    });

    return {
      contents: [{
        uri: `entity-schema://${entityType}`,
        mimeType: 'application/json',
        text: JSON.stringify({
          entityType,
          schema: jsonSchema,
          requiredFields: getRequiredFields(entityType, 'update'),
          supportedOperations: {
            list: ENTITY_TYPE_CONFIG[entityType]?.supportsFilter || false,
            create: ENTITY_TYPE_CONFIG[entityType]?.supportsCreate || false,
            update: ENTITY_TYPE_CONFIG[entityType]?.supportsUpdate || false,
            delete: ENTITY_TYPE_CONFIG[entityType]?.supportsDelete || false
          }
        }, null, 2)
      }]
    };
  }
};
```

**Example Response:**
```json
{
  "entityType": "lineItem",
  "schema": {
    "type": "object",
    "properties": {
      "lineItemId": { "type": "string" },
      "displayName": { "type": "string" },
      "bidStrategy": {
        "type": "object",
        "properties": {
          "fixedBid": {
            "type": "object",
            "properties": {
              "bidAmountMicros": {
                "type": "number",
                "description": "Bid amount in micros (1 USD = 1,000,000 micros)"
              }
            }
          }
        }
      },
      "entityStatus": {
        "type": "string",
        "enum": ["ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_PAUSED", ...]
      }
    }
  },
  "requiredFields": ["advertiserId", "lineItemId"],
  "supportedOperations": {
    "list": true,
    "create": true,
    "update": true,
    "delete": true
  }
}
```

**2. `entity-fields://{entityType}`** - Lightweight Field List

```typescript
// Resource definition
export const entityFieldsResource: ResourceDefinition = {
  uri: new UriTemplate('entity-fields://{entityType}'),
  name: 'DV360 Entity Fields',
  description: 'Get a flat list of all fields for a DV360 entity (lightweight, for quick reference)',

  async read({ entityType }: { entityType: string }) {
    const zodSchema = getEntitySchema(entityType, 'update');
    const fields = extractFieldsFromZodSchema(zodSchema);

    return {
      contents: [{
        uri: `entity-fields://${entityType}`,
        mimeType: 'application/json',
        text: JSON.stringify({
          entityType,
          fields: fields.map(f => ({
            path: f.path,                    // e.g., "bidStrategy.fixedBid.bidAmountMicros"
            type: f.type,                    // e.g., "number", "string", "enum"
            required: f.required,            // true/false
            description: f.description,      // from .describe()
            enum: f.enum                     // if applicable
          })),
          commonUpdatePaths: [
            'entityStatus',
            'bidStrategy.fixedBid.bidAmountMicros',
            'displayName',
            'flight.startDate',
            'budget.budgetAmountMicros'
          ]
        }, null, 2)
      }]
    };
  }
};
```

**Example Response:**
```json
{
  "entityType": "lineItem",
  "fields": [
    {
      "path": "lineItemId",
      "type": "string",
      "required": true,
      "description": "Unique line item identifier"
    },
    {
      "path": "bidStrategy.fixedBid.bidAmountMicros",
      "type": "number",
      "required": false,
      "description": "Fixed bid amount in micros"
    },
    {
      "path": "entityStatus",
      "type": "enum",
      "required": false,
      "description": "Line item status",
      "enum": ["ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_PAUSED", ...]
    }
  ],
  "commonUpdatePaths": [
    "entityStatus",
    "bidStrategy.fixedBid.bidAmountMicros",
    "displayName"
  ]
}
```

**3. `entity-examples://{entityType}`** - Common Update Patterns

```typescript
// Resource definition
export const entityExamplesResource: ResourceDefinition = {
  uri: new UriTemplate('entity-examples://{entityType}'),
  name: 'DV360 Entity Examples',
  description: 'Get common update patterns and examples for a DV360 entity',

  async read({ entityType }: { entityType: string }) {
    // Load curated examples for common operations
    const examples = ENTITY_EXAMPLES[entityType] || [];

    return {
      contents: [{
        uri: `entity-examples://${entityType}`,
        mimeType: 'application/json',
        text: JSON.stringify({
          entityType,
          examples: examples.map(ex => ({
            operation: ex.operation,          // e.g., "Update bid"
            description: ex.description,
            data: ex.data,                    // Example data payload
            updateMask: ex.updateMask,        // Required updateMask
            notes: ex.notes                   // Additional guidance
          }))
        }, null, 2)
      }]
    };
  }
};

// Curated examples
const ENTITY_EXAMPLES = {
  lineItem: [
    {
      operation: 'Update CPM bid',
      description: 'Change the fixed bid amount for a line item',
      data: {
        bidStrategy: {
          fixedBid: {
            bidAmountMicros: 5000000  // $5 CPM
          }
        }
      },
      updateMask: 'bidStrategy',
      notes: 'Bid amount is in micros (1 USD = 1,000,000 micros). Only include fixedBid if using fixed bidding strategy.'
    },
    {
      operation: 'Pause line item',
      description: 'Set line item status to paused',
      data: {
        entityStatus: 'ENTITY_STATUS_PAUSED'
      },
      updateMask: 'entityStatus',
      notes: 'Valid statuses: ENTITY_STATUS_ACTIVE, ENTITY_STATUS_PAUSED, ENTITY_STATUS_ARCHIVED'
    },
    {
      operation: 'Update flight dates',
      description: 'Change line item start and end dates',
      data: {
        flight: {
          startDate: { year: 2025, month: 1, day: 15 },
          endDate: { year: 2025, month: 2, day: 15 }
        }
      },
      updateMask: 'flight',
      notes: 'Dates must be in the future and end date must be after start date'
    }
  ],
  campaign: [
    {
      operation: 'Update budget',
      description: 'Change campaign budget amount',
      data: {
        campaignBudgets: [{
          budgetAmountMicros: 100000000  // $100
        }]
      },
      updateMask: 'campaignBudgets',
      notes: 'Budget amount is in micros. Use campaignBudgets array even for single budget.'
    }
  ]
  // ... examples for other entities
};
```

**Example Response:**
```json
{
  "entityType": "lineItem",
  "examples": [
    {
      "operation": "Update CPM bid",
      "description": "Change the fixed bid amount for a line item",
      "data": {
        "bidStrategy": {
          "fixedBid": {
            "bidAmountMicros": 5000000
          }
        }
      },
      "updateMask": "bidStrategy",
      "notes": "Bid amount is in micros (1 USD = 1,000,000 micros)"
    }
  ]
}
```

#### AI Agent Workflow

```
1. User: "Update line item 123 bid to $5 CPM"

2. AI sees dv360_update_entity tool:
   - entityType: enum[62 values]
   - data: Record<string, any>  ❌ No schema detail

3. AI calls resource: entity-fields://lineItem
   - Gets flat field list (~2KB)
   - Discovers: bidStrategy.fixedBid.bidAmountMicros exists

4. AI calls resource: entity-examples://lineItem (optional)
   - Gets example showing bid update pattern
   - Learns: use updateMask='bidStrategy'

5. AI constructs update:
   {
     entityType: 'lineItem',
     advertiserId: '...',
     lineItemId: '123',
     data: {
       bidStrategy: {
         fixedBid: { bidAmountMicros: 5000000 }
       }
     },
     updateMask: 'bidStrategy'
   }

6. AI calls dv360_update_entity
```

#### Implementation Files

```
src/mcp-server/resources/
├── definitions/
│   ├── index.ts                      # Barrel export
│   ├── entity-schema.resource.ts     # Full JSON Schema
│   ├── entity-fields.resource.ts     # Flat field list
│   └── entity-examples.resource.ts   # Curated examples
└── utils/
    ├── resourceRegistry.ts           # ResourceRegistry class
    ├── extractFieldsFromZodSchema.ts # Schema introspection
    └── entityExamples.ts             # Curated example data
```

#### Benefits

1. **Small context window**: ~9KB initial, +2-5KB per lookup (vs ~50KB for inline schemas)
2. **On-demand discovery**: AI only fetches schemas when needed
3. **Cacheable**: Claude caches resource responses
4. **Rich examples**: Curated patterns guide AI toward correct usage
5. **All 62 entities**: Same pattern works for all entities without bloat

---

### 4.3 DV360Service (Entity-Centric Service)

**Purpose:** Provides generic, type-safe access to all DV360 entities via unified CRUD methods.

**Key Features:**

- Service account authentication (OAuth2)
- **Generic entity operations** (not entity-specific methods)
- Uses generated Zod schemas for validation
- Dynamic API path construction based on entity type
- Rate limiting via `RateLimiterService`
- RequestContext propagation for observability
- Throws `McpError` on API failures (no try/catch in service methods)

**Structure:**


_Detailed pseudo-code for 4.3 DV360Service (Entity-Centric Service) is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#43-dv360service-entity-centric-service)._


**Benefits of Entity-Centric Service:**

1. **Single source of truth**: One method for each CRUD operation instead of entity-specific methods
2. **Easy to extend**: Adding new entities requires only adding to `ENTITY_TYPE_CONFIG` (no new methods)
3. **Consistent behavior**: All entities follow the same patterns for auth, rate limiting, validation
4. **Reduced code**: ~200 lines instead of ~1000+ for entity-specific methods
5. **Leverages generated schemas**: Dynamic schema lookup ensures type safety for all 62 entities

---

### 4.4 Dependency Injection Container

**Purpose:** Centralizes service registration and lifecycle management.

**Key Files:**

- `src/container/index.ts` (composition root)
- `src/container/tokens.ts` (DI tokens)
- `src/container/registrations/core.ts`
- `src/container/registrations/mcp.ts`

**Token Definitions:**

- Symbol-based tokens isolate dependencies for configuration, logging, DV360 API access, request context propagation, and rate limiting.
- Tokens are the only contract other modules rely on—no module imports concrete classes outside the container boundary.

_Detailed pseudo-code for 4.4 Dependency Injection Container is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#44-dependency-injection-container)._ 

**Registration Pattern:**

- `registrations/core.ts` wires infrastructure services (config loader, logger, telemetry, rate limiter).
- `registrations/mcp.ts` registers tool/resource registries and wraps logic with authentication and observability helpers.
- Composition keeps HTTP transport thin—the container delivers fully wired services.

**Composition Root:**

- `composeContainer()` creates the container once during startup, executes both registration modules, and returns a frozen instance.
- Entry points resolve the `TransportManager` and `ToolRegistry` from this container so all runtime code uses the same singleton graph.
---

### 4.5 Error Handling Architecture

**Pattern:** "Logic Throws, Handler Catches"

#### Layer 1: Tool Logic (Pure)


_Detailed pseudo-code for Layer 1: Tool Logic (Pure) is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#layer-1-tool-logic-pure)._ 

- Tool logic focuses on business rules and DV360 API orchestration, throwing `McpError` with contextual data when a failure occurs.

#### Layer 2: Tool Handler (Catches & Formats)


_Detailed pseudo-code for Layer 2: Tool Handler (Catches & Formats) is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#layer-2-tool-handler-catches-formats)._ 


- `createMcpToolHandler` centralizes telemetry, structured logging, input validation, and JSON-RPC response formatting.
- Non-MCP errors are normalized and emitted with `InternalError` codes, keeping clients insulated from raw exceptions.

#### Layer 3: HTTP Transport (Global Handler)


_Detailed pseudo-code for Layer 3: HTTP Transport (Global Handler) is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#layer-3-http-transport-global-handler)._ 


- Hono's global error handler maps `McpError` instances to HTTP status codes and ensures every response remains JSON-RPC compliant.
- Transport-level middleware attaches correlation IDs and request context before delegating to tool handlers.

#### McpError Structure


_Detailed pseudo-code for McpError Structure is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#mcperror-structure)._ 


- Enumerates JSON-RPC standard and implementation-specific codes to keep tooling consistent across services.
- Carries optional metadata (e.g., offending entity IDs, validation errors) to help clients diagnose issues quickly.
---

### 4.6 Authentication & Authorization

**JWT Authentication Flow:**


_Detailed pseudo-code for 4.6 Authentication & Authorization is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#46-authentication-authorization)._


**Implementation:**

- Bearer tokens are extracted from the HTTP `Authorization` header and verified via either shared-secret JWT or JWKS-based OAuth strategies.
- Successful verification stores claims in AsyncLocalStorage so downstream services can read tenant ID, client ID, and granted scopes.
- Failures are logged with sanitized context and surfaced as `Unauthorized` or `Forbidden` JSON-RPC errors.

**Scope Hierarchy:**

- Coarse scopes (`dv360:read`, `dv360:write`) gate entire tool tiers, while granular scopes (e.g., `dv360:budget:write`) restrict sensitive operations.
- `withToolAuth` reads the AsyncLocalStorage context to enforce scopes consistently without duplicating authorization logic inside tools.
---

### 4.7 RequestContext Propagation

**Purpose:** Structured context for logging, tracing, and multi-tenancy.

**Structure:**

- The context carries request IDs, tenant IDs, auth claims, and trace/span identifiers to correlate logs and metrics across layers.

_Detailed pseudo-code for 4.7 RequestContext Propagation is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#47-requestcontext-propagation)._ 

**Creation & Propagation:**

- The HTTP transport seeds a new context per request and attaches it to AsyncLocalStorage before invoking tool handlers.
- Nested services always receive the active context through DI to avoid manual parameter plumbing.

**Usage in Tool Handler:**

- Tool handlers enrich logs with context metadata, emit OpenTelemetry spans, and pass context into DV360 service calls for consistent tracing.
---

## Data Flow

### Example: `update_line_item_bid` Tool Execution

- Agent submits a JSON-RPC request; the transport authenticates it and seeds the request context.
- The tool handler validates input, elicits any missing fields, and delegates to `DV360Service.updateEntity`.
- The service applies rate limiting, authenticates with DV360, and returns normalized MCP content blocks.

_Detailed pseudo-code for Example: `update_line_item_bid` Tool Execution is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#example-updatelineitembid-tool-execution)._ 

### Error Flow (if API fails)

- DV360 API failures are wrapped in `McpError` objects with appropriate JSON-RPC codes and sanitized payloads.
- Transport middleware emits structured logs and OpenTelemetry spans before returning the error response to the client.

_Detailed pseudo-code for Error Flow (if API fails) is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#error-flow-if-api-fails)._ 

---

## Configuration

### Environment Variables

All configuration is centralized in `src/config/index.ts` and validated with Zod at startup.

| Variable                              | Type    | Default                                  | Description                                              |
| ------------------------------------- | ------- | ---------------------------------------- | -------------------------------------------------------- |
| `DV360_MCP_PORT`                      | number  | `3002`                                   | HTTP server port                                         |
| `DV360_MCP_HOST`                      | string  | `0.0.0.0`                                | HTTP server host                                         |
| `NODE_ENV`                            | enum    | `development`                            | Environment: `development`, `production`, `test`         |
| `MCP_AUTH_MODE`                       | enum    | `none`                                   | Auth mode: `none`, `jwt`, `oauth`                        |
| `MCP_AUTH_SECRET_KEY`                 | string  | _(required for jwt)_                     | JWT secret (32+ chars)                                   |
| `MCP_SESSION_MODE`                    | enum    | `auto`                                   | Session mode: `stateless`, `stateful`, `auto`            |
| `MCP_STATEFUL_SESSION_TIMEOUT_MS`     | number  | `3600000`                                | Session timeout (1 hour)                                 |
| `MCP_ALLOWED_ORIGINS`                 | string  | `*`                                      | CORS origins (CSV)                                       |
| `MCP_LOG_LEVEL`                       | enum    | `debug`                                  | Log level: `debug`, `info`, `notice`, `warning`, `error` |
| `OTEL_ENABLED`                        | boolean | `true`                                   | Enable OpenTelemetry                                     |
| `OTEL_SERVICE_NAME`                   | string  | `dv360-mcp`                              | Service name for traces                                  |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`  | string  | _(optional)_                             | OTLP endpoint for traces                                 |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | string  | _(optional)_                             | OTLP endpoint for metrics                                |
| `DV360_API_BASE_URL`                  | string  | `https://displayvideo.googleapis.com/v4` | DV360 API base URL                                       |
| `DV360_SERVICE_ACCOUNT_JSON`          | string  | _(required)_                             | GCP service account JSON (base64 or file path)           |
| `DV360_RATE_LIMIT_PER_MINUTE`         | number  | `60`                                     | Rate limit per advertiser per minute                     |

### Configuration Schema


_Detailed pseudo-code for Configuration Schema is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#configuration-schema)._


---

## Integration Points

### 7.1 Integration with bidshifter-mcp

**Architecture:** Loose coupling via MCP HTTP transport (no direct library dependencies)

**Flow:**

- bidshifter-mcp issues scoped JWTs, calls the HTTP transport, and listens on SSE for MCP responses.
- Correlated request IDs enable cross-service tracing, and errors are surfaced back to bidshifter workflows with actionable metadata.

_Detailed pseudo-code for 7.1 Integration with bidshifter-mcp is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#71-integration-with-bidshifter-mcp)._

**Benefits of MCP Transport:**

- **Platform agnostic**: bidshifter-mcp can orchestrate any MCP server (DV360, Google Ads, Meta)
- **Independent deployment**: dv360-mcp can scale/update independently
- **Network-level security**: JWT authentication between services
- **Observability**: Distributed tracing across service boundaries

---

### 7.2 Integration with DV360 API

**Authentication:** Service account OAuth2


_Detailed pseudo-code for 7.2 Integration with DV360 API is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#72-integration-with-dv360-api)._


**Rate Limiting:**

- DV360 API has per-project quotas
- `RateLimiterService` tracks requests per advertiser
- Token bucket algorithm with configurable refill rate

**Type Safety:**

- Generated Zod schemas validate all API responses
- Catches schema drift immediately
- Example: `schemas.LineItemSchema.parse(apiResponse)`

---

### 7.3 Future Integrations

**BigQuery (Phase 3):**

- High-level: Audit logging for all write operations
- Schema: `dv360_audit_log` table with (timestamp, tool, userId, lineItemId, changes, reason)
- Deferred to separate implementation doc

**SDF Files (Phase 3):**

- High-level: Bulk entity management via Structured Data Files
- Tools: `upload_sdf`, `download_sdf`, `validate_sdf`
- Deferred to separate implementation doc

---

## Testing Strategy

### Unit Tests

- Focused on individual tool logic functions and utility helpers using dependency injection mocks.
- Ensure validation, authorization, and error translation behave deterministically across entities.

_Detailed pseudo-code for Unit Tests is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#unit-tests)._

### Integration Tests

- Spin up the HTTP transport with an in-memory DI container to validate full request → response cycles.
- Use mocked DV360 API clients to assert rate limiting, telemetry, and error handling wiring.

_Detailed pseudo-code for Integration Tests is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#integration-tests)._

### Contract Tests (Schema Validation)

- Generated Zod schemas protect against upstream API drift; recorded fixtures from DV360 are replayed to confirm compatibility.
- Contract tests run independently of tool logic to highlight schema or API contract regressions early.

_Detailed pseudo-code for Contract Tests (Schema Validation) is available in [Phase 2 Implementation Reference](./phase-2/IMPLEMENTATION_REFERENCE.md#contract-tests-schema-validation)._

---

## Migration Path

### Phase 1: Schema Generation ✅ (COMPLETE)

**Status:** Fully operational
**Deliverables:**

- ✅ OpenAPI schema extraction pipeline (`scripts/generate-schemas.ts`)
- ✅ Generated TypeScript types (`src/generated/schemas/types.ts`)
- ✅ Generated Zod schemas (`src/generated/schemas/zod.ts`)
- ✅ 62 schemas extracted from DV360 API Discovery Document
- ✅ Documentation in `docs/schemas/`

---

### Phase 2: MCP Server Implementation (THIS PLAN)

**Status:** Design complete, implementation pending
**Deliverables:**

- [x] HTTP transport with SSE (`src/mcp-server/transports/http/`)
- [x] Authentication middleware (`src/mcp-server/transports/http/auth/`)
- [x] **8 tool definitions** (`src/mcp-server/tools/definitions/*.tool.ts`)
  - [x] Tier 1: 5 entity CRUD tools (list-entities, get-entity, create-entity, update-entity, delete-entity)
  - [x] Tier 2: 2 workflow tools (adjust-line-item-bids, bulk-update-status)
  - [ ] Tier 2: 1 workflow tool (campaign-setup-wizard) - deferred
- [ ] **3 MCP resource definitions** (`src/mcp-server/resources/definitions/*.resource.ts`) - deferred
  - [ ] `entity-schema://{entityType}` - Full JSON Schema with validation rules
  - [ ] `entity-fields://{entityType}` - Lightweight flat field list
  - [ ] `entity-examples://{entityType}` - Curated update patterns and examples
- [x] **Dynamic entity system utilities** (`src/mcp-server/tools/utils/`)
  - [x] `schemaIntrospection.ts` - Auto-discover schemas from generated/schemas/zod.ts with caching
  - [x] `entityMappingDynamic.ts` - Minimal API metadata → full EntityConfig (87% reduction)
  - [x] `entityIdExtraction.ts` - DRY utilities for ID extraction (eliminates ~70 lines of duplication)
  - ~~`entityMapping.ts`~~ - **Removed** (replaced by dynamic system)
  - ~~`requiredFields.ts`~~ - **Removed** (replaced by schema introspection)
- [ ] **Resource utilities** (`src/mcp-server/resources/utils/`) - deferred
  - [ ] `extractFieldsFromZodSchema.ts` - Schema introspection
  - [ ] `entityExamples.ts` - Curated example data
  - [ ] `resourceRegistry.ts` - ResourceRegistry class
- [x] **DV360Service with generic entity methods** (`src/services/dv360/DV360Service.ts`)
  - [x] `listEntities()`, `getEntity()`, `createEntity()`, `updateEntity()`, `deleteEntity()`
- [x] Dependency injection setup (`src/container/`)
- [x] Utility modules (`src/utils/`) - RateLimiter, sanitization, withToolAuth
- [ ] Unit + integration tests
- [x] Server bootstrap in `src/index.ts`

**Estimated Timeline:** 2-3 weeks

**Acceptance Criteria:**

- [x] 7 tools executable via MCP HTTP endpoint (list, get, create, update, delete, adjust-bids, bulk-status)
- [x] **Dynamic entity system** with 87% configuration reduction
- [x] **Entity-centric tools support 12 DV360 entities** (partner, advertiser, campaign, insertionOrder, lineItem, adGroup, ad, creative, customBiddingAlgorithm, inventorySource, inventorySourceGroup, locationList)
- [x] **Schema-driven configuration** with auto-discovery and caching
- [x] **DRY utilities** eliminate ~70 lines of duplicate code
- [x] JWT authentication implemented (scope-based with withToolAuth)
- [x] DV360 API integration with service account auth
- [x] Rate limiting functional with memory leak prevention
- [ ] OpenTelemetry instrumentation operational - deferred
- [ ] Test coverage >80% - deferred
- [x] **Dynamic validation using generated Zod schemas**
- [ ] **MCP resources for schema discovery** - deferred (tools currently use Record<string, any> for data fields)

---

### Phase 3: SDF File Handling (FUTURE)

**Status:** Design deferred
**Deliverables:**

- [ ] SDF upload/download tools
- [ ] SDF validation utilities
- [ ] Bulk entity management via SDF
- [ ] Separate architecture document: `docs/SDF-INTEGRATION.md`

---

### Phase 4: BigQuery Integration (FUTURE)

**Status:** Design deferred
**Deliverables:**

- [ ] Audit logging for write operations
- [ ] Historical metrics storage
- [ ] Query tools for reporting
- [ ] Separate architecture document: `docs/BIGQUERY-INTEGRATION.md`

---

## References

### Internal Documentation

- **Phase 1 Documentation:**
  - [`docs/schemas/phase-1-summary.md`](./schemas/phase-1-summary.md) - Schema extraction overview
  - [`docs/schemas/phase-1-implementation-checklist.md`](./schemas/phase-1-implementation-checklist.md) - Implementation plan
  - [`docs/schemas/generated-schema-example.md`](./schemas/generated-schema-example.md) - Usage examples
- **Generated Schemas:**
  - [`src/generated/schemas/types.ts`](../src/generated/schemas/types.ts) - TypeScript types (996 lines)
  - [`src/generated/schemas/zod.ts`](../src/generated/schemas/zod.ts) - Zod schemas (911 lines)
- **Example Code:**
  - [`src/examples/README.md`](../src/examples/README.md) - Integration guide
  - [`src/examples/get-entities.ts`](../src/examples/get-entities.ts) - GET operation examples
  - [`src/examples/update-entities.ts`](../src/examples/update-entities.ts) - UPDATE operation examples
  - [`src/examples/google-auth.ts`](../src/examples/google-auth.ts) - Service account auth

### External References

- **MCP Protocol:**
  - [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
  - [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - Official SDK
  - [@hono/mcp](https://www.npmjs.com/package/@hono/mcp) - Hono MCP transport
- **Advanced Patterns:**
  - [`mcp-ts-quickstart-template/`](../../mcp-ts-quickstart-template/) - Production-grade patterns
  - [`mcp-ts-quickstart-template/AGENTS.md`](../../mcp-ts-quickstart-template/AGENTS.md) - Development rules
  - [`mcp-ts-quickstart-template/src/mcp-server/`](../../mcp-ts-quickstart-template/src/mcp-server/) - Reference implementation
- **DV360 API:**
  - [Display & Video 360 API v4](https://developers.google.com/display-video/api/reference/rest/v4)
  - [Service Account Authentication](https://developers.google.com/identity/protocols/oauth2/service-account)

### Project Documentation

- **Root Documentation:**
  - [`CLAUDE.md`](../../CLAUDE.md) - Project overview and commands
  - [`README.md`](../../README.md) - User-facing documentation
  - [`docs/bidshifter-mcp-design-architecture.md`](../../docs/bidshifter-mcp-design-architecture.md) - Overall architecture
  - [`docs/PRD.md`](../../docs/PRD.md) - Product requirements

---

## Appendix: Key Design Decisions

### Why Advanced Patterns over Simplified?

**Decision:** Adopt advanced patterns from `mcp-ts-quickstart-template`

**Rationale:**

1. **Production-grade requirements**: dv360-mcp will handle real money (campaign budgets, bids)
2. **Multi-tenancy**: Need tenant isolation via RequestContext
3. **Observability**: OpenTelemetry tracing critical for debugging distributed systems
4. **Security**: Scope-based auth prevents unauthorized budget/bid changes
5. **Maintainability**: Declarative tool pattern scales better than imperative handlers

**Trade-offs:**

- More boilerplate (McpError, RequestContext propagation, withToolAuth wrappers)
- Steeper learning curve for contributors
- Longer initial implementation time

**Mitigation:**

- Comprehensive documentation (this doc + inline comments)
- Reference examples in `mcp-ts-quickstart-template/`
- Code generation scripts for new tools (future)

---

### Why Entity-Centric Tools over Operation-Specific Tools?

**Decision:** Generic entity CRUD tools + domain-specific workflow tools (Tier 1 + Tier 2 hybrid)

**Rationale:**

1. **Flexibility**: AI agents can update ANY field on ANY entity (not just bid/budget/status)
2. **Scalability**: 62 entities × 5 operations = 310 potential combinations covered by 5 tools
3. **Leverages Phase 1**: Generated schemas provide type safety for all entities automatically
4. **Matches DV360 API**: Natural mapping to REST endpoints with updateMask pattern
5. **Better AI reasoning**: Agents understand entities better than specific operations
6. **Reduced maintenance**: Adding new entities requires config changes, not new tools

**Alternative considered:** Operation-specific tools (update_campaign_budget, update_line_item_bid, etc.)

- Rejected: Doesn't scale (would need 100+ tools for all entity × field combinations)
- Rejected: Doesn't leverage generated schemas effectively
- Rejected: Forces agents into predefined workflows instead of flexible composition

**Hybrid approach adopted:**

- **Tier 1 (Generic)**: 5 CRUD tools for maximum flexibility
- **Tier 2 (Domain)**: 3 workflow tools for common patterns with audit trails

---

### Why Single DV360Service with Generic Methods?

**Decision:** Single `DV360Service` class with generic entity methods (`listEntities`, `getEntity`, etc.)

**Rationale:**

1. **Simplicity**: 5 generic methods instead of 310+ entity-specific methods
2. **Shared state**: Access token, rate limiter shared across all operations
3. **Clear boundaries**: Service account auth encapsulated in one place
4. **Easy testing**: Single mock for all tools
5. **Leverages generated schemas**: Dynamic schema lookup ensures type safety
6. **Consistent behavior**: All entities follow same patterns (auth, rate limit, validation)

**Alternative considered:** Entity-specific services (`PartnerService`, `CampaignService`, `LineItemService`)

- Rejected: 62 services with duplicate code for auth, rate limiting, error handling
- Rejected: Doesn't scale as new entities are added

**Alternative considered:** Entity-specific methods in single service (`getCampaign`, `updateLineItem`, etc.)

- Rejected: Would need 300+ methods for all entity × operation combinations
- Rejected: Each new entity requires 5 new methods (list, get, create, update, delete)

---

### Why HTTP-only Transport (No stdio)?

**Decision:** HTTP/SSE transport only, no stdio implementation

**Rationale:**

1. **Use case**: Called by bidshifter-mcp over network (not local CLI)
2. **Deployment**: GCP Cloud Run requires HTTP
3. **Security**: JWT authentication only makes sense over HTTP
4. **Session management**: Stateful sessions require HTTP transport

**Future consideration:** Add stdio transport if local development/testing needs arise

---

### Why MCP Resources for Schema Discovery?

**Decision:** Provide 3 MCP resources (entity-schema, entity-fields, entity-examples) instead of inline schemas in tool definitions

**Rationale:**

1. **Context window optimization**: ~9KB initial vs ~50KB+ for inline schemas
2. **On-demand loading**: AI only fetches schemas when needed for specific entities
3. **Caching**: Claude caches resource responses, subsequent lookups are instant
4. **Scalability**: Works for all 62 entities without bloating tool definitions
5. **Rich guidance**: Curated examples guide AI toward correct update patterns
6. **Better UX**: AI discovers schema naturally instead of parsing huge tool definitions

**Alternative considered:** Include all 62 entity schemas inline in `dv360_update_entity` tool definition
- Rejected: Would create ~200KB tool definition (62 entities × ~3KB each)
- Rejected: Context window would be exhausted before agent even starts reasoning
- Rejected: Every tool call would send full schemas even if not needed

**Alternative considered:** Single resource with all schemas
- Rejected: Still too large (~200KB per lookup)
- Rejected: Agent would need to parse all 62 schemas to find one entity

**Resource-based approach benefits:**
- Lightweight tool definitions remain cacheable by Claude
- Schemas fetched granularly (only the entities agent needs)
- Example patterns help agent construct correct `updateMask` and `data` payloads
- Works seamlessly with MCP protocol's native resource capabilities

---

## Document Metadata

- **Author:** Architecture Team
- **Version:** 2.3 (Dynamic Entity System - Implemented)
- **Phase:** Phase 2 (MCP Server Implementation)
- **Status:** Implementation Complete (Core Features)
- **Last Updated:** 2025-01-14
- **Key Changes in v2.3:**
  - **Dynamic Entity System**: 87% configuration reduction through schema introspection
  - **Schema-Driven**: Auto-discovery, caching, and dynamic validation
  - **7 Tools Implemented**: 5 CRUD + 2 workflow tools (all using dynamic system)
  - **DRY Utilities**: Eliminated ~70 lines of duplicate code via `entityIdExtraction.ts`
  - **Performance**: Schema caching (~30% improvement), rate limiter cleanup
  - **Code Reduction**: ~300 lines eliminated (234 from legacy files + 70 from duplicates)
  - **Removed Legacy**: `entityMapping.ts`, `requiredFields.ts` replaced by dynamic system
  - **Deferred**: MCP resources, campaign wizard, tests, OpenTelemetry
- **Key Changes in v2.2:**
  - Added 3 MCP resources for on-demand schema discovery (context window optimization)
  - Resources: entity-schema, entity-fields, entity-examples
  - Context window: ~9KB initial + ~2-5KB per lookup (vs ~50KB+ for inline schemas)
- **Key Changes in v2.1:**
  - Adopted entity-centric tool architecture (5 CRUD tools + 3 workflow tools)
  - Generic DV360Service with dynamic entity operations
  - Entity mapping patterns from example-tools.ts
  - Support for all 62 generated entity schemas
- **Next Review:** After Phase 3 (MCP Resources, Tests, OpenTelemetry)
