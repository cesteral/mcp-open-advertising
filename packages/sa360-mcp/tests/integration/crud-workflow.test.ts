import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Integration test: SA360 search -> list -> get workflow through the MCP transport.
 *
 * SA360 is read-only for entities, so the workflow tests search, list, and get operations
 * rather than create/update/delete.
 */

const mockState = vi.hoisted(() => ({
  entities: new Map<string, Record<string, unknown>>(),
  sa360Service: {
    sa360Search: vi.fn(),
    listAccessibleCustomers: vi.fn(),
    getEntity: vi.fn(),
    listEntities: vi.fn(),
    searchFields: vi.fn(),
    listCustomColumns: vi.fn(),
  },
  conversionService: {
    insertConversions: vi.fn(),
    updateConversions: vi.fn(),
  },
}));

vi.mock("../../src/auth/sa360-auth-adapter.js", async () => {
  const actual = await vi.importActual<any>("../../src/auth/sa360-auth-adapter.js");
  return {
    ...actual,
    SA360RefreshTokenAuthAdapter: class {
      loginCustomerId: string | undefined;
      constructor(creds: { loginCustomerId?: string }) {
        this.loginCustomerId = creds.loginCustomerId;
      }
      async getAccessToken() { return "mock-token"; }
      async validate() {}
    },
  };
});

vi.mock("../../src/services/session-services.js", async () => {
  const services = new Map<string, any>();
  const fingerprints = new Map<string, string>();
  const authContexts = new Map<string, any>();
  const store = {
    set(sessionId: string, sessionServices: any, credentialFingerprint?: string) {
      services.set(sessionId, sessionServices);
      if (credentialFingerprint) fingerprints.set(sessionId, credentialFingerprint);
    },
    get(sessionId: string) {
      return services.get(sessionId);
    },
    delete(sessionId: string) {
      services.delete(sessionId);
      fingerprints.delete(sessionId);
      authContexts.delete(sessionId);
    },
    validateFingerprint(sessionId: string, credentialFingerprint: string) {
      const stored = fingerprints.get(sessionId);
      if (!stored) return true;
      return stored === credentialFingerprint;
    },
    getFingerprint(sessionId: string) {
      return fingerprints.get(sessionId);
    },
    setAuthContext(sessionId: string, authContext: any) {
      authContexts.set(sessionId, authContext);
    },
    getAuthContext(sessionId: string) {
      return authContexts.get(sessionId);
    },
    isFull() {
      return false;
    },
    get size() {
      return services.size;
    },
  };
  return {
    sessionServiceStore: store,
    createSessionServices: vi.fn(() => ({
      httpClient: {} as any,
      v2HttpClient: {} as any,
      sa360Service: mockState.sa360Service,
      conversionService: mockState.conversionService,
    })),
  };
});

import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";

const logger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};
logger.child.mockReturnValue(logger);

const config: any = {
  serviceName: "sa360-mcp-test",
  port: 3010,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpStatefulSessionTimeoutMs: 60_000,
  mcpAuthMode: "none",
  mcpAuthSecretKey: undefined,
  mcpAllowedOrigins: "*",
  logLevel: "debug",
  mcpLogLevel: "debug",
  otelEnabled: false,
  otelServiceName: "sa360-mcp-test",
  otelExporterOtlpTracesEndpoint: undefined,
  otelExporterOtlpMetricsEndpoint: undefined,
  sa360ApiBaseUrl: "https://searchads360.googleapis.com/v0",
  sa360V2ApiBaseUrl: "https://www.googleapis.com/doubleclicksearch/v2",
  sa360RateLimitPerMinute: 100,
  sa360ClientId: "test-client-id",
  sa360ClientSecret: "test-client-secret",
  sa360RefreshToken: "test-refresh-token",
  sa360LoginCustomerId: undefined,
};

async function postMcp(app: any, payload: unknown, sessionId?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-03-26",
  };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }

  const response = await app.request("http://localhost/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return {
    response,
    json,
    text,
    sessionId:
      response.headers.get("mcp-session-id") ??
      json?.result?.sessionId ??
      json?.sessionId,
  };
}

describe("SA360 MCP transport search/list/get workflow", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    // Set up mock implementations
    mockState.sa360Service.sa360Search.mockResolvedValue({
      results: [{ campaign: { id: "123", name: "Search Campaign" } }],
      nextPageToken: undefined,
      totalResultsCount: 1,
    });

    mockState.sa360Service.listAccessibleCustomers.mockResolvedValue({
      resourceNames: ["customers/1234567890"],
    });

    mockState.sa360Service.getEntity.mockImplementation(
      async (_entityType: string, _customerId: string, entityId: string) => {
        if (entityId === "123") {
          return { campaign: { id: "123", name: "Search Campaign" } };
        }
        throw new Error(`Entity ${entityId} not found`);
      }
    );

    mockState.sa360Service.listEntities.mockResolvedValue({
      entities: [
        { campaign: { id: "123", name: "Search Campaign" } },
        { campaign: { id: "456", name: "Display Campaign" } },
      ],
      nextPageToken: undefined,
      totalResultsCount: 2,
    });

    const server = createMcpHttpServer(config, logger);
    app = server.app;
    shutdown = server.shutdown;
  });

  afterAll(async () => {
    await shutdown();
  });

  it("supports sa360_search through /mcp", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "sa360_search",
        arguments: {
          customerId: "1234567890",
          query: "SELECT campaign.id, campaign.name FROM campaign",
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.json?.error).toBeUndefined();
    expect(result.sessionId).toBeDefined();
    expect(mockState.sa360Service.sa360Search).toHaveBeenCalled();
  });

  it("supports sa360_list_entities through /mcp", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "sa360_list_entities",
        arguments: {
          entityType: "campaign",
          customerId: "1234567890",
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.json?.error).toBeUndefined();
    expect(result.sessionId).toBeDefined();
  });

  it("supports sa360_list_accounts through /mcp", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "sa360_list_accounts",
        arguments: {},
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.json?.error).toBeUndefined();
    expect(result.sessionId).toBeDefined();
    expect(mockState.sa360Service.listAccessibleCustomers).toHaveBeenCalled();
  });
});
