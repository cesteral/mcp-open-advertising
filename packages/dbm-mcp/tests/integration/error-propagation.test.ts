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
        googleAuthAdapter: {} as any,
        credentialFingerprint: "fp-test",
      })),
    })),
  };
});

vi.mock("../../src/services/session-services.js", async () => {
  const { SessionServiceStore } = await import("@cesteral/shared");
  const store = new SessionServiceStore<any>();
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
  mcpSessionMode: "stateful",
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

describe("dbm transport error propagation", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    mockState.bidManagerService.executeCustomQuery.mockRejectedValue(
      new Error("Injected custom query failure")
    );
    const server = createMcpHttpServer(config, logger);
    app = server.app;
    shutdown = server.shutdown;
  });

  afterAll(async () => {
    await shutdown();
  });

  it("returns error payload for failing custom query", async () => {
    const response = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-03-26",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "run_custom_query",
          arguments: {
            reportType: "STANDARD",
            groupBys: ["FILTER_NOT_REAL"],
            metrics: ["METRIC_IMPRESSIONS"],
            dateRange: { preset: "LAST_7_DAYS" },
          },
        },
      }),
    });

    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain("isError");
    expect(text).toContain("safeParseAsync");
  });
});
