import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  ttdService: {
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
      ttdService: {
        ...mockState.ttdService,
        createEntity: vi.fn(),
        updateEntity: vi.fn(),
        deleteEntity: vi.fn(),
      } as any,
      ttdReportingService: { runReport: vi.fn() } as any,
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
  serviceName: "ttd-mcp-test",
  port: 3003,
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
  otelServiceName: "ttd-mcp-test",
  otelExporterOtlpTracesEndpoint: undefined,
  otelExporterOtlpMetricsEndpoint: undefined,
  ttdApiBaseUrl: "https://api.example.test/v3",
  ttdAuthUrl: "https://auth.example.test/oauth2/token",
  ttdRateLimitPerMinute: 100,
  ttdPartnerId: "partner-1",
  ttdApiSecret: "secret-1",
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
          name: "ttd_get_entity",
          arguments: {
            entityType: "campaign",
            entityId: "cmp-001",
            advertiserId: "adv-123",
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
