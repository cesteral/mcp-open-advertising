import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
      bidManagerService: {
        executeCustomQuery: vi.fn().mockResolvedValue({
          queryId: "q-001",
          reportId: "r-001",
          status: "DONE",
          rowCount: 0,
          columns: [],
          data: [],
        }),
      },
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

describe("dbm transport session lifecycle", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    const server = createMcpHttpServer(config, logger);
    app = server.app;
    shutdown = server.shutdown;
  });

  afterAll(async () => {
    await shutdown();
  });

  it("terminates session and rejects reused session id", async () => {
    const initResponse = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-03-26",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "vitest", version: "1.0.0" },
        },
      }),
    });

    const initText = await initResponse.clone().text();
    let initBody: any = undefined;
    try {
      initBody = JSON.parse(initText);
    } catch {
      initBody = undefined;
    }
    const sessionId =
      initResponse.headers.get("mcp-session-id") ??
      initBody?.result?.sessionId ??
      initBody?.sessionId;
    expect(sessionId).toBeDefined();

    const terminateResponse = await app.request("http://localhost/mcp", {
      method: "DELETE",
      headers: { "mcp-session-id": sessionId as string },
    });
    expect(terminateResponse.status).toBe(200);

    const reusedResponse = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-03-26",
        "mcp-session-id": sessionId as string,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "run_custom_query",
          arguments: {
            reportType: "STANDARD",
            groupBys: ["FILTER_DATE"],
            metrics: ["METRIC_IMPRESSIONS"],
            dateRange: { preset: "LAST_7_DAYS" },
          },
        },
      }),
    });

    expect(reusedResponse.status).toBe(404);
  });
});
