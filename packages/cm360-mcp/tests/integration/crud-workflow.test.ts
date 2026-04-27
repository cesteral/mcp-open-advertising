import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  entities: new Map<string, Record<string, unknown>>(),
  cm360Service: {
    listUserProfiles: vi.fn(),
    listEntities: vi.fn(),
    getEntity: vi.fn(),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn(),
    listTargetingOptions: vi.fn(),
  },
  cm360ReportingService: {
    runReport: vi.fn(),
    createReport: vi.fn(),
    checkReportFile: vi.fn(),
    downloadReportFile: vi.fn(),
  },
}));

// The mock services that will be returned for every session
const mockServices = {
  cm360Service: mockState.cm360Service,
  cm360ReportingService: mockState.cm360ReportingService,
};

vi.mock("../../src/services/session-services.js", async () => {
  const fingerprints = new Map<string, string>();
  const authContexts = new Map<string, any>();
  const store = {
    set(_sessionId: string, _sessionServices: any, credentialFingerprint?: string) {
      if (credentialFingerprint) fingerprints.set(_sessionId, credentialFingerprint);
    },
    get(_sessionId: string) {
      // Always return mock services so tool handlers can resolve them
      return mockServices;
    },
    delete(sessionId: string) {
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
      return 1;
    },
  };
  return {
    sessionServiceStore: store,
    createSessionServices: vi.fn(() => mockServices),
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
  serviceName: "cm360-mcp-test",
  port: 3008,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpStatefulSessionTimeoutMs: 60_000,
  mcpAuthMode: "none",
  mcpAuthSecretKey: undefined,
  mcpAllowedOrigins: "*",
  logLevel: "debug",
  mcpLogLevel: "debug",
  otelEnabled: false,
  otelServiceName: "cm360-mcp-test",
  otelExporterOtlpTracesEndpoint: undefined,
  otelExporterOtlpMetricsEndpoint: undefined,
  cm360ApiBaseUrl: "https://dfareporting.googleapis.com/dfareporting/v5",
  cm360RateLimitPerMinute: 100,
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
    sessionId: response.headers.get("mcp-session-id") ?? json?.result?.sessionId ?? json?.sessionId,
  };
}

describe("mcp transport CRUD integration (CM360)", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    mockState.entities.clear();

    mockState.cm360Service.createEntity.mockImplementation(
      async (_entityType: string, _profileId: string, data: Record<string, unknown>) => {
        const id = "campaign-001";
        const entity = { ...data, id };
        mockState.entities.set(id, entity);
        return entity;
      }
    );

    mockState.cm360Service.getEntity.mockImplementation(
      async (_entityType: string, _profileId: string, entityId: string) => {
        const entity = mockState.entities.get(entityId);
        if (!entity) throw new Error("Entity not found");
        return entity;
      }
    );

    mockState.cm360Service.updateEntity.mockImplementation(
      async (_entityType: string, _profileId: string, data: Record<string, unknown>) => {
        const id = data.id as string;
        const existing = mockState.entities.get(id) ?? {};
        const updated = { ...existing, ...data };
        mockState.entities.set(id, updated);
        return updated;
      }
    );

    mockState.cm360Service.deleteEntity.mockImplementation(
      async (_entityType: string, _profileId: string, entityId: string) => {
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

  it("supports create -> get -> update -> delete through /mcp", async () => {
    // Create
    const createResult = await postMcp(app, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "cm360_create_entity",
        arguments: {
          profileId: "12345",
          entityType: "campaign",
          data: { name: "Test Campaign", advertiserId: "999" },
        },
      },
    });
    expect(createResult.response.status).toBe(200);
    expect(createResult.json?.error).toBeUndefined();
    expect(createResult.sessionId).toBeDefined();

    // Get
    const getResult = await postMcp(app, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "cm360_get_entity",
        arguments: {
          profileId: "12345",
          entityType: "campaign",
          entityId: "campaign-001",
        },
      },
    });
    expect(getResult.response.status).toBe(200);
    expect(getResult.json?.error).toBeUndefined();

    // Update
    const updateResult = await postMcp(app, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "cm360_update_entity",
        arguments: {
          profileId: "12345",
          entityType: "campaign",
          entityId: "campaign-001",
          data: { id: "campaign-001", name: "Updated Campaign" },
        },
      },
    });
    expect(updateResult.response.status).toBe(200);
    expect(updateResult.json?.error).toBeUndefined();

    // Delete (using floodlightActivity since campaign doesn't support delete)
    mockState.cm360Service.deleteEntity.mockResolvedValueOnce(undefined);
    const deleteResult = await postMcp(app, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "cm360_delete_entity",
        arguments: {
          profileId: "12345",
          entityType: "floodlightActivity",
          entityId: "fl-001",
        },
      },
    });
    expect(deleteResult.response.status).toBe(200);
    expect(deleteResult.json?.error).toBeUndefined();

    expect(mockState.cm360Service.createEntity).toHaveBeenCalledOnce();
    expect(mockState.cm360Service.getEntity).toHaveBeenCalledOnce();
    expect(mockState.cm360Service.updateEntity).toHaveBeenCalledOnce();
    expect(mockState.cm360Service.deleteEntity).toHaveBeenCalledOnce();
  });
});
