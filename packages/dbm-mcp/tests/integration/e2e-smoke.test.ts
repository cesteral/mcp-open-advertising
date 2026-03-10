/**
 * E2E Smoke Tests — DBM MCP Server
 *
 * Tests the full HTTP → auth → session → tool → service → response pipeline.
 * Mocks session-services and auth strategy to provide mock service instances.
 * DBM uses the googleapis SDK internally (not fetchWithTimeout for API calls),
 * so we mock at the session-services level while still exercising the real
 * transport, session creation, tool handler dispatch, and response formatting.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  bidManagerService: {
    executeCustomQuery: vi.fn(),
    getDeliveryMetrics: vi.fn(),
    getPerformanceMetrics: vi.fn(),
    getHistoricalMetrics: vi.fn(),
    getPacingStatus: vi.fn(),
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
    get(sessionId: string) { return services.get(sessionId); },
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
    getFingerprint(sessionId: string) { return fingerprints.get(sessionId); },
    setAuthContext(sessionId: string, authContext: any) { authContexts.set(sessionId, authContext); },
    getAuthContext(sessionId: string) { return authContexts.get(sessionId); },
    isFull() { return false; },
    get size() { return services.size; },
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
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(),
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
  try { json = JSON.parse(text); } catch { json = undefined; }
  // Parse SSE data lines if plain JSON parsing failed
  if (!json) {
    const dataLines = text.split("\n").filter((l: string) => l.startsWith("data:"));
    for (const line of dataLines) {
      try {
        const candidate = JSON.parse(line.slice(5).trim());
        if (candidate?.jsonrpc === "2.0" && candidate?.id !== undefined) {
          json = candidate;
          break;
        }
      } catch { /* skip */ }
    }
  }
  return {
    response, json, text,
    sessionId:
      response.headers.get("mcp-session-id") ??
      json?.result?.sessionId ??
      json?.sessionId,
  };
}

describe("dbm-mcp e2e smoke tests", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    mockState.bidManagerService.executeCustomQuery.mockResolvedValue({
      queryId: "q-001",
      reportId: "r-001",
      status: "DONE",
      rowCount: 2,
      columns: ["FILTER_DATE", "METRIC_IMPRESSIONS"],
      data: [
        { FILTER_DATE: "2026-01-01", METRIC_IMPRESSIONS: "5000" },
        { FILTER_DATE: "2026-01-02", METRIC_IMPRESSIONS: "6000" },
      ],
    });
    mockState.bidManagerService.getDeliveryMetrics.mockResolvedValue({
      impressions: 11000,
      clicks: 220,
      spend: 45.50,
      conversions: 15,
      revenue: 120.00,
    });

    const server = createMcpHttpServer(config, logger);
    app = server.app;
    shutdown = server.shutdown;
  });

  afterAll(async () => {
    await shutdown();
  });

  it("full round-trip: read tool returns valid MCP response", async () => {
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
    expect(result.json?.error).toBeUndefined();
    expect(result.sessionId).toBeDefined();

    const content = result.json?.result?.content;
    expect(content).toBeDefined();
    expect(content[0]?.type).toBe("text");
    expect(content[0]?.text).toContain("METRIC_IMPRESSIONS");
  });

  it("full round-trip: campaign delivery tool returns metrics", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "dbm_get_campaign_delivery",
        arguments: {
          campaignId: "camp-001",
          advertiserId: "adv-123",
          startDate: "2026-01-01",
          endDate: "2026-01-31",
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.json?.error).toBeUndefined();

    const content = result.json?.result?.content;
    expect(content).toBeDefined();
    expect(content[0]?.text).toContain("camp-001");
  });

  it("session reuse: second request with same session ID succeeds", async () => {
    const first = await postMcp(app, {
      jsonrpc: "2.0",
      id: 3,
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
    expect(first.response.status).toBe(200);
    expect(first.sessionId).toBeDefined();

    const second = await postMcp(
      app,
      {
        jsonrpc: "2.0",
        id: 4,
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
      },
      first.sessionId!
    );
    expect(second.response.status).toBe(200);
    expect(second.sessionId).toBe(first.sessionId);
  });

  it("error propagation: invalid args returns isError true", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "dbm_run_custom_query",
        arguments: {
          // Missing required reportType, groupBys, metrics, dateRange
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.json?.result?.isError).toBe(true);
    expect(result.json?.result?.content?.[0]?.text).toBeDefined();
  });

  it("health endpoint returns server metadata", async () => {
    const response = await app.request("http://localhost/health", { method: "GET" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("healthy");
    expect(body.service).toBe("dbm-mcp-test");
    expect(typeof body.activeSessions).toBe("number");
  });
});
