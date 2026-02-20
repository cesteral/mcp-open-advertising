import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  dv360Service: {
    getEntity: vi.fn(),
  },
}));

vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual<any>("@cesteral/shared");
  return {
    ...actual,
    createAuthStrategy: vi.fn(() => ({
      verify: vi.fn(async () => ({
        authInfo: { clientId: "test-client", authType: "google-headers" },
        googleAuthAdapter: {} as any,
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
      dv360Service: {
        listEntities: vi.fn(),
        deleteEntity: vi.fn(),
        ...mockState.dv360Service,
      } as any,
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
  mcpSessionMode: "stateful",
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

async function postMcp(app: any, payload: unknown) {
  const response = await app.request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-03-26",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  return { response, text };
}

describe("dv360 transport error propagation", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    mockState.dv360Service.getEntity.mockRejectedValue(new Error("Injected dv360 get failure"));
    const server = createMcpHttpServer(config, logger);
    app = server.app;
    shutdown = server.shutdown;
  });

  afterAll(async () => {
    await shutdown();
  });

  it("returns error output from failing service call", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 1,
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
    expect(mockState.dv360Service.getEntity).toHaveBeenCalledOnce();
    expect(result.text).toContain("Injected dv360 get failure");
  });
});
