# Microsoft Advertising MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `@cesteral/msads-mcp`, a new MCP server for Microsoft Advertising (Bing Ads) campaign management and reporting via the REST API v13.

**Architecture:** Follows the exact same patterns as `snapchat-mcp` — per-session auth adapters, HTTP client with retry, entity mapping, registerToolsFromDefinitions factory, Hono + @hono/mcp streamable HTTP transport. Microsoft Ads uses a different auth model (OAuth2 access token + developer token + account IDs) and verb-based REST endpoints rather than resource-based REST.

**Tech Stack:** TypeScript, Zod, Hono, @hono/mcp, @modelcontextprotocol/sdk, @opentelemetry/api, Pino, vitest

**Reference server:** `packages/snapchat-mcp` — copy structure and adapt for Microsoft Advertising API patterns.

---

## Task 1: Package Scaffolding

**Files:**
- Create: `packages/msads-mcp/package.json`
- Create: `packages/msads-mcp/tsconfig.json`
- Create: `packages/msads-mcp/vitest.config.ts`

**Step 1: Create package.json**

```json
{
  "name": "@cesteral/msads-mcp",
  "version": "1.0.0",
  "description": "Microsoft Advertising MCP Server - Campaign management and reporting via Microsoft Advertising REST API v13",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/cesteral/cesteral-mcp-servers.git",
    "directory": "packages/msads-mcp"
  },
  "homepage": "https://github.com/cesteral/cesteral-mcp-servers#readme",
  "keywords": ["mcp", "model-context-protocol", "advertising", "microsoft-ads", "bing-ads"],
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

**Step 2: Create tsconfig.json**

Copy from `packages/snapchat-mcp/tsconfig.json` exactly (it extends root tsconfig).

**Step 3: Create vitest.config.ts**

Copy from `packages/snapchat-mcp/vitest.config.ts` exactly.

**Step 4: Install dependencies**

Run: `cd /Users/daniel.thorner/GitHub/cesteral-mcp-servers && pnpm install`

**Step 5: Commit**

```bash
git add packages/msads-mcp/package.json packages/msads-mcp/tsconfig.json packages/msads-mcp/vitest.config.ts pnpm-lock.yaml
git commit -m "chore: scaffold msads-mcp package"
```

---

## Task 2: Configuration

**Files:**
- Create: `packages/msads-mcp/src/config/index.ts`

**Step 1: Create config**

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
  serviceName: z.string().default("msads-mcp"),
  port: z.number().int().min(1).max(65535).default(3013),
  otelServiceName: z.string().default("msads-mcp"),

  // Auth — Microsoft Ads-specific modes
  mcpAuthMode: z.enum(["msads-bearer", "jwt", "none"]).default("msads-bearer"),

  // Microsoft Ads API Configuration
  msadsCampaignApiBaseUrl: z
    .string()
    .url()
    .default("https://campaign.api.bingads.microsoft.com/CampaignManagement/v13"),
  msadsReportingApiBaseUrl: z
    .string()
    .url()
    .default("https://reporting.api.bingads.microsoft.com/Reporting/v13"),
  msadsCustomerApiBaseUrl: z
    .string()
    .url()
    .default("https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13"),
  msadsBulkApiBaseUrl: z
    .string()
    .url()
    .default("https://bulk.api.bingads.microsoft.com/Bulk/v13"),
  msadsRateLimitPerMinute: z.number().default(100),

  // Stdio fallback credentials
  msadsAccessToken: z.string().optional(),
  msadsDeveloperToken: z.string().optional(),
  msadsCustomerId: z.string().optional(),
  msadsAccountId: z.string().optional(),

  // Reporting poll configuration
  msadsReportPollIntervalMs: z.number().default(3_000),
  msadsReportMaxPollAttempts: z.number().default(30),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function parseConfig(): AppConfig {
  const defaultHost = getDefaultHost();

  const rawConfig: Record<string, unknown> = {
    ...getBaseEnvConfig(defaultHost),

    serviceName: process.env.SERVICE_NAME,
    port: process.env.MSADS_MCP_PORT ? Number(process.env.MSADS_MCP_PORT) : undefined,
    host: process.env.MSADS_MCP_HOST || defaultHost,

    // Microsoft Ads API
    msadsCampaignApiBaseUrl: process.env.MSADS_CAMPAIGN_API_BASE_URL,
    msadsReportingApiBaseUrl: process.env.MSADS_REPORTING_API_BASE_URL,
    msadsCustomerApiBaseUrl: process.env.MSADS_CUSTOMER_API_BASE_URL,
    msadsBulkApiBaseUrl: process.env.MSADS_BULK_API_BASE_URL,
    msadsRateLimitPerMinute: process.env.MSADS_RATE_LIMIT_PER_MINUTE
      ? Number(process.env.MSADS_RATE_LIMIT_PER_MINUTE)
      : undefined,

    // Stdio fallback credentials
    msadsAccessToken: process.env.MSADS_ACCESS_TOKEN,
    msadsDeveloperToken: process.env.MSADS_DEVELOPER_TOKEN,
    msadsCustomerId: process.env.MSADS_CUSTOMER_ID,
    msadsAccountId: process.env.MSADS_ACCOUNT_ID,

    // Reporting poll configuration
    msadsReportPollIntervalMs: process.env.MSADS_REPORT_POLL_INTERVAL_MS
      ? Number(process.env.MSADS_REPORT_POLL_INTERVAL_MS)
      : undefined,
    msadsReportMaxPollAttempts: process.env.MSADS_REPORT_MAX_POLL_ATTEMPTS
      ? Number(process.env.MSADS_REPORT_MAX_POLL_ATTEMPTS)
      : undefined,
  };

  return parseConfigWithSchema(ConfigSchema, rawConfig);
}

export const mcpConfig = parseConfig();
export const appConfig: AppConfig = mcpConfig;
```

**Step 2: Commit**

```bash
git add packages/msads-mcp/src/config/index.ts
git commit -m "feat(msads-mcp): add configuration with Zod schema"
```

---

## Task 3: Auth Adapter

**Files:**
- Create: `packages/msads-mcp/src/auth/msads-auth-adapter.ts`
- Create: `packages/msads-mcp/src/auth/index.ts`
- Create: `packages/msads-mcp/tests/auth/msads-auth-adapter.test.ts`

**Context:** Microsoft Advertising auth is simpler than Snapchat — no refresh token flow needed at the adapter level. The adapter holds an OAuth2 access token + developer token + account IDs. Validation calls the Customer Management API `GetUser` endpoint.

**Step 1: Write the failing test**

```typescript
// tests/auth/msads-auth-adapter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MsAdsAccessTokenAdapter } from "../../src/auth/msads-auth-adapter.js";

// Mock fetchWithTimeout
vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual("@cesteral/shared");
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetch = vi.mocked(fetchWithTimeout);

describe("MsAdsAccessTokenAdapter", () => {
  let adapter: MsAdsAccessTokenAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new MsAdsAccessTokenAdapter(
      "test-access-token",
      "test-dev-token",
      "test-customer-id",
      "test-account-id"
    );
  });

  it("returns the access token", async () => {
    expect(await adapter.getAccessToken()).toBe("test-access-token");
  });

  it("returns the developer token", () => {
    expect(adapter.developerToken).toBe("test-dev-token");
  });

  it("returns customer and account IDs", () => {
    expect(adapter.customerId).toBe("test-customer-id");
    expect(adapter.accountId).toBe("test-account-id");
  });

  it("validates token via GetUser endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ UserId: 12345, UserName: "testuser" }),
    } as Response);

    await adapter.validate();
    expect(adapter.userId).toBe("12345");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("GetUser");
  });

  it("throws on validation failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Invalid token",
    } as unknown as Response);

    await expect(adapter.validate()).rejects.toThrow("Microsoft Ads token validation");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/msads-mcp && pnpm run test -- tests/auth/msads-auth-adapter.test.ts`
Expected: FAIL — module not found

**Step 3: Write the auth adapter**

```typescript
// src/auth/msads-auth-adapter.ts
import { createHash } from "crypto";
import { extractHeader, fetchWithTimeout } from "@cesteral/shared";

/**
 * Contract for Microsoft Advertising authentication adapters.
 * Microsoft Ads requires 4 credentials per request:
 * - AuthenticationToken (OAuth2 access token)
 * - DeveloperToken (per-app, not per-user)
 * - CustomerId (manager account ID)
 * - CustomerAccountId (ad account ID)
 */
export interface MsAdsAuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly developerToken: string;
  readonly customerId: string;
  readonly accountId: string;
  readonly userId: string;
}

interface GetUserResponse {
  UserId?: number;
  UserName?: string;
}

/**
 * Simple access token adapter — holds a pre-generated Microsoft Ads OAuth2 token
 * plus developer token and account identifiers.
 * Validates via Customer Management API GetUser call.
 */
export class MsAdsAccessTokenAdapter implements MsAdsAuthAdapter {
  private validated = false;
  private _userId = "";

  constructor(
    private readonly accessToken: string,
    private readonly _developerToken: string,
    private readonly _customerId: string,
    private readonly _accountId: string,
    private readonly customerApiBaseUrl: string = "https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13"
  ) {}

  get developerToken(): string {
    return this._developerToken;
  }

  get customerId(): string {
    return this._customerId;
  }

  get accountId(): string {
    return this._accountId;
  }

  get userId(): string {
    return this._userId;
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }

  async validate(): Promise<void> {
    if (this.validated) return;

    const response = await fetchWithTimeout(
      `${this.customerApiBaseUrl}/User/GetUser`,
      10_000,
      undefined,
      {
        method: "POST",
        headers: {
          AuthenticationToken: this.accessToken,
          DeveloperToken: this._developerToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ UserId: null }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Microsoft Ads token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`
      );
    }

    const data = (await response.json()) as GetUserResponse;
    this._userId = String(data.UserId ?? "unknown");
    this.validated = true;
  }
}

/**
 * Parse Microsoft Ads access token from HTTP headers.
 * Expects `Authorization: Bearer <token>` header.
 */
export function parseMsAdsTokenFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const authHeader = extractHeader(headers, "authorization");
  if (!authHeader) {
    throw new Error("Missing required Authorization header");
  }
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    throw new Error("Authorization header must use Bearer scheme");
  }
  return match[1];
}

/**
 * Extract Microsoft Ads developer token from HTTP headers.
 */
export function getMsAdsDeveloperTokenFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const token = extractHeader(headers, "x-msads-developer-token");
  if (!token) {
    throw new Error("Missing required X-MSAds-Developer-Token header");
  }
  return token;
}

/**
 * Extract Microsoft Ads customer ID from HTTP headers.
 */
export function getMsAdsCustomerIdFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const id = extractHeader(headers, "x-msads-customer-id");
  if (!id) {
    throw new Error("Missing required X-MSAds-Customer-Id header");
  }
  return id;
}

/**
 * Extract Microsoft Ads account ID from HTTP headers.
 */
export function getMsAdsAccountIdFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const id = extractHeader(headers, "x-msads-account-id");
  if (!id) {
    throw new Error("Missing required X-MSAds-Account-Id header");
  }
  return id;
}

/**
 * Generate a fingerprint for session binding.
 */
export function getMsAdsCredentialFingerprint(
  accessToken: string,
  developerToken: string,
  accountId: string
): string {
  return createHash("sha256")
    .update(`${accessToken.trim()}:${developerToken.trim()}:${accountId.trim()}`)
    .digest("hex")
    .substring(0, 32);
}
```

**Step 4: Create barrel export**

```typescript
// src/auth/index.ts
export {
  type MsAdsAuthAdapter,
  MsAdsAccessTokenAdapter,
  parseMsAdsTokenFromHeaders,
  getMsAdsDeveloperTokenFromHeaders,
  getMsAdsCustomerIdFromHeaders,
  getMsAdsAccountIdFromHeaders,
  getMsAdsCredentialFingerprint,
} from "./msads-auth-adapter.js";
```

**Step 5: Run tests**

Run: `cd packages/msads-mcp && pnpm run test -- tests/auth/msads-auth-adapter.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/msads-mcp/src/auth/ packages/msads-mcp/tests/auth/
git commit -m "feat(msads-mcp): add auth adapter with token validation"
```

---

## Task 4: Auth Strategy

**Files:**
- Create: `packages/msads-mcp/src/auth/msads-auth-strategy.ts`
- Create: `packages/msads-mcp/tests/auth/msads-auth-strategy.test.ts`
- Modify: `packages/msads-mcp/src/auth/index.ts`

**Context:** Microsoft Ads uses a simpler auth model than Snapchat — no refresh token flow at the transport level. The strategy extracts Bearer token + developer token + customer/account IDs from headers, validates via GetUser, and returns platformAuthAdapter. Use `BearerAuthStrategyBase` from shared.

**Step 1: Write the failing test**

```typescript
// tests/auth/msads-auth-strategy.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MsAdsBearerAuthStrategy } from "../../src/auth/msads-auth-strategy.js";

vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual("@cesteral/shared");
  return {
    ...actual,
    fetchWithTimeout: vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ UserId: 12345, UserName: "testuser" }),
    }),
  };
});

describe("MsAdsBearerAuthStrategy", () => {
  let strategy: MsAdsBearerAuthStrategy;

  beforeEach(() => {
    vi.clearAllMocks();
    strategy = new MsAdsBearerAuthStrategy();
  });

  it("extracts credentials from headers and returns AuthResult", async () => {
    const headers = {
      authorization: "Bearer test-token-123",
      "x-msads-developer-token": "dev-token-456",
      "x-msads-customer-id": "cust-789",
      "x-msads-account-id": "acct-012",
    };

    const result = await strategy.verify(headers);

    expect(result.authInfo.authType).toBe("msads-bearer");
    expect(result.platformAuthAdapter).toBeDefined();
    expect(result.credentialFingerprint).toBeDefined();
    expect(result.credentialFingerprint!.length).toBe(32);
  });

  it("throws when Authorization header is missing", async () => {
    const headers = {
      "x-msads-developer-token": "dev-token",
      "x-msads-customer-id": "cust-id",
      "x-msads-account-id": "acct-id",
    };

    await expect(strategy.verify(headers)).rejects.toThrow("Authorization");
  });

  it("throws when developer token is missing", async () => {
    const headers = {
      authorization: "Bearer test-token",
      "x-msads-customer-id": "cust-id",
      "x-msads-account-id": "acct-id",
    };

    await expect(strategy.verify(headers)).rejects.toThrow("Developer-Token");
  });

  it("generates consistent fingerprints for same credentials", async () => {
    const headers = {
      authorization: "Bearer test-token",
      "x-msads-developer-token": "dev-token",
      "x-msads-customer-id": "cust-id",
      "x-msads-account-id": "acct-id",
    };

    const fp1 = strategy.getCredentialFingerprint(headers);
    const fp2 = strategy.getCredentialFingerprint(headers);
    expect(fp1).toBe(fp2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/msads-mcp && pnpm run test -- tests/auth/msads-auth-strategy.test.ts`
Expected: FAIL

**Step 3: Write the auth strategy**

Microsoft Ads doesn't have a refresh token branch in the transport layer (unlike Snapchat/TikTok), so we implement `AuthStrategy` directly instead of extending `BearerAuthStrategyBase`.

```typescript
// src/auth/msads-auth-strategy.ts
import type { AuthStrategy, AuthResult } from "@cesteral/shared";
import {
  MsAdsAccessTokenAdapter,
  parseMsAdsTokenFromHeaders,
  getMsAdsDeveloperTokenFromHeaders,
  getMsAdsCustomerIdFromHeaders,
  getMsAdsAccountIdFromHeaders,
  getMsAdsCredentialFingerprint,
} from "./msads-auth-adapter.js";

/**
 * Microsoft Ads Bearer auth strategy.
 *
 * Extracts OAuth2 access token, developer token, customer ID, and account ID
 * from HTTP headers. Validates by calling GetUser via the adapter.
 *
 * Headers:
 * - Authorization: Bearer <access_token>
 * - X-MSAds-Developer-Token: <developer_token>
 * - X-MSAds-Customer-Id: <customer_id>
 * - X-MSAds-Account-Id: <account_id>
 */
export class MsAdsBearerAuthStrategy implements AuthStrategy {
  constructor(
    private readonly customerApiBaseUrl?: string
  ) {}

  async verify(
    headers: Record<string, string | string[] | undefined>
  ): Promise<AuthResult> {
    const accessToken = parseMsAdsTokenFromHeaders(headers);
    const developerToken = getMsAdsDeveloperTokenFromHeaders(headers);
    const customerId = getMsAdsCustomerIdFromHeaders(headers);
    const accountId = getMsAdsAccountIdFromHeaders(headers);

    const adapter = new MsAdsAccessTokenAdapter(
      accessToken,
      developerToken,
      customerId,
      accountId,
      this.customerApiBaseUrl
    );

    await adapter.validate();

    const fingerprint = getMsAdsCredentialFingerprint(
      accessToken,
      developerToken,
      accountId
    );

    return {
      authInfo: {
        clientId: adapter.userId,
        authType: "msads-bearer",
      },
      platformAuthAdapter: adapter,
      credentialFingerprint: fingerprint,
    };
  }

  getCredentialFingerprint(
    headers: Record<string, string | string[] | undefined>
  ): string | undefined {
    try {
      const accessToken = parseMsAdsTokenFromHeaders(headers);
      const developerToken = getMsAdsDeveloperTokenFromHeaders(headers);
      const accountId = getMsAdsAccountIdFromHeaders(headers);
      return getMsAdsCredentialFingerprint(accessToken, developerToken, accountId);
    } catch {
      return undefined;
    }
  }
}
```

**Step 4: Update barrel export**

Add to `src/auth/index.ts`:
```typescript
export { MsAdsBearerAuthStrategy } from "./msads-auth-strategy.js";
```

**Step 5: Run tests**

Run: `cd packages/msads-mcp && pnpm run test -- tests/auth/`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/msads-mcp/src/auth/ packages/msads-mcp/tests/auth/
git commit -m "feat(msads-mcp): add bearer auth strategy"
```

---

## Task 5: Utility Files (Errors, Telemetry, Rate Limiter, Types)

**Files:**
- Create: `packages/msads-mcp/src/utils/errors/index.ts`
- Create: `packages/msads-mcp/src/utils/telemetry/index.ts`
- Create: `packages/msads-mcp/src/utils/telemetry/tracing.ts`
- Create: `packages/msads-mcp/src/utils/security/rate-limiter.ts`
- Create: `packages/msads-mcp/src/types-global/mcp.ts`

**Step 1: Copy utility files from snapchat-mcp**

These are boilerplate files that follow the exact same pattern across all servers. Copy each from `packages/snapchat-mcp/src/utils/` and `packages/snapchat-mcp/src/types-global/`, replacing "snapchat" with "msads" and "Snapchat" with "MsAds" in:
- Error re-exports (errors/index.ts)
- Telemetry initialization (telemetry/index.ts)
- API span helper: `withMsAdsApiSpan` (telemetry/tracing.ts)
- Rate limiter configuration (security/rate-limiter.ts) — use `mcpConfig.msadsRateLimitPerMinute`
- MCP types (types-global/mcp.ts) — copy as-is

**Step 2: Commit**

```bash
git add packages/msads-mcp/src/utils/ packages/msads-mcp/src/types-global/
git commit -m "feat(msads-mcp): add utility files (errors, telemetry, rate limiter)"
```

---

## Task 6: HTTP Client

**Files:**
- Create: `packages/msads-mcp/src/services/msads/msads-http-client.ts`
- Create: `packages/msads-mcp/tests/services/msads-http-client.test.ts`

**Context:** Microsoft Ads REST API v13 uses JSON POST for all operations. Every request requires 4 headers: AuthenticationToken, DeveloperToken, CustomerId, CustomerAccountId. Responses are JSON objects (not wrapped in an envelope like Snapchat). Error responses include TrackingId, Type, Message, ErrorCode fields.

**Step 1: Write the failing test**

```typescript
// tests/services/msads-http-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MsAdsHttpClient } from "../../src/services/msads/msads-http-client.js";
import type { MsAdsAuthAdapter } from "../../src/auth/msads-auth-adapter.js";

vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual("@cesteral/shared");
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

vi.mock("../../src/utils/telemetry/tracing.js", () => ({
  withMsAdsApiSpan: (_name: string, _path: string, fn: (span: unknown) => unknown) =>
    fn({ setAttribute: vi.fn() }),
  setSpanAttribute: vi.fn(),
}));

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetch = vi.mocked(fetchWithTimeout);

function createMockAdapter(): MsAdsAuthAdapter {
  return {
    getAccessToken: vi.fn().mockResolvedValue("test-token"),
    validate: vi.fn().mockResolvedValue(undefined),
    developerToken: "dev-token",
    customerId: "cust-123",
    accountId: "acct-456",
    userId: "user-789",
  };
}

describe("MsAdsHttpClient", () => {
  let client: MsAdsHttpClient;
  let adapter: MsAdsAuthAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockAdapter();
    client = new MsAdsHttpClient(adapter, "https://campaign.api.bingads.microsoft.com/CampaignManagement/v13");
  });

  it("sends POST with all required auth headers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ CampaignIds: [111] }),
    } as Response);

    await client.post("/Campaigns/Add", { Campaigns: [{ Name: "Test" }] });

    const [, , , opts] = mockFetch.mock.calls[0]!;
    const headers = opts?.headers as Record<string, string>;
    expect(headers.AuthenticationToken).toBe("test-token");
    expect(headers.DeveloperToken).toBe("dev-token");
    expect(headers.CustomerId).toBe("cust-123");
    expect(headers.CustomerAccountId).toBe("acct-456");
  });

  it("sends GET requests with query params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ Campaigns: [] }),
    } as Response);

    await client.get("/Campaigns/GetByAccountId", { AccountId: "acct-456" });

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("AccountId=acct-456");
  });

  it("retries on 429 and 5xx", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: async () => "rate limited",
        headers: new Headers(),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "ok" }),
      } as Response);

    const result = await client.post("/Campaigns/Add", {});
    expect(result).toEqual({ result: "ok" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws McpError on non-retryable errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => "invalid params",
      headers: new Headers(),
    } as unknown as Response);

    await expect(client.post("/Campaigns/Add", {})).rejects.toThrow("Microsoft Ads API");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/msads-mcp && pnpm run test -- tests/services/msads-http-client.test.ts`
Expected: FAIL

**Step 3: Write the HTTP client**

Follow the pattern from `packages/snapchat-mcp/src/services/snapchat/snapchat-http-client.ts` but adapted:
- Use 4 auth headers instead of Bearer token
- No envelope parsing (Microsoft Ads returns plain JSON)
- Same retry logic (429/5xx with exponential backoff)
- Methods: `get()`, `post()` (Microsoft Ads REST uses POST for most operations)

```typescript
// src/services/msads/msads-http-client.ts
import type { MsAdsAuthAdapter } from "../../auth/msads-auth-adapter.js";
import { McpError, JsonRpcErrorCode } from "../../utils/errors/index.js";
import { fetchWithTimeout } from "@cesteral/shared";
import type { RequestContext, RetryConfig } from "@cesteral/shared";
import { withMsAdsApiSpan, setSpanAttribute } from "../../utils/telemetry/tracing.js";

const MSADS_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialBackoffMs: 2_000,
  maxBackoffMs: 30_000,
  timeoutMs: 30_000,
  platformName: "Microsoft Ads",
};

function mapHttpStatusToJsonRpc(httpStatus: number): JsonRpcErrorCode {
  if (httpStatus === 401) return JsonRpcErrorCode.Unauthorized;
  if (httpStatus === 403) return JsonRpcErrorCode.Forbidden;
  if (httpStatus === 429) return JsonRpcErrorCode.RateLimited;
  if (httpStatus >= 500) return JsonRpcErrorCode.ServiceUnavailable;
  return JsonRpcErrorCode.InvalidRequest;
}

function isRetryableStatus(httpStatus: number): boolean {
  return httpStatus === 429 || httpStatus >= 500;
}

/**
 * HTTP client for Microsoft Advertising REST API v13.
 *
 * All requests include 4 auth headers:
 * - AuthenticationToken: OAuth2 access token
 * - DeveloperToken: per-app developer token
 * - CustomerId: manager account ID
 * - CustomerAccountId: ad account ID
 *
 * Microsoft Ads REST API patterns:
 * - Most operations use POST (even reads like GetCampaignsByAccountId)
 * - GET is used for some simple lookups
 * - Response is plain JSON (no wrapper envelope)
 * - Errors: { TrackingId, Type, Message, ErrorCode }
 */
export class MsAdsHttpClient {
  constructor(
    private readonly authAdapter: MsAdsAuthAdapter,
    private readonly baseUrl: string
  ) {}

  async get(
    path: string,
    params?: Record<string, string>,
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path, params);
    return this.executeRequest(url, "GET", context);
  }

  async post(
    path: string,
    data?: Record<string, unknown> | unknown[],
    context?: RequestContext
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    return this.executeRequest(url, "POST", context, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, value);
        }
      }
    }
    return url.toString();
  }

  private async executeRequest(
    url: string,
    method: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    return withMsAdsApiSpan(`api.${method}`, url, async (span) => {
      span.setAttribute("http.request.method", method);
      span.setAttribute("http.url", url);
      return this.executeRequestInner(url, method, context, options);
    });
  }

  private async executeRequestInner(
    url: string,
    method: string,
    context?: RequestContext,
    options?: RequestInit
  ): Promise<unknown> {
    const maxRetries = MSADS_RETRY_CONFIG.maxRetries ?? 3;
    const timeoutMs = MSADS_RETRY_CONFIG.timeoutMs ?? 30_000;

    let lastError: McpError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const accessToken = await this.authAdapter.getAccessToken();

      const response = await fetchWithTimeout(
        url,
        timeoutMs,
        context,
        {
          ...options,
          method,
          headers: {
            AuthenticationToken: accessToken,
            DeveloperToken: this.authAdapter.developerToken,
            CustomerId: this.authAdapter.customerId,
            CustomerAccountId: this.authAdapter.accountId,
            "Content-Type": "application/json",
            ...options?.headers,
          },
        }
      );

      setSpanAttribute("http.response.status_code", response.status);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        const mcpError = new McpError(
          mapHttpStatusToJsonRpc(response.status),
          `Microsoft Ads API HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`,
          { requestId: context?.requestId, httpStatus: response.status, url, method, attempt }
        );

        if (!isRetryableStatus(response.status) || attempt >= maxRetries) {
          throw mcpError;
        }

        lastError = mcpError;
        await this.sleep(this.calculateBackoff(attempt, response));
        continue;
      }

      return response.json();
    }

    throw (
      lastError ??
      new McpError(JsonRpcErrorCode.InternalError, "Unexpected retry loop exit", { requestId: context?.requestId })
    );
  }

  private calculateBackoff(attempt: number, response: Response): number {
    const initialBackoffMs = MSADS_RETRY_CONFIG.initialBackoffMs ?? 2_000;
    const maxBackoffMs = MSADS_RETRY_CONFIG.maxBackoffMs ?? 30_000;

    let delayMs = Math.min(initialBackoffMs * Math.pow(2, attempt), maxBackoffMs);

    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
      const retryAfterSeconds = parseInt(retryAfter, 10);
      if (!isNaN(retryAfterSeconds)) {
        delayMs = Math.min(retryAfterSeconds * 1000, maxBackoffMs);
      }
    }

    return delayMs;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

**Step 4: Run tests**

Run: `cd packages/msads-mcp && pnpm run test -- tests/services/msads-http-client.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/msads-mcp/src/services/msads/msads-http-client.ts packages/msads-mcp/tests/services/
git commit -m "feat(msads-mcp): add HTTP client with retry and auth headers"
```

---

## Task 7: Entity Mapping

**Files:**
- Create: `packages/msads-mcp/src/mcp-server/tools/utils/entity-mapping.ts`
- Create: `packages/msads-mcp/tests/tools/msads-entity-mapping.test.ts`

**Context:** Microsoft Ads REST API v13 uses verb-based endpoints (not RESTful paths). Each entity type has its own Add/Get/Update/Delete operations. Entity hierarchy: Account → Campaign → AdGroup → Ad/Keyword, plus shared resources (Budget, AdExtension, Audience, Label).

**Step 1: Write the failing test**

```typescript
// tests/tools/msads-entity-mapping.test.ts
import { describe, it, expect } from "vitest";
import {
  getEntityConfig,
  getSupportedEntityTypes,
  getEntityTypeEnum,
  type MsAdsEntityType,
} from "../../src/mcp-server/tools/utils/entity-mapping.js";

describe("MsAds Entity Mapping", () => {
  it("returns all 8 supported entity types", () => {
    const types = getSupportedEntityTypes();
    expect(types).toHaveLength(8);
    expect(types).toContain("campaign");
    expect(types).toContain("adGroup");
    expect(types).toContain("ad");
    expect(types).toContain("keyword");
    expect(types).toContain("budget");
    expect(types).toContain("adExtension");
    expect(types).toContain("audience");
    expect(types).toContain("label");
  });

  it("campaign config has correct operations", () => {
    const config = getEntityConfig("campaign");
    expect(config.addOperation).toBe("/Campaigns/Add");
    expect(config.getByAccountOperation).toBe("/Campaigns/GetByAccountId");
    expect(config.getByIdsOperation).toBe("/Campaigns/GetByIds");
    expect(config.updateOperation).toBe("/Campaigns/Update");
    expect(config.deleteOperation).toBe("/Campaigns/Delete");
    expect(config.idField).toBe("Id");
    expect(config.pluralName).toBe("Campaigns");
  });

  it("adGroup config has correct operations", () => {
    const config = getEntityConfig("adGroup");
    expect(config.addOperation).toBe("/AdGroups/Add");
    expect(config.getByParentOperation).toBe("/AdGroups/GetByCampaignId");
    expect(config.parentIdField).toBe("CampaignId");
  });

  it("keyword config has correct operations", () => {
    const config = getEntityConfig("keyword");
    expect(config.addOperation).toBe("/Keywords/Add");
    expect(config.getByParentOperation).toBe("/Keywords/GetByAdGroupId");
    expect(config.parentIdField).toBe("AdGroupId");
  });

  it("getEntityTypeEnum returns tuple for Zod", () => {
    const tuple = getEntityTypeEnum();
    expect(tuple.length).toBeGreaterThan(0);
    expect(typeof tuple[0]).toBe("string");
  });

  it("throws for unknown entity type", () => {
    expect(() => getEntityConfig("unknown" as MsAdsEntityType)).toThrow("Unknown");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/msads-mcp && pnpm run test -- tests/tools/msads-entity-mapping.test.ts`
Expected: FAIL

**Step 3: Write entity mapping**

```typescript
// src/mcp-server/tools/utils/entity-mapping.ts
export type MsAdsEntityType =
  | "campaign"
  | "adGroup"
  | "ad"
  | "keyword"
  | "budget"
  | "adExtension"
  | "audience"
  | "label";

export interface MsAdsEntityConfig {
  /** REST operation path for adding entities (POST) */
  addOperation: string;
  /** REST operation path for getting by account ID (POST) */
  getByAccountOperation?: string;
  /** REST operation path for getting by parent entity ID (POST) */
  getByParentOperation?: string;
  /** REST operation path for getting by entity IDs (POST) */
  getByIdsOperation: string;
  /** REST operation path for updating entities (POST) */
  updateOperation: string;
  /** REST operation path for deleting entities (POST) */
  deleteOperation: string;
  /** Primary ID field in the response object */
  idField: string;
  /** Parent ID field (e.g., CampaignId for adGroups) */
  parentIdField?: string;
  /** Plural name for the entity (used as response/request key) */
  pluralName: string;
  /** Singular display name */
  displayName: string;
  /** Batch limit for add/update operations */
  batchLimit: number;
}

const ENTITY_CONFIGS: Record<MsAdsEntityType, MsAdsEntityConfig> = {
  campaign: {
    addOperation: "/Campaigns/Add",
    getByAccountOperation: "/Campaigns/GetByAccountId",
    getByIdsOperation: "/Campaigns/GetByIds",
    updateOperation: "/Campaigns/Update",
    deleteOperation: "/Campaigns/Delete",
    idField: "Id",
    pluralName: "Campaigns",
    displayName: "Campaign",
    batchLimit: 100,
  },
  adGroup: {
    addOperation: "/AdGroups/Add",
    getByParentOperation: "/AdGroups/GetByCampaignId",
    getByIdsOperation: "/AdGroups/GetByIds",
    updateOperation: "/AdGroups/Update",
    deleteOperation: "/AdGroups/Delete",
    idField: "Id",
    parentIdField: "CampaignId",
    pluralName: "AdGroups",
    displayName: "Ad Group",
    batchLimit: 1000,
  },
  ad: {
    addOperation: "/Ads/Add",
    getByParentOperation: "/Ads/GetByAdGroupId",
    getByIdsOperation: "/Ads/GetByIds",
    updateOperation: "/Ads/Update",
    deleteOperation: "/Ads/Delete",
    idField: "Id",
    parentIdField: "AdGroupId",
    pluralName: "Ads",
    displayName: "Ad",
    batchLimit: 50,
  },
  keyword: {
    addOperation: "/Keywords/Add",
    getByParentOperation: "/Keywords/GetByAdGroupId",
    getByIdsOperation: "/Keywords/GetByIds",
    updateOperation: "/Keywords/Update",
    deleteOperation: "/Keywords/Delete",
    idField: "Id",
    parentIdField: "AdGroupId",
    pluralName: "Keywords",
    displayName: "Keyword",
    batchLimit: 1000,
  },
  budget: {
    addOperation: "/Budgets/Add",
    getByIdsOperation: "/Budgets/GetByIds",
    updateOperation: "/Budgets/Update",
    deleteOperation: "/Budgets/Delete",
    idField: "Id",
    pluralName: "Budgets",
    displayName: "Budget",
    batchLimit: 100,
  },
  adExtension: {
    addOperation: "/AdExtensions/Add",
    getByIdsOperation: "/AdExtensions/GetByIds",
    updateOperation: "/AdExtensions/Update",
    deleteOperation: "/AdExtensions/Delete",
    idField: "Id",
    pluralName: "AdExtensions",
    displayName: "Ad Extension",
    batchLimit: 100,
  },
  audience: {
    addOperation: "/Audiences/Add",
    getByIdsOperation: "/Audiences/GetByIds",
    updateOperation: "/Audiences/Update",
    deleteOperation: "/Audiences/Delete",
    idField: "Id",
    pluralName: "Audiences",
    displayName: "Audience",
    batchLimit: 100,
  },
  label: {
    addOperation: "/Labels/Add",
    getByIdsOperation: "/Labels/GetByIds",
    updateOperation: "/Labels/Update",
    deleteOperation: "/Labels/Delete",
    idField: "Id",
    pluralName: "Labels",
    displayName: "Label",
    batchLimit: 100,
  },
};

export function getEntityConfig(entityType: MsAdsEntityType): MsAdsEntityConfig {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) {
    throw new Error(`Unknown Microsoft Ads entity type: ${entityType}`);
  }
  return config;
}

export function getSupportedEntityTypes(): MsAdsEntityType[] {
  return Object.keys(ENTITY_CONFIGS) as MsAdsEntityType[];
}

export function getEntityTypeEnum(): [string, ...string[]] {
  const types = getSupportedEntityTypes();
  return types as [string, ...string[]];
}
```

**Step 4: Run tests**

Run: `cd packages/msads-mcp && pnpm run test -- tests/tools/msads-entity-mapping.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/msads-mcp/src/mcp-server/tools/utils/entity-mapping.ts packages/msads-mcp/tests/tools/
git commit -m "feat(msads-mcp): add entity mapping for 8 entity types"
```

---

## Task 8: Entity Service

**Files:**
- Create: `packages/msads-mcp/src/services/msads/msads-service.ts`
- Create: `packages/msads-mcp/tests/services/msads-service.test.ts`

**Context:** Generic CRUD service wrapping MsAdsHttpClient. Uses entity mapping to route operations. Microsoft Ads returns partial success (nil elements for failed items in batches).

**Step 1: Write the failing test**

Test list, get, create, update, delete operations using mocked HTTP client.

**Step 2: Write the service**

Follow same pattern as `packages/snapchat-mcp/src/services/snapchat/snapchat-service.ts`:
- `listEntities()` — calls getByAccountOperation or getByParentOperation
- `getEntity()` — calls getByIdsOperation with single ID
- `createEntity()` — calls addOperation
- `updateEntity()` — calls updateOperation (partial update supported)
- `deleteEntity()` — calls deleteOperation
- `bulkCreateEntities()`, `bulkUpdateEntities()`, `bulkUpdateStatus()`
- `adjustBids()` — read-modify-write for keyword/adGroup bids

**Step 3: Run tests, commit**

```bash
git commit -m "feat(msads-mcp): add entity service with CRUD operations"
```

---

## Task 9: Reporting Service

**Files:**
- Create: `packages/msads-mcp/src/services/msads/msads-reporting-service.ts`
- Create: `packages/msads-mcp/tests/services/msads-reporting-service.test.ts`

**Context:** Async reporting via Reporting API v13. Flow: SubmitGenerateReport → PollGenerateReport → download CSV/TSV.

**Step 1: Write tests for submit, poll, download, and full getReport flow**

**Step 2: Write the reporting service**

Follow same pattern as `packages/snapchat-mcp/src/services/snapchat/snapchat-reporting-service.ts`:
- `submitReport()` — POST to `/Reports/Submit` → returns ReportRequestId
- `pollReport()` — POST to `/Reports/Poll` → returns Status + ReportDownloadUrl
- `checkReportStatus()` — single poll
- `downloadReport()` — fetch URL, parse CSV
- `getReport()` — full flow: submit → poll until Success → download

**Step 3: Run tests, commit**

```bash
git commit -m "feat(msads-mcp): add reporting service with async poll flow"
```

---

## Task 10: Session Services

**Files:**
- Create: `packages/msads-mcp/src/services/session-services.ts`

**Step 1: Write session services**

```typescript
// src/services/session-services.ts
import type { Logger } from "pino";
import type { RateLimiter, SessionServiceStore as SharedStore } from "@cesteral/shared";
import { SessionServiceStore } from "@cesteral/shared";
import type { MsAdsAuthAdapter } from "../auth/msads-auth-adapter.js";
import { MsAdsHttpClient } from "./msads/msads-http-client.js";
import { MsAdsService } from "./msads/msads-service.js";
import { MsAdsReportingService } from "./msads/msads-reporting-service.js";

export interface SessionServices {
  msadsService: MsAdsService;
  msadsReportingService: MsAdsReportingService;
}

export interface MsAdsSessionConfig {
  reportPollIntervalMs: number;
  reportMaxPollAttempts: number;
}

export const sessionServiceStore = new SessionServiceStore<SessionServices>();

export function createSessionServices(
  authAdapter: MsAdsAuthAdapter,
  campaignApiBaseUrl: string,
  reportingApiBaseUrl: string,
  logger: Logger,
  rateLimiter: RateLimiter,
  sessionConfig: MsAdsSessionConfig
): SessionServices {
  const campaignClient = new MsAdsHttpClient(authAdapter, campaignApiBaseUrl);
  const reportingClient = new MsAdsHttpClient(authAdapter, reportingApiBaseUrl);

  const msadsService = new MsAdsService(campaignClient, logger);
  const msadsReportingService = new MsAdsReportingService(
    reportingClient,
    logger,
    sessionConfig.reportPollIntervalMs,
    sessionConfig.reportMaxPollAttempts
  );

  return { msadsService, msadsReportingService };
}
```

**Step 2: Create resolve-session utility**

```typescript
// src/mcp-server/tools/utils/resolve-session.ts
import { sessionServiceStore, type SessionServices } from "../../../services/session-services.js";
import type { ToolSdkContext } from "@cesteral/shared";

export function resolveSessionServices(sdkContext: ToolSdkContext): SessionServices {
  const sessionId = sdkContext.sessionId;
  const services = sessionServiceStore.get(sessionId);
  if (!services) {
    throw new Error(`No session services found for sessionId: ${sessionId}`);
  }
  return services;
}
```

**Step 3: Commit**

```bash
git commit -m "feat(msads-mcp): add session services and resolve utility"
```

---

## Task 11: Tool Definitions (Core CRUD — 6 tools)

**Files:**
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/list-entities.tool.ts`
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/get-entity.tool.ts`
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/create-entity.tool.ts`
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/update-entity.tool.ts`
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/delete-entity.tool.ts`
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/list-accounts.tool.ts`
- Create: `packages/msads-mcp/tests/tools/msads-list-entities.test.ts`
- Create: `packages/msads-mcp/tests/tools/msads-create-entity.test.ts`

**Step 1: Write tests for list-entities and create-entity tools**

Follow pattern from `packages/snapchat-mcp/tests/tools/snapchat-list-entities.test.ts` and `snapchat-create-entity.test.ts`.

**Step 2: Implement all 6 core CRUD tool definitions**

Each tool follows the exact pattern from snapchat-mcp tool definitions:
- TOOL_NAME constant (e.g., `"msads_list_entities"`)
- Zod input schema
- Output schema
- Logic function that calls `resolveSessionServices()` then `msadsService.*`
- Response formatter
- Annotations (readOnlyHint/destructiveHint)
- Input examples

**Step 3: Run tests, commit**

```bash
git commit -m "feat(msads-mcp): add core CRUD tool definitions (6 tools)"
```

---

## Task 12: Tool Definitions (Reporting — 4 tools)

**Files:**
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/get-report.tool.ts`
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/submit-report.tool.ts`
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/check-report-status.tool.ts`
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/download-report.tool.ts`

**Step 1: Implement reporting tools**

Follow pattern from snapchat-mcp reporting tools. Key params:
- `msads_get_report`: reportType, accountId, dateRange, columns
- `msads_submit_report`: same params, non-blocking
- `msads_check_report_status`: reportRequestId
- `msads_download_report`: downloadUrl, maxRows

**Step 2: Write tests for submit and check-status**

**Step 3: Run tests, commit**

```bash
git commit -m "feat(msads-mcp): add reporting tool definitions (4 tools)"
```

---

## Task 13: Tool Definitions (Bulk Operations — 4 tools)

**Files:**
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/bulk-create-entities.tool.ts`
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/bulk-update-entities.tool.ts`
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/bulk-update-status.tool.ts`
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/adjust-bids.tool.ts`

**Step 1: Implement bulk tools following snapchat-mcp patterns**

**Step 2: Run tests, commit**

```bash
git commit -m "feat(msads-mcp): add bulk operation tool definitions (4 tools)"
```

---

## Task 14: Tool Definitions (Targeting, Specialized, Import — 5 tools)

**Files:**
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/manage-ad-extensions.tool.ts`
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/manage-criterions.tool.ts`
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/get-ad-preview.tool.ts`
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/validate-entity.tool.ts`
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/import-from-google.tool.ts`

**Step 1: Implement specialized tools**

The `import-from-google` tool is unique to Microsoft Ads — uses the ImportJobs API:
- POST `/ImportJobs/Add` to create import job
- POST `/ImportJobs/GetByIds` to check status

**Step 2: Run tests, commit**

```bash
git commit -m "feat(msads-mcp): add targeting, specialized, and import tools (5 tools)"
```

---

## Task 15: Tool Index and Barrel Exports

**Files:**
- Create: `packages/msads-mcp/src/mcp-server/tools/definitions/index.ts`
- Create: `packages/msads-mcp/src/mcp-server/tools/index.ts`

**Step 1: Create barrel exports**

```typescript
// src/mcp-server/tools/definitions/index.ts
// Import all tool definitions and export as productionTools array
import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { createEntityTool } from "./create-entity.tool.js";
import { updateEntityTool } from "./update-entity.tool.js";
import { deleteEntityTool } from "./delete-entity.tool.js";
import { listAccountsTool } from "./list-accounts.tool.js";
import { getReportTool } from "./get-report.tool.js";
import { submitReportTool } from "./submit-report.tool.js";
import { checkReportStatusTool } from "./check-report-status.tool.js";
import { downloadReportTool } from "./download-report.tool.js";
import { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
import { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
import { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
import { adjustBidsTool } from "./adjust-bids.tool.js";
import { manageAdExtensionsTool } from "./manage-ad-extensions.tool.js";
import { manageCriterionsTool } from "./manage-criterions.tool.js";
import { getAdPreviewTool } from "./get-ad-preview.tool.js";
import { validateEntityTool } from "./validate-entity.tool.js";
import { importFromGoogleTool } from "./import-from-google.tool.js";

export const productionTools = [
  listEntitiesTool,
  getEntityTool,
  createEntityTool,
  updateEntityTool,
  deleteEntityTool,
  listAccountsTool,
  getReportTool,
  submitReportTool,
  checkReportStatusTool,
  downloadReportTool,
  bulkCreateEntitiesTool,
  bulkUpdateEntitiesTool,
  bulkUpdateStatusTool,
  adjustBidsTool,
  manageAdExtensionsTool,
  manageCriterionsTool,
  getAdPreviewTool,
  validateEntityTool,
  importFromGoogleTool,
];
```

```typescript
// src/mcp-server/tools/index.ts
export { productionTools as allTools } from "./definitions/index.js";
```

**Step 2: Commit**

```bash
git commit -m "feat(msads-mcp): add tool barrel exports (19 tools)"
```

---

## Task 16: MCP Resources

**Files:**
- Create: `packages/msads-mcp/src/mcp-server/resources/index.ts`
- Create: `packages/msads-mcp/src/mcp-server/resources/types.ts`
- Create: `packages/msads-mcp/src/mcp-server/resources/definitions/index.ts`
- Create: `packages/msads-mcp/src/mcp-server/resources/definitions/entity-hierarchy.resource.ts`
- Create: `packages/msads-mcp/src/mcp-server/resources/definitions/entity-schemas.resource.ts`
- Create: `packages/msads-mcp/src/mcp-server/resources/definitions/entity-examples.resource.ts`
- Create: `packages/msads-mcp/src/mcp-server/resources/definitions/reporting-reference.resource.ts`

**Step 1: Create resources following snapchat-mcp pattern**

Key content for entity-hierarchy resource:
- Entity hierarchy: Account → Campaign → AdGroup → Ad/Keyword
- Shared resources: Budget, AdExtension, Audience, Label
- Campaign types: Search, Shopping, Audience, Performance Max
- Microsoft Ads REST API operation patterns

Key content for reporting-reference resource:
- Report types: CampaignPerformance, AdGroupPerformance, AdPerformance, KeywordPerformance, SearchQuery, etc.
- Available columns/metrics
- Async flow: SubmitGenerateReport → PollGenerateReport → download

**Step 2: Commit**

```bash
git commit -m "feat(msads-mcp): add MCP resources (entity hierarchy, schemas, examples, reporting)"
```

---

## Task 17: MCP Prompts

**Files:**
- Create: `packages/msads-mcp/src/mcp-server/prompts/index.ts`
- Create: `packages/msads-mcp/src/mcp-server/prompts/definitions/campaign-setup-workflow.prompt.ts`
- Create: `packages/msads-mcp/src/mcp-server/prompts/definitions/reporting-workflow.prompt.ts`
- Create: `packages/msads-mcp/src/mcp-server/prompts/definitions/google-import-workflow.prompt.ts`

**Step 1: Create prompt definitions following snapchat-mcp pattern**

The `google-import-workflow` prompt is unique to Microsoft Ads — guides importing campaigns from Google Ads.

**Step 2: Add additional standard prompts**

Copy and adapt from snapchat-mcp:
- bulk-operations-workflow
- entity-update-workflow
- targeting-discovery-workflow
- troubleshoot-entity
- tool-schema-exploration
- cross-platform-campaign-setup
- cross-platform-performance

**Step 3: Commit**

```bash
git commit -m "feat(msads-mcp): add MCP prompts including Google Ads import workflow"
```

---

## Task 18: MCP Server and Transport

**Files:**
- Create: `packages/msads-mcp/src/mcp-server/server.ts`
- Create: `packages/msads-mcp/src/mcp-server/transports/streamable-http-transport.ts`
- Create: `packages/msads-mcp/src/index.ts`

**Step 1: Create server.ts**

Follow snapchat-mcp pattern:
- `createMcpServer()` — creates McpServer, registers tools via `registerToolsFromDefinitions()`, registers resources and prompts
- `runStdioServer()` — starts stdio transport

**Step 2: Create streamable-http-transport.ts**

Follow snapchat-mcp pattern, adapted for `msads-bearer` auth:
- Auth strategy: `MsAdsBearerAuthStrategy`
- Session creation: extract `MsAdsAuthAdapter` from `platformAuthAdapter`
- CORS headers for Microsoft Ads-specific headers (`X-MSAds-Developer-Token`, `X-MSAds-Customer-Id`, `X-MSAds-Account-Id`)

**Step 3: Create index.ts entry point**

Follow snapchat-mcp/src/index.ts pattern:
- `setupStdioCredentials()` reads `MSADS_ACCESS_TOKEN`, `MSADS_DEVELOPER_TOKEN`, `MSADS_CUSTOMER_ID`, `MSADS_ACCOUNT_ID` from env
- `bootstrapMcpServer()` with all wiring

**Step 4: Commit**

```bash
git commit -m "feat(msads-mcp): add MCP server, transport, and entry point"
```

---

## Task 19: Integration Tests

**Files:**
- Create: `packages/msads-mcp/tests/mcp-server/msads-definitions-coverage.test.ts`
- Create: `packages/msads-mcp/tests/mcp-server/msads-server-transport.test.ts`
- Create: `packages/msads-mcp/tests/cross-server-contract.test.ts`

**Step 1: Create definitions coverage test**

Verifies all exported tools have required fields (name, description, inputSchema, logic, responseFormatter).

**Step 2: Create server transport test**

Verifies the Hono app can be instantiated and responds to health checks.

**Step 3: Create cross-server contract test**

Verifies tool names follow `msads_` prefix convention.

**Step 4: Run all tests**

Run: `cd packages/msads-mcp && pnpm run test`
Expected: ALL PASS

**Step 5: Commit**

```bash
git commit -m "test(msads-mcp): add integration and contract tests"
```

---

## Task 20: Build and Monorepo Integration

**Files:**
- Modify: `pnpm-workspace.yaml` (if not auto-detected)
- Modify: `scripts/dev-server.sh` (add msads-mcp entry)

**Step 1: Build the package**

Run: `cd /Users/daniel.thorner/GitHub/cesteral-mcp-servers && pnpm run build`
Expected: All packages build successfully including msads-mcp

**Step 2: Type check**

Run: `pnpm run typecheck`
Expected: No errors

**Step 3: Run all tests**

Run: `pnpm run test`
Expected: All tests pass

**Step 4: Add dev-server.sh entry**

Add msads-mcp port 3013 entry to `scripts/dev-server.sh`.

**Step 5: Update CLAUDE.md**

Add msads-mcp to the project overview, commands, ports, and tools catalog.

**Step 6: Commit**

```bash
git commit -m "feat(msads-mcp): integrate into monorepo build and dev scripts"
```

---

## Summary

| Task | Description | Est. Tools |
|------|-------------|------------|
| 1 | Package scaffolding | — |
| 2 | Configuration (Zod schema) | — |
| 3 | Auth adapter + tests | — |
| 4 | Auth strategy + tests | — |
| 5 | Utility files (errors, telemetry, rate limiter) | — |
| 6 | HTTP client + tests | — |
| 7 | Entity mapping + tests | 8 types |
| 8 | Entity service + tests | — |
| 9 | Reporting service + tests | — |
| 10 | Session services | — |
| 11 | Core CRUD tools + tests | 6 tools |
| 12 | Reporting tools | 4 tools |
| 13 | Bulk operation tools | 4 tools |
| 14 | Targeting, specialized, import tools | 5 tools |
| 15 | Tool barrel exports | — |
| 16 | MCP Resources | 4 resources |
| 17 | MCP Prompts | ~10 prompts |
| 18 | Server + transport + entry point | — |
| 19 | Integration tests | — |
| 20 | Monorepo integration + CLAUDE.md | — |

**Total: 19 tools, 8 entity types, 4 resources, ~10 prompts**
