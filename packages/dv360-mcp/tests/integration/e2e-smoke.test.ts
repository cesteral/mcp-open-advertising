/**
 * E2E Smoke Tests — DV360 MCP Server
 *
 * Tests the full HTTP → auth → session → tool → service → response pipeline.
 * Mocks session-services and auth strategy to provide mock service instances.
 * Uses google-headers auth mode with mocked auth strategy, exercising the
 * session creation, tool handler dispatch, and response formatting chain.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  dv360Service: {
    listEntities: vi.fn(),
    getEntity: vi.fn(),
    createEntity: vi.fn(),
    deleteEntity: vi.fn(),
  },
}));

vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual<any>("@cesteral/shared");
  return {
    ...actual,
    createAuthStrategy: vi.fn(() => ({
      verify: vi.fn(async () => ({
        authInfo: { clientId: "test-client", authType: "google-headers" },
        googleAuthAdapter: { validate: vi.fn() } as any,
        credentialFingerprint: "fp-test",
      })),
    })),
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
      dv360Service: mockState.dv360Service,
      targetingService: {} as any,
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
  serviceName: "dv360-mcp-test",
  port: 3002,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpStatefulSessionTimeoutMs: 60_000,
  mcpAuthMode: "google-headers",
  mcpAuthSecretKey: undefined,
  mcpAllowedOrigins: "*",
  logLevel: "debug",
  mcpLogLevel: "debug",
  otelEnabled: false,
  otelServiceName: "dv360-mcp-test",
  otelExporterOtlpTracesEndpoint: undefined,
  otelExporterOtlpMetricsEndpoint: undefined,
  dv360ApiBaseUrl: "https://displayvideo.googleapis.com/v4",
  dv360RateLimitPerMinute: 60,
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
      } catch {
        /* skip */
      }
    }
  }
  return {
    response,
    json,
    text,
    sessionId: response.headers.get("mcp-session-id") ?? json?.result?.sessionId ?? json?.sessionId,
  };
}

describe("dv360-mcp e2e smoke tests", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    mockState.dv360Service.listEntities.mockResolvedValue({
      entities: [{ campaignId: "cmp-001", displayName: "Campaign One" }],
      nextPageToken: undefined,
    });
    mockState.dv360Service.getEntity.mockResolvedValue({
      campaignId: "cmp-001",
      displayName: "Campaign One",
      entityStatus: "ENTITY_STATUS_ACTIVE",
    });
    mockState.dv360Service.createEntity.mockResolvedValue({
      campaignId: "cmp-new",
      displayName: "New Campaign",
    });
    mockState.dv360Service.deleteEntity.mockResolvedValue(undefined);

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
        name: "dv360_list_entities",
        arguments: {
          entityType: "campaign",
          advertiserId: "adv-123",
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.json?.error).toBeUndefined();
    expect(result.sessionId).toBeDefined();

    const content = result.json?.result?.content;
    expect(content).toBeDefined();
    expect(content[0]?.type).toBe("text");
    expect(content[0]?.text).toContain("Campaign One");
  });

  it("full round-trip: get entity returns entity data", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "dv360_get_entity",
        arguments: {
          entityType: "campaign",
          advertiserId: "adv-123",
          campaignId: "cmp-001",
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.json?.error).toBeUndefined();

    const content = result.json?.result?.content;
    expect(content).toBeDefined();
    expect(content[0]?.text).toContain("cmp-001");
  });

  it("session reuse: second request with same session ID succeeds", async () => {
    const first = await postMcp(app, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "dv360_list_entities",
        arguments: { entityType: "campaign", advertiserId: "adv-123" },
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
          name: "dv360_list_entities",
          arguments: { entityType: "campaign", advertiserId: "adv-123" },
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
        name: "dv360_get_entity",
        arguments: {
          // Missing required entityType and advertiserId
          campaignId: "cmp-001",
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.json?.result?.isError).toBe(true);
    expect(result.json?.result?.content?.[0]?.text).toBeDefined();
  });

  it("health endpoint returns server metadata", async () => {
    const response = await app.request("http://localhost/health", { method: "GET" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("healthy");
    expect(body.service).toBe("dv360-mcp-test");
    expect(typeof body.activeSessions).toBe("number");
  });
});
