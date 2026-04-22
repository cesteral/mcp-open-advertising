/**
 * E2E Smoke Tests — GAds MCP Server
 *
 * Tests the full HTTP → auth → session → tool → service → response pipeline.
 * Mocks session-services to provide mock service instances (GAds uses
 * Google Ads REST API which goes through fetchWithTimeout, but the auth
 * adapter creation is complex). Uses "none" auth mode with env var
 * credentials, exercising the real NoAuthStrategy + session creation chain.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  gadsService: {
    createEntity: vi.fn(),
    getEntity: vi.fn(),
    updateEntity: vi.fn(),
    removeEntity: vi.fn(),
    listEntities: vi.fn(),
    executeGaqlQuery: vi.fn(),
  },
}));

vi.mock("../../src/auth/gads-auth-adapter.js", async () => {
  const actual = await vi.importActual<any>("../../src/auth/gads-auth-adapter.js");
  return {
    ...actual,
    GAdsRefreshTokenAuthAdapter: class {
      developerToken: string;
      loginCustomerId: string | undefined;
      constructor(creds: { developerToken: string; loginCustomerId?: string }) {
        this.developerToken = creds.developerToken;
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
    get(sessionId: string) { return services.get(sessionId); },
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
    getFingerprint(sessionId: string) { return fingerprints.get(sessionId); },
    setAuthContext(sessionId: string, authContext: any) { authContexts.set(sessionId, authContext); },
    getAuthContext(sessionId: string) { return authContexts.get(sessionId); },
    isFull() { return false; },
    get size() { return services.size; },
  };
  return {
    sessionServiceStore: store,
    createSessionServices: vi.fn(() => ({
      httpClient: {} as any,
      gadsService: mockState.gadsService,
    })),
  };
});

import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";

const logger: any = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(),
};
logger.child.mockReturnValue(logger);

const config: any = {
  serviceName: "gads-mcp-test",
  port: 3004,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpStatefulSessionTimeoutMs: 60_000,
  mcpAuthMode: "none",
  mcpAuthSecretKey: undefined,
  mcpAllowedOrigins: "*",
  logLevel: "debug",
  mcpLogLevel: "debug",
  otelEnabled: false,
  otelServiceName: "gads-mcp-test",
  otelExporterOtlpTracesEndpoint: undefined,
  otelExporterOtlpMetricsEndpoint: undefined,
  gadsApiBaseUrl: "https://googleads.googleapis.com/v23",
  gadsRateLimitPerMinute: 100,
  gadsDeveloperToken: "test-dev-token",
  gadsClientId: "test-client-id",
  gadsClientSecret: "test-client-secret",
  gadsRefreshToken: "test-refresh-token",
  gadsLoginCustomerId: undefined,
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
  try { json = JSON.parse(text); } catch { json = undefined; }
  // Parse SSE data lines if plain JSON parsing failed
  if (!json) {
    const dataLines = text.split("\n").filter((l: string) => l.startsWith("data:"));
    for (const line of dataLines) {
      try {
        const candidate = JSON.parse(line.slice(5).trim());
        if (candidate?.jsonrpc === "2.0" && candidate?.id !== undefined) {
          json = candidate;
          break;
        }
      } catch { /* skip */ }
    }
  }
  return {
    response, json, text,
    sessionId:
      response.headers.get("mcp-session-id") ??
      json?.result?.sessionId ??
      json?.sessionId,
  };
}

describe("gads-mcp e2e smoke tests", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    mockState.gadsService.getEntity.mockResolvedValue({
      resourceName: "customers/1234567890/campaigns/111",
      campaign: { name: "Test Campaign", status: "ENABLED" },
    });
    mockState.gadsService.createEntity.mockResolvedValue({
      resourceName: "customers/1234567890/campaigns/222",
    });
    mockState.gadsService.listEntities.mockResolvedValue({
      results: [{ campaign: { resourceName: "customers/1234567890/campaigns/111", name: "Test" } }],
      totalResultsCount: "1",
    });

    const server = createMcpHttpServer(config, logger);
    app = server.app;
    shutdown = server.shutdown;
  });

  afterAll(async () => {
    await shutdown();
  });

  it("full round-trip: read tool returns valid MCP response", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "gads_get_entity",
        arguments: {
          entityType: "campaign",
          customerId: "1234567890",
          entityId: "111",
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.json?.error).toBeUndefined();
    expect(result.sessionId).toBeDefined();

    const content = result.json?.result?.content;
    expect(content).toBeDefined();
    expect(content[0]?.type).toBe("text");
    expect(content[0]?.text).toContain("Test Campaign");
  });

  it("full round-trip: write tool returns created entity", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "gads_create_entity",
        arguments: {
          entityType: "campaign",
          customerId: "1234567890",
          data: { name: "New Campaign" },
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.json?.error).toBeUndefined();

    const content = result.json?.result?.content;
    expect(content).toBeDefined();
    expect(content[0]?.text).toContain("222");
  });

  it("session reuse: second request with same session ID succeeds", async () => {
    const first = await postMcp(app, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "gads_get_entity",
        arguments: { entityType: "campaign", customerId: "1234567890", entityId: "111" },
      },
    });
    expect(first.response.status).toBe(200);
    expect(first.sessionId).toBeDefined();

    const second = await postMcp(
      app,
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "gads_get_entity",
          arguments: { entityType: "campaign", customerId: "1234567890", entityId: "111" },
        },
      },
      first.sessionId!
    );
    expect(second.response.status).toBe(200);
    expect(second.sessionId).toBe(first.sessionId);
  });

  it("error propagation: invalid args returns isError true", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "gads_get_entity",
        arguments: {
          // Missing required entityType and customerId
          entityId: "111",
        },
      },
    });

    expect(result.response.status).toBe(200);
    const content = result.json?.result?.content;
    expect(result.json?.result?.isError).toBe(true);
    expect(content?.[0]?.text).toBeDefined();
  });

  it("health endpoint returns server metadata", async () => {
    const response = await app.request("http://localhost/health", { method: "GET" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("healthy");
    expect(body.service).toBe("gads-mcp-test");
    expect(typeof body.activeSessions).toBe("number");
  });
});
