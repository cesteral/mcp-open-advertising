# Adding a New MCP Server

Step-by-step guide for adding a new ad platform MCP server to this monorepo. Uses `{platform}` placeholders throughout — replace with your platform name (e.g., `reddit`, `spotify`). The canonical reference implementation is **pinterest-mcp**; secondary reference is **snapchat-mcp**.

> **Prerequisite reading:** Skim `packages/pinterest-mcp/src/` to see the complete pattern in action before starting.

> **How to use the snippets.** They are abridged illustrations, not files to paste: they show the shape of each piece and every `@cesteral/shared` call a server must make, but leave out platform detail. Your config field names, session config and auth headers will differ. Start from the reference files below instead, and treat CI as the authority: most of the rules a new server must meet are enforced by checks, not by this text. Run **`corepack pnpm ci:local`** early and often. It runs `.github/workflows/ci.yml`'s steps in order, and each failure names the file to change. [Step 20](#step-20-verification-checklist) lists the checks and what each one requires.

**Copy from `packages/pinterest-mcp` and rename** (no platform logic, or only platform names):

| File                                                                                                      | Change                                                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `tsconfig.json`, `vitest.config.ts`                                                                       | nothing                                                                                                                       |
| `src/mcp-server/tools/utils/resolve-session.ts`                                                           | names                                                                                                                         |
| `src/mcp-server/tools/index.ts`, `src/mcp-server/resources/types.ts`, `src/mcp-server/resources/index.ts` | names                                                                                                                         |
| `src/utils/platform.ts`                                                                                   | platform key and config field                                                                                                 |
| `src/mcp-server/tools/definitions/get-pacing-status.tool.ts`                                              | names and the account-id field                                                                                                |
| `src/mcp-server/server.ts`                                                                                | names, description, instructions, workflow-id map; keep the conformance block and the `resolveManifestEntry` line as they are |
| `src/mcp-server/transports/streamable-http-transport.ts`, `src/index.ts`                                  | auth strategy, headers, env-credential fallback                                                                               |
| `package.json`                                                                                            | names, description, keywords; drop `generate` and `openapi-typescript` unless you generate types                              |

**Write yourself; the snippets only illustrate**: `src/config/index.ts`, the auth adapter and strategy, the HTTP client, the service, entity mapping, `session-services.ts`, the tools other than pacing, the resources' and prompts' content, and the tests. These hold the platform's API surface, and copying Pinterest's would carry Pinterest's API with them.

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
- [Step 9.5: Governing Your Write Tools](#step-95-governing-your-write-tools)
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
- [Appendix C: Governance Cheat Sheet](#appendix-c-governance-cheat-sheet)

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

- **Node.js** 22+ and **pnpm 10** — the repo pins `packageManager: pnpm@10.34.5`; run `corepack enable` or prefix commands with `corepack pnpm`. An older global pnpm fails on the `engines` check.
- Familiarity with **TypeScript**, **Zod**, and REST APIs
- Platform API credentials (developer account, API keys/tokens)
- Read the platform's API documentation to understand:
  - Authentication method (OAuth2, API key, bearer token)
  - Entity hierarchy (campaigns > ad groups > ads, etc.)
  - Rate limits and pagination style
  - Base URL and API version

## Step 0: Planning

Before writing code, decide these things, then register the server (step 4) before anything else:

### 1. Choose the platform key

One key identifies the platform everywhere: it is the tool-name prefix (`{prefix}_list_entities`), the registry's `tool_prefix` and `platform_key`, every governed tool's `cesteral.platform` and `contractPlatformSlug` (so every `contractId` starts with it), the telemetry `platform`, the rate-limiter and span key, and the `platform-facts.json` id prefix. In this guide `{prefix}` is that key. (The rule is from [the platform-key decision](../plans/2026-10-11-platform-keys-and-contract-decisions.md); a few older servers keep frozen exceptions, recorded and checked in `scripts/lib/platform-keys.mjs`. A new server gets none.)

Rules:

- Lowercase letters, digits and underscores; no hyphens (`amazon_dsp`, not `amazon-dsp`)
- The platform's common short name (`reddit`, not `reddit_ads`)
- Unique across all servers (check `docs/CROSS_SERVER_CONTRACT.md`)
- Agreed in the [New Platform Proposal](https://github.com/cesteral/mcp-open-advertising/issues/new?template=new_platform_proposal.yml) before work starts: the governance layer keys write admission on it, so it cannot be renamed later without re-admitting every governed tool

### 2. Allocate a port

Ports are assigned sequentially. Current allocation:

| Port     | Server             |
| -------- | ------------------ |
| 3001     | dbm-mcp            |
| 3002     | dv360-mcp          |
| 3003     | ttd-mcp            |
| 3004     | gads-mcp           |
| 3005     | meta-mcp           |
| 3006     | linkedin-mcp       |
| 3007     | tiktok-mcp         |
| 3008     | cm360-mcp          |
| 3009     | snapchat-mcp       |
| 3010     | sa360-mcp          |
| 3011     | pinterest-mcp      |
| 3012     | amazon-dsp-mcp     |
| 3013     | msads-mcp          |
| **3014** | **Next available** |

### 3. Identify entity types

List the platform's manageable entity types. Most platforms have:

- `campaign` — top-level spending container
- `adGroup` — targeting/bidding unit within a campaign
- `ad` — individual creative placement
- `creative` — media asset (image, video, etc.)

Some platforms add platform-specific types (e.g., `siteList`, `conversionTracker`). Map platform terminology to these standard names where possible (e.g., Snapchat "Ad Squads" → `adGroup`).

### 4. Register the server in `registry.json` first

Do this **before** writing server code. `buildServerInfo()` and `buildServerCardExtras()` (Steps 12–13) read the registry through `packages/shared/src/utils/transport/registry-data.generated.ts`, and throw `Registry lookup failed` for a package that is not there, so the server cannot boot or pass a test until it is registered. That file is regenerated by `@cesteral/shared`'s `prebuild` (`sync-registry-data.mjs`), so run `corepack pnpm run build` after editing the registry.

`registry.json` is also the source of truth for manifests, `server.json`, the runtime tool checks and the server card, and `scripts/lib/fleet-inventory.test.mjs` requires every `packages/*-mcp` directory to have an entry. Copy an existing entry (Pinterest's is a good model) and fill in every field:

```jsonc
{
  "package": "{platform}-mcp",
  "port": 3014, // the port you allocated; must equal your config's default
  "tool_prefix": "{prefix}", // must match the prefix your tool names share
  "platform_key": "{prefix}", // the same key (Step 0, item 1); scripts/lib/platform-keys.mjs checks it
  "type": "management", // or "reporting" / "reporting_conversions"; decides the required tools (Step 9)
  "governed": true, // see Step 9.5 before setting false
  "title": "{Platform} Ads MCP Server", // must end in "MCP Server"
  "description": "{Platform} Ads management — CRUD, reporting, ...",
  "runtime_description": "{Platform} Ads API: campaigns, ad groups, ads, reporting.",
  "platform": "{Platform} Ads",
  "platform_display_name": "{Platform}",
  "documentation_url": "https://developers.{platform}.com/docs",
  "tools": [], // regenerate with `corepack pnpm sync:registry-tools` once tools exist
  "resources": [],
  "prompts": [], // must match prompts/list exactly (check:registry-runtime)
  "auth": { "modes": ["{platform}-bearer", "jwt", "none"] }, // must include "none"
  "tags": ["advertising", "{platform}"],
  "untrustedContent": { "pathReporting": "per-response" }, // see Step 9
  "operational": { "terminalOperations": [] }, // see Step 9.5; required even when empty
}
```

Every other package also needs `"mcpName": "io.github.cesteral/{platform}-mcp"` in its `package.json` (Step 18); `corepack pnpm generate:registry` then writes the committed `packages/{platform}-mcp/server.json`.

The **port** must equal the `port` default in your config (Step 2), and **`tool_prefix`** must be the prefix your tool names share. Both are checked. The release, conformance, deploy and smoke scripts, Cloud Build and the dev-server usage text all read the server list and ports from the registry (`node scripts/fleet.mjs servers` / `port <package>`), so registering here is what adds the server to them.

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
│   │   └── {platform}-auth-strategy.ts       # Auth strategy for HTTP mode
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
│   └── utils/
│       └── platform.ts                       # Rate limiter + span helper (Step 16)
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

> **Reference:** `packages/pinterest-mcp/src/auth/pinterest-auth-strategy.ts`

## Step 4: HTTP Client

Create `src/services/{platform}/{platform}-http-client.ts`. This wraps `fetch` with authentication, retry, and telemetry.

```typescript
import type { Logger } from "pino";
import type { {Platform}AuthAdapter } from "../../auth/{platform}-auth-adapter.js";
import { McpError, JsonRpcErrorCode, fetchWithTimeout, executeWithRetry } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { with{Platform}ApiSpan } from "../../utils/platform.js";

export const {PLATFORM}_RETRY_CONFIG: RetryConfig = {
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
      return executeWithRetry({PLATFORM}_RETRY_CONFIG, {
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
import type { RateLimiter } from "@cesteral/shared";
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
    await this.rateLimiter.consume(`{prefix}:${filters.accountId}`);
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
import type { RateLimiter } from "@cesteral/shared";
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
import type { SdkContext } from "@cesteral/shared";

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
import type { SdkContext } from "@cesteral/shared";

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
  // Where platform-controlled text appears in the result (see below).
  untrustedContent: {
    structuredPaths: ["$.entities"],
    contentBlocks: [0],
  },
};
```

### Required tool fields

| Field               | Type             | Description                                                          |
| ------------------- | ---------------- | -------------------------------------------------------------------- |
| `name`              | `string`         | `{prefix}_{action}` pattern                                          |
| `title`             | `string`         | Human-readable display name                                          |
| `description`       | `string`         | Tool description (>10 chars). Embed entity types, hierarchy hints    |
| `inputSchema`       | `z.ZodTypeAny`   | Zod schema — factory calls `.parse()` for validation                 |
| `outputSchema`      | `z.ZodTypeAny`   | Zod schema for structured return type                                |
| `annotations`       | `object`         | `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` |
| `inputExamples`     | `array`          | `{ label, input }` objects — embedded as markdown in description     |
| `logic`             | `async function` | `(input, context, sdkContext?) => Promise<Output>`                   |
| `responseFormatter` | `function`       | `(result, input?) => McpTextContent[]`                               |
| `untrustedContent`  | `object`         | Paths holding platform text, or `NO_UNTRUSTED_CONTENT` (below)       |

**Rules CI enforces on every tool** (each is a check under `scripts/lib/`; see [Step 20](#step-20-verification-checklist)):

- **`inputSchema` is a top-level `z.object`** (`.superRefine` allowed), never a `z.union` / `z.discriminatedUnion`: the SDK publishes a union as an empty input schema.
- **`annotations.readOnlyHint` is an explicit boolean**, and `false` for any tool whose name says it mutates or that sends PUT/PATCH/DELETE.
- **`untrustedContent` is declared on every tool.** Platform text (entity names, ad copy, raw responses, report cells, platform error text) is attacker-controllable, so the result says where it sits: `{ structuredPaths: ["$.entities"], contentBlocks: [0] }` for a tool that returns it, or `NO_UNTRUSTED_CONTENT` (from `@cesteral/shared`) for one that returns none. IDs, statuses, counts and the caller's own input do not count. Over-marking is harmless; under-marking is the failure. After declaring, run `corepack pnpm sync:untrusted-declarations` and commit the snapshot it updates. `docs/architecture/untrusted-content-marking.md` has the full rules.
- **The title or description names the platform** (its `platform`, `platform_display_name` or prefix from `registry.json`). Many operation names (`get_entity`, `get_pacing_status`) exist on every server, and in a merged tool list the platform is the only disambiguator.
- **Tool files live in `src/mcp-server/tools/definitions/` and declare `const TOOL_NAME = "..."`** (or `name:`), which `sync:registry-tools` parses.

### Required tools (cross-server contract)

What a server must ship depends on its registry `type`. `scripts/lib/contract-tiers.mjs` checks it against `registry.json`'s tool list:

| Requirement                                                                                           | `management` | `reporting` | `reporting_conversions` |
| ----------------------------------------------------------------------------------------------------- | ------------ | ----------- | ----------------------- |
| `{prefix}_list_entities`, `_get_entity`                                                               | MUST         | —           | MUST                    |
| `{prefix}_create_entity`, `_update_entity`, `_delete_entity` (or `_remove_entity`)                    | MUST         | —           | —                       |
| `{prefix}_bulk_update_status`, `_validate_entity`                                                     | MUST         | —           | —                       |
| `{prefix}_get_pacing_status` (copy Pinterest's; the math is shared)                                   | MUST         | MUST        | MUST                    |
| A reporting tool (`get_report`, `submit_report`, `get_insights`, `get_analytics`, `run_custom_query`) | SHOULD       | MUST        | MUST                    |
| `{prefix}_insert_conversions`                                                                         | —            | —           | MUST                    |
| `{prefix}_duplicate_entity`                                                                           | SHOULD       | —           | —                       |
| `{prefix}_adjust_bids` (or `_adjust_line_item_bids`)                                                  | SHOULD       | —           | —                       |
| Account discovery (`list_accounts`, `list_ad_accounts`, `list_advertisers` or `list_user_profiles`)   | SHOULD       | —           | —                       |
| `{prefix}_search_tools`, generated by `createToolSearchTool` (see the barrel below)                   | SHOULD       | SHOULD      | SHOULD                  |

A MUST cannot be excepted. A SHOULD you do not ship needs an entry in your registry entry's `contract.exceptions`, with a reason (for example, CM360 has no bid adjustment because its API prices placements with pricing schedules). An exception for a tool you later add fails the check, so remove it then. Additional recommended tools: bulk create/update, targeting search and options, delivery estimate, ad preview, media upload.

### Tool barrel export

Create `src/mcp-server/tools/definitions/index.ts`:

```typescript
export { listEntitiesTool } from "./list-entities.tool.js";
export { getEntityTool } from "./get-entity.tool.js";
// ... export each tool

import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
// ... import each tool
import {
  conformanceTools,
  createToolSearchTool,
  type ToolDefinitionForFactory,
} from "@cesteral/shared";

const productionTools: ToolDefinitionForFactory[] = [
  // ── Core CRUD ──
  listEntitiesTool,
  getEntityTool,
  createEntityTool,
  updateEntityTool,
  deleteEntityTool,
  // ── Account ──
  listAccountsTool,
  // ── Reporting ──
  getReportTool,
  getReportBreakdownsTool,
  submitReportTool,
  checkReportStatusTool,
  downloadReportTool,
  // ── Bulk Operations ──
  bulkUpdateStatusTool,
  bulkCreateEntitiesTool,
  bulkUpdateEntitiesTool,
  // ── Bids (required by contract) ──
  adjustBidsTool,
  // ── Targeting ──
  searchTargetingTool,
  getTargetingOptionsTool,
  // ── Specialized ──
  duplicateEntityTool,
  getDeliveryEstimateTool,
  getAdPreviewTool,
  // ── Validation (required by contract) ──
  validateEntityTool,
  // ── Pacing (required) ──
  getPacingStatusTool,
  // ── Media (if platform supports upload) ──
  // uploadImageTool, uploadVideoTool,
  // ── Discovery ──
  createToolSearchTool({ platform: "{prefix}", getTools: () => allTools }),
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

## Step 9.5: Governing Your Write Tools

The `annotations` block in Step 9 has two layers. The four MCP hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) are protocol-standard. The **`cesteral` namespace inside `annotations` is what makes a tool _governed_** — it is the single declaration that wires a write tool into the attestation manifest, the `definitionHash` contract, and the decision-token enforcement path. A server whose write tools omit it builds and serves fine, but is invisible to the governance layer: it ships **no attestation manifest**, and its writes can never be admitted or token-enforced. This step is not optional for a management server.

> **Why this matters:** the platform boundary is deliberate. The governance layer (`cesteral-intelligence`, the paid product) mints a short-lived signed **decision token** after a write clears admission, binding it to the tool's `contractId`, `definitionHash`, and `actionHash`. The MCP server (this repo, open source) verifies that token before executing the write. The `cesteral` annotation is the contract both halves agree on. See [`docs/governance/decision-token-rollout-and-rotation.md`](../governance/decision-token-rollout-and-rotation.md) for the full token lifecycle.

### Which tools get a `cesteral` block

| Tool kind                                                                                                    | `cesteral` block? | `kind` / `writeClass` |
| ------------------------------------------------------------------------------------------------------------ | ----------------- | --------------------- |
| Mutates a canonical entity (`create`/`update`/`delete`/`bulk` on entity)                                     | **Yes**           | `write` / `entity`    |
| Write with no canonical entity snapshot (uploads, report-schedule CRUD, conversion uploads, async bulk jobs) | **Yes**           | `write` / `effect`    |
| Read tool that is a write tool's `readPartner`                                                               | **Yes**           | `read`                |
| Other read-only tools (list, search, get-report, validate)                                                   | No                | —                     |

The type lives in `@cesteral/contract-schema` (re-exported from `@cesteral/shared`). Author against it with `satisfies` so the compiler enforces the strict contract:

```typescript
import type { CesteralWriteToolAnnotations } from "@cesteral/shared";
```

### Entity write annotation (the strict contract)

An **entity write** mutates a canonical entity, so it MUST declare a `readPartner` (the read tool that returns the before/after snapshot) and MUST promise `requiresValidation: true`, `requiresSimulation: true`, and `supportsBeforeAfterSnapshot: true`. The governance admission layer rejects the tool otherwise.

```typescript
annotations: {
  // Standard MCP hints
  readOnlyHint: false,
  openWorldHint: false,
  idempotentHint: false,
  destructiveHint: true,
  // Cesteral governance contract
  cesteral: {
    kind: "write",
    writeClass: "entity",
    platform: "{prefix}",                // your platform key (Step 0, item 1)
    contractPlatformSlug: "{prefix}",    // the same key; /^[a-z0-9_]{1,40}$/, no hyphens
    contractToolSlug: "create_entity",   // same slug shape
    schemaVersion: 1,                     // bump on breaking contract changes
    contractId: "{prefix}.create_entity.v1", // MUST equal `${slug}.${toolSlug}.v${schemaVersion}`
    operation: ["create"],               // canonical operations this tool performs
    entityKinds: ["campaign", "ad_group", "ad"], // CanonicalEntityKind values
    entityIdArgs: ["accountId"],         // input args carrying platform entity IDs
    executableArgsExclude: ["dry_run"],  // args excluded from the actionHash binding
    readPartner: {
      toolName: "{prefix}_get_entity",
      argMap: { entityType: "entityType", accountId: "accountId" },
    },
    supportsDryRun: true,
    supportsBeforeAfterSnapshot: true,
    requiresValidation: true,
    requiresSimulation: true,
  } satisfies CesteralWriteToolAnnotations,
},
```

### Effect write annotation

An **effect write** has no canonical entity snapshot (e.g. media upload, report-schedule create, conversion upload, fire-and-forget bulk job). It carries **no `readPartner`**, `supportsBeforeAfterSnapshot: false`, and its `requiresValidation` / `requiresSimulation` are **honest booleans** — set them to `true` only if the tool actually validates/simulates. Effect writes take the same decision-token path as entity writes: the factory resolves a mode for them and verifies the token identically (the check is `writeClass`-agnostic), so `enforce` applies to them too.

```typescript
cesteral: {
  kind: "write",
  writeClass: "effect",
  platform: "{prefix}",
  contractPlatformSlug: "{prefix}",
  contractToolSlug: "upload_video",
  schemaVersion: 1,
  contractId: "{prefix}.upload_video.v1",
  operation: ["create"],
  entityKinds: [],                      // may be empty for effect writes
  entityIdArgs: ["accountId"],
  executableArgsExclude: [],
  supportsBeforeAfterSnapshot: false,
  requiresValidation: false,            // honest: this upload neither validates...
  requiresSimulation: false,            // ...nor simulates
} satisfies CesteralWriteToolAnnotations,
```

### Field rules to get right

- **`contractId` must equal `` `${contractPlatformSlug}.${contractToolSlug}.v${schemaVersion}` ``** — the admission layer rejects any divergence. The slugs match `/^[a-z0-9_]{1,40}$/` (lowercase, digits, underscores; **no hyphens**, so `amazon_dsp` not `amazon-dsp`).
- **`entityKinds` are canonical** (`campaign`, `ad_group`, `ad`, etc. — the `CanonicalEntityKind` set), not your platform's raw type names. Map platform terminology to the canonical kinds, the same way Step 0 maps entity types.
- **`executableArgsExclude`** lists control args that are not part of the executable write identity (e.g. `dry_run`). The decision-token verifier hashes the wire args **minus** this set into `actionHash`; `__`-prefixed internal args are excluded implicitly.
- **`readPartner.argMap`** maps this write tool's arg names → the read tool's arg names, so the control plane can fetch the before/after snapshot with no out-of-band pairing. The `readPartner.toolName` must resolve to a real tool — give that read tool a `cesteral` block with `kind: "read"` and a matching `contractId`.
- **`schemaVersion`** is the contract-surface version. Bump it (and the `contractId` suffix) on any breaking change to the tool's governed surface — this is how the governance repo detects drift.

### Destructive tools: declare them terminal

A tool that deletes, or sets a status that cannot be undone, goes in your registry entry's `operational.terminalOperations` with a note (over 20 characters) saying what cannot be reversed; the server card publishes it. If it is in fact reversible, list it in `scripts/lib/reversible-operations-allowlist.json` with the reason instead. `scripts/lib/terminal-operations.test.mjs` keys on the tool name as well as the annotation, so a `*_delete_entity` governed as a `bulk_job` effect still counts.

### A server with no write tools

A reporting-only server has no `cesteral` blocks, needs no wire tests or decision-token path, and sets `"governed": false`. Today `scripts/lib/governed-packages.test.mjs` allows that only for `dbm-mcp`, so propose a read-only server in an issue first. Its first write tool must meet everything in this step before it ships.

### Hosted governance must add the platform

Cesteral's hosted governance layer (`cesteral-intelligence`) admits a governed write only for a platform it knows. Until it adds your platform key to its write-admission tables and its platform alias map, it refuses your server's governed writes, however correct the annotations are. Self-hosted servers are unaffected: their decision-token mode defaults to `off`. Ask for this in the New Platform Proposal so the governance work can run in parallel with yours.

### What you do NOT have to wire by hand

Once the annotation is correct, the shared `registerToolsFromDefinitions()` factory does the rest automatically:

- **Decision-token verification** — for governed writes (entity and effect class), the factory resolves the per-contract mode (`off` / `warn` / `enforce`), verifies signature, claims, expiry, issuer/audience, `definitionHash`, `actionHash`, and replay (`jti`) before invoking `tool.logic`. The **code default is `off` outside a hosted deployment** (`warn` when `K_SERVICE` is set), so self-hosted/open-source servers stay neutral with no `MISSING_TOKEN` noise.
- **Dry-run / snapshot honesty checks** — if your handler honors `supportsDryRun`, the shared `governed-dry-run.ts` helpers enforce that a tool promising `requiresValidation` / `requiresSimulation` never returns `validationSource: "none"` / `expectedStateSource: "none"`. Wire your `create`/`update` logic to return the dry-run result and before/after snapshots; the factory validates the promises.
- **`definitionHash`** — computed canonically by `@cesteral/contract-hash` and blessed in the release manifest (Step 19). You never compute it yourself; just keep the tool definition stable and bump `schemaVersion` on real changes.

> **References:** `packages/pinterest-mcp/src/mcp-server/tools/definitions/create-entity.tool.ts` (entity write), `packages/pinterest-mcp/src/mcp-server/tools/definitions/upload-video.tool.ts` (effect write), `packages/contract-schema/src/annotations.ts` (the contract type), `docs/governance/decision-token-rollout-and-rotation.md`.

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
  getContent: () =>
    JSON.stringify(
      {
        /* schema definitions */
      },
      null,
      2
    ),
};
```

Barrel in `src/mcp-server/resources/definitions/index.ts`. Note: the shared package provides `createToolExamplesResource()` and `createServerCapabilitiesResource()` — include these alongside your platform-specific resources:

```typescript
import { entityHierarchyResource } from "./entity-hierarchy.resource.js";
import { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
import { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
import { reportingReferenceResource } from "./reporting-reference.resource.js";
import { allTools } from "../../tools/definitions/index.js";
import { createToolExamplesResource, createServerCapabilitiesResource } from "@cesteral/shared";
import type { Resource } from "../types.js";

const toolExamplesResource = createToolExamplesResource(allTools, "{platform}-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "{platform}-mcp",
  toolGroups: {
    crud: [
      "{prefix}_list_entities",
      "{prefix}_get_entity",
      "{prefix}_create_entity",
      "{prefix}_update_entity",
      "{prefix}_delete_entity",
    ],
    account: ["{prefix}_list_accounts"],
    reporting: ["{prefix}_get_report", "{prefix}_submit_report" /* ... */],
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

| Resource                              | Description                                             |
| ------------------------------------- | ------------------------------------------------------- |
| Entity hierarchy                      | Visual tree of entity relationships                     |
| Entity schemas (per-type + combined)  | JSON field definitions for each entity type             |
| Entity examples (per-type + combined) | Example API payloads                                    |
| Reporting reference                   | Available metrics, dimensions, date ranges              |
| Tool examples                         | Auto-generated from `inputExamples` (via shared helper) |
| Server capabilities                   | Tool groups and workflows (via shared helper)           |

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
  arguments: [{ name: "objective", description: "Campaign objective", required: false }],
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
import {
  crossPlatformCampaignSetupPrompt,
  crossPlatformPerformancePrompt,
  getCrossPlatformCampaignSetupMessage,
  getCrossPlatformPerformanceMessage,
} from "@cesteral/shared";

export interface PromptDefinition {
  prompt: Prompt;
  generateMessage: (args?: Record<string, string>) => string;
}

export const promptRegistry: Map<string, PromptDefinition> = new Map([
  [
    campaignSetupWorkflowPrompt.name,
    {
      prompt: campaignSetupWorkflowPrompt,
      generateMessage: getCampaignSetupWorkflowMessage,
    },
  ],
  // ... additional prompts
  // Required on every server, from @cesteral/shared. Never keep a local copy.
  [
    crossPlatformPerformancePrompt.name,
    { prompt: crossPlatformPerformancePrompt, generateMessage: getCrossPlatformPerformanceMessage },
  ],
  [
    crossPlatformCampaignSetupPrompt.name,
    {
      prompt: crossPlatformCampaignSetupPrompt,
      generateMessage: getCrossPlatformCampaignSetupMessage,
    },
  ],
]);
```

Prompt and resource text may only name tools and prompts that are registered somewhere in the fleet (`scripts/lib/prompt-tool-references.test.mjs`), and `registry.json`'s `prompts` list must match `prompts/list` exactly.

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
  buildServerInfo,
  extractZodShape,
  registerToolsFromDefinitions,
  createManifestEntryResolver,
  registerPromptsFromDefinitions,
  registerStaticResourcesFromDefinitions,
  InteractionLogger,
  isConformanceFixturesEnabled,
  type McpServerPromptLike,
  type PromptDefinitionForFactory,
  type PromptArgumentForFactory,
} from "@cesteral/shared";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

const PACKAGE_NAME = "{platform}-mcp";
const PLATFORM = "{prefix}"; // telemetry platform: your platform key

// Exported: scripts/lib/workflow-id-maps.test.mjs requires one entry per
// registered tool (the generated {prefix}_search_tools excepted) and no others.
export const {prefix}WorkflowIdByToolName: Record<string, string> = {
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
    // title and websiteUrl come from registry.json (scripts/lib/server-info.test.mjs)
    buildServerInfo("{platform}-mcp", {
      version: packageJson.version,
      description: "{Platform} Ads campaign management and reporting via {Platform} API.",
    }),
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
    // Required for a governed server: lets the decision-token check compare each
    // tool against the definitionHash in the release manifest. Without it,
    // `warn` mode skips that comparison and `enforce` refuses every governed write.
    resolveManifestEntry: createManifestEntryResolver(
      new URL("../cesteral-manifest.json", import.meta.url)
    ),
    createRequestContext: (params) =>
      createOperationContext({ operation: params.operation, additionalContext: params.additionalContext }),
    defaultTextFormat: "compact",
    packageName: PACKAGE_NAME,
    platform: PLATFORM,
    workflowIdByToolName: {prefix}WorkflowIdByToolName,
    interactionLogger,
    authContextResolver: sessionId
      ? () => sessionServiceStore.getAuthContext(sessionId)
      : undefined,
  });

  // Register resources
  registerStaticResourcesFromDefinitions({ server, resources: allResources, logger });

  // Register conformance fixtures (for MCP protocol compliance testing).
  // Copy the body of this `if` from packages/pinterest-mcp/src/mcp-server/server.ts
  // unchanged; it is identical on every server. CI's conformance job needs it.
  if (isConformanceFixturesEnabled()) {
    // ... conformance resources, resource template and prompts from @cesteral/shared
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
- `buildServerInfo()` reads `title` and `websiteUrl` from the registry entry you created in Step 0, item 4
- If your server has a `download_report` tool, also call `registerReportCsvResource` as Pinterest does

> **Reference:** `packages/pinterest-mcp/src/mcp-server/server.ts`

## Step 13: HTTP Transport

Create `src/mcp-server/transports/streamable-http-transport.ts`. This is the HTTP transport factory.

```typescript
import type { Logger } from "pino";
import type { AppConfig } from "../../config/index.js";
import { createMcpServer } from "../server.js";
import {
  createAuthStrategy,
  type AuthMode,
  type TransportFactoryConfig,
  buildServerCardExtras,
  createTransportEntrypoints,
} from "@cesteral/shared";
import { {Platform}BearerAuthStrategy } from "../../auth/{platform}-auth-strategy.js";
import type { {Platform}AuthAdapter } from "../../auth/{platform}-auth-adapter.js";
import { createSessionServices, sessionServiceStore } from "../../services/session-services.js";
import { rateLimiter } from "../../utils/platform.js";
import { {PLATFORM}_RETRY_CONFIG } from "../../services/{platform}/{platform}-http-client.js";

function buildPlatformConfig(config: AppConfig, logger: Logger): TransportFactoryConfig {
  return {
    authStrategy:
      config.mcpAuthMode === "{platform}-bearer"
        ? new {Platform}BearerAuthStrategy(config.{platform}ApiBaseUrl, logger)
        : createAuthStrategy(config.mcpAuthMode as AuthMode, {
            jwtSecret: config.mcpAuthSecretKey,
            logger,
          }),
    // CORS headers must exactly match the header names your auth adapter reads.
    corsAllowHeaders: [
      "Content-Type",
      "Authorization",
      "Mcp-Session-Id",
      "MCP-Protocol-Version",
      "X-Cesteral-Decision-Token", // governance decision tokens; every server lists it
      "X-{Platform}-Account-Id",
    ],
    authErrorHint:
      config.mcpAuthMode === "{platform}-bearer"
        ? "Provide a {Platform} access token via Authorization: Bearer <token> and account ID via X-{Platform}-Account-Id."
        : "Provide a valid Bearer token in the Authorization header.",
    sessionServiceStore,
    rateLimiter,
    // The server card publishes this server's real retry budget.
    retryDescriptor: { maxRetries: {PLATFORM}_RETRY_CONFIG.maxRetries },
    async createSessionForAuth(authResult, sessionId, appConfig, log) {
      const cfg = appConfig as AppConfig;
      const sessionConfig = { baseUrl: cfg.{platform}ApiBaseUrl, apiVersion: cfg.{platform}ApiVersion };

      // {platform}-bearer mode: the strategy already built and validated the adapter.
      const adapter = authResult.platformAuthAdapter as {Platform}AuthAdapter | undefined;
      if (adapter) {
        const services = createSessionServices(adapter, sessionConfig, log, rateLimiter);
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
        return { services };
      }

      // none / jwt modes: fall back to env var credentials.
      if (cfg.{platform}AccessToken && cfg.{platform}AccountId) {
        const { {Platform}AccessTokenAdapter } = await import("../../auth/{platform}-auth-adapter.js");
        const envAdapter = new {Platform}AccessTokenAdapter(
          cfg.{platform}AccessToken,
          cfg.{platform}AccountId,
          cfg.{platform}ApiBaseUrl
        );
        await envAdapter.validate();
        const services = createSessionServices(envAdapter, sessionConfig, log, rateLimiter);
        sessionServiceStore.set(sessionId, services, authResult.credentialFingerprint);
        return { services };
      }

      // `none` without credentials is a protocol-only session (CI's conformance
      // job runs this way); tools fail at call time instead.
      if (cfg.mcpAuthMode === "none") return { services: null };
      return {
        services: null,
        error: { message: "{Platform} credentials required.", status: 400 as const },
      };
    },
    async createMcpServer(log, sessionId, gcsBucket) {
      return createMcpServer(log, sessionId, gcsBucket);
    },
    packageJsonPath: new URL("../../../package.json", import.meta.url).pathname,
    // Server-card description, platform and auth modes come from registry.json.
    serverCard: buildServerCardExtras("{platform}-mcp"),
  };
}

export const { createMcpHttpServer, startHttpServer } =
  createTransportEntrypoints<AppConfig>(buildPlatformConfig);
```

**Key points:**

- `buildPlatformConfig()` returns the platform-specific configuration for the shared transport factory
- `createSessionForAuth()` is the callback that creates session services when a new session connects
- CORS headers must include all platform-specific headers that clients will send
- The `createAuthStrategy()` helper handles `jwt` and `none` modes generically
- `buildServerCardExtras()` throws until the server is in `registry.json` (Step 0, item 4) and `@cesteral/shared` has been rebuilt

> **Reference:** `packages/pinterest-mcp/src/mcp-server/transports/streamable-http-transport.ts`

## Step 14: Entry Point

Create `src/index.ts`. This is the complete entry point:

```typescript
#!/usr/bin/env node
import { mcpConfig } from "./config/index.js";
import { createMcpServer, runStdioServer } from "./mcp-server/server.js";
import { startHttpServer } from "./mcp-server/transports/streamable-http-transport.js";
import {
  initializeOpenTelemetry,
  otelLogMixin,
  detectTransportMode,
  createServerLogger,
  bootstrapMcpServer,
} from "@cesteral/shared";
import { {Platform}AccessTokenAdapter } from "./auth/{platform}-auth-adapter.js";
import { createSessionServices, sessionServiceStore } from "./services/session-services.js";
import { rateLimiter } from "./utils/platform.js";
import { allTools } from "./mcp-server/tools/definitions/index.js";

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
    accessToken,
    accountId,
    mcpConfig.{platform}ApiBaseUrl
  );
  await authAdapter.validate(); // fail fast on invalid credentials

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
  // Boot-time governance posture check and process-wide jti store: an unsafe
  // `enforce` configuration refuses to start instead of failing every session.
  tools: allTools,
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
}).catch((err) => {
  logger.fatal({ err }, "Failed to start {platform}-mcp");
  process.exit(1);
});
```

`bootstrapMcpServer()` handles all the orchestration: OTEL initialization, transport mode detection (stdio vs HTTP), graceful shutdown with signal handlers, and session cleanup.

> **Reference:** `packages/pinterest-mcp/src/index.ts`

## Step 15: Types

There is no local types module. Import `SdkContext`, `RequestContext`, `McpError`, `JsonRpcErrorCode` and the other shared types directly from `@cesteral/shared`.

## Step 16: Utilities

Create `src/utils/platform.ts`. It is the only local utility module:

```typescript
import { createPlatformSpanHelper, createPlatformRateLimiter } from "@cesteral/shared";
import { mcpConfig } from "../config/index.js";

export const with{Platform}ApiSpan = createPlatformSpanHelper("{prefix}");
export const rateLimiter = createPlatformRateLimiter(
  "{prefix}",
  mcpConfig.{platform}RateLimitPerMinute
);
```

Every `rateLimiter.consume()` key must be a literal or template starting with `{prefix}:` (`scripts/lib/rate-limit-keys.test.mjs`). The rate-limit default you pick in Step 2 also needs a `{prefix}.rate_limit_default` fact in `platform-facts.json` (Step 19).

> **Reference:** `packages/pinterest-mcp/src/utils/platform.ts`

## Step 17: Tests

Create tests in a `tests/` directory at the package root.

### Test categories

| Category        | Example file                      | What to test                                             |
| --------------- | --------------------------------- | -------------------------------------------------------- |
| **Unit**        | `tests/entity-mapping.test.ts`    | Entity config lookup, path interpolation, enum helpers   |
| **Unit**        | `tests/auth-adapter.test.ts`      | Token parsing, fingerprint generation, header extraction |
| **Integration** | `tests/tool-registration.test.ts` | All tools register without errors, have valid schemas    |
| **Integration** | `tests/session-lifecycle.test.ts` | Session create/resolve/cleanup cycle                     |

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

### Wire-request tests (required for every write tool)

Every tool with `readOnlyHint: false` needs a wire test: a `tests/**/*wire*.test.ts` file that calls the tool's `*Logic` function with only `globalThis.fetch` stubbed, and asserts the exact upstream method, URL and body. The file must cite the vendor source it checks against in a `// basis:` comment (an API reference page, an OpenAPI document and its version). `scripts/lib/wire-request-coverage.test.mjs` fails for any write tool whose `*Logic` is never called in such a file. A mocked unit test is not enough, because it cannot catch a wrong path or body shape.

> **Reference:** `packages/pinterest-mcp/tests/tools/pinterest-wire-requests.test.ts` and its helper `tests/helpers/wire.ts`

### Vitest config

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts", "src/config/**", "dist/**"],
      thresholds: { lines: 50, branches: 40, functions: 50, statements: 50 },
    },
  },
});
```

> **Reference:** `packages/pinterest-mcp/tests/` (or any server's `tests/` directory)

## Step 18: Package Metadata

### package.json

```json
{
  "name": "@cesteral/{platform}-mcp",
  "mcpName": "io.github.cesteral/{platform}-mcp",
  "version": "1.0.0",
  "description": "{Platform} Ads MCP Server - Campaign management and reporting via {Platform} API",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/cesteral/mcp-open-advertising.git",
    "directory": "packages/{platform}-mcp"
  },
  "homepage": "https://github.com/cesteral/mcp-open-advertising#readme",
  "keywords": ["mcp", "model-context-protocol", "advertising", "{platform}-ads"],
  "files": ["dist/", "README.md", "LICENSE.md"],
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "bin": { "{platform}-mcp": "./dist/index.js" },
  "publishConfig": { "access": "public" },
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
    "@modelcontextprotocol/sdk": "catalog:",
    "pino": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@types/node": "^26.6.6",
    "tsx": "^4.20.6",
    "typescript": "^5.9.3",
    "vitest": "^1.6.0"
  }
}
```

- **`catalog:`** resolves the SDK, pino and zod from `pnpm-workspace.yaml`, so every server shares one copy. Never pin those versions per package.
- Hono, OpenTelemetry and dotenv are dependencies of `@cesteral/shared`, not of a server.
- **`mcpName`** is required: `generate:registry` writes `server.json` from it.
- **`files`** ships `LICENSE.md` (copy it into the package), which the release tarball check expects.

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

`registry.json` (Step 0, item 4) is the source for everything registry-driven. The rest of the integration is either **generated** from it or a **hand-maintained list** that CI checks against it.

### 1. Install and build

```bash
corepack pnpm install     # pnpm workspaces pick up the new package
corepack pnpm run build   # also regenerates shared's registry-data from registry.json
```

### 2. Regenerate the generated files and commit them

```bash
corepack pnpm sync:registry-tools            # registry tools[] from your *.tool.ts files
corepack pnpm generate:registry              # packages/{platform}-mcp/server.json
corepack pnpm sync:untrusted-declarations    # untrusted-declarations snapshot
corepack pnpm generate:manifests             # dist/cesteral-manifest.json (not committed)
```

`generate:manifests` must print `wrote manifest with N governed tool(s)` for the new server. `no governed tools` means your write tools are missing their `cesteral` block ([Step 9.5](#step-95-governing-your-write-tools)). The tag-triggered `release.yml` regenerates and signs this manifest transitively via npm build provenance; the governance repo verifies that provenance to promote matching tools to `attested` trust.

### 3. Add the server to every hand-maintained list

The scripts, Cloud Build's steps and the Dockerfile read the server list from `registry.json`, so they need no edit. What remains is static configuration that cannot read the registry, and three per-service maps Terraform keeps by hand (its modules, outputs, monitoring and load balancer iterate the registry). `scripts/lib/fleet-inventory.test.mjs` fails, naming the file and list, until the server appears in each of these.

| File                                                               | What to add                                                                                                                                                            |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloudbuild.yaml`, `cloudbuild-manual.yaml`                        | both `images:` tags (static Cloud Build config; the build steps read the registry)                                                                                     |
| `terraform/main.tf`                                                | `local.service_auth_defaults` entry (a mode from your registry `auth.modes`); the `for_each` module, monitoring and load balancer pick the server up from the registry |
| `terraform/variables.tf`                                           | `mcp_secret_env_vars` default entry: env var → Secret Manager secret                                                                                                   |
| `terraform/{dev,prod}.tfvars.example`                              | `mcp_images` entry                                                                                                                                                     |
| `.github/ISSUE_TEMPLATE/*.yml`                                     | server dropdowns; your auth mode in `bug_report.yml`'s auth-mode dropdown                                                                                              |
| `docs/CROSS_SERVER_CONTRACT.md`, `docs/guides/platform-mapping.md` | inventory rows                                                                                                                                                         |

Besides those named lists, the check counts how many lines of each file mention each server. In a file where every server should appear equally often, a server mentioned on fewer lines than the rest is missing from some list, even one the check does not name. That covers `main.tf`, the tfvars examples, Cloud Build's `images:` and the issue forms. It cannot cover `variables.tf` (servers declare different numbers of secrets), `bug_report.yml` or the contract doc; there, only the named lists above are checked.

**Deployment work no check covers.** The checks prove the server is _listed_; they cannot prove it will _run_ in Cloud Run:

- The contents of your `mcp_secret_env_vars` entry: which env vars your config reads and which Secret Manager secret each comes from.
- Creating those secrets (`scripts/create-secrets.sh`) and their values.
- Per-environment settings in your own tfvars: resource overrides, auth-mode overrides, invokers.
- A `terraform plan` against a real project, which is the only thing that shows the new module resolves.

### 4. Docs and facts with their own checks

- **`README.md`** fleet table: a row with the server's tool count (`check:doc-tool-counts`).
- **`platform-facts.json`**: at least a base-URL or API-version fact and a `{prefix}.rate_limit_default` fact for the package, each pinned to the literal in your config (`check:platform-facts`). Ship them as `unverified` with a `verifyBy` deadline unless you have read the vendor's page; see CLAUDE.md's "Platform-Facts Ledger". If you add facts, update the fact count in CLAUDE.md.
- **`packages/{platform}-mcp/CLAUDE.md`**: write down the platform quirks a later contributor would trip on, and add a row for the package to the "Server-Specific Notes" table in the root `CLAUDE.md`. The root file has no fleet table to update.
- **Not yet checked**: `docs/guides/ENV-VARIABLES-GUIDE.md`, `.env.example` and `scripts/create-secrets.sh`. Add the server there too.

## Step 20: Verification Checklist

**The gate is `corepack pnpm ci:local`.** It runs `.github/workflows/ci.yml`'s jobs and steps in order and prints a summary; a job it cannot run locally (Terraform or gitleaks not installed) is reported as NOT RUN rather than passed. Run a single job with `--job <name>`, or see the plan with `--list`. Conformance binds ports 3001 upward, so stop local dev servers first.

What the checks require of a new server, so a failure is not a surprise:

| Requirement                                                                                                      | Enforced by                                                     |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Registry entry exists, with every field from Step 0                                                              | `fleet-inventory`, `server-info`, `terminal-operations`         |
| Server listed in every hand-maintained list (Step 19.3)                                                          | `fleet-inventory`                                               |
| Registry `tools` / `prompts` match the source and the live server                                                | `check:registry-tools`, `check:registry-runtime`                |
| `server.json` generated, `mcpName` set                                                                           | `check:registry`                                                |
| Every tool declares `untrustedContent`; snapshot regenerated                                                     | `untrusted-declarations`                                        |
| Every write tool carries a `cesteral` block; `contractId` = `` `${slug}.${toolSlug}.v${schemaVersion}` ``        | `write-coverage`, `contract-id-invariant`, `generate:manifests` |
| Each entity write's `readPartner.argMap` covers the read tool's required args                                    | `readpartner-argmap`                                            |
| Every destructive tool is in `operational.terminalOperations` or the reversible allowlist                        | `terminal-operations`                                           |
| Every write tool has a basis-cited wire test                                                                     | `wire-request-coverage`                                         |
| `inputSchema` is a `z.object`; `readOnlyHint` explicit and consistent with the HTTP verbs used                   | `input-schema-wire`, `write-coverage`, `write-behavior`         |
| Workflow-id map covers every tool except `_search_tools`                                                         | `workflow-id-maps`                                              |
| `{prefix}_get_pacing_status`, the two shared cross-platform prompts, platform named in tool text                 | `cross-server-routing` eval, `cross-platform-prompts`           |
| Prompts and resources name only registered tools                                                                 | `prompt-tool-references`                                        |
| Account-scoped tools call `assertAccountScope()`                                                                 | `check:account-scope`                                           |
| Rate-limit keys start with `{prefix}:`                                                                           | `rate-limit-keys`                                               |
| One platform key: `platform_key` = `tool_prefix` = every governed `cesteral.platform` and `contractPlatformSlug` | `platform-keys`                                                 |
| The required tools for your registry `type`; each missing SHOULD has a reasoned `contract.exceptions` entry      | `contract-tiers`                                                |
| `resolveManifestEntry` passed in `server.ts` (governed servers)                                                  | `definition-hash-resolver-coverage` (shared)                    |
| Platform facts for base URL and rate-limit default                                                               | `check-platform-facts`                                          |
| README fleet row                                                                                                 | `check:doc-tool-counts`                                         |

The named checks live in `scripts/lib/*.test.mjs`, `scripts/__tests__/`, `evals/` and `packages/shared/tests/`. Each failure message says what to change.

Things no check covers, to verify by hand:

- [ ] Auth adapter `validate()` calls a real, cheap platform endpoint and memoizes the result
- [ ] Session services are created and cleaned up (`onDelete` hooks if you spill reports)
- [ ] HTTP client uses `executeWithRetry()` for every API call, and `rateLimiter.consume()` before it
- [ ] Entity mapping covers the platform's entity types
- [ ] `./scripts/dev-server.sh {platform}-mcp` starts the server; `curl http://localhost:{port}/health` returns 200
- [ ] `curl -X POST http://localhost:{port}/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"ping","id":1}'` returns a response
- [ ] Docs from Step 19.4 that have no check yet

---

## Quick Reference: File Creation Order

Create files in this order (each step depends only on previous steps):

| #   | File                                                     | Depends on                                |
| --- | -------------------------------------------------------- | ----------------------------------------- |
| 0   | `registry.json` entry, then `corepack pnpm run build`    | Nothing (Step 0, item 4)                  |
| 1   | `package.json`, `tsconfig.json`, `vitest.config.ts`      | Nothing                                   |
| 2   | `src/config/index.ts`                                    | Package metadata                          |
| 3   | `src/utils/platform.ts`                                  | Config                                    |
| 4   | `src/auth/{platform}-auth-adapter.ts`                    | Utils                                     |
| 5   | `src/auth/{platform}-auth-strategy.ts`                   | Auth adapter                              |
| 6   | `src/services/{platform}/{platform}-http-client.ts`      | Auth, utils                               |
| 7   | `src/services/{platform}/{platform}-service.ts`          | HTTP client                               |
| 8   | `src/mcp-server/tools/utils/entity-mapping.ts`           | Nothing                                   |
| 9   | `src/services/session-services.ts`                       | Services, HTTP client                     |
| 10  | `src/mcp-server/tools/utils/resolve-session.ts`          | Session services                          |
| 11  | `src/mcp-server/tools/definitions/*.tool.ts`             | Entity mapping, session resolver          |
| 12  | `src/mcp-server/tools/definitions/index.ts`              | Tool definitions                          |
| 13  | `src/mcp-server/tools/index.ts`                          | Tool barrel                               |
| 14  | `src/mcp-server/resources/`                              | Entity mapping                            |
| 15  | `src/mcp-server/prompts/`                                | Nothing                                   |
| 16  | `src/mcp-server/server.ts`                               | Tools, resources, prompts, registry entry |
| 17  | `src/mcp-server/transports/streamable-http-transport.ts` | Server, auth, sessions, registry entry    |
| 18  | `src/index.ts`                                           | Everything                                |
| 19  | `tests/` (including wire tests for every write tool)     | Source code                               |

---

## Appendix A: Auth Pattern Reference

| Server         | Auth Mode             | Adapter Pattern                                                | Headers Required (HTTP)                                                    |
| -------------- | --------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| dv360-mcp      | `google-headers`      | `GoogleAuthAdapter` (shared)                                   | Google OAuth2 headers                                                      |
| dbm-mcp        | `google-headers`      | `GoogleAuthAdapter` (shared)                                   | Google OAuth2 headers                                                      |
| gads-mcp       | `google-headers`      | `GoogleAuthAdapter` (shared)                                   | Google OAuth2 headers                                                      |
| cm360-mcp      | `google-headers`      | `GoogleAuthAdapter` (shared)                                   | Google OAuth2 headers                                                      |
| sa360-mcp      | `sa360-headers`       | OAuth2 refresh token                                           | `Authorization`, `X-SA360-Client-Id`, etc.                                 |
| ttd-mcp        | `ttd-token` (default) | `TtdDirectTokenAuthAdapter`                                    | `TTD-Auth`                                                                 |
| meta-mcp       | `meta-bearer`         | `MetaAccessTokenAdapter`                                       | `Authorization: Bearer`                                                    |
| linkedin-mcp   | `linkedin-bearer`     | `LinkedInAccessTokenAdapter`                                   | `Authorization: Bearer`                                                    |
| tiktok-mcp     | `tiktok-bearer`       | `TikTokAccessTokenAdapter`                                     | `Authorization: Bearer`, `X-TikTok-Advertiser-Id`                          |
| pinterest-mcp  | `pinterest-bearer`    | `PinterestAccessTokenAdapter` / `PinterestRefreshTokenAdapter` | `Authorization: Bearer`, `X-Pinterest-Ad-Account-Id`                       |
| snapchat-mcp   | `snapchat-bearer`     | `SnapchatAccessTokenAdapter` / `SnapchatRefreshTokenAdapter`   | `Authorization: Bearer`, `X-Snapchat-Ad-Account-Id`                        |
| amazon-dsp-mcp | `amazon-dsp-bearer`   | `AmazonDspAccessTokenAdapter`                                  | `Authorization: Bearer`, `X-Amazon-DSP-Profile-Id`                         |
| msads-mcp      | `msads-bearer`        | `MsAdsAccessTokenAdapter`                                      | `AuthenticationToken`, `DeveloperToken`, `CustomerId`, `CustomerAccountId` |

**Which pattern to use:**

- **Google platform** (DV360, DBM, GAds, CM360): Use `GoogleAuthAdapter` from shared
- **OAuth2 Bearer token**: Extend `BearerAuthStrategyBase` (most common for non-Google platforms)
- **API key/secret**: Implement `AuthStrategy` interface directly (like TTD)

## Appendix B: Cross-Server Contract Summary

The required tools depend on the server's registry `type`; the table is in [Step 9](#required-tools-cross-server-contract), and `scripts/lib/contract-tiers.mjs` enforces it. `delete` may be `remove` (Google Ads) and bid adjustment may be `adjust_line_item_bids` (DV360).

**Bulk result format** (all bulk tools must return):

```json
{
  "results": [
    { "success": true, "entityId": "123" },
    { "success": false, "entityId": "456", "error": "..." }
  ],
  "successCount": 1,
  "failureCount": 1,
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

See `docs/CROSS_SERVER_CONTRACT.md` for the full specification.

## Appendix C: Governance Cheat Sheet

What "governed" means in practice, and the minimum a new platform must do to participate. Full detail in [Step 9.5](#step-95-governing-your-write-tools) and [`docs/governance/`](../governance/).

**The chain:** `cesteral` annotation on a write tool → `definitionHash` (`@cesteral/contract-hash`) → blessed in `dist/cesteral-manifest.json` (`pnpm run generate:manifests`, driven by `registry.json`) → signed transitively by npm provenance on release → verified by the governance repo to promote the tool to `attested` trust → decision token bound to `contractId` + `definitionHash` + `actionHash` and verified at call time by `registerToolsFromDefinitions()`.

**Minimum to be governed (per new platform):**

| #   | Action                                                                                       | Where                        |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------- |
| 1   | Add a `cesteral` block to every write tool (`entity` or `effect`), authored with `satisfies` | each `*.tool.ts` (Step 9.5)  |
| 2   | Add a `cesteral` `kind: "read"` block to each entity write's `readPartner` read tool         | the `get_entity` / read tool |
| 3   | Keep `contractId` = `` `${slug}.${toolSlug}.v${schemaVersion}` ``                            | each annotation              |
| 4   | Register the package in `registry.json`                                                      | `registry.json` (Step 0)     |
| 5   | Verify `pnpm run generate:manifests` writes a manifest for the package                       | build step (Step 19.2)       |
| 6   | Add the platform to `docs/guides/platform-mapping.md`                                        | platform-mapping doc         |

**Free, handled by `@cesteral/shared` once the annotation is right:** decision-token verification (default `off` off-hosted, `warn` on a hosted deployment), dry-run/snapshot honesty enforcement, `definitionHash` computation, telemetry span attributes via `workflowIdByToolName`.

**Two strictness axes — don't conflate them** (see decision-token runbook):

- `GOVERNANCE_TOKEN_MODE` (`off`/`warn`/`enforce`) is **fleet-global**, set per deployment in terraform; the server _code_ default is `off` off-hosted and `warn` on a hosted deployment (`K_SERVICE` set).
- Per-tenant strictness is the governance layer's per-org `AttestedWritePolicy` — not a server-side setting.
