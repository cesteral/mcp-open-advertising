import { describe, expect, it, vi } from "vitest";

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
import { sessionServiceStore } from "../../src/services/session-services.js";

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

describe("session rebuild after in-memory eviction (Cloud Run scale-out simulation)", () => {
  it("rebuilds services when a follow-up request arrives with a sessionId absent from this instance's store", async () => {
    // Instance A: receives the initialize request.
    const { app: appA } = createMcpHttpServer(config, logger);
    // Instance B: a second Cloud Run instance with its own per-process
    // session tracker. Cloud Run round-robins without session_affinity, so
    // follow-up calls land here. Shares the module-level sessionServiceStore
    // because the mock treats it as a module-level singleton — deleting
    // from it simulates "not in this instance's store".
    const { app: appB } = createMcpHttpServer(config, logger);

    // 1. Client initializes against instance A
    const initRes = await appA.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-03-26",
        "ttd-auth": "token-client-1",
        "x-test-fingerprint": "fp-client-1",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      }),
    });
    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();
    expect(sessionServiceStore.get(sessionId!)).toBeTruthy();

    // 2. Simulate scale-out: drop from shared store so instance B sees a cold cache.
    sessionServiceStore.delete(sessionId!);
    expect(sessionServiceStore.get(sessionId!)).toBeUndefined();

    // 3. Follow-up tool call lands on instance B (never saw this session).
    const toolRes = await appB.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-03-26",
        "ttd-auth": "token-client-1",
        "x-test-fingerprint": "fp-client-1",
        "mcp-session-id": sessionId!,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });

    // EXPECTED AFTER FIX: 200 and store is repopulated.
    // TODAY: 404 "Session not found or expired"
    expect(toolRes.status).toBe(200);
    expect(sessionServiceStore.get(sessionId!)).toBeTruthy();
  });
});
