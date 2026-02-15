import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  gadsService: {
    getEntity: vi.fn(),
  },
}));

vi.mock("../../src/services/session-services.js", async () => {
  const { SessionServiceStore } = await import("@cesteral/shared");
  const store = new SessionServiceStore<any>();
  return {
    sessionServiceStore: store,
    createSessionServices: vi.fn(() => ({
      httpClient: {} as any,
      gadsService: {
        ...mockState.gadsService,
        createEntity: vi.fn(),
        updateEntity: vi.fn(),
        removeEntity: vi.fn(),
      } as any,
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

  return app.request("http://localhost/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

describe("mcp transport session lifecycle", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    mockState.gadsService.getEntity.mockResolvedValue({
      resourceName: "customers/1234567890/campaigns/123456789",
      name: "Session Test Campaign",
    });

    const server = createMcpHttpServer(config, logger);
    app = server.app;
    shutdown = server.shutdown;
  });

  afterAll(async () => {
    await shutdown();
  });

  it("terminates session and rejects further calls with same session id", async () => {
    const initResponse = await postMcp(app, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "vitest", version: "1.0.0" },
      },
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
      headers: {
        "mcp-session-id": sessionId as string,
      },
    });
    expect(terminateResponse.status).toBe(200);

    const postTerminateResponse = await postMcp(
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
      },
      sessionId as string
    );

    expect(postTerminateResponse.status).toBe(404);
    const body = await postTerminateResponse.json();
    expect(body.error).toContain("Session not found");
  });
});
