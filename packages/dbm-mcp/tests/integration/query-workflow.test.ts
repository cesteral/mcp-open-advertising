import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  bidManagerService: {
    executeCustomQuery: vi.fn(),
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
      bidManagerService: mockState.bidManagerService,
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
  serviceName: "dbm-mcp-test",
  port: 3001,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpStatefulSessionTimeoutMs: 60_000,
  mcpAuthMode: "google-headers",
  mcpAuthSecretKey: undefined,
  mcpAllowedOrigins: "*",
  logLevel: "debug",
  mcpLogLevel: "debug",
  otelEnabled: false,
  otelServiceName: "dbm-mcp-test",
  otelExporterOtlpTracesEndpoint: undefined,
  otelExporterOtlpMetricsEndpoint: undefined,
  gcpProjectId: "project-1",
  serviceAccountJson: undefined,
  serviceAccountFile: undefined,
  rateLimitPerMinute: 100,
  reportCacheTtlMs: 300000,
  reportPollMaxRetries: 10,
  reportPollInitialDelayMs: 2000,
  reportPollMaxDelayMs: 60000,
  reportQueryRetries: 3,
  reportRetryCooldownMs: 60000,
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

describe("dbm transport query workflow", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    mockState.bidManagerService.executeCustomQuery.mockResolvedValue({
      queryId: "q-001",
      reportId: "r-001",
      status: "DONE",
      rowCount: 1,
      columns: ["FILTER_DATE", "METRIC_IMPRESSIONS"],
      data: [{ FILTER_DATE: "2026-01-01", METRIC_IMPRESSIONS: "1000" }],
    });

    const server = createMcpHttpServer(config, logger);
    app = server.app;
    shutdown = server.shutdown;
  });

  afterAll(async () => {
    await shutdown();
  });

  it("executes dbm_run_custom_query successfully over /mcp", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "dbm_run_custom_query",
        arguments: {
          reportType: "STANDARD",
          groupBys: ["FILTER_DATE"],
          metrics: ["METRIC_IMPRESSIONS"],
          dateRange: { preset: "LAST_7_DAYS" },
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.text).toContain('"jsonrpc":"2.0"');
    expect(result.text).not.toContain("Method not found");
  });
});
