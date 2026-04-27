/**
 * Auth E2E Tests — CM360 MCP Server
 *
 * Tests auth rejection/acceptance scenarios through the real transport layer.
 * CM360 uses google-headers auth mode; we mock createAuthStrategy to control
 * credential validation without needing real Google credentials.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    createAuthStrategy: vi.fn(() => ({
      verify: vi.fn(async (headers: Record<string, string | string[] | undefined>) => {
        if (!headers.authorization && !headers["x-google-auth-type"]) {
          throw new Error("Missing required credentials");
        }
        if (headers.authorization === "Bearer invalid-token") {
          throw new Error("Invalid credentials");
        }
        const fp =
          typeof headers["x-test-fingerprint"] === "string"
            ? headers["x-test-fingerprint"]
            : "fp-default";
        return {
          authInfo: {
            clientId: "test-user",
            authType: "google-headers",
          },
          googleAuthAdapter: {
            validate: vi.fn(),
            getAccessToken: vi.fn().mockResolvedValue("mock-token"),
            getAuthClient: vi.fn(),
          },
          credentialFingerprint: fp,
        };
      }),
      getCredentialFingerprint: vi.fn(
        async (headers: Record<string, string | string[] | undefined>) => {
          return typeof headers["x-test-fingerprint"] === "string"
            ? headers["x-test-fingerprint"]
            : "fp-default";
        }
      ),
    })),
  };
});

const mockState = vi.hoisted(() => ({
  cm360Service: {
    listUserProfiles: vi.fn(),
    listEntities: vi.fn(),
    getEntity: vi.fn(),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn(),
    listTargetingOptions: vi.fn(),
  },
  cm360ReportingService: {
    runReport: vi.fn(),
    createReport: vi.fn(),
    checkReportFile: vi.fn(),
    downloadReportFile: vi.fn(),
  },
}));

const mockServices = {
  cm360Service: mockState.cm360Service,
  cm360ReportingService: mockState.cm360ReportingService,
};

vi.mock("../../src/services/session-services.js", async () => {
  const fingerprints = new Map<string, string>();
  const authContexts = new Map<string, any>();
  const store = {
    set(_sessionId: string, _sessionServices: any, credentialFingerprint?: string) {
      if (credentialFingerprint) fingerprints.set(_sessionId, credentialFingerprint);
    },
    get(_sessionId: string) {
      return mockServices;
    },
    delete(sessionId: string) {
      fingerprints.delete(sessionId);
      authContexts.delete(sessionId);
    },
    validateFingerprint(sessionId: string, credentialFingerprint: string) {
      const stored = fingerprints.get(sessionId);
      if (!stored) return true;
      return stored === credentialFingerprint;
    },
    getFingerprint(sessionId: string) {
      return fingerprints.get(sessionId);
    },
    setAuthContext(sessionId: string, authContext: any) {
      authContexts.set(sessionId, authContext);
    },
    getAuthContext(sessionId: string) {
      return authContexts.get(sessionId);
    },
    isFull() {
      return false;
    },
    get size() {
      return 1;
    },
  };
  return {
    sessionServiceStore: store,
    createSessionServices: vi.fn(() => mockServices),
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
  serviceName: "cm360-mcp-auth-test",
  port: 3008,
  host: "127.0.0.1",
  nodeEnv: "test",
  mcpStatefulSessionTimeoutMs: 60_000,
  mcpAuthMode: "google-headers",
  mcpAuthSecretKey: undefined,
  mcpAllowedOrigins: "*",
  logLevel: "debug",
  mcpLogLevel: "debug",
  otelEnabled: false,
  otelServiceName: "cm360-mcp-auth-test",
  otelExporterOtlpTracesEndpoint: undefined,
  otelExporterOtlpMetricsEndpoint: undefined,
  cm360ApiBaseUrl: "https://dfareporting.googleapis.com/dfareporting/v5",
  cm360RateLimitPerMinute: 100,
};

async function postMcp(
  app: any,
  payload: unknown,
  sessionId?: string,
  extraHeaders?: Record<string, string>
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-03-26",
    ...extraHeaders,
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
    sessionId: response.headers.get("mcp-session-id") ?? json?.result?.sessionId ?? json?.sessionId,
  };
}

const toolCallPayload = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "cm360_list_entities",
    arguments: {
      profileId: "12345",
      entityType: "campaign",
    },
  },
};

describe("cm360-mcp auth e2e", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    mockState.cm360Service.listEntities.mockResolvedValue({
      items: [],
      nextPageToken: undefined,
    });

    const server = createMcpHttpServer(config, logger);
    app = server.app;
    shutdown = server.shutdown;
  });

  afterAll(async () => {
    await shutdown();
  });

  it("valid credentials -> 200", async () => {
    const result = await postMcp(app, toolCallPayload, undefined, {
      authorization: "Bearer valid-token",
      "x-test-fingerprint": "fp-valid",
    });
    expect(result.response.status).toBe(200);
  });

  it("missing credentials -> 401", async () => {
    const result = await postMcp(app, toolCallPayload, undefined, {});
    expect(result.response.status).toBe(401);
    const body = result.json ?? JSON.parse(result.text);
    expect(JSON.stringify(body)).toMatch(/credentials|Authorization/i);
  });

  it("invalid credentials -> 401", async () => {
    const result = await postMcp(app, toolCallPayload, undefined, {
      authorization: "Bearer invalid-token",
    });
    expect(result.response.status).toBe(401);
  });

  it("fingerprint mismatch on session reuse -> 401", async () => {
    // First request with fingerprint A creates a session
    const first = await postMcp(app, toolCallPayload, undefined, {
      authorization: "Bearer valid-token",
      "x-test-fingerprint": "fp-A",
    });
    expect(first.response.status).toBe(200);
    const sessionId = first.sessionId;
    expect(sessionId).toBeDefined();

    // Second request with different fingerprint reusing same session
    const second = await postMcp(app, { ...toolCallPayload, id: 2 }, sessionId as string, {
      authorization: "Bearer valid-token",
      "x-test-fingerprint": "fp-B",
    });
    expect(second.response.status).toBe(401);
    const body = second.json ?? JSON.parse(second.text);
    expect(JSON.stringify(body)).toContain("credential mismatch");
  });
});
