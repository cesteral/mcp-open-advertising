/**
 * Auth E2E Tests — TTD MCP Server
 *
 * Tests auth rejection/acceptance scenarios through the real transport layer.
 * Mocks only fetchWithTimeout at the network boundary.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
    fetchWithTimeout: vi.fn(async (url: string) => {
      // Auth token exchange — valid credentials
      if (url.includes(AUTH_URL)) {
        return new Response(
          JSON.stringify({ access_token: "mock-ttd-token", expires_in: 3600, token_type: "Bearer" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      // API calls — generic success
      if (url.startsWith(API_BASE)) {
        return new Response(
          JSON.stringify({ CampaignId: "cmp-001", CampaignName: "Test" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
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
  serviceName: "ttd-mcp-auth-test",
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
  otelServiceName: "ttd-mcp-auth-test",
  otelExporterOtlpTracesEndpoint: undefined,
  otelExporterOtlpMetricsEndpoint: undefined,
  ttdApiBaseUrl: API_BASE,
  ttdAuthUrl: AUTH_URL,
  ttdGraphqlUrl: "https://graphql.example.test/graphql",
  ttdRateLimitPerMinute: 100,
  ttdPartnerId: undefined,
  ttdApiSecret: undefined,
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
        name: "ttd_get_entity",
        arguments: { entityType: "campaign", entityId: "cmp-001", advertiserId: "adv-123" },
      },
    }),
  });
}

describe("ttd-mcp auth e2e", () => {
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

  it("valid TTD headers → 200", async () => {
    const response = await makeRequest(app, {
      "x-ttd-partner-id": "test-partner",
      "x-ttd-api-secret": "test-secret",
    });
    expect(response.status).toBe(200);
  });

  it("missing X-TTD-Partner-Id → 401", async () => {
    const response = await makeRequest(app, {
      "x-ttd-api-secret": "test-secret",
    });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("X-TTD-Partner-Id");
  });

  it("missing X-TTD-Api-Secret → 401", async () => {
    const response = await makeRequest(app, {
      "x-ttd-partner-id": "test-partner",
    });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain("X-TTD-Api-Secret");
  });

  it("invalid credentials (mock returns 401) → 401", async () => {
    mockFetch.mockImplementationOnce(async (url: string) => {
      if (url.includes(AUTH_URL)) {
        return new Response(
          JSON.stringify({ error: "Invalid credentials" }),
          { status: 401, statusText: "Unauthorized", headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const response = await makeRequest(app, {
      "x-ttd-partner-id": "bad-partner",
      "x-ttd-api-secret": "bad-secret",
    });
    expect(response.status).toBe(401);
  });

  it("fingerprint mismatch on session reuse → 401", async () => {
    // First request with partner-A creates a session
    const first = await makeRequest(app, {
      "x-ttd-partner-id": "partner-A",
      "x-ttd-api-secret": "secret-A",
    });
    expect(first.status).toBe(200);
    const sessionId = first.headers.get("mcp-session-id");
    expect(sessionId).toBeDefined();

    // Second request with different partner-id but same session → mismatch
    const second = await app.request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-03-26",
        "mcp-session-id": sessionId!,
        "x-ttd-partner-id": "partner-B",
        "x-ttd-api-secret": "secret-B",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "ttd_get_entity",
          arguments: { entityType: "campaign", entityId: "cmp-001", advertiserId: "adv-123" },
        },
      }),
    });
    expect(second.status).toBe(401);
    const body = await second.json();
    expect(body.error).toContain("credential mismatch");
  });

  it("DELETE with wrong credentials → 401", async () => {
    // Create a session with partner-A
    const create = await makeRequest(app, {
      "x-ttd-partner-id": "partner-delete-A",
      "x-ttd-api-secret": "secret-delete-A",
    });
    const sessionId = create.headers.get("mcp-session-id");

    // Try to delete with different credentials
    const del = await app.request("http://localhost/mcp", {
      method: "DELETE",
      headers: {
        "mcp-session-id": sessionId!,
        "x-ttd-partner-id": "partner-delete-B",
        "x-ttd-api-secret": "secret-delete-B",
      },
    });
    expect(del.status).toBe(401);
  });
});
