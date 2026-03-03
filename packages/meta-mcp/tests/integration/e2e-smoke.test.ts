/**
 * E2E Smoke Test — Meta MCP Server
 *
 * Exercises the full HTTP -> auth -> session -> tool -> service -> response
 * pipeline by mocking ONLY fetchWithTimeout at the network boundary.
 *
 * Unlike other integration tests that mock auth strategies and session
 * services, this test uses the REAL MetaBearerAuthStrategy, REAL
 * MetaAccessTokenAdapter, REAL MetaGraphApiClient, and REAL MetaService.
 * The single mock point is the shared fetchWithTimeout function.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock only fetchWithTimeout — the single network boundary
// ---------------------------------------------------------------------------
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

import { fetchWithTimeout } from "@cesteral/shared";
import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";

const mockFetch = vi.mocked(fetchWithTimeout);

// ---------------------------------------------------------------------------
// Logger stub
// ---------------------------------------------------------------------------
const logger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};
logger.child.mockReturnValue(logger);

// ---------------------------------------------------------------------------
// Config — uses real meta-bearer auth (not "none")
// ---------------------------------------------------------------------------
const config: any = {
  serviceName: "meta-mcp-test",
  port: 3005,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpSessionMode: "stateful",
  mcpStatefulSessionTimeoutMs: 60_000,
  mcpAuthMode: "meta-bearer",
  mcpAuthSecretKey: undefined,
  mcpAllowedOrigins: "*",
  logLevel: "debug",
  mcpLogLevel: "debug",
  otelEnabled: false,
  otelServiceName: "meta-mcp-test",
  otelExporterOtlpTracesEndpoint: undefined,
  otelExporterOtlpMetricsEndpoint: undefined,
  metaApiBaseUrl: "https://graph.example.test/v21.0",
  metaRateLimitPerMinute: 100,
  metaAccessToken: undefined,
};

// ---------------------------------------------------------------------------
// Helper — POST to /mcp with Bearer auth
// ---------------------------------------------------------------------------
function parseSSE(text: string): any {
  // The Streamable HTTP transport returns SSE: "event: message\ndata: {...}\n\n"
  // Extract JSON from the last "data:" line.
  for (const line of text.split("\n").reverse()) {
    if (line.startsWith("data: ")) {
      try {
        return JSON.parse(line.slice(6));
      } catch {
        // continue
      }
    }
  }
  // Fallback: try parsing the whole text as JSON (non-SSE responses)
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function postMcp(app: any, payload: unknown, sessionId?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-03-26",
    authorization: "Bearer test-meta-token-abc123",
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
  const json = parseSSE(text);
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
// Mock fetchWithTimeout — route by URL pattern
// ---------------------------------------------------------------------------
function setupFetchMock() {
  mockFetch.mockImplementation(async (url: string, _timeout, _ctx, options) => {
    const urlStr = String(url);
    const method = (options as RequestInit | undefined)?.method ?? "GET";

    // Auth validation: GET /me?fields=id,name&access_token=...
    if (urlStr.includes("/me?")) {
      return new Response(
        JSON.stringify({ id: "user-123", name: "Test User" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // GET — entity read (contains an entity ID like camp-001)
    if (method === "GET" && urlStr.includes("camp-001")) {
      return new Response(
        JSON.stringify({ id: "camp-001", name: "Test Campaign", status: "ACTIVE" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // POST — entity creation (contains act_ in URL path)
    if (method === "POST" && urlStr.includes("act_12345")) {
      return new Response(
        JSON.stringify({ id: "camp-new" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Default: empty success
    return new Response(
      JSON.stringify({}),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe("meta-mcp e2e smoke", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    setupFetchMock();
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
        name: "meta_get_entity",
        arguments: {
          entityType: "campaign",
          entityId: "camp-001",
          fields: ["name", "status"],
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.json?.error).toBeUndefined();
    expect(result.sessionId).toBeDefined();

    const content = result.json?.result?.content?.[0]?.text ?? "";
    expect(content).toContain("camp-001");
    expect(content).toContain("Test Campaign");
  });

  it("full round-trip: write tool returns created entity", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "meta_create_entity",
        arguments: {
          entityType: "campaign",
          adAccountId: "act_12345",
          data: {
            name: "New Campaign",
            objective: "OUTCOME_TRAFFIC",
            status: "PAUSED",
            special_ad_categories: [],
          },
        },
      },
    });

    expect(result.response.status).toBe(200);
    expect(result.json?.error).toBeUndefined();
    expect(result.sessionId).toBeDefined();

    const content = result.json?.result?.content?.[0]?.text ?? "";
    expect(content).toContain("camp-new");
  });

  it("session reuse: second request with same session ID succeeds", async () => {
    // First request — creates a session
    const first = await postMcp(app, {
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: {
        name: "meta_get_entity",
        arguments: { entityType: "campaign", entityId: "camp-001" },
      },
    });
    expect(first.response.status).toBe(200);
    expect(first.sessionId).toBeDefined();

    // Second request — reuses same session
    const second = await postMcp(
      app,
      {
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: {
          name: "meta_get_entity",
          arguments: { entityType: "campaign", entityId: "camp-001" },
        },
      },
      first.sessionId
    );
    expect(second.response.status).toBe(200);
    expect(second.json?.error).toBeUndefined();
    expect(second.sessionId).toBe(first.sessionId);
  });

  it("error propagation: invalid args returns isError true", async () => {
    const result = await postMcp(app, {
      jsonrpc: "2.0",
      id: 20,
      method: "tools/call",
      params: {
        name: "meta_get_entity",
        arguments: {
          entityType: "campaign",
          // entityId intentionally omitted
        },
      },
    });

    expect(result.response.status).toBe(200);
    // The MCP SDK returns a JSON-RPC error for invalid params
    const hasError =
      result.json?.result?.isError === true || result.json?.error != null;
    expect(hasError).toBe(true);
  });

  it("health endpoint returns server metadata", async () => {
    const response = await app.request("http://localhost/health", {
      method: "GET",
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("healthy");
    expect(body.service).toBe("meta-mcp-test");
    expect(typeof body.activeSessions).toBe("number");
  });
});
