import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  metaService: {
    createEntity: vi.fn(),
    getEntity: vi.fn(),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn(),
  },
}));

vi.mock("../../src/auth/meta-auth-strategy.js", () => {
  return {
    MetaBearerAuthStrategy: class {
      constructor(_baseUrl: string, _logger?: unknown) {}

      async verify(_headers: Record<string, string | string[] | undefined>) {
        return {
          authInfo: {
            clientId: "user-123",
            subject: "Test User",
            authType: "meta-bearer",
          },
          platformAuthAdapter: {
            getAccessToken: async () => "mock-token",
            validate: async () => {},
            userId: "user-123",
          },
          credentialFingerprint: "fp-test",
        };
      }

      async getCredentialFingerprint(
        _headers: Record<string, string | string[] | undefined>
      ) {
        return "fp-test";
      }
    },
  };
});

vi.mock("../../src/services/session-services.js", async () => {
  const services = new Map<string, any>();
  const fingerprints = new Map<string, string>();
  const authContexts = new Map<string, any>();
  const store = {
    set(
      sessionId: string,
      sessionServices: any,
      credentialFingerprint?: string
    ) {
      services.set(sessionId, sessionServices);
      if (credentialFingerprint)
        fingerprints.set(sessionId, credentialFingerprint);
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
      metaService: mockState.metaService,
      metaInsightsService: { getInsights: vi.fn(), getInsightsBreakdowns: vi.fn() } as any,
      metaTargetingService: { searchTargeting: vi.fn(), getTargetingOptions: vi.fn() } as any,
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
  serviceName: "meta-mcp-test",
  port: 3005,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpStatefulSessionTimeoutMs: 60_000,
  mcpAuthMode: "meta-bearer",
  mcpAuthSecretKey: undefined,
  mcpAllowedOrigins: "*",
  logLevel: "debug",
  mcpLogLevel: "debug",
  otelEnabled: false,
  otelServiceName: "meta-mcp-test",
  otelExporterOtlpTracesEndpoint: undefined,
  otelExporterOtlpMetricsEndpoint: undefined,
  metaApiBaseUrl: "https://graph.test/v21.0",
  metaApiVersion: "v21.0",
  metaRateLimitPerMinute: 200,
  metaAccessToken: undefined,
};

async function postMcp(app: any, payload: unknown, sessionId?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-03-26",
    authorization: "Bearer mock-meta-token",
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

describe("mcp transport error propagation", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    mockState.metaService.createEntity.mockRejectedValue(
      new Error("Injected create failure")
    );

    const server = createMcpHttpServer(config, logger);
    app = server.app;
    shutdown = server.shutdown;
  });

  afterAll(async () => {
    await shutdown();
  });

  it("returns an MCP tool error payload when service throws", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "meta_create_entity",
        arguments: {
          entityType: "campaign",
          adAccountId: "act_123456789",
          data: {
            name: "Will Fail",
            objective: "OUTCOME_TRAFFIC",
            special_ad_categories: [],
          },
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.sessionId).toBeDefined();
    expect(mockState.metaService.createEntity).toHaveBeenCalledOnce();
    const combinedOutput = `${result.text}\n${JSON.stringify(result.json ?? {})}`;
    expect(combinedOutput).toContain("Injected create failure");
  });
});
