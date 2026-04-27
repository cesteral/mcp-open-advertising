/**
 * Auth E2E Tests — Meta MCP Server
 *
 * Tests auth rejection/acceptance scenarios through the real transport layer.
 * Mocks only fetchWithTimeout at the network boundary.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const META_BASE = "https://graph.example.test/v21.0";

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(async (url: string) => {
      // Auth validation (GET /me)
      if (url.includes("/me?")) {
        return new Response(
          JSON.stringify({ id: "user-123", name: "Test User" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      // API calls — generic success
      return new Response(
        JSON.stringify({ id: "camp-001", name: "Test Campaign" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }),
  };
});

import { fetchWithTimeout } from "@cesteral/shared";
import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";

const mockFetch = vi.mocked(fetchWithTimeout);

const logger: any = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(),
};
logger.child.mockReturnValue(logger);

const config: any = {
  serviceName: "meta-mcp-auth-test",
  port: 3005,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpStatefulSessionTimeoutMs: 60_000,
  mcpAuthMode: "meta-bearer",
  mcpAuthSecretKey: undefined,
  mcpAllowedOrigins: "*",
  logLevel: "debug",
  mcpLogLevel: "debug",
  otelEnabled: false,
  otelServiceName: "meta-mcp-auth-test",
  otelExporterOtlpTracesEndpoint: undefined,
  otelExporterOtlpMetricsEndpoint: undefined,
  metaApiBaseUrl: META_BASE,
  metaRateLimitPerMinute: 100,
  metaAccessToken: undefined,
};

function makeRequest(app: any, headers: Record<string, string>) {
  return app.request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-03-26",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "meta_get_entity",
        arguments: { entityType: "campaign", entityId: "camp-001", fields: ["name", "status"] },
      },
    }),
  });
}

describe("meta-mcp auth e2e", () => {
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

  it("valid Bearer token → 200", async () => {
    const response = await makeRequest(app, {
      authorization: "Bearer valid-meta-token-123",
    });
    expect(response.status).toBe(200);
  });

  it("missing Authorization header → 401", async () => {
    const response = await makeRequest(app, {});
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("Authorization");
  });

  it("invalid token (GET /me fails) → 401", async () => {
    mockFetch.mockImplementationOnce(async (url: string) => {
      if (url.includes("/me?")) {
        return new Response(
          JSON.stringify({ error: { message: "Invalid OAuth access token", type: "OAuthException", code: 190 } }),
          { status: 401, statusText: "Unauthorized", headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    const response = await makeRequest(app, {
      authorization: "Bearer invalid-token",
    });
    expect(response.status).toBe(401);
  });

  it("fingerprint mismatch on session reuse → 401", async () => {
    // First request with token-A creates a session
    const first = await makeRequest(app, {
      authorization: "Bearer token-A-for-fingerprint-test",
    });
    expect(first.status).toBe(200);
    const sessionId = first.headers.get("mcp-session-id");
    expect(sessionId).toBeDefined();

    // Second request with different token but same session → mismatch
    const second = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-03-26",
        "mcp-session-id": sessionId!,
        authorization: "Bearer token-B-different",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "meta_get_entity",
          arguments: { entityType: "campaign", entityId: "camp-001", fields: ["name"] },
        },
      }),
    });
    expect(second.status).toBe(401);
    const body = await second.json();
    expect(body.error).toContain("credential mismatch");
  });
});
