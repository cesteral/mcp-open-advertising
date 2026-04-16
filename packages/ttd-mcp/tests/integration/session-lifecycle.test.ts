import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual<any>("@cesteral/shared");
  return {
    ...actual,
    validateSessionReuse: vi.fn(async (authStrategy: any, sessionServiceStore: any, headers: any, sessionId: string) => {
      const requestFingerprint = authStrategy.getCredentialFingerprint
        ? await authStrategy.getCredentialFingerprint(headers)
        : (await authStrategy.verify(headers)).credentialFingerprint;

      if (requestFingerprint && !sessionServiceStore.validateFingerprint(sessionId, requestFingerprint)) {
        return {
          valid: false,
          reason: "Credential fingerprint mismatch",
          storedFingerprint: sessionServiceStore.getFingerprint(sessionId),
          requestFingerprint,
        };
      }

      return {
        valid: true,
        requestFingerprint,
      };
    }),
  };
});

vi.mock("../../src/auth/ttd-auth-strategy.js", () => {
  return {
    TtdTokenAuthStrategy: class {
      constructor(_logger?: unknown) {}

      async verify(headers: Record<string, string | string[] | undefined>) {
        const fp = typeof headers["x-test-fingerprint"] === "string"
          ? headers["x-test-fingerprint"]
          : "fp-test";
        return {
          authInfo: { clientId: "ttd-direct-token", authType: "ttd-token" },
          platformAuthAdapter: { validate: vi.fn() } as any,
          credentialFingerprint: fp,
        };
      }

      async getCredentialFingerprint(headers: Record<string, string | string[] | undefined>) {
        return typeof headers["x-test-fingerprint"] === "string"
          ? headers["x-test-fingerprint"]
          : "fp-test";
      }
    },
  };
});

const mockState = vi.hoisted(() => ({
  ttdService: {
    getEntity: vi.fn(),
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
      ttdService: {
        ...mockState.ttdService,
        createEntity: vi.fn(),
        updateEntity: vi.fn(),
        deleteEntity: vi.fn(),
      } as any,
      ttdReportingService: { runReport: vi.fn() } as any,
    })),
    reportCsvStore: {
      list: () => [],
      getByUri: () => undefined,
    },
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
  serviceName: "ttd-mcp-test",
  port: 3003,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpSessionMode: "stateful",
  mcpStatefulSessionTimeoutMs: 60_000,
  mcpAuthMode: "ttd-token",
  mcpAuthSecretKey: undefined,
  mcpAllowedOrigins: "*",
  logLevel: "debug",
  mcpLogLevel: "debug",
  otelEnabled: false,
  otelServiceName: "ttd-mcp-test",
  otelExporterOtlpTracesEndpoint: undefined,
  otelExporterOtlpMetricsEndpoint: undefined,
  ttdApiBaseUrl: "https://api.example.test/v3",
  ttdRateLimitPerMinute: 100,
  ttdApiToken: "direct-token",
};

function buildPayload(method: string, id: number) {
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "vitest", version: "1.0.0" },
      },
    };
  }

  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name: "ttd_get_entity",
      arguments: {
        entityType: "campaign",
        entityId: "cmp-001",
        advertiserId: "adv-123",
      },
    },
  };
}

async function postMcp(
  app: any,
  method: "initialize" | "tools/call",
  id: number,
  sessionId?: string,
  fingerprint?: string
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-03-26",
    "ttd-auth": "direct-token",
  };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }
  if (fingerprint) {
    headers["x-test-fingerprint"] = fingerprint;
  }

  return app.request("http://localhost/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(buildPayload(method, id)),
  });
}

function extractSessionId(response: any, bodyText: string): string | undefined {
  let body: any = undefined;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = undefined;
  }
  return (
    response.headers.get("mcp-session-id") ??
    body?.result?.sessionId ??
    body?.sessionId
  );
}

describe("mcp transport session lifecycle", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    mockState.ttdService.getEntity.mockResolvedValue({
      CampaignId: "cmp-001",
      CampaignName: "Session Test",
    });

    const server = createMcpHttpServer(config, logger);
    app = server.app;
    shutdown = server.shutdown;
  });

  afterAll(async () => {
    await shutdown();
  });

  it("terminates session and rejects further calls with same session id", async () => {
    const initResponse = await postMcp(app, "initialize", 1, undefined, "fp-test");
    const initText = await initResponse.clone().text();
    const sessionId = extractSessionId(initResponse, initText);
    expect(sessionId).toBeDefined();

    const terminateResponse = await app.request("http://localhost/mcp", {
      method: "DELETE",
      headers: {
        "mcp-session-id": sessionId as string,
      },
    });
    expect(terminateResponse.status).toBe(200);

    const postTerminateResponse = await postMcp(app, "tools/call", 2, sessionId as string, "fp-test");

    expect(postTerminateResponse.status).toBe(404);
    const body = await postTerminateResponse.json();
    expect(body.error).toContain("Session not found");
  });

  it("rejects reused session when fingerprint mismatches", async () => {
    const initResponse = await postMcp(app, "initialize", 3, undefined, "fp-a");
    const initText = await initResponse.clone().text();
    const sessionId = extractSessionId(initResponse, initText);
    expect(sessionId).toBeDefined();

    const reusedResponse = await postMcp(app, "tools/call", 4, sessionId as string, "fp-b");
    expect(reusedResponse.status).toBe(401);
  });

  it("allows reused session when fingerprint matches", async () => {
    const initResponse = await postMcp(app, "initialize", 5, undefined, "fp-match");
    const initText = await initResponse.clone().text();
    const sessionId = extractSessionId(initResponse, initText);
    expect(sessionId).toBeDefined();

    const reusedResponse = await postMcp(app, "tools/call", 6, sessionId as string, "fp-match");
    expect(reusedResponse.status).not.toBe(401);
  });
});
