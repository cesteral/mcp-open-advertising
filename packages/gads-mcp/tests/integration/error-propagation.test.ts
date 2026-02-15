import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  gadsService: {
    createEntity: vi.fn(),
    getEntity: vi.fn(),
    updateEntity: vi.fn(),
    removeEntity: vi.fn(),
  },
}));

vi.mock("../../src/services/session-services.js", async () => {
  const { SessionServiceStore } = await import("@cesteral/shared");
  const store = new SessionServiceStore<any>();
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

describe("mcp transport error propagation", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    mockState.gadsService.createEntity.mockRejectedValue(new Error("Injected create failure"));

    const server = createMcpHttpServer(config, logger);
    app = server.app;
    shutdown = server.shutdown;
  });

  afterAll(async () => {
    await shutdown();
  });

  it("returns an MCP tool error payload when service throws", async () => {
    const result = await postMcp(
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
            data: { name: "Will Fail" },
          },
        },
      }
    );

    expect(result.response.status).toBe(200);
    expect(result.sessionId).toBeDefined();
    expect(mockState.gadsService.createEntity).toHaveBeenCalledOnce();
    const combinedOutput = `${result.text}\n${JSON.stringify(result.json ?? {})}`;
    expect(combinedOutput).toContain("Injected create failure");
  });
});
