# Phase 2 Implementation Reference

This document captures the pseudo-code and detailed implementation snippets referenced throughout the architecture guide.

### Architecture Diagram

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
│                            │  - dv360_update_entity               │ │
│                            │  - dv360_delete_entity               │ │
│                            │  Tier 2: Workflow Tools              │ │
│                            │  - dv360_adjust_line_item_bids       │ │
│                            │  - dv360_bulk_update_status          │ │
│                            │  - dv360_campaign_setup_wizard       │ │
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

### Directory Structure

```
packages/dv360-mcp/
├── src/
│   ├── index.ts                          # Server bootstrap & entry point
│   │
│   ├── config/
│   │   └── index.ts                      # Zod-validated environment config
│   │
│   ├── container/
│   │   ├── index.ts                      # Composition root (composeContainer)
│   │   ├── tokens.ts                     # DI tokens (Symbol-based)
│   │   └── registrations/
│   │       ├── core.ts                   # Core services (Logger, Config, etc.)
│   │       └── mcp.ts                    # MCP-specific (ToolRegistry, etc.)
│   │
│   ├── mcp-server/
│   │   ├── tools/
│   │   │   ├── definitions/
│   │   │   │   ├── index.ts              # Barrel export (all tools)
│   │   │   │   # Tier 1: Entity CRUD (Generic)
│   │   │   │   ├── list-entities.tool.ts
│   │   │   │   ├── get-entity.tool.ts
│   │   │   │   ├── create-entity.tool.ts
│   │   │   │   ├── update-entity.tool.ts
│   │   │   │   ├── delete-entity.tool.ts
│   │   │   │   # Tier 2: Workflow Tools (Domain-Specific)
│   │   │   │   ├── adjust-line-item-bids.tool.ts
│   │   │   │   ├── bulk-update-status.tool.ts
│   │   │   │   └── campaign-setup-wizard.tool.ts
│   │   │   └── utils/
│   │   │       ├── toolHandlerFactory.ts # createMcpToolHandler()
│   │   │       ├── toolRegistry.ts       # ToolRegistry class
│   │   │       ├── entityMapping.ts      # Entity type to API endpoint mapping
│   │   │       ├── requiredFields.ts     # Required fields per entity/method
│   │   │       └── types.ts              # ToolDefinition interface
│   │   │
│   │   ├── transports/
│   │   │   └── http/
│   │   │       ├── httpTransport.ts      # createHttpApp (Hono)
│   │   │       ├── httpErrorHandler.ts   # Global error handler
│   │   │       ├── sessionStore.ts       # SessionStore class
│   │   │       └── auth/
│   │   │           ├── authMiddleware.ts # JWT verification
│   │   │           ├── authContext.ts    # AsyncLocalStorage
│   │   │           └── authUtils.ts      # withRequiredScopes, etc.
│   │   │
│   │   └── prompts/
│   │       └── definitions/              # Future: workflow prompts
│   │           └── index.ts
│   │
│   ├── services/
│   │   └── dv360/
│   │       ├── DV360Service.ts           # Main API client (injectable)
│   │       ├── auth.ts                   # Service account auth
│   │       └── types.ts                  # Service-specific types
│   │
│   ├── utils/
│   │   ├── errors/
│   │   │   ├── McpError.ts               # Custom error class
│   │   │   ├── ErrorHandler.ts           # ErrorHandler utility
│   │   │   └── errorCodes.ts             # JsonRpcErrorCode enum
│   │   ├── internal/
│   │   │   ├── requestContext.ts         # RequestContextService
│   │   │   ├── logger.ts                 # Logger class (Pino)
│   │   │   └── performance.ts            # measureToolExecution()
│   │   ├── security/
│   │   │   ├── sanitization.ts           # Sanitization utility
│   │   │   ├── rateLimiter.ts            # RateLimiter class
│   │   │   └── withToolAuth.ts           # withToolAuth() wrapper
│   │   ├── network/
│   │   │   └── fetchWithTimeout.ts       # Timeout-aware fetch
│   │   └── telemetry/
│   │       └── index.ts                  # OpenTelemetry helpers
│   │
│   ├── generated/
│   │   └── schemas/
│   │       ├── types.ts                  # Generated TypeScript types (Phase 1 ✅)
│   │       └── zod.ts                    # Generated Zod schemas (Phase 1 ✅)
│   │
│   └── types-global/
│       ├── index.ts                      # Global type exports
│       ├── mcp.ts                        # MCP-specific types
│       └── common.ts                     # Common shared types
│
├── docs/
│   ├── ARCHITECTURE.md                   # This document
│   └── schemas/                          # Phase 1 documentation (✅)
│       ├── generated-schema-example.md
│       ├── phase-1-summary.md
│       └── phase-1-implementation-checklist.md
│
├── scripts/
│   ├── generate-schemas.ts               # Schema extraction pipeline (Phase 1 ✅)
│   └── lib/                              # Schema generation utilities
│
├── config/
│   └── schema-extraction.config.ts       # OpenAPI extraction config
│
├── package.json
├── tsconfig.json
├── Dockerfile
└── README.md
```

##### Session Management

```typescript
// SessionStore with identity binding (prevents session hijacking)
export class SessionStore {
  // Sessions bound to tenantId + clientId from JWT
  // Automatic stale session cleanup
  // Stateful mode: sessions persist across requests
  // Stateless mode: new session per request
}
```

##### Authentication Middleware

```typescript
// JWT verification → AsyncLocalStorage propagation
app.use("/mcp", async (c, next) => {
  const token = extractBearerToken(c.req.header("authorization"));
  const authInfo = await authStrategy.verify(token); // { scopes, clientId, tenantId, subject }

  // Store in AsyncLocalStorage for entire request lifecycle
  await authContext.run({ authInfo }, async () => {
    await next();
  });
});
```

##### Error Handling

```typescript
// Global error handler maps McpError → HTTP status
app.onError((err, c) => {
  if (err instanceof McpError) {
    return c.json(
      {
        error: err.message,
        code: err.code,
        data: err.data,
      },
      mapErrorCodeToHttpStatus(err.code)
    );
  }
  return c.json({ error: "Internal server error" }, 500);
});
```

##### Tier 1: Entity CRUD Tools (Generic, Schema-Driven)

```typescript
// Input: { entityType: 'lineItem', advertiserId: '123', campaignId: '456' }
// Output: { entities: LineItem[], nextPageToken?: string }
// Scopes: ['dv360:read']
```

```typescript
// Input: { entityType: 'campaign', advertiserId: '123', campaignId: '456' }
// Output: { entity: Campaign }
// Scopes: ['dv360:read']
```

```typescript
// Input: { entityType: 'lineItem', advertiserId: '123', data: { ...LineItem } }
// Output: { entity: LineItem }
// Scopes: ['dv360:write', 'dv360:{entityType}:write']
```

```typescript
// Input: {
//   entityType: 'lineItem',
//   advertiserId: '123',
//   lineItemId: '789',
//   data: { bidStrategy: { ... } },
//   updateMask: 'bidStrategy',
//   reason?: 'Optional reason for audit'
// }
// Output: { entity: LineItem, previousValues?: object }
// Scopes: ['dv360:write', 'dv360:{entityType}:write']
```

```typescript
// Input: { entityType: 'campaign', advertiserId: '123', campaignId: '456' }
// Output: { success: boolean, deletedEntity: Campaign }
// Scopes: ['dv360:write', 'dv360:{entityType}:delete']
```

##### Tier 2: Workflow Tools (Domain-Specific Convenience)

```typescript
// Input: {
//   adjustments: [
//     { advertiserId, lineItemId, newBidMicros, reason }
//   ]
// }
// Output: {
//   successful: [{ lineItemId, previousBid, newBid }],
//   failed: [{ lineItemId, error }]
// }
// Scopes: ['dv360:write', 'dv360:lineitem:write']
```

```typescript
// Input: {
//   advertiserId: '123',
//   lineItemIds: ['1', '2', '3'],
//   status: 'ENTITY_STATUS_PAUSED',
//   reason?: 'Budget exhausted'
// }
// Output: {
//   successful: [{ lineItemId, previousStatus, newStatus }],
//   failed: [{ lineItemId, error }]
// }
// Scopes: ['dv360:write', 'dv360:lineitem:write']
```

```typescript
// Input: {
//   advertiserId: '123',
//   campaign: { displayName, budget, flight, ... },
//   insertionOrder: { displayName, budget, pacing, ... },
//   lineItems: [{ displayName, bidStrategy, targeting, ... }]
// }
// Output: {
//   campaign: Campaign,
//   insertionOrder: InsertionOrder,
//   lineItems: LineItem[]
// }
// Scopes: ['dv360:write', 'dv360:campaign:write']
```

##### Entity Mapping Pattern (from example-tools.ts)

```typescript
// src/mcp-server/tools/utils/entityMapping.ts

export const ENTITY_TYPE_CONFIG: Record<string, EntityConfig> = {
  partner: {
    apiPath: "/partners",
    parentIds: [],
    supportsCreate: false, // Partners are managed by Google
    supportsUpdate: true,
    supportsDelete: false,
    supportsFilter: false,
  },
  advertiser: {
    apiPath: "/advertisers",
    parentIds: ["partnerId"],
    supportsCreate: true,
    supportsUpdate: true,
    supportsDelete: true,
    supportsFilter: true,
    filterFields: ["partnerId", "entityStatus"],
  },
  campaign: {
    apiPath: (ids) => `/advertisers/${ids.advertiserId}/campaigns`,
    parentIds: ["advertiserId"],
    supportsCreate: true,
    supportsUpdate: true,
    supportsDelete: true,
    supportsFilter: true,
    filterFields: ["entityStatus", "advertiserId"],
  },
  lineItem: {
    apiPath: (ids) => `/advertisers/${ids.advertiserId}/lineItems`,
    parentIds: ["advertiserId"],
    supportsCreate: true,
    supportsUpdate: true,
    supportsDelete: true,
    supportsFilter: true,
    filterFields: ["campaignId", "insertionOrderId", "entityStatus", "lineItemType"],
  },
  // ... other entities
};

// Get schema validator for entity type
export function getEntitySchema(
  entityType: string,
  operation: "list" | "get" | "create" | "update"
): z.ZodSchema {
  const schemaMap = {
    partner: schemas.PartnerSchema,
    advertiser: schemas.AdvertiserSchema,
    campaign: schemas.CampaignSchema,
    insertionOrder: schemas.InsertionOrderSchema,
    lineItem: schemas.LineItemSchema,
    adGroup: schemas.AdGroupSchema,
    // ... from generated schemas
  };

  return schemaMap[entityType];
}
```

##### Required Fields Pattern (from example-tools.ts, enhanced)

```typescript
// src/mcp-server/tools/utils/requiredFields.ts

export function getRequiredFields(
  entityType: string,
  method: "list" | "get" | "create" | "update" | "delete"
): string[] {
  const config = ENTITY_TYPE_CONFIG[entityType];
  if (!config) return [];

  // Base required fields (parent IDs)
  const baseFields = [...config.parentIds];

  if (method === "list") {
    return baseFields;
  }

  if (method === "get" || method === "update" || method === "delete") {
    // Add entity ID field (e.g., 'campaignId' for campaign)
    const idField = `${entityType}Id`;
    return [...baseFields, idField];
  }

  if (method === "create") {
    // Required fields for entity creation (varies by entity)
    const createRequiredFields = {
      campaign: ["advertiserId", "displayName", "entityStatus", "campaignGoal", "campaignFlight"],
      insertionOrder: [
        "advertiserId",
        "campaignId",
        "displayName",
        "entityStatus",
        "pacing",
        "budget",
      ],
      lineItem: [
        "advertiserId",
        "insertionOrderId",
        "displayName",
        "lineItemType",
        "entityStatus",
        "flight",
        "budget",
        "bidStrategy",
      ],
      advertiser: ["partnerId", "displayName"],
      // ... other entities
    };

    return createRequiredFields[entityType] || baseFields;
  }

  return baseFields;
}

// Validate that all required fields are present and non-empty
export function validateRequiredFields(
  entityType: string,
  method: string,
  input: Record<string, unknown>
): void {
  const required = getRequiredFields(entityType, method as any);
  const missing = required.filter((field) => !input[field]);

  if (missing.length > 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `Missing required fields for ${entityType}.${method}: ${missing.join(", ")}`,
      { entityType, method, missing, provided: Object.keys(input) }
    );
  }
}
```

##### Tool Definition Example: `dv360_update_entity`

```typescript
// Example: src/mcp-server/tools/definitions/update-entity.tool.ts

const TOOL_NAME = "dv360_update_entity";
const TOOL_TITLE = "Update DV360 Entity";
const TOOL_DESCRIPTION = "Update any DV360 entity with specified fields via updateMask parameter";

// Input schema (dynamic validation based on entityType)
const InputSchema = z
  .object({
    entityType: z
      .enum([
        "partner",
        "advertiser",
        "campaign",
        "insertionOrder",
        "lineItem",
        "adGroup",
        "ad",
        "creative",
      ])
      .describe("Type of entity to update"),
    // Parent IDs (validated dynamically based on entityType)
    partnerId: z.string().optional().describe("Partner ID (if required for entity type)"),
    advertiserId: z.string().optional().describe("Advertiser ID (if required for entity type)"),
    campaignId: z.string().optional().describe("Campaign ID (if required for entity type)"),
    insertionOrderId: z
      .string()
      .optional()
      .describe("Insertion order ID (if required for entity type)"),
    lineItemId: z.string().optional().describe("Line item ID (if required for entity type)"),
    // Update payload
    data: z.record(z.any()).describe("Entity fields to update (validated against schema)"),
    updateMask: z
      .string()
      .describe('Comma-separated list of fields to update (e.g., "bidStrategy,entityStatus")'),
    reason: z.string().optional().describe("Optional reason for audit trail"),
  })
  .describe("Parameters for updating a DV360 entity");

const OutputSchema = z
  .object({
    entity: z.record(z.any()).describe("Updated entity (validated against entity schema)"),
    previousValues: z.record(z.any()).optional().describe("Previous values of updated fields"),
    timestamp: z.string().datetime(),
  })
  .describe("Entity update result");

type UpdateEntityInput = z.infer<typeof InputSchema>;
type UpdateEntityOutput = z.infer<typeof OutputSchema>;

async function updateEntityLogic(
  input: UpdateEntityInput,
  appContext: RequestContext,
  sdkContext: SdkContext
): Promise<UpdateEntityOutput> {
  const dv360Service = container.resolve(DV360Service);

  // Validate required fields for this entity type
  validateRequiredFields(input.entityType, "update", input);

  // Extract entity IDs
  const entityIds = {
    partnerId: input.partnerId,
    advertiserId: input.advertiserId,
    campaignId: input.campaignId,
    insertionOrderId: input.insertionOrderId,
    lineItemId: input.lineItemId,
  };

  // Get current entity to capture previous values
  const current = await dv360Service.getEntity(input.entityType, entityIds, appContext);

  // Extract previous values for updated fields
  const updateFields = input.updateMask.split(",").map((f) => f.trim());
  const previousValues: Record<string, any> = {};
  for (const field of updateFields) {
    previousValues[field] = current[field];
  }

  // Perform update
  const updated = await dv360Service.updateEntity(
    input.entityType,
    entityIds,
    input.data,
    input.updateMask,
    appContext
  );

  return {
    entity: updated,
    previousValues,
    timestamp: new Date().toISOString(),
  };
}

function responseFormatter(result: UpdateEntityOutput): ContentBlock[] {
  const entitySummary = JSON.stringify(result.entity, null, 2);
  const changesSummary = result.previousValues
    ? `\nPrevious values:\n${JSON.stringify(result.previousValues, null, 2)}`
    : "";

  return [
    {
      type: "text",
      text: `✓ Entity updated\n${entitySummary}${changesSummary}\nTimestamp: ${result.timestamp}`,
    },
  ];
}

export const updateEntityTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  annotations: {
    readOnlyHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
  logic: withToolAuth(
    ["dv360:write"], // Base scope, entity-specific scope checked dynamically
    updateEntityLogic
  ),
  responseFormatter,
};
```

#### 4.3 DV360Service (Entity-Centric Service)

```typescript
@injectable()
export class DV360Service {
  private accessToken?: string;
  private tokenExpiry?: Date;

  constructor(
    @inject(Logger) private logger: typeof logger,
    @inject(AppConfig) private config: AppConfig,
    @inject(RateLimiterService) private rateLimiter: RateLimiter
  ) {}

  // Authentication
  async authenticateServiceAccount(context: RequestContext): Promise<void> {
    // Load service account JSON from env
    // Exchange for OAuth2 access token
    // Cache token until expiry
  }

  // Generic entity operations

  /**
   * List entities with optional filtering and pagination
   */
  async listEntities(
    entityType: string,
    ids: Record<string, string>, // Parent IDs (e.g., { advertiserId: '123' })
    filter?: string,
    pageToken?: string,
    context?: RequestContext
  ): Promise<{ entities: unknown[]; nextPageToken?: string }> {
    await this.ensureAuthenticated(context);

    const config = ENTITY_TYPE_CONFIG[entityType];
    if (!config) {
      throw new McpError(JsonRpcErrorCode.InvalidParams, `Unknown entity type: ${entityType}`, {
        entityType,
      });
    }

    // Construct API path
    const basePath = typeof config.apiPath === "function" ? config.apiPath(ids) : config.apiPath;

    // Build query params
    const params = new URLSearchParams();
    if (filter) params.append("filter", filter);
    if (pageToken) params.append("pageToken", pageToken);

    const path = `${basePath}?${params.toString()}`;

    // Rate limit by advertiser
    if (ids.advertiserId) {
      await this.rateLimiter.consume(`dv360:${ids.advertiserId}`, 1);
    }

    const response = await this.fetch(path, context);

    // Validate response with generated schema
    const schema = getEntitySchema(entityType, "list");
    const validated = schema.parse(response);

    return {
      entities: validated[`${entityType}s`] || [],
      nextPageToken: validated.nextPageToken,
    };
  }

  /**
   * Get single entity by ID
   */
  async getEntity(
    entityType: string,
    ids: Record<string, string>, // All required IDs (e.g., { advertiserId, lineItemId })
    context: RequestContext
  ): Promise<unknown> {
    await this.ensureAuthenticated(context);

    const config = ENTITY_TYPE_CONFIG[entityType];
    if (!config) {
      throw new McpError(JsonRpcErrorCode.InvalidParams, `Unknown entity type: ${entityType}`, {
        entityType,
      });
    }

    // Construct full path including entity ID
    const basePath = typeof config.apiPath === "function" ? config.apiPath(ids) : config.apiPath;
    const entityId = ids[`${entityType}Id`];
    const path = `${basePath}/${entityId}`;

    // Rate limit by advertiser
    if (ids.advertiserId) {
      await this.rateLimiter.consume(`dv360:${ids.advertiserId}`, 1);
    }

    const response = await this.fetch(path, context);

    // Validate with generated schema
    const schema = getEntitySchema(entityType, "get");
    return schema.parse(response);
  }

  /**
   * Create new entity
   */
  async createEntity(
    entityType: string,
    ids: Record<string, string>, // Parent IDs
    data: Record<string, unknown>, // Entity data
    context: RequestContext
  ): Promise<unknown> {
    await this.ensureAuthenticated(context);

    const config = ENTITY_TYPE_CONFIG[entityType];
    if (!config || !config.supportsCreate) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Entity type ${entityType} does not support create operation`,
        { entityType }
      );
    }

    // Validate input data with generated schema
    const schema = getEntitySchema(entityType, "create");
    const validated = schema.parse(data);

    const basePath = typeof config.apiPath === "function" ? config.apiPath(ids) : config.apiPath;

    // Rate limit by advertiser
    if (ids.advertiserId) {
      await this.rateLimiter.consume(`dv360:${ids.advertiserId}`, 1);
    }

    const response = await this.fetch(basePath, context, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validated),
    });

    return schema.parse(response);
  }

  /**
   * Update entity with updateMask
   */
  async updateEntity(
    entityType: string,
    ids: Record<string, string>, // All required IDs
    data: Record<string, unknown>, // Partial entity data
    updateMask: string, // Comma-separated field paths
    context: RequestContext
  ): Promise<unknown> {
    await this.ensureAuthenticated(context);

    const config = ENTITY_TYPE_CONFIG[entityType];
    if (!config || !config.supportsUpdate) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Entity type ${entityType} does not support update operation`,
        { entityType }
      );
    }

    // Get current entity and merge with updates
    const current = await this.getEntity(entityType, ids, context);
    const merged = { ...current, ...data };

    // Validate merged entity
    const schema = getEntitySchema(entityType, "update");
    const validated = schema.parse(merged);

    const basePath = typeof config.apiPath === "function" ? config.apiPath(ids) : config.apiPath;
    const entityId = ids[`${entityType}Id`];
    const path = `${basePath}/${entityId}?updateMask=${encodeURIComponent(updateMask)}`;

    // Rate limit by advertiser
    if (ids.advertiserId) {
      await this.rateLimiter.consume(`dv360:${ids.advertiserId}`, 1);
    }

    const response = await this.fetch(path, context, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validated),
    });

    return schema.parse(response);
  }

  /**
   * Delete entity
   */
  async deleteEntity(
    entityType: string,
    ids: Record<string, string>, // All required IDs
    context: RequestContext
  ): Promise<void> {
    await this.ensureAuthenticated(context);

    const config = ENTITY_TYPE_CONFIG[entityType];
    if (!config || !config.supportsDelete) {
      throw new McpError(
        JsonRpcErrorCode.InvalidParams,
        `Entity type ${entityType} does not support delete operation`,
        { entityType }
      );
    }

    const basePath = typeof config.apiPath === "function" ? config.apiPath(ids) : config.apiPath;
    const entityId = ids[`${entityType}Id`];
    const path = `${basePath}/${entityId}`;

    // Rate limit by advertiser
    if (ids.advertiserId) {
      await this.rateLimiter.consume(`dv360:${ids.advertiserId}`, 1);
    }

    await this.fetch(path, context, { method: "DELETE" });
  }

  // Private helpers
  private async fetch(
    path: string,
    context: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    const url = `${this.config.dv360ApiBaseUrl}${path}`;

    const response = await fetchWithTimeout(url, 10000, context, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new McpError(
        response.status >= 500
          ? JsonRpcErrorCode.ServiceUnavailable
          : JsonRpcErrorCode.InvalidRequest,
        `DV360 API request failed: ${response.status} ${response.statusText}`,
        {
          requestId: context.requestId,
          httpStatus: response.status,
          path,
          method: options?.method ?? "GET",
        }
      );
    }

    // DELETE returns 204 No Content
    if (response.status === 204) {
      return {};
    }

    return response.json();
  }

  private async ensureAuthenticated(context: RequestContext): Promise<void> {
    if (!this.accessToken || !this.tokenExpiry || this.tokenExpiry < new Date()) {
      await this.authenticateServiceAccount(context);
    }
  }
}
```

#### 4.4 Dependency Injection Container

```typescript
// src/container/tokens.ts
export const AppConfig = Symbol("AppConfig");
export const Logger = Symbol("Logger");
export const DV360Service = Symbol("DV360Service");
export const RateLimiterService = Symbol("RateLimiterService");
export const RequestContextService = Symbol("RequestContextService");
export const ToolDefinitions = Symbol("ToolDefinitions");
export const ToolRegistry = Symbol("ToolRegistry");
export const CreateMcpServerInstance = Symbol("CreateMcpServerInstance");
```

```typescript
// src/container/registrations/core.ts
export const registerCoreServices = () => {
  // Static values (singleton instances)
  const config = parseConfig();
  container.register(AppConfig, { useValue: config });
  container.register(Logger, { useValue: logger });

  // Services (singleton lifecycle)
  container.registerSingleton(DV360Service, DV360ServiceImpl);
  container.registerSingleton(RateLimiterService, RateLimiter);
  container.register(RequestContextService, { useValue: requestContextService });
};
```

```typescript
// src/container/registrations/mcp.ts
export const registerMcpServices = () => {
  // Registries
  container.registerSingleton(ToolRegistry);

  // Multi-injection: all tool definitions
  const allTools = [
    // Tier 1: Entity CRUD
    listEntitiesTool,
    getEntityTool,
    createEntityTool,
    updateEntityTool,
    deleteEntityTool,
    // Tier 2: Workflow tools
    adjustLineItemBidsTool,
    bulkUpdateStatusTool,
    campaignSetupWizardTool,
  ];

  for (const tool of allTools) {
    container.register(ToolDefinitions, { useValue: tool });
  }

  // Factory for MCP server instances
  container.register(CreateMcpServerInstance, {
    useValue: createMcpServerInstance,
  });
};
```

```typescript
// src/container/index.ts
import "reflect-metadata"; // MUST be first import

let isContainerComposed = false;

export function composeContainer(): void {
  if (isContainerComposed) return;

  registerCoreServices();
  registerMcpServices();

  isContainerComposed = true;
}
```

##### Layer 1: Tool Logic (Pure)

```typescript
// NO try/catch in tool logic
// Just throw McpError on failure
async function toolLogic(input, context, sdkContext) {
  if (!input.campaignId) {
    throw new McpError(JsonRpcErrorCode.InvalidParams, "Campaign ID required", {
      requestId: context.requestId,
    });
  }

  const result = await dv360Service.getCampaign(input.campaignId, context);
  return result;
}
```

##### Layer 2: Tool Handler (Catches & Formats)

```typescript
// src/mcp-server/tools/utils/toolHandlerFactory.ts
export function createMcpToolHandler({ toolName, logic, responseFormatter }) {
  return async (input, callContext) => {
    const sdkContext = callContext as SdkContext;
    const appContext = requestContextService.createRequestContext({
      parentContext: sdkContext,
      operation: "HandleToolRequest",
      additionalContext: { toolName, input },
    });

    try {
      const result = await measureToolExecution(
        () => logic(input, appContext, sdkContext),
        { ...appContext, toolName },
        input
      );

      return {
        structuredContent: result,
        content: responseFormatter(result),
      };
    } catch (error: unknown) {
      // ErrorHandler.handleError does:
      // - Determines error code (if not McpError)
      // - Logs with full context
      // - Records OpenTelemetry exception
      // - Sanitizes sensitive data
      const mcpError = ErrorHandler.handleError(error, {
        operation: `tool:${toolName}`,
        context: appContext,
        input,
      }) as McpError;

      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${mcpError.message}` }],
        structuredContent: {
          code: mcpError.code,
          message: mcpError.message,
          correlationId: appContext.requestId,
          data: mcpError.data,
        },
      };
    }
  };
}
```

##### Layer 3: HTTP Transport (Global Handler)

```typescript
// src/mcp-server/transports/http/httpErrorHandler.ts
export const httpErrorHandler: ErrorHandler = (err, c) => {
  logger.error("HTTP request failed", {
    error: err.message,
    path: c.req.path,
    method: c.req.method,
  });

  if (err instanceof McpError) {
    return c.json(
      {
        error: err.message,
        code: err.code,
        data: err.data,
      },
      mapErrorCodeToHttpStatus(err.code)
    );
  }

  return c.json(
    {
      error: "Internal server error",
      message: err.message,
    },
    500
  );
};
```

##### McpError Structure

```typescript
// src/utils/errors/McpError.ts
export class McpError extends Error {
  public code: JsonRpcErrorCode;
  public readonly data?: Record<string, unknown>;

  constructor(
    code: JsonRpcErrorCode,
    message?: string,
    data?: Record<string, unknown>,
    options?: { cause?: unknown }
  ) {
    super(message);
    this.code = code;
    this.data = data;
    this.cause = options?.cause;
  }
}

export enum JsonRpcErrorCode {
  // Standard JSON-RPC 2.0
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,

  // Implementation-defined (-32000 to -32099)
  ServiceUnavailable = -32000,
  NotFound = -32001,
  Conflict = -32002,
  RateLimited = -32003,
  Timeout = -32004,
  Forbidden = -32005,
  Unauthorized = -32006,
  ValidationError = -32007,
}
```

#### 4.6 Authentication & Authorization

```
1. Client sends JWT in Authorization: Bearer <token>
2. Auth middleware extracts token → verifies signature/expiry
3. Extract claims: { sub, scopes, clientId, tenantId, aud, iss, exp }
4. Store AuthInfo in AsyncLocalStorage (available throughout request)
5. Tool wrapper (withToolAuth) checks scopes before executing logic
```

```typescript
// src/mcp-server/transports/http/auth/authMiddleware.ts
export function createAuthMiddleware(authStrategy: AuthStrategy) {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid authorization header" }, 401);
    }

    const token = authHeader.slice(7);

    try {
      const authInfo = await authStrategy.verify(token);

      // Store in AsyncLocalStorage for entire request lifecycle
      await authContext.run({ authInfo }, async () => {
        await next();
      });
    } catch (error) {
      logger.warning("JWT verification failed", { error: error.message });
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  };
}
```

```typescript
// src/mcp-server/transports/http/auth/authContext.ts
export const authContext = new AsyncLocalStorage<AuthStore>();

export interface AuthStore {
  authInfo: AuthInfo;
}

export interface AuthInfo {
  subject: string; // User/service account ID
  scopes: string[]; // Granted permissions
  clientId: string; // OAuth client ID
  tenantId?: string; // Multi-tenancy support
  token: string; // Raw JWT (for forwarding to DV360 API if needed)
}
```

```typescript
// src/utils/security/withToolAuth.ts
export function withToolAuth<TInput, TOutput>(
  requiredScopes: string[],
  logicFn: (
    input: TInput,
    context: RequestContext,
    sdkContext: SdkContext
  ) => TOutput | Promise<TOutput>
): (input: TInput, context: RequestContext, sdkContext: SdkContext) => Promise<TOutput> {
  return async (input, context, sdkContext) => {
    withRequiredScopes(requiredScopes); // Throws if unauthorized
    return Promise.resolve(logicFn(input, context, sdkContext));
  };
}

export function withRequiredScopes(requiredScopes: string[]): void {
  // When auth is disabled (MCP_AUTH_MODE=none), allow all
  if (config.mcpAuthMode === "none") return;

  // Get auth info from AsyncLocalStorage
  const store = authContext.getStore();
  if (!store?.authInfo) {
    throw new McpError(JsonRpcErrorCode.Unauthorized, "No authentication information found");
  }

  const userScopes = store.authInfo.scopes;
  const hasAllScopes = requiredScopes.every((scope) => userScopes.includes(scope));

  if (!hasAllScopes) {
    throw new McpError(JsonRpcErrorCode.Forbidden, "Insufficient permissions", {
      required: requiredScopes,
      provided: userScopes,
    });
  }
}
```

```
dv360:read                      # Read-only access (fetch_campaign_entities)
dv360:write                     # Base write permission (all updates require this)
  ├─ dv360:budget:write         # Budget modifications
  ├─ dv360:lineitem:write       # Line item modifications
  └─ dv360:campaign:write       # Campaign modifications
```

#### 4.7 RequestContext Propagation

```typescript
export interface RequestContext {
  requestId: string; // Unique ID for correlation (generated)
  timestamp: string; // ISO 8601
  tenantId?: string; // Multi-tenancy (from JWT or parent context)
  auth?: AuthContext; // Authentication info
  traceId?: string; // OpenTelemetry trace ID (auto-injected)
  spanId?: string; // OpenTelemetry span ID (auto-injected)
  [key: string]: unknown; // Extensible for tool-specific data
}
```

```typescript
// src/utils/internal/requestContext.ts
export const requestContextService = {
  createRequestContext(params: {
    parentContext?: Record<string, unknown>;
    additionalContext?: Record<string, unknown>;
    operation?: string;
  }): RequestContext {
    const requestId = params.parentContext?.requestId ?? generateRequestContextId();

    // Auto-inject OpenTelemetry IDs from active span
    const span = trace.getActiveSpan();
    const spanContext = span?.spanContext();

    // Resolve tenantId: additionalContext > parentContext > AsyncLocalStorage auth
    const store = authContext.getStore();
    const tenantId =
      params.additionalContext?.tenantId ??
      params.parentContext?.tenantId ??
      store?.authInfo?.tenantId;

    return {
      requestId,
      timestamp: new Date().toISOString(),
      tenantId,
      traceId: spanContext?.traceId,
      spanId: spanContext?.spanId,
      ...params.parentContext,
      ...params.additionalContext,
      operation: params.operation,
    };
  },
};
```

```typescript
// Create context from SDK context
const appContext = requestContextService.createRequestContext({
  parentContext: sdkContext,
  operation: 'HandleToolRequest',
  additionalContext: { toolName, sessionId, input }
});

// Pass through entire call stack
const result = await toolLogic(input, appContext, sdkContext);

// DV360Service receives and propagates
async getCampaign(campaignId: string, context: RequestContext) {
  logger.info('Fetching campaign', context); // Auto-includes requestId, traceId, etc.
  const response = await fetchWithTimeout(url, 10000, context);
  return response;
}
```

#### Example: `update_line_item_bid` Tool Execution

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. Client Request                                                    │
│    POST /mcp                                                         │
│    Authorization: Bearer <JWT>                                       │
│    Body: { method: "tools/call", params: {                          │
│      name: "update_line_item_bid",                                   │
│      arguments: {                                                    │
│        lineItemId: "12345",                                          │
│        advertiserId: "67890",                                        │
│        newBid: 5000000, // $5 CPM in micros                          │
│        reason: "Underdelivering - increase bid"                      │
│      }                                                               │
│    }}                                                                │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 2. CORS Middleware                                                   │
│    - Validate origin against MCP_ALLOWED_ORIGINS                     │
│    - Add CORS headers                                                │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 3. Auth Middleware                                                   │
│    - Extract JWT from Authorization header                           │
│    - Verify signature + expiry                                       │
│    - Extract claims: { sub, scopes: ["dv360:write",                  │
│                         "dv360:lineitem:write"], tenantId: "acme" }  │
│    - Store AuthInfo in AsyncLocalStorage                             │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 4. HTTP Transport                                                    │
│    - Extract/generate sessionId from Mcp-Session-Id header           │
│    - Validate session with identity binding (tenantId + clientId)    │
│    - Create McpSessionTransport                                      │
│    - Connect MCP server to transport                                 │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 5. MCP Server                                                        │
│    - Parse JSON-RPC request                                          │
│    - Route to tools/call handler                                     │
│    - Lookup tool: "update_line_item_bid"                             │
│    - Invoke tool handler with (input, callContext)                   │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 6. Tool Handler (createMcpToolHandler)                               │
│    - Create RequestContext from callContext (SdkContext)             │
│      appContext = {                                                  │
│        requestId: "req-abc123",                                      │
│        timestamp: "2025-01-13T10:30:00Z",                            │
│        tenantId: "acme",                                             │
│        traceId: "otel-trace-xyz",                                    │
│        spanId: "otel-span-123",                                      │
│        operation: "HandleToolRequest",                               │
│        toolName: "update_line_item_bid"                              │
│      }                                                               │
│    - Start OpenTelemetry span: "tool_execution:update_line_item_bid" │
│    - Record start time + memory snapshot                             │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 7. withToolAuth Wrapper                                              │
│    - Get AuthInfo from AsyncLocalStorage                             │
│    - Check required scopes: ["dv360:write", "dv360:lineitem:write"]  │
│    - Verify user has both scopes                                     │
│    - ✓ Authorized → proceed to tool logic                            │
│    - ✗ Unauthorized → throw McpError(Forbidden)                      │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 8. Tool Logic (updateLineItemBidLogic)                               │
│    - Validate input with Zod schema                                  │
│    - Resolve DV360Service from DI container                          │
│    - Call dv360Service.getLineItem(advertiserId, lineItemId, ctx)    │
│      - Returns current LineItem with previousBid                     │
│    - Call dv360Service.updateLineItemBid(advertiserId, lineItemId,   │
│                                          newBid, reason, ctx)         │
│      - Returns updated LineItem                                      │
│    - Return UpdateBidOutput: { lineItemId, previousBid, newBid, ts } │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 9. DV360Service.updateLineItemBid                                    │
│    - Ensure service account authenticated (cache access token)       │
│    - Rate limit check: rateLimiter.consume("dv360:67890", 1)         │
│    - Fetch current line item via DV360 API GET request               │
│    - Construct update payload with new bid + reason (metadata)       │
│    - PATCH request to DV360 API:                                     │
│      POST /advertisers/67890/lineItems/12345?updateMask=bidStrategy  │
│      Authorization: Bearer <service-account-token>                   │
│      Body: { bidStrategy: { fixedBid: { bidAmountMicros: 5000000 }}}│
│    - Validate response with generated Zod schema (LineItemSchema)    │
│    - Return validated LineItem                                       │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 10. Tool Handler (continued)                                         │
│     - Receive result from tool logic                                 │
│     - End OpenTelemetry span                                         │
│     - Record metrics:                                                │
│       - Duration: 342ms                                              │
│       - Input size: 156 bytes                                        │
│       - Output size: 234 bytes                                       │
│       - Memory delta: +2.1 MB RSS                                    │
│     - Call responseFormatter(result) → ContentBlock[]                │
│     - Return CallToolResult: {                                       │
│         structuredContent: result,                                   │
│         content: [{                                                  │
│           type: "text",                                              │
│           text: "✓ Line item bid updated\n..."                       │
│         }]                                                           │
│       }                                                              │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 11. MCP Server                                                       │
│     - Wrap result in JSON-RPC 2.0 response                           │
│     - Return to transport                                            │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 12. HTTP Transport                                                   │
│     - Add Mcp-Session-Id header (for stateful mode)                  │
│     - Send SSE response to client                                    │
│     - Update session last accessed timestamp                         │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 13. Client Receives Response                                         │
│     {                                                                │
│       jsonrpc: "2.0",                                                │
│       id: 1,                                                         │
│       result: {                                                      │
│         content: [{                                                  │
│           type: "text",                                              │
│           text: "✓ Line item bid updated\nID: 12345\n..."            │
│         }]                                                           │
│       }                                                              │
│     }                                                                │
└──────────────────────────────────────────────────────────────────────┘
```

#### Error Flow (if API fails)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 9. DV360Service.updateLineItemBid                                    │
│    - PATCH request to DV360 API                                      │
│    - Response: 429 Too Many Requests                                 │
│    - Throw McpError(RateLimited, "DV360 API rate limit exceeded",    │
│                     { httpStatus: 429, requestId: "req-abc123" })    │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 10. Tool Handler (catch block)                                       │
│     - Catch McpError                                                 │
│     - Call ErrorHandler.handleError(error, { operation, context })   │
│       - Logs error with full context                                 │
│       - Records OpenTelemetry exception on span                      │
│       - Sanitizes sensitive data                                     │
│     - Return CallToolResult: {                                       │
│         isError: true,                                               │
│         content: [{                                                  │
│           type: "text",                                              │
│           text: "Error: DV360 API rate limit exceeded"               │
│         }],                                                          │
│         structuredContent: {                                         │
│           code: -32003,                                              │
│           message: "DV360 API rate limit exceeded",                  │
│           correlationId: "req-abc123",                               │
│           data: { httpStatus: 429 }                                  │
│         }                                                            │
│       }                                                              │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 11. Client Receives Error Response                                   │
│     {                                                                │
│       jsonrpc: "2.0",                                                │
│       id: 1,                                                         │
│       error: {                                                       │
│         code: -32003,                                                │
│         message: "DV360 API rate limit exceeded",                    │
│         data: { httpStatus: 429, correlationId: "req-abc123" }       │
│       }                                                              │
│     }                                                                │
└──────────────────────────────────────────────────────────────────────┘
```

#### Configuration Schema

```typescript
// src/config/index.ts
import { z } from "zod";

const ConfigSchema = z.object({
  serviceName: z.string().default("dv360-mcp"),
  port: z.number().int().min(1).max(65535).default(3002),
  host: z.string().default("0.0.0.0"),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),

  // Authentication
  mcpAuthMode: z.enum(["none", "jwt", "oauth"]).default("none"),
  mcpAuthSecretKey: z.string().min(32).optional(),

  // Session
  mcpSessionMode: z.enum(["stateless", "stateful", "auto"]).default("auto"),
  mcpStatefulSessionTimeoutMs: z.number().default(3600000),

  // CORS
  mcpAllowedOrigins: z.string().optional(),

  // Logging
  mcpLogLevel: z.enum(["debug", "info", "notice", "warning", "error"]).default("debug"),

  // OpenTelemetry
  otelEnabled: z.boolean().default(true),
  otelServiceName: z.string().default("dv360-mcp"),
  otelExporterOtlpTracesEndpoint: z.string().optional(),
  otelExporterOtlpMetricsEndpoint: z.string().optional(),

  // DV360 API
  dv360ApiBaseUrl: z.string().url().default("https://displayvideo.googleapis.com/v4"),
  dv360ServiceAccountJson: z.string(),
  dv360RateLimitPerMinute: z.number().default(60),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const config = ConfigSchema.parse({
    serviceName: process.env.SERVICE_NAME,
    port: process.env.DV360_MCP_PORT ? Number(process.env.DV360_MCP_PORT) : undefined,
    host: process.env.DV360_MCP_HOST,
    nodeEnv: process.env.NODE_ENV,
    mcpAuthMode: process.env.MCP_AUTH_MODE,
    mcpAuthSecretKey: process.env.MCP_AUTH_SECRET_KEY,
    mcpSessionMode: process.env.MCP_SESSION_MODE,
    mcpStatefulSessionTimeoutMs: process.env.MCP_STATEFUL_SESSION_TIMEOUT_MS
      ? Number(process.env.MCP_STATEFUL_SESSION_TIMEOUT_MS)
      : undefined,
    mcpAllowedOrigins: process.env.MCP_ALLOWED_ORIGINS,
    mcpLogLevel: process.env.MCP_LOG_LEVEL,
    otelEnabled: process.env.OTEL_ENABLED === "true",
    otelServiceName: process.env.OTEL_SERVICE_NAME,
    otelExporterOtlpTracesEndpoint: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    otelExporterOtlpMetricsEndpoint: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
    dv360ApiBaseUrl: process.env.DV360_API_BASE_URL,
    dv360ServiceAccountJson: process.env.DV360_SERVICE_ACCOUNT_JSON,
    dv360RateLimitPerMinute: process.env.DV360_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.DV360_RATE_LIMIT_PER_MINUTE)
      : undefined,
  });

  // Validation: JWT mode requires secret key
  if (config.mcpAuthMode === "jwt" && !config.mcpAuthSecretKey) {
    throw new Error("MCP_AUTH_SECRET_KEY is required when MCP_AUTH_MODE=jwt");
  }

  return config;
}
```

#### 7.1 Integration with bidshifter-mcp

```typescript
// bidshifter-mcp orchestrates dv360-mcp tools
async function optimizeCampaignBids(campaignId: string) {
  // 1. Call dv360-mcp to fetch entities
  const entities = await mcpClient.callTool("fetch_campaign_entities", {
    campaignId,
    platform: "dv360",
  });

  // 2. Analyze entities (bidshifter-mcp logic)
  const recommendations = calculateBidAdjustments(entities);

  // 3. Apply adjustments via dv360-mcp
  for (const rec of recommendations) {
    await mcpClient.callTool("update_line_item_bid", {
      lineItemId: rec.lineItemId,
      advertiserId: rec.advertiserId,
      newBid: rec.newBidMicros,
      reason: rec.reason,
    });
  }
}
```

#### 7.2 Integration with DV360 API

```typescript
// src/services/dv360/auth.ts
export async function authenticateServiceAccount(
  serviceAccountJson: string,
  context: RequestContext
): Promise<{ accessToken: string; expiresAt: Date }> {
  const credentials = JSON.parse(Buffer.from(serviceAccountJson, "base64").toString());

  // Create JWT assertion
  const jwtHeader = { alg: "RS256", typ: "JWT" };
  const jwtPayload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/display-video",
    aud: "https://oauth2.googleapis.com/token",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };

  // Sign with private key
  const assertion = jwt.sign(jwtPayload, credentials.private_key, {
    algorithm: "RS256",
    header: jwtHeader,
  });

  // Exchange for access token
  const response = await fetchWithTimeout("https://oauth2.googleapis.com/token", 5000, context, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new McpError(
      JsonRpcErrorCode.ServiceUnavailable,
      `OAuth2 token exchange failed: ${response.status}`,
      { requestId: context.requestId }
    );
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}
```

#### Unit Tests

```typescript
// Example: src/mcp-server/tools/definitions/__tests__/update-line-item-bid.test.ts
import { describe, it, expect, vi } from "vitest";
import { updateLineItemBidLogic } from "../update-line-item-bid.tool";
import { DV360Service } from "../../../../services/dv360/DV360Service";
import { McpError, JsonRpcErrorCode } from "../../../../utils/errors/McpError";

describe("updateLineItemBidLogic", () => {
  it("should update bid successfully", async () => {
    const mockService = {
      getLineItem: vi.fn().mockResolvedValue({
        lineItemId: "12345",
        bidStrategy: { fixedBid: { bidAmountMicros: 3000000 } },
      }),
      updateLineItemBid: vi.fn().mockResolvedValue({
        lineItemId: "12345",
        bidStrategy: { fixedBid: { bidAmountMicros: 5000000 } },
      }),
    };

    container.register(DV360Service, { useValue: mockService });

    const result = await updateLineItemBidLogic(
      { lineItemId: "12345", advertiserId: "67890", newBid: 5000000 },
      { requestId: "test-123" } as RequestContext,
      {} as SdkContext
    );

    expect(result.previousBid).toBe(3000000);
    expect(result.newBid).toBe(5000000);
    expect(mockService.updateLineItemBid).toHaveBeenCalledWith(
      "67890",
      "12345",
      5000000,
      undefined,
      expect.anything()
    );
  });

  it("should throw McpError when line item not found", async () => {
    const mockService = {
      getLineItem: vi
        .fn()
        .mockRejectedValue(new McpError(JsonRpcErrorCode.NotFound, "Line item not found")),
    };

    container.register(DV360Service, { useValue: mockService });

    await expect(
      updateLineItemBidLogic(
        { lineItemId: "99999", advertiserId: "67890", newBid: 5000000 },
        { requestId: "test-123" } as RequestContext,
        {} as SdkContext
      )
    ).rejects.toThrow(McpError);
  });
});
```

#### Integration Tests

```typescript
// Example: tests/integration/http-transport.test.ts
import { describe, it, expect } from "vitest";
import { createHttpApp } from "../../src/mcp-server/transports/http/httpTransport";

describe("HTTP Transport", () => {
  it("should return 401 for missing JWT", async () => {
    const app = createHttpApp(mcpServer, {} as RequestContext);
    const response = await app.request("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "tools/list" }),
    });

    expect(response.status).toBe(401);
  });

  it("should execute tool with valid JWT", async () => {
    const jwt = generateTestJwt({ scopes: ["dv360:read"] });
    const app = createHttpApp(mcpServer, {} as RequestContext);

    const response = await app.request("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "fetch_campaign_entities",
          arguments: { campaignId: "12345", platform: "dv360" },
        },
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result).toBeDefined();
  });
});
```

#### Contract Tests (Schema Validation)

```typescript
// Example: tests/contract/dv360-api-schemas.test.ts
import { describe, it, expect } from "vitest";
import { schemas } from "../../src/generated/schemas/zod";
import sampleLineItemResponse from "./fixtures/line-item-response.json";

describe("DV360 API Schema Contracts", () => {
  it("should validate line item response from API", () => {
    const result = schemas.LineItemSchema.safeParse(sampleLineItemResponse);
    expect(result.success).toBe(true);
  });

  it("should reject invalid line item response", () => {
    const invalid = { ...sampleLineItemResponse, lineItemId: 123 }; // Should be string
    const result = schemas.LineItemSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
```
