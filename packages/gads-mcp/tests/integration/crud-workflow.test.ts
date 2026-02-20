import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  entities: new Map<string, Record<string, unknown>>(),
  gadsService: {
    createEntity: vi.fn(),
    getEntity: vi.fn(),
    updateEntity: vi.fn(),
    removeEntity: vi.fn(),
  },
}));

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
      gadsService: mockState.gadsService,
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
  serviceName: "gads-mcp-test",
  port: 3004,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpSessionMode: "stateful",
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

describe("mcp transport CRUD integration", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    mockState.entities.clear();
    mockState.gadsService.createEntity.mockImplementation(
      async (_entityType: string, _customerId: string, data: Record<string, unknown>) => {
        const id = "123456789";
        const entity = { ...data, resourceName: `customers/1234567890/campaigns/${id}` };
        mockState.entities.set(id, entity);
        return entity;
      }
    );
    mockState.gadsService.getEntity.mockImplementation(
      async (_entityType: string, _customerId: string, entityId: string) => {
        const entity = mockState.entities.get(entityId);
        if (!entity) {
          throw new Error("Entity not found");
        }
        return entity;
      }
    );
    mockState.gadsService.updateEntity.mockImplementation(
      async (_entityType: string, _customerId: string, entityId: string, data: Record<string, unknown>) => {
        const existing = mockState.entities.get(entityId) ?? {};
        const updated = { ...existing, ...data };
        mockState.entities.set(entityId, updated);
        return updated;
      }
    );
    mockState.gadsService.removeEntity.mockImplementation(
      async (_entityType: string, _customerId: string, entityId: string) => {
        mockState.entities.delete(entityId);
      }
    );

    const server = createMcpHttpServer(config, logger);
    app = server.app;
    shutdown = server.shutdown;
  });

  afterAll(async () => {
    await shutdown();
  });

  it("supports create -> get -> update -> remove through /mcp", async () => {
    const createResult = await postMcp(
      app,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "gads_create_entity",
          arguments: {
            entityType: "campaign",
            customerId: "1234567890",
            data: { name: "Test Campaign" },
          },
        },
      }
    );
    expect(createResult.response.status).toBe(200);
    expect(createResult.json?.error).toBeUndefined();
    expect(createResult.sessionId).toBeDefined();

    const getResult = await postMcp(
      app,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "gads_get_entity",
          arguments: {
            entityType: "campaign",
            customerId: "1234567890",
            entityId: "123456789",
          },
        },
      }
    );
    expect(getResult.response.status).toBe(200);
    expect(getResult.json?.error).toBeUndefined();
    expect(getResult.sessionId).toBeDefined();

    const updateResult = await postMcp(
      app,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "gads_update_entity",
          arguments: {
            entityType: "campaign",
            customerId: "1234567890",
            entityId: "123456789",
            data: { name: "Updated Campaign" },
            updateMask: "name",
          },
        },
      }
    );
    expect(updateResult.response.status).toBe(200);
    expect(updateResult.json?.error).toBeUndefined();
    expect(updateResult.sessionId).toBeDefined();

    const removeResult = await postMcp(
      app,
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "gads_remove_entity",
          arguments: {
            entityType: "campaign",
            customerId: "1234567890",
            entityId: "123456789",
          },
        },
      }
    );
    expect(removeResult.response.status).toBe(200);
    expect(removeResult.json?.error).toBeUndefined();
    expect(removeResult.sessionId).toBeDefined();
    expect(mockState.entities.has("123456789")).toBe(false);
  });
});
