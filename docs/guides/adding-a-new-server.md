# Adding a New MCP Server

Step-by-step guide for adding a new ad platform MCP server to this monorepo. Uses `{platform}` placeholders throughout — replace with your platform name (e.g., `reddit`, `spotify`). The canonical reference implementation is **pinterest-mcp**; secondary reference is **snapchat-mcp**.

> **Prerequisite reading:** Skim `packages/pinterest-mcp/src/` to see the complete pattern in action before starting.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Step 0: Planning](#step-0-planning)
- [Step 1: Scaffold the Package](#step-1-scaffold-the-package)
- [Step 2: Configuration](#step-2-configuration)
- [Step 3: Authentication](#step-3-authentication)
- [Step 4: HTTP Client](#step-4-http-client)
- [Step 5: Platform Service](#step-5-platform-service)
- [Step 6: Session Services](#step-6-session-services)
- [Step 7: Entity Mapping](#step-7-entity-mapping)
- [Step 8: Session Resolution](#step-8-session-resolution)
- [Step 9: Tool Definitions](#step-9-tool-definitions)
- [Step 10: Resources](#step-10-resources)
- [Step 11: Prompts](#step-11-prompts)
- [Step 12: MCP Server Setup](#step-12-mcp-server-setup)
- [Step 13: HTTP Transport](#step-13-http-transport)
- [Step 14: Entry Point](#step-14-entry-point)
- [Step 15: Types](#step-15-types)
- [Step 16: Utilities](#step-16-utilities)
- [Step 17: Tests](#step-17-tests)
- [Step 18: Package Metadata](#step-18-package-metadata)
- [Step 19: Monorepo Integration](#step-19-monorepo-integration)
- [Step 20: Verification Checklist](#step-20-verification-checklist)
- [Quick Reference: File Creation Order](#quick-reference-file-creation-order)
- [Appendix A: Auth Pattern Reference](#appendix-a-auth-pattern-reference)
- [Appendix B: Cross-Server Contract Summary](#appendix-b-cross-server-contract-summary)

---

## Overview

Each MCP server in this repo is a standalone Node.js service that exposes tools, resources, and prompts via the [Model Context Protocol](https://modelcontextprotocol.io/). An AI agent (Claude Desktop, etc.) connects to the server and uses these tools to manage ad campaigns on the platform's API.

**What a server does:**

1. Authenticates requests using platform-specific credentials
2. Maps MCP tool calls to platform API operations (CRUD, reporting, bulk)
3. Returns structured results that AI agents can reason about

**Architecture layers (bottom-up):**

```
Entry Point → Transport (HTTP/stdio) → MCP Server → Tools → Services → HTTP Client → Platform API
```

Every server follows the same layered pattern. The shared package (`@cesteral/shared`) provides the glue: auth base classes, tool registration factory, session management, retry logic, telemetry, and bootstrap orchestration.

## Prerequisites

- **Node.js** 20+ and **pnpm** 9+
- Familiarity with **TypeScript**, **Zod**, and REST APIs
- Platform API credentials (developer account, API keys/tokens)
- Read the platform's API documentation to understand:
  - Authentication method (OAuth2, API key, bearer token)
  - Entity hierarchy (campaigns > ad groups > ads, etc.)
  - Rate limits and pagination style
  - Base URL and API version

## Step 0: Planning

Before writing code, decide three things:

### 1. Choose a prefix

The prefix appears in every tool name: `{prefix}_list_entities`, `{prefix}_get_entity`, etc.

Rules:
- Lowercase, no hyphens (underscores OK for multi-word like `amazon_dsp`)
- Must be unique across all servers (check `docs/CROSS_SERVER_CONTRACT.md`)
- Match the platform's common abbreviation

### 2. Allocate a port

Ports are assigned sequentially. Current allocation:

| Port | Server |
|------|--------|
| 3001 | dbm-mcp |
| 3002 | dv360-mcp |
| 3003 | ttd-mcp |
| 3004 | gads-mcp |
| 3005 | meta-mcp |
| 3006 | linkedin-mcp |
| 3007 | tiktok-mcp |
| 3008 | cm360-mcp |
| 3009 | snapchat-mcp |
| 3010 | sa360-mcp |
| 3011 | pinterest-mcp |
| 3012 | amazon-dsp-mcp |
| 3013 | msads-mcp |
| **3014** | **Next available** |

### 3. Identify entity types

List the platform's manageable entity types. Most platforms have:

- `campaign` — top-level spending container
- `adGroup` — targeting/bidding unit within a campaign
- `ad` — individual creative placement
- `creative` — media asset (image, video, etc.)

Some platforms add platform-specific types (e.g., `siteList`, `conversionTracker`). Map platform terminology to these standard names where possible (e.g., Snapchat "Ad Squads" → `adGroup`).

## Step 1: Scaffold the Package

Create the directory structure under `packages/{platform}-mcp/`:

```
packages/{platform}-mcp/
├── src/
│   ├── index.ts                              # Entry point
│   ├── config/
│   │   └── index.ts                          # Zod config schema + parseConfig()
│   ├── auth/
│   │   ├── {platform}-auth-adapter.ts        # Token adapter(s)
│   │   ├── {platform}-auth-strategy.ts       # Auth strategy for HTTP mode
│   │   └── index.ts                          # Barrel export
│   ├── services/
│   │   ├── session-services.ts               # SessionServiceStore setup
│   │   └── {platform}/
│   │       ├── {platform}-http-client.ts     # Authenticated HTTP client
│   │       ├── {platform}-service.ts         # CRUD business logic
│   │       └── {platform}-reporting-service.ts  # Async reporting (if applicable)
│   ├── mcp-server/
│   │   ├── server.ts                         # McpServer creation + registration
│   │   ├── transports/
│   │   │   └── streamable-http-transport.ts  # HTTP transport factory
│   │   ├── tools/
│   │   │   ├── definitions/
│   │   │   │   ├── list-entities.tool.ts     # One file per tool
│   │   │   │   ├── get-entity.tool.ts
│   │   │   │   ├── ...                       # (all tool files)
│   │   │   │   └── index.ts                  # Barrel: exports allTools array
│   │   │   ├── utils/
│   │   │   │   ├── entity-mapping.ts         # Entity type configs
│   │   │   │   └── resolve-session.ts        # Session resolver wrapper
│   │   │   └── index.ts                      # Re-exports allTools
│   │   ├── resources/
│   │   │   ├── types.ts                      # Resource type definitions
│   │   │   ├── definitions/
│   │   │   │   ├── entity-schemas.resource.ts
│   │   │   │   ├── entity-examples.resource.ts
│   │   │   │   ├── entity-hierarchy.resource.ts
│   │   │   │   └── index.ts                  # Barrel
│   │   │   └── index.ts                      # Re-exports allResources
│   │   └── prompts/
│   │       ├── definitions/
│   │       │   ├── campaign-setup-workflow.prompt.ts
│   │       │   └── ...
│   │       └── index.ts                      # promptRegistry Map
│   ├── types-global/
│   │   └── mcp.ts                            # Re-exported shared types
│   └── utils/
│       ├── security/
│       │   └── rate-limiter.ts               # Platform rate limiter singleton
│       ├── telemetry/
│       │   ├── index.ts                      # Re-exports
│       │   └── tracing.ts                    # Platform-specific span helpers
│       └── errors/
│           └── index.ts                      # Re-exports from shared
├── tests/                                    # Test files
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

> **Reference:** `packages/pinterest-mcp/` for the complete directory structure.

## Step 2: Configuration

Create `src/config/index.ts` with a Zod schema extending `BaseConfigSchema`.

```typescript
import { z } from "zod";
import {
  loadDotEnv,
  BaseConfigSchema,
  getBaseEnvConfig,
  parseConfigWithSchema,
  getDefaultHost,
} from "@cesteral/shared";

loadDotEnv();

const ConfigSchema = BaseConfigSchema.extend({
  // Server identity
  serviceName: z.string().default("{platform}-mcp"),
  port: z.number().int().min(1).max(65535).default(3014), // your allocated port
  otelServiceName: z.string().default("{platform}-mcp"),

  // Auth mode — platform-specific + shared modes
  mcpAuthMode: z.enum(["{platform}-bearer", "jwt", "none"]).default("{platform}-bearer"),

  // Platform API configuration
  {platform}ApiBaseUrl: z.string().url().default("https://api.{platform}.com"),
  {platform}ApiVersion: z.string().default("v1"),
  {platform}RateLimitPerMinute: z.number().default(10),

  // Stdio credentials (env var fallback)
  {platform}AccessToken: z.string().optional(),
  {platform}AccountId: z.string().optional(),

  // Reporting poll config (if platform has async reports)
  {platform}ReportPollIntervalMs: z.number().default(2_000),
  {platform}ReportMaxPollAttempts: z.number().default(30),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();

  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),
    serviceName: process.env.SERVICE_NAME,
    port: process.env.{PLATFORM}_MCP_PORT ? Number(process.env.{PLATFORM}_MCP_PORT) : undefined,
    host: process.env.{PLATFORM}_MCP_HOST || defaultHost,
    {platform}ApiBaseUrl: process.env.{PLATFORM}_API_BASE_URL,
    {platform}ApiVersion: process.env.{PLATFORM}_API_VERSION,
    {platform}RateLimitPerMinute: process.env.{PLATFORM}_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.{PLATFORM}_RATE_LIMIT_PER_MINUTE) : undefined,
    {platform}AccessToken: process.env.{PLATFORM}_ACCESS_TOKEN,
    {platform}AccountId: process.env.{PLATFORM}_ACCOUNT_ID,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();
```

**Key points:**

- `BaseConfigSchema` provides common fields: `host`, `logLevel`, `mcpAuthSecretKey`, OTEL config, etc.
- `getBaseEnvConfig()` reads the standard env vars (`LOG_LEVEL`, `OTEL_*`, `MCP_AUTH_SECRET_KEY`)
- Every platform field uses a `{PLATFORM}_` env var prefix (uppercase)
- Rate limit defaults should be conservative: `platform_quota / max_instances`

> **Reference:** `packages/pinterest-mcp/src/config/index.ts`

## Step 3: Authentication

Authentication has two components: **adapters** (hold credentials, provide tokens) and **strategies** (verify incoming HTTP requests).

### 3a. Auth Adapter

Create `src/auth/{platform}-auth-adapter.ts`. The adapter interface is simple:

```typescript
export interface {Platform}AuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly userId: string;
  readonly accountId: string;  // platform's account identifier
}
```

Implement at least one adapter class:

**Static token adapter** — for development and stdio mode:

```typescript
export class {Platform}AccessTokenAdapter implements {Platform}AuthAdapter {
  private validated = false;
  private _userId = "";

  constructor(
    private readonly accessToken: string,
    private readonly _accountId: string,
    private readonly baseUrl: string
  ) {}

  get userId(): string { return this._userId; }
  get accountId(): string { return this._accountId; }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }

  async validate(): Promise<void> {
    if (this.validated) return;
    // Call a lightweight endpoint to verify the token works
    // e.g., GET /v1/me or GET /v1/user
    const response = await fetchWithTimeout(`${this.baseUrl}/v1/me`, 10_000, undefined, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Token validation failed: ${response.status}`);
    }
    const data = await response.json();
    this._userId = data.username ?? "unknown";
    this.validated = true;
  }
}
```

**Refresh token adapter** (optional, recommended for production) — same interface but auto-refreshes tokens using OAuth2 `refresh_token` grant. See `PinterestRefreshTokenAdapter` for the mutex + caching pattern.

Also add helper functions for extracting credentials from HTTP headers:

```typescript
import { createHash } from "crypto";
import { extractHeader } from "@cesteral/shared";

export function parse{Platform}TokenFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const authHeader = extractHeader(headers, "authorization");
  if (!authHeader) throw new Error("Missing Authorization header");
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new Error("Authorization header must use Bearer scheme");
  return match[1];
}

export function get{Platform}AccountIdFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const id = extractHeader(headers, "x-{platform}-account-id");
  if (!id) throw new Error("Missing X-{Platform}-Account-Id header");
  return id;
}

export function get{Platform}CredentialFingerprint(token: string, accountId: string): string {
  return createHash("sha256")
    .update(`${token.trim()}:${accountId.trim()}`)
    .digest("hex")
    .substring(0, 32);
}
```

> **Reference:** `packages/pinterest-mcp/src/auth/pinterest-auth-adapter.ts`

### 3b. Auth Strategy

Create `src/auth/{platform}-auth-strategy.ts`. Extend `BearerAuthStrategyBase` from shared:

```typescript
import type { Logger } from "pino";
import { BearerAuthStrategyBase, type BearerAdapterResult } from "@cesteral/shared";
import {
  {Platform}AccessTokenAdapter,
  parse{Platform}TokenFromHeaders,
  get{Platform}AccountIdFromHeaders,
  get{Platform}CredentialFingerprint,
} from "./{platform}-auth-adapter.js";

export class {Platform}BearerAuthStrategy extends BearerAuthStrategyBase {
  protected readonly authType = "{platform}-bearer";
  protected readonly platformName = "{Platform}";

  constructor(private readonly baseUrl: string, logger?: Logger) {
    super(logger);
  }

  protected async resolveRefreshBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult | null> {
    // Return null if this platform doesn't support refresh flow,
    // or parse refresh credentials from headers and return adapter
    return null;
  }

  protected async resolveAccessBranch(
    headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult> {
    const token = parse{Platform}TokenFromHeaders(headers);
    const accountId = get{Platform}AccountIdFromHeaders(headers);
    const adapter = new {Platform}AccessTokenAdapter(token, accountId, this.baseUrl);
    await adapter.validate();

    return {
      adapter,
      fingerprint: get{Platform}CredentialFingerprint(token, accountId),
      userId: adapter.userId,
      authFlow: "static-token",
      logContext: { accountId },
    };
  }

  protected getRefreshFingerprint(): string | undefined { return undefined; }

  protected getTokenFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string {
    const token = parse{Platform}TokenFromHeaders(headers);
    const accountId = get{Platform}AccountIdFromHeaders(headers);
    return get{Platform}CredentialFingerprint(token, accountId);
  }
}
```

`BearerAuthStrategyBase` handles the shared control flow: it tries `resolveRefreshBranch()` first (for production OAuth2 refresh), falls back to `resolveAccessBranch()` (static token). The fingerprint methods enable credential-bound session reuse.

Create `src/auth/index.ts`:

```typescript
export * from "./{platform}-auth-adapter.js";
export * from "./{platform}-auth-strategy.js";
```

> **Reference:** `packages/pinterest-mcp/src/auth/pinterest-auth-strategy.ts`

## Step 4: HTTP Client

Create `src/services/{platform}/{platform}-http-client.ts`. This wraps `fetch` with authentication, retry, and telemetry.

```typescript
import type { Logger } from "pino";
import type { {Platform}AuthAdapter } from "../../auth/{platform}-auth-adapter.js";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { fetchWithTimeout, executeWithRetry } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { with{Platform}ApiSpan } from "../../utils/telemetry/tracing.js";

const RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "{Platform}",
  tokenExpiryHint: "{Platform} token expired. Regenerate at developers.{platform}.com.",
};

export class {Platform}HttpClient {
  constructor(
    private readonly authAdapter: {Platform}AuthAdapter,
    private readonly accountId: string,
    private readonly baseUrl: string,
    private readonly logger: Logger,
    private readonly apiVersion: string = "v1"
  ) {}

  get account(): string { return this.accountId; }

  async get(path: string, params?: Record<string, string>, context?: RequestContext): Promise<unknown> {
    return this.executeRequest(this.buildUrl(path, params), context, { method: "GET" });
  }

  async post(path: string, data?: unknown, context?: RequestContext): Promise<unknown> {
    return this.executeRequest(this.buildUrl(path), context, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data ?? {}),
    });
  }

  async patch(path: string, data?: unknown, context?: RequestContext): Promise<unknown> {
    return this.executeRequest(this.buildUrl(path), context, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data ?? {}),
    });
  }

  async delete(path: string, params?: Record<string, string>, context?: RequestContext): Promise<unknown> {
    return this.executeRequest(this.buildUrl(path, params), context, { method: "DELETE" });
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  private async executeRequest(url: string, context?: RequestContext, options?: RequestInit): Promise<unknown> {
    const method = options?.method || "GET";
    return with{Platform}ApiSpan(`api.${method}`, url, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      return executeWithRetry(RETRY_CONFIG, {
        url,
        fetchOptions: options,
        context,
        logger: this.logger,
        fetchFn: fetchWithTimeout,
        getHeaders: async () => {
          const accessToken = await this.authAdapter.getAccessToken();
          return {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          };
        },
      });
    });
  }
}
```

**Key points:**

- `executeWithRetry()` handles 429/5xx with exponential backoff and `Retry-After` header support
- `getHeaders` is called on each attempt (not just the first) so token refresh works across retries
- Telemetry spans wrap each API call for observability
- Add `postMultipart()` if the platform supports image/video upload

> **Reference:** `packages/pinterest-mcp/src/services/pinterest/pinterest-http-client.ts`

## Step 5: Platform Service

Create `src/services/{platform}/{platform}-service.ts`. This contains the business logic for CRUD operations.

```typescript
import type { Logger } from "pino";
import type { RateLimiter } from "../../utils/security/rate-limiter.js";
import type { {Platform}HttpClient } from "./{platform}-http-client.js";
import type { RequestContext } from "@cesteral/shared";
import { getEntityConfig, interpolatePath, type {Platform}EntityType } from "../../mcp-server/tools/utils/entity-mapping.js";

export class {Platform}Service {
  constructor(
    private readonly rateLimiter: RateLimiter,
    private readonly httpClient: {Platform}HttpClient,
    private readonly logger: Logger
  ) {}

  async listEntities(
    entityType: {Platform}EntityType,
    filters: { accountId: string; [key: string]: string | undefined },
    cursor?: string,
    pageSize?: number,
    context?: RequestContext
  ) {
    const config = getEntityConfig(entityType);
    const path = interpolatePath(config.listPath, { accountId: filters.accountId });
    await this.rateLimiter.consume(`{platform}:${filters.accountId}`);
    const result = await this.httpClient.get(path, { /* pagination params */ }, context);
    return result;
  }

  // getEntity(), createEntity(), updateEntity(), deleteEntity()...
  // bulkUpdateStatus(), adjustBids()...
}
```

If the platform supports async reporting, also create `{platform}-reporting-service.ts` with submit/poll/download methods.

> **Reference:** `packages/pinterest-mcp/src/services/pinterest/pinterest-service.ts`

## Step 6: Session Services

Create `src/services/session-services.ts`. This wires up per-session service instances.

```typescript
import type { Logger } from "pino";
import type { {Platform}AuthAdapter } from "../auth/{platform}-auth-adapter.js";
import type { RateLimiter } from "../utils/security/rate-limiter.js";
import { SessionServiceStore } from "@cesteral/shared";
export { SessionServiceStore } from "@cesteral/shared";
import { {Platform}HttpClient } from "./{platform}/{platform}-http-client.js";
import { {Platform}Service } from "./{platform}/{platform}-service.js";

export interface SessionServices {
  {platform}Service: {Platform}Service;
  // Add reporting service if applicable
}

export interface {Platform}SessionConfig {
  baseUrl: string;
  apiVersion: string;
  // Add reporting config fields if applicable
}

export function createSessionServices(
  authAdapter: {Platform}AuthAdapter,
  config: {Platform}SessionConfig,
  logger: Logger,
  rateLimiter: RateLimiter
): SessionServices {
  const httpClient = new {Platform}HttpClient(
    authAdapter,
    authAdapter.accountId,
    config.baseUrl,
    logger,
    config.apiVersion
  );
  const {platform}Service = new {Platform}Service(rateLimiter, httpClient, logger);

  return { {platform}Service };
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();
```

**Key points:**

- `SessionServiceStore<T>` is a generic typed Map with credential fingerprint binding and max session cap
- `createSessionServices()` is called from two places: stdio setup (entry point) and HTTP session creation (transport)
- The `sessionServiceStore` singleton is imported by both the transport layer and tool resolution

> **Reference:** `packages/pinterest-mcp/src/services/session-services.ts`

## Step 7: Entity Mapping

Create `src/mcp-server/tools/utils/entity-mapping.ts`. This is the central registry of entity types and their API paths.

```typescript
export type {Platform}EntityType = "campaign" | "adGroup" | "ad" | "creative";

export interface {Platform}EntityConfig {
  listPath: string;
  createPath: string;
  updatePath: string;
  statusUpdatePath: string;
  deletePath: string;
  idField: string;
  deleteIdsParam: string;
  displayName: string;
  defaultFields: string[];
  supportsDuplicate?: boolean;
}

const ENTITY_CONFIGS: Record<{Platform}EntityType, {Platform}EntityConfig> = {
  campaign: {
    listPath: "/v1/accounts/{accountId}/campaigns",
    createPath: "/v1/accounts/{accountId}/campaigns",
    updatePath: "/v1/accounts/{accountId}/campaigns",
    statusUpdatePath: "/v1/accounts/{accountId}/campaigns",
    deletePath: "/v1/accounts/{accountId}/campaigns",
    idField: "id",
    deleteIdsParam: "campaign_ids",
    displayName: "Campaign",
    defaultFields: ["id", "name", "status", "created_time"],
    supportsDuplicate: true,
  },
  // ... adGroup, ad, creative
};

export function interpolatePath(path: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (acc, [key, val]) => acc.replace(`{${key}}`, val),
    path
  );
}

export function getEntityConfig(entityType: {Platform}EntityType): {Platform}EntityConfig {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) throw new Error(`Unknown entity type: ${entityType}`);
  return config;
}

export function getSupportedEntityTypes(): {Platform}EntityType[] {
  return Object.keys(ENTITY_CONFIGS) as {Platform}EntityType[];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  return getSupportedEntityTypes() as [string, ...string[]];
}
```

**Key points:**

- Path templates use `{accountId}` and `{entityId}` placeholders, substituted at runtime via `interpolatePath()`
- `getEntityTypeEnum()` returns a tuple compatible with `z.enum()` (Zod requires at least one element)
- `defaultFields` drives which fields are included in list responses
- Add entity types incrementally — start with the core four, add platform-specific types later

> **Reference:** `packages/pinterest-mcp/src/mcp-server/tools/utils/entity-mapping.ts`

## Step 8: Session Resolution

Create `src/mcp-server/tools/utils/resolve-session.ts`. This is a thin wrapper:

```typescript
import { resolveSessionServicesFromStore } from "@cesteral/shared";
import { sessionServiceStore, type SessionServices } from "../../../services/session-services.js";
import type { SdkContext } from "../../../types-global/mcp.js";

export function resolveSessionServices(sdkContext?: SdkContext): SessionServices {
  return resolveSessionServicesFromStore(sessionServiceStore, sdkContext);
}
```

Every tool handler calls `resolveSessionServices(sdkContext)` to get the authenticated services for the current session. The shared `resolveSessionServicesFromStore()` extracts the session ID from `sdkContext` and looks it up in the store, throwing a descriptive `McpError` if not found.

> **Reference:** `packages/pinterest-mcp/src/mcp-server/tools/utils/resolve-session.ts`

## Step 9: Tool Definitions

This is the core of the server. Each tool is a single file in `src/mcp-server/tools/definitions/`.

### Tool anatomy

Every tool file exports these things:

```typescript
import { z } from "zod";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { getEntityTypeEnum, type {Platform}EntityType } from "../utils/entity-mapping.js";
import type { RequestContext, McpTextContent } from "@cesteral/shared";
import type { SdkContext } from "../../../types-global/mcp.js";

// 1. Tool metadata constants
const TOOL_NAME = "{prefix}_list_entities";
const TOOL_TITLE = "List {Platform} Entities";
const TOOL_DESCRIPTION = `List {Platform} entities with filtering and pagination.
Supported entity types: ${getEntityTypeEnum().join(", ")}`;

// 2. Input schema (Zod)
export const ListEntitiesInputSchema = z.object({
  entityType: z.enum(getEntityTypeEnum()).describe("Type of entity to list"),
  accountId: z.string().min(1).describe("{Platform} account ID"),
  pageSize: z.number().int().min(1).max(100).optional().default(25)
    .describe("Results per page"),
}).describe("Parameters for listing entities");

// 3. Output schema (Zod)
export const ListEntitiesOutputSchema = z.object({
  entities: z.array(z.record(z.any())),
  has_more: z.boolean(),
  timestamp: z.string().datetime(),
}).describe("Entity list result");

type ListEntitiesInput = z.infer<typeof ListEntitiesInputSchema>;
type ListEntitiesOutput = z.infer<typeof ListEntitiesOutputSchema>;

// 4. Logic function
export async function listEntitiesLogic(
  input: ListEntitiesInput,
  context: RequestContext,
  sdkContext?: SdkContext
): Promise<ListEntitiesOutput> {
  const { {platform}Service } = resolveSessionServices(sdkContext);
  const result = await {platform}Service.listEntities(
    input.entityType as {Platform}EntityType,
    { accountId: input.accountId },
    undefined, // cursor
    input.pageSize,
    context
  );
  return {
    entities: result.entities as Record<string, unknown>[],
    // Derive has_more from cursor presence (platform-specific — adapt to your API's pagination)
    has_more: result.pageInfo.bookmark != null,
    timestamp: new Date().toISOString(),
  };
}

// 5. Response formatter
export function listEntitiesResponseFormatter(result: ListEntitiesOutput): McpTextContent[] {
  return [{
    type: "text" as const,
    text: `Found ${result.entities.length} entities\n\n${JSON.stringify(result.entities, null, 2)}`,
  }];
}

// 6. Tool definition object (what gets registered)
export const listEntitiesTool = {
  name: TOOL_NAME,
  title: TOOL_TITLE,
  description: TOOL_DESCRIPTION,
  inputSchema: ListEntitiesInputSchema,
  outputSchema: ListEntitiesOutputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputExamples: [
    {
      label: "List campaigns",
      input: { entityType: "campaign", accountId: "123456" },
    },
  ],
  logic: listEntitiesLogic,
  responseFormatter: listEntitiesResponseFormatter,
};
```

### Required tool fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | `{prefix}_{action}` pattern |
| `title` | `string` | Human-readable display name |
| `description` | `string` | Tool description (>10 chars). Embed entity types, hierarchy hints |
| `inputSchema` | `z.ZodTypeAny` | Zod schema — factory calls `.parse()` for validation |
| `outputSchema` | `z.ZodTypeAny` | Zod schema for structured return type |
| `annotations` | `object` | `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` |
| `inputExamples` | `array` | `{ label, input }` objects — embedded as markdown in description |
| `logic` | `async function` | `(input, context, sdkContext?) => Promise<Output>` |
| `responseFormatter` | `function` | `(result, input?) => McpTextContent[]` |

### Required tools (cross-server contract)

Every management server must provide these tools. See `docs/CROSS_SERVER_CONTRACT.md` for the full contract.

| Category | Tools |
|----------|-------|
| **Core CRUD** | `{prefix}_list_entities`, `_get_entity`, `_create_entity`, `_update_entity`, `_delete_entity` |
| **Account** | `{prefix}_list_accounts` or similar |
| **Bulk** | `{prefix}_bulk_update_status` |
| **Bids** | `{prefix}_adjust_bids` |
| **Validation** | `{prefix}_validate_entity` |

Additional recommended tools: reporting (5), bulk create/update (2), targeting (2), duplicate, delivery estimate, ad preview, media upload.

### Tool barrel export

Create `src/mcp-server/tools/definitions/index.ts`:

```typescript
export { listEntitiesTool } from "./list-entities.tool.js";
export { getEntityTool } from "./get-entity.tool.js";
// ... export each tool

import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
// ... import each tool
import { conformanceTools, type ToolDefinitionForFactory } from "@cesteral/shared";

const productionTools: ToolDefinitionForFactory[] = [
  // ── Core CRUD ──
  listEntitiesTool, getEntityTool, createEntityTool, updateEntityTool, deleteEntityTool,
  // ── Account ──
  listAccountsTool,
  // ── Reporting ──
  getReportTool, getReportBreakdownsTool, submitReportTool, checkReportStatusTool, downloadReportTool,
  // ── Bulk Operations ──
  bulkUpdateStatusTool, bulkCreateEntitiesTool, bulkUpdateEntitiesTool,
  // ── Bids (required by contract) ──
  adjustBidsTool,
  // ── Targeting ──
  searchTargetingTool, getTargetingOptionsTool,
  // ── Specialized ──
  duplicateEntityTool, getDeliveryEstimateTool, getAdPreviewTool,
  // ── Validation (required by contract) ──
  validateEntityTool,
  // ── Media (if platform supports upload) ──
  // uploadImageTool, uploadVideoTool,
];

export const allTools: ToolDefinitionForFactory[] = [
  ...productionTools,
  ...(process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true" ? conformanceTools : []),
];
```

Then create `src/mcp-server/tools/index.ts`:

```typescript
export { allTools } from "./definitions/index.js";
```

> **Reference:** `packages/pinterest-mcp/src/mcp-server/tools/definitions/list-entities.tool.ts`, `packages/pinterest-mcp/src/mcp-server/tools/definitions/index.ts`

## Step 10: Resources

Resources provide reference data that AI agents can read on demand (entity schemas, examples, hierarchy diagrams).

Create resource files in `src/mcp-server/resources/definitions/`:

Types in `src/mcp-server/resources/types.ts`:

```typescript
export interface Resource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  /** Function to generate the content (lazy evaluation) */
  getContent: () => string;
}
```

Create resource files in `src/mcp-server/resources/definitions/`:

```typescript
// entity-schemas.resource.ts
import type { Resource } from "../types.js";

export const entitySchemasResource: Resource = {
  uri: "{platform}://entity-schemas",
  name: "{Platform} Entity Schemas",
  description: "JSON schemas for all {Platform} entity types",
  mimeType: "application/json",
  getContent: () => JSON.stringify({ /* schema definitions */ }, null, 2),
};
```

Barrel in `src/mcp-server/resources/definitions/index.ts`. Note: the shared package provides `createToolExamplesResource()` and `createServerCapabilitiesResource()` — include these alongside your platform-specific resources:

```typescript
import { entityHierarchyResource } from "./entity-hierarchy.resource.js";
import { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
import { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
import { reportingReferenceResource } from "./reporting-reference.resource.js";
import { allTools } from "../../tools/definitions/index.js";
import {
  createToolExamplesResource,
  createServerCapabilitiesResource,
} from "@cesteral/shared";
import type { Resource } from "../types.js";

const toolExamplesResource = createToolExamplesResource(allTools, "{platform}-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "{platform}-mcp",
  toolGroups: {
    crud: ["{prefix}_list_entities", "{prefix}_get_entity", "{prefix}_create_entity", "{prefix}_update_entity", "{prefix}_delete_entity"],
    account: ["{prefix}_list_accounts"],
    reporting: ["{prefix}_get_report", "{prefix}_submit_report", /* ... */],
    bulk: ["{prefix}_bulk_update_status", "{prefix}_adjust_bids"],
    // ... additional groups
  },
  commonWorkflows: ["campaign_setup", "async_reporting"],
  startHere: "{prefix}_list_accounts",
});

export const allResources: Resource[] = [
  entityHierarchyResource,
  entitySchemaAllResource,
  ...entitySchemaResources,
  entityExampleAllResource,
  ...entityExampleResources,
  reportingReferenceResource,
  ...(toolExamplesResource ? [toolExamplesResource as unknown as Resource] : []),
  serverCapabilitiesResource as unknown as Resource,
];
```

Re-export in `src/mcp-server/resources/index.ts`:

```typescript
export type { Resource } from "./types.js";
export { allResources } from "./definitions/index.js";
```

**Resource categories to implement:**

| Resource | Description |
|----------|-------------|
| Entity hierarchy | Visual tree of entity relationships |
| Entity schemas (per-type + combined) | JSON field definitions for each entity type |
| Entity examples (per-type + combined) | Example API payloads |
| Reporting reference | Available metrics, dimensions, date ranges |
| Tool examples | Auto-generated from `inputExamples` (via shared helper) |
| Server capabilities | Tool groups and workflows (via shared helper) |

> **Reference:** `packages/pinterest-mcp/src/mcp-server/resources/`

## Step 11: Prompts

Prompts provide on-demand workflow guidance for complex multi-step operations.

Create prompt files in `src/mcp-server/prompts/definitions/`:

```typescript
// campaign-setup-workflow.prompt.ts
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";

export const campaignSetupWorkflowPrompt: Prompt = {
  name: "{prefix}_campaign_setup_workflow",
  description: "Step-by-step guide for creating a full campaign on {Platform}",
  arguments: [
    { name: "objective", description: "Campaign objective", required: false },
  ],
};

export function getCampaignSetupWorkflowMessage(args?: Record<string, string>): string {
  const objective = args?.objective ?? "awareness";
  return `## {Platform} Campaign Setup Workflow

### Step 1: Create Campaign
Use \`{prefix}_create_entity\` with entityType "campaign"...

### Step 2: Create Ad Group
...`;
}
```

Register all prompts in `src/mcp-server/prompts/index.ts`:

```typescript
import type { Prompt } from "@modelcontextprotocol/sdk/types.js";
import {
  campaignSetupWorkflowPrompt,
  getCampaignSetupWorkflowMessage,
} from "./definitions/campaign-setup-workflow.prompt.js";

export interface PromptDefinition {
  prompt: Prompt;
  generateMessage: (args?: Record<string, string>) => string;
}

export const promptRegistry: Map<string, PromptDefinition> = new Map([
  [campaignSetupWorkflowPrompt.name, {
    prompt: campaignSetupWorkflowPrompt,
    generateMessage: getCampaignSetupWorkflowMessage,
  }],
  // ... additional prompts
]);
```

**Recommended prompts:** campaign setup, bulk operations, reporting, troubleshooting, targeting discovery.

> **Reference:** `packages/pinterest-mcp/src/mcp-server/prompts/index.ts`

## Step 12: MCP Server Setup

Create `src/mcp-server/server.ts`. This creates and configures the `McpServer` instance.

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { promptRegistry } from "./prompts/index.js";
import { createOperationContext } from "@cesteral/shared";
import { sessionServiceStore } from "../services/session-services.js";
import {
  extractZodShape,
  registerToolsFromDefinitions,
  registerPromptsFromDefinitions,
  registerStaticResourcesFromDefinitions,
  InteractionLogger,
  type McpServerPromptLike,
  type PromptDefinitionForFactory,
  type PromptArgumentForFactory,
} from "@cesteral/shared";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

const PACKAGE_NAME = "{platform}-mcp";
const PLATFORM = "{platform}";

const workflowIdByToolName: Record<string, string> = {
  {prefix}_list_entities: "mcp.execute.{prefix}_entity_read",
  {prefix}_get_entity: "mcp.execute.{prefix}_entity_read",
  {prefix}_create_entity: "mcp.execute.{prefix}_entity_update",
  {prefix}_update_entity: "mcp.execute.{prefix}_entity_update",
  {prefix}_delete_entity: "mcp.execute.{prefix}_entity_update",
  // ... map all tools to workflow IDs
};

export async function createMcpServer(
  logger: Logger,
  sessionId?: string,
  gcsBucket?: string
): Promise<McpServer> {
  const server = new McpServer(
    {
      name: "{platform}-mcp",
      version: packageJson.version,
      description: "{Platform} Ads campaign management and reporting via {Platform} API.",
    },
    {
      capabilities: { logging: {} },
      instructions: "{Platform} Ads management server. Use {prefix}_list_accounts to discover accounts...",
    }
  );

  const interactionLogger = new InteractionLogger({
    serverName: PACKAGE_NAME,
    logger,
    gcsBucket,
  });

  // Register tools via shared factory
  registerToolsFromDefinitions({
    server,
    tools: allTools,
    logger,
    sessionId,
    transformSchema: (schema) => extractZodShape(schema),
    createRequestContext: (params) =>
      createOperationContext({ operation: params.operation, additionalContext: params.additionalContext }),
    defaultTextFormat: "compact",
    packageName: PACKAGE_NAME,
    platform: PLATFORM,
    workflowIdByToolName,
    interactionLogger,
    authContextResolver: sessionId
      ? () => sessionServiceStore.getAuthContext(sessionId)
      : undefined,
  });

  // Register resources
  registerStaticResourcesFromDefinitions({ server, resources: allResources, logger });

  // Register conformance fixtures (for MCP protocol compliance testing)
  // Copy this block from any existing server — it's identical across all servers.
  // See packages/pinterest-mcp/src/mcp-server/server.ts lines 112-148 for the full block.
  if (process.env.MCP_CONFORMANCE_FIXTURES === "true") {
    // ... conformance resources, resource templates, and prompts from @cesteral/shared
  }

  // Register prompts
  const allPrompts: PromptDefinitionForFactory[] = Array.from(promptRegistry.values()).map((def) => ({
    name: def.prompt.name,
    description: def.prompt.description ?? "",
    arguments: def.prompt.arguments as PromptArgumentForFactory[] | undefined,
    generateMessage: def.generateMessage,
  }));
  registerPromptsFromDefinitions({ server: server as unknown as McpServerPromptLike, prompts: allPrompts, logger });

  return server;
}

export async function runStdioServer(server: McpServer, logger: Logger): Promise<void> {
  logger.info("Starting MCP server with stdio transport");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");
}
```

**Key points:**

- `registerToolsFromDefinitions()` handles all the boilerplate: input validation, OTEL spans, error handling, response formatting, JWT scope enforcement, interaction logging
- `extractZodShape()` converts Zod schemas to JSON Schema for MCP tool registration
- `workflowIdByToolName` maps tools to workflow categories for telemetry grouping
- `InteractionLogger` persists tool execution data for debugging

> **Reference:** `packages/pinterest-mcp/src/mcp-server/server.ts`

## Step 13: HTTP Transport

Create `src/mcp-server/transports/streamable-http-transport.ts`. This is the HTTP transport factory.

```typescript
import type { Logger } from "pino";
import type { AppConfig } from "../../config/index.js";
import { createMcpServer } from "../server.js";
import {
  createMcpHttpTransport,
  startMcpHttpServer,
  createAuthStrategy,
  type AuthMode,
  type McpHttpServer,
  type TransportFactoryConfig,
} from "@cesteral/shared";
import { {Platform}BearerAuthStrategy } from "../../auth/{platform}-auth-strategy.js";
import type { {Platform}AuthAdapter } from "../../auth/{platform}-auth-adapter.js";
import { createSessionServices, sessionServiceStore } from "../../services/session-services.js";
import { rateLimiter } from "../../utils/security/rate-limiter.js";

function buildPlatformConfig(config: AppConfig, logger: Logger): TransportFactoryConfig {
  return {
    authStrategy:
      config.mcpAuthMode === "{platform}-bearer"
        ? new {Platform}BearerAuthStrategy(config.{platform}ApiBaseUrl, logger)
        : createAuthStrategy(config.mcpAuthMode as AuthMode, {
            jwtSecret: config.mcpAuthSecretKey,
            logger,
          }),
    // IMPORTANT: CORS headers must exactly match the header names your auth adapter reads.
    // For example, if your adapter reads "x-{platform}-advertiser-id", list "X-{Platform}-Advertiser-Id" here.
    corsAllowHeaders: [
      "Content-Type",
      "Authorization",
      "Mcp-Session-Id",
      "MCP-Protocol-Version",
      "X-{Platform}-Account-Id",
      // Add refresh token headers if applicable:
      // "X-{Platform}-App-Id", "X-{Platform}-App-Secret", "X-{Platform}-Refresh-Token",
    ],
    authErrorHint:
      config.mcpAuthMode === "{platform}-bearer"
        ? "Provide a {Platform} access token via Authorization: Bearer <token> and account ID via X-{Platform}-Account-Id."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    async createSessionForAuth(authResult, sessionId, appConfig, log) {
      const adapter = authResult.platformAuthAdapter as {Platform}AuthAdapter | undefined;
      if (adapter) {
        const cfg = appConfig as AppConfig;
        const services = createSessionServices(
          adapter,
          {
            baseUrl: cfg.{platform}ApiBaseUrl,
            apiVersion: cfg.{platform}ApiVersion,
            // Include reporting config if your SessionConfig interface requires it:
            // reportPollIntervalMs: cfg.{platform}ReportPollIntervalMs,
            // reportMaxPollAttempts: cfg.{platform}ReportMaxPollAttempts,
          },
          log,
          rateLimiter
        );
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
        return { services };
      }

      // Fallback for none/jwt modes: use env var credentials
      const cfg = appConfig as AppConfig;
      if (cfg.{platform}AccessToken && cfg.{platform}AccountId) {
        const { {Platform}AccessTokenAdapter } = await import("../../auth/{platform}-auth-adapter.js");
        const envAdapter = new {Platform}AccessTokenAdapter(
          cfg.{platform}AccessToken,
          cfg.{platform}AccountId,
          cfg.{platform}ApiBaseUrl
        );
        await envAdapter.validate();
        const services = createSessionServices(
          envAdapter,
          {
            baseUrl: cfg.{platform}ApiBaseUrl,
            apiVersion: cfg.{platform}ApiVersion,
          },
          log,
          rateLimiter
        );
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
        return { services };
      }

      return {
        services: null,
        error: { message: "{Platform} credentials required.", status: 400 as const },
      };
    },
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    platformDisplayName: "{Platform}",
  };
}

export function createMcpHttpServer(
  config: AppConfig,
  logger: Logger
): { app: ReturnType<typeof createMcpHttpTransport>["app"]; shutdown: () => Promise<void> } {
  return createMcpHttpTransport(config, logger, buildPlatformConfig(config, logger));
}

export async function startHttpServer(config: AppConfig, logger: Logger): Promise<McpHttpServer> {
  return startMcpHttpServer(config, logger, buildPlatformConfig(config, logger));
}
```

**Key points:**

- `buildPlatformConfig()` returns the platform-specific configuration for the shared transport factory
- `createSessionForAuth()` is the callback that creates session services when a new session connects
- CORS headers must include all platform-specific headers that clients will send
- The `createAuthStrategy()` helper handles `jwt` and `none` modes generically

> **Reference:** `packages/pinterest-mcp/src/mcp-server/transports/streamable-http-transport.ts`

## Step 14: Entry Point

Create `src/index.ts`. This is the complete entry point:

```typescript
import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import { initializeOpenTelemetry, otelLogMixin } from "./utils/telemetry/index.js";
import { {Platform}AccessTokenAdapter } from "./auth/{platform}-auth-adapter.js";
import {
  detectTransportMode,
  createServerLogger,
  bootstrapMcpServer,
} from "@cesteral/shared";
import { createSessionServices, sessionServiceStore } from "./services/session-services.js";
import { rateLimiter } from "./utils/security/rate-limiter.js";

const transportMode = detectTransportMode();
const logger = createServerLogger("{platform}-mcp", transportMode, otelLogMixin());

async function setupStdioCredentials(sessionId: string): Promise<boolean> {
  const accessToken = mcpConfig.{platform}AccessToken;
  const accountId = mcpConfig.{platform}AccountId;

  if (!accessToken || !accountId) {
    logger.warn(
      "No {Platform} credentials in env vars. " +
      "Set {PLATFORM}_ACCESS_TOKEN and {PLATFORM}_ACCOUNT_ID for stdio mode."
    );
    return false;
  }

  const authAdapter = new {Platform}AccessTokenAdapter(
    accessToken, accountId, mcpConfig.{platform}ApiBaseUrl
  );
  await authAdapter.validate();

  const services = createSessionServices(
    authAdapter,
    { baseUrl: mcpConfig.{platform}ApiBaseUrl, apiVersion: mcpConfig.{platform}ApiVersion },
    logger,
    rateLimiter
  );

  sessionServiceStore.set(sessionId, services);
  logger.info("Stdio session services created successfully");
  return true;
}

bootstrapMcpServer({
  serviceName: "{platform}-mcp",
  config: mcpConfig,
  logger,
  transportMode,
  initOtel: initializeOpenTelemetry,
  setupStdioSession: setupStdioCredentials,
  createMcpServer,
  runStdio: runStdioServer,
  startHttp: startHttpServer,
  onShutdown: () => rateLimiter.destroy(),
});
```

`bootstrapMcpServer()` handles all the orchestration: OTEL initialization, transport mode detection (stdio vs HTTP), graceful shutdown with signal handlers, and session cleanup.

> **Reference:** `packages/pinterest-mcp/src/index.ts`

## Step 15: Types

Create `src/types-global/mcp.ts`:

```typescript
export type { ToolDefinition, ResourceDefinition, SdkContext } from "@cesteral/shared";
```

These re-exports keep imports clean in tool files. `SdkContext` is the MCP SDK context passed to tool handlers (contains session ID, auth info, etc.).

> **Reference:** `packages/pinterest-mcp/src/types-global/mcp.ts`

## Step 16: Utilities

### Rate Limiter

Create `src/utils/security/rate-limiter.ts`:

```typescript
export { RateLimiter } from "@cesteral/shared";
import { createPlatformRateLimiter } from "@cesteral/shared";
import { mcpConfig } from "../../config/index.js";

export const rateLimiter = createPlatformRateLimiter("{platform}", mcpConfig.{platform}RateLimitPerMinute);
```

### Telemetry

Create `src/utils/telemetry/tracing.ts`:

```typescript
export {
  initializeOpenTelemetry, shutdownOpenTelemetry, getOpenTelemetrySDK,
  isOpenTelemetryEnabled, otelLogMixin, getTracer, withSpan, withToolSpan,
  setSpanAttribute, recordSpanError, type Span,
} from "@cesteral/shared";

import { withSpan } from "@cesteral/shared";
import type { Span } from "@cesteral/shared";

export async function with{Platform}ApiSpan<T>(
  operation: string,
  entityType: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(`{platform}.${operation}`, fn, {
    "{platform}.operation": operation,
    "{platform}.entityType": entityType,
  });
}
```

Create `src/utils/telemetry/index.ts`:

```typescript
export * from "./tracing.js";
```

### Errors

Create `src/utils/errors/index.ts`:

```typescript
export {
  McpError, ErrorHandler, type ErrorContext,
  JsonRpcErrorCode, mapErrorCodeToHttpStatus,
} from "@cesteral/shared";
```

> **Reference:** `packages/pinterest-mcp/src/utils/`

## Step 17: Tests

Create tests in a `tests/` directory at the package root.

### Test categories

| Category | Example file | What to test |
|----------|-------------|--------------|
| **Unit** | `tests/entity-mapping.test.ts` | Entity config lookup, path interpolation, enum helpers |
| **Unit** | `tests/auth-adapter.test.ts` | Token parsing, fingerprint generation, header extraction |
| **Integration** | `tests/tool-registration.test.ts` | All tools register without errors, have valid schemas |
| **Integration** | `tests/session-lifecycle.test.ts` | Session create/resolve/cleanup cycle |

### Test patterns

```typescript
import { describe, it, expect } from "vitest";
import { getEntityConfig, interpolatePath } from "../src/mcp-server/tools/utils/entity-mapping.js";

describe("entity-mapping", () => {
  it("returns config for known entity type", () => {
    const config = getEntityConfig("campaign");
    expect(config.listPath).toContain("campaigns");
    expect(config.idField).toBe("id");
  });

  it("interpolates path placeholders", () => {
    const path = interpolatePath("/v1/accounts/{accountId}/campaigns", { accountId: "123" });
    expect(path).toBe("/v1/accounts/123/campaigns");
  });

  it("throws for unknown entity type", () => {
    expect(() => getEntityConfig("invalid" as any)).toThrow("Unknown");
  });
});
```

**Key rules:**

- Mock external API calls — never hit real platform APIs
- Use Vitest as the test runner
- Name test files `*.test.ts` (excluded from build via tsconfig)

### Vitest config

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

> **Reference:** `packages/pinterest-mcp/tests/` (or any server's `tests/` directory)

## Step 18: Package Metadata

### package.json

```json
{
  "name": "@cesteral/{platform}-mcp",
  "version": "1.0.0",
  "description": "{Platform} Ads MCP Server - Campaign management and reporting via {Platform} API",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/cesteral/cesteral-mcp-servers.git",
    "directory": "packages/{platform}-mcp"
  },
  "keywords": ["mcp", "model-context-protocol", "advertising", "{platform}-ads"],
  "files": ["dist/", "README.md", "LICENSE"],
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc --build",
    "clean": "rm -rf dist *.tsbuildinfo",
    "dev:http": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@cesteral/shared": "workspace:*",
    "@hono/mcp": "^0.2.3",
    "@hono/node-server": "^1.19.9",
    "@modelcontextprotocol/sdk": "^1.27.1",
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/auto-instrumentations-node": "^0.67.0",
    "@opentelemetry/exporter-metrics-otlp-http": "^0.208.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.208.0",
    "@opentelemetry/resources": "^2.2.0",
    "@opentelemetry/sdk-metrics": "^2.2.0",
    "@opentelemetry/sdk-node": "^0.208.0",
    "@opentelemetry/semantic-conventions": "^1.38.0",
    "dotenv": "^17.2.3",
    "hono": "^4.11.9",
    "pino": "^10.1.0",
    "zod": "3.25.76"
  },
  "devDependencies": {
    "@types/node": "^20.17.6",
    "tsx": "^4.20.6",
    "typescript": "^5.9.3",
    "vitest": "^1.6.0"
  }
}
```

### tsconfig.json

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "composite": true,
    "baseUrl": "./src",
    "paths": { "@/*": ["*"] }
  },
  "references": [{ "path": "../shared" }],
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"]
}
```

> **Reference:** `packages/pinterest-mcp/package.json`, `packages/pinterest-mcp/tsconfig.json`

## Step 19: Monorepo Integration

After the package code is complete, integrate it into the monorepo:

### 1. Install dependencies

```bash
pnpm install
```

pnpm workspaces will automatically detect the new package.

### 2. Update `scripts/dev-server.sh`

Add the new server name to the usage help string:

```bash
echo "Available servers: ..., {platform}-mcp"
```

### 3. Update `docs/CROSS_SERVER_CONTRACT.md`

Add a row to the Server Inventory table:

```markdown
| {platform}-mcp | `{prefix}` | Management | `accountId` |
```

### 4. Update `CLAUDE.md`

Add the server to the Server Reference table and any relevant sections.

### 5. Add a Dockerfile (if deploying to Cloud Run)

Follow the pattern in `terraform/` and existing Dockerfiles. Each server gets its own container.

### 6. Build and verify

```bash
pnpm run build       # Must complete without errors
pnpm run typecheck   # Must complete without errors
pnpm run test        # All tests pass
```

## Step 20: Verification Checklist

Run through this checklist before submitting your PR:

- [ ] `pnpm run build` succeeds
- [ ] `pnpm run typecheck` succeeds
- [ ] `pnpm run test` passes (including your new tests)
- [ ] All required tools exist (see [Appendix B](#appendix-b-cross-server-contract-summary))
- [ ] Tool names follow `{prefix}_{action}` pattern
- [ ] All tool definitions have `name`, `title`, `description`, `inputSchema`, `outputSchema`, `annotations`, `inputExamples`, `logic`
- [ ] Entity mapping covers all platform entity types
- [ ] Auth adapter validates tokens (calls a real API endpoint)
- [ ] Session services are properly created and cleaned up
- [ ] Rate limiter is configured and consumed before API calls
- [ ] HTTP client uses `executeWithRetry()` for all API calls
- [ ] `./scripts/dev-server.sh {platform}-mcp` starts the server
- [ ] `curl http://localhost:{port}/health` returns 200
- [ ] `curl -X POST http://localhost:{port}/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"ping","id":1}'` returns a response
- [ ] Cross-server contract table updated in `docs/CROSS_SERVER_CONTRACT.md`

---

## Quick Reference: File Creation Order

Create files in this order (each step depends only on previous steps):

| # | File | Depends on |
|---|------|------------|
| 1 | `package.json`, `tsconfig.json`, `vitest.config.ts` | Nothing |
| 2 | `src/config/index.ts` | Package metadata |
| 3 | `src/utils/errors/index.ts` | Nothing (re-exports from shared) |
| 4 | `src/utils/telemetry/tracing.ts`, `index.ts` | Nothing (re-exports from shared) |
| 5 | `src/utils/security/rate-limiter.ts` | Config |
| 6 | `src/types-global/mcp.ts` | Nothing |
| 7 | `src/auth/{platform}-auth-adapter.ts` | Utils |
| 8 | `src/auth/{platform}-auth-strategy.ts` | Auth adapter |
| 9 | `src/auth/index.ts` | Auth files |
| 10 | `src/services/{platform}/{platform}-http-client.ts` | Auth, utils |
| 11 | `src/services/{platform}/{platform}-service.ts` | HTTP client |
| 12 | `src/mcp-server/tools/utils/entity-mapping.ts` | Nothing |
| 13 | `src/services/session-services.ts` | Services, HTTP client |
| 14 | `src/mcp-server/tools/utils/resolve-session.ts` | Session services |
| 15 | `src/mcp-server/tools/definitions/*.tool.ts` | Entity mapping, session resolver |
| 16 | `src/mcp-server/tools/definitions/index.ts` | Tool definitions |
| 17 | `src/mcp-server/tools/index.ts` | Tool barrel |
| 18 | `src/mcp-server/resources/` | Entity mapping |
| 19 | `src/mcp-server/prompts/` | Nothing |
| 20 | `src/mcp-server/server.ts` | Tools, resources, prompts |
| 21 | `src/mcp-server/transports/streamable-http-transport.ts` | Server, auth, sessions |
| 22 | `src/index.ts` | Everything |
| 23 | `tests/` | Source code |

---

## Appendix A: Auth Pattern Reference

| Server | Auth Mode | Adapter Pattern | Headers Required (HTTP) |
|--------|-----------|----------------|------------------------|
| dv360-mcp | `google-headers` | `GoogleAuthAdapter` (shared) | Google OAuth2 headers |
| dbm-mcp | `google-headers` | `GoogleAuthAdapter` (shared) | Google OAuth2 headers |
| gads-mcp | `google-headers` | `GoogleAuthAdapter` (shared) | Google OAuth2 headers |
| cm360-mcp | `google-headers` | `GoogleAuthAdapter` (shared) | Google OAuth2 headers |
| sa360-mcp | `sa360-headers` | OAuth2 refresh token | `Authorization`, `X-SA360-Client-Id`, etc. |
| ttd-mcp | `ttd-headers` | `TtdApiTokenAuthAdapter` | `X-TTD-Partner-Id`, `X-TTD-Api-Secret` |
| meta-mcp | `meta-bearer` | `MetaAccessTokenAdapter` | `Authorization: Bearer` |
| linkedin-mcp | `linkedin-bearer` | `LinkedInAccessTokenAdapter` | `Authorization: Bearer` |
| tiktok-mcp | `tiktok-bearer` | `TikTokAccessTokenAdapter` | `Authorization: Bearer`, `X-TikTok-Advertiser-Id` |
| pinterest-mcp | `pinterest-bearer` | `PinterestAccessTokenAdapter` / `PinterestRefreshTokenAdapter` | `Authorization: Bearer`, `X-Pinterest-Ad-Account-Id` |
| snapchat-mcp | `snapchat-bearer` | `SnapchatAccessTokenAdapter` / `SnapchatRefreshTokenAdapter` | `Authorization: Bearer`, `X-Snapchat-Ad-Account-Id` |
| amazon-dsp-mcp | `amazon-dsp-bearer` | `AmazonDspAccessTokenAdapter` | `Authorization: Bearer`, `X-Amazon-DSP-Profile-Id` |
| msads-mcp | `msads-bearer` | `MsAdsAccessTokenAdapter` | `AuthenticationToken`, `DeveloperToken`, `CustomerId`, `CustomerAccountId` |

**Which pattern to use:**

- **Google platform** (DV360, DBM, GAds, CM360): Use `GoogleAuthAdapter` from shared
- **OAuth2 Bearer token**: Extend `BearerAuthStrategyBase` (most common for non-Google platforms)
- **API key/secret**: Implement `AuthStrategy` interface directly (like TTD)

## Appendix B: Cross-Server Contract Summary

Every management server must provide:

| Category | Required Tools | Notes |
|----------|---------------|-------|
| Core CRUD | `list_entities`, `get_entity`, `create_entity`, `update_entity`, `delete_entity` | `delete` may be `remove` (Google Ads) |
| Bulk | `bulk_update_status` | Batch status changes |
| Bids | `adjust_bids` | May be `adjust_line_item_bids` (DV360) |
| Validation | `validate_entity` | Client-side or server-side |

**Bulk result format** (all bulk tools must return):

```json
{
  "results": [{ "success": true, "entityId": "123" }, { "success": false, "entityId": "456", "error": "..." }],
  "successCount": 1,
  "failureCount": 1,
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

**Exceptions:** `dbm-mcp` (reporting only) and `sa360-mcp` (reporting + conversions) are exempt from CRUD requirements.

See `docs/CROSS_SERVER_CONTRACT.md` for the full specification.
