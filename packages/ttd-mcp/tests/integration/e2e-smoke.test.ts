/**
 * E2E Smoke Test — TTD MCP Server
 *
 * Exercises the full HTTP -> auth -> session -> tool -> service -> response
 * pipeline by mocking ONLY fetchWithTimeout at the network boundary.
 * The real auth strategy, auth adapter, session services, HTTP client, and
 * service all execute, giving high confidence in the integration.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock fetchWithTimeout — the single network boundary
// ---------------------------------------------------------------------------
const AUTH_URL = "https://auth.example.test/v3/authentication";
const API_BASE = "https://api.example.test/v3";

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  const extractHeader = (
    headers: Record<string, string | string[] | undefined>,
    name: string
  ): string | undefined => {
    const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    const value = key ? headers[key] : undefined;
    return Array.isArray(value) ? value[0] : value;
  };
  return {
    ...actual,
    extractHeader,
    fetchWithTimeout: vi.fn(async (url: string, _timeout: number, _ctx: unknown, options?: RequestInit) => {
      const method = options?.method ?? "GET";

      // Auth token exchange
      if (url.includes(AUTH_URL)) {
        return new Response(
          JSON.stringify({ access_token: "mock-ttd-token", expires_in: 3600, token_type: "Bearer" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // GET — single entity read
      if (url.startsWith(API_BASE) && method === "GET") {
        return new Response(
          JSON.stringify({ CampaignId: "cmp-001", CampaignName: "Test Campaign" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // POST to query paths — list operation
      if (url.startsWith(API_BASE) && method === "POST" && url.includes("/query/")) {
        return new Response(
          JSON.stringify({ Result: [{ CampaignId: "cmp-001" }], TotalCount: 1, ResultCount: 1 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // POST to entity creation paths
      if (url.startsWith(API_BASE) && method === "POST") {
        const body = options?.body ? JSON.parse(options.body as string) : {};
        return new Response(
          JSON.stringify({ CampaignId: "cmp-new", CampaignName: body.CampaignName ?? "Created" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      // Fallback
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  };
});

import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";

// ---------------------------------------------------------------------------
// Logger stub
// ---------------------------------------------------------------------------
const logger: any = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(),
};
logger.child.mockReturnValue(logger);

// ---------------------------------------------------------------------------
// Config — uses real ttd-headers auth, not "none"
// ---------------------------------------------------------------------------
const config: any = {
  serviceName: "ttd-mcp-test",
  port: 3003,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpSessionMode: "stateful",
  mcpStatefulSessionTimeoutMs: 60_000,
  mcpAuthMode: "ttd-headers",
  mcpAuthSecretKey: undefined,
  mcpAllowedOrigins: "*",
  logLevel: "debug",
  mcpLogLevel: "debug",
  otelEnabled: false,
  otelServiceName: "ttd-mcp-test",
  otelExporterOtlpTracesEndpoint: undefined,
  otelExporterOtlpMetricsEndpoint: undefined,
  ttdApiBaseUrl: API_BASE,
  ttdAuthUrl: AUTH_URL,
  ttdGraphqlUrl: "https://graphql.example.test/graphql",
  ttdRateLimitPerMinute: 100,
  ttdPartnerId: undefined,
  ttdApiSecret: undefined,
};

// ---------------------------------------------------------------------------
// Helper — post to MCP endpoint with TTD auth headers
// ---------------------------------------------------------------------------
async function postMcp(app: any, payload: unknown, sessionId?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-03-26",
    "x-ttd-partner-id": "test-partner",
    "x-ttd-api-secret": "test-secret",
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

  // Try plain JSON first
  try { json = JSON.parse(text); } catch { json = undefined; }

  // If that failed, try parsing SSE data events
  if (!json) {
    const dataLines = text.split("\n").filter((l: string) => l.startsWith("data:"));
    for (const line of dataLines) {
      try {
        const candidate = JSON.parse(line.slice(5).trim());
        // Pick the JSON-RPC response that matches our request id
        if (candidate?.jsonrpc === "2.0" && candidate?.id !== undefined) {
          json = candidate;
          break;
        }
      } catch { /* skip non-JSON data lines */ }
    }
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("e2e smoke — real auth + session + service pipeline", () => {
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

  it("full round-trip: read tool returns valid MCP response", async () => {
    const { response, json } = await postMcp(app, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "ttd_get_entity",
        arguments: { entityType: "campaign", entityId: "cmp-001", advertiserId: "adv-123" },
      },
    });

    expect(response.status).toBe(200);
    expect(json?.error).toBeUndefined();

    const content = json?.result?.content;
    expect(content).toBeDefined();
    expect(content[0]?.type).toBe("text");
    expect(content[0]?.text).toContain("cmp-001");
  });

  it("full round-trip: write tool returns created entity", async () => {
    const { response, json } = await postMcp(app, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "ttd_create_entity",
        arguments: {
          entityType: "campaign",
          advertiserId: "adv-123",
          data: { CampaignName: "New Campaign", AdvertiserId: "adv-123" },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(json?.error).toBeUndefined();

    const content = json?.result?.content;
    expect(content).toBeDefined();
    expect(content[0]?.text).toContain("New Campaign");
  });

  it("session reuse: second request with same session ID succeeds", async () => {
    const first = await postMcp(app, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "ttd_get_entity",
        arguments: { entityType: "campaign", entityId: "cmp-001", advertiserId: "adv-123" },
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
          name: "ttd_get_entity",
          arguments: { entityType: "campaign", entityId: "cmp-001", advertiserId: "adv-123" },
        },
      },
      first.sessionId!
    );

    expect(second.response.status).toBe(200);
    expect(second.json?.error).toBeUndefined();
    expect(second.sessionId).toBe(first.sessionId);
  });

  it("error propagation: invalid args returns isError true", async () => {
    const { response, json } = await postMcp(app, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "ttd_get_entity",
        arguments: { entityId: "cmp-001" },
      },
    });

    expect(response.status).toBe(200);
    const result = json?.result;
    expect(result?.isError).toBe(true);
  });

  it("health endpoint returns server metadata", async () => {
    const response = await app.request("http://localhost/health", { method: "GET" });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("healthy");
    expect(body.service).toBe("ttd-mcp-test");
    expect(typeof body.activeSessions).toBe("number");
  });
});
