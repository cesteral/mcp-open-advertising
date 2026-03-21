/**
 * Session Lifecycle Tests — CM360 MCP Server
 *
 * Tests session capacity enforcement, fingerprint validation on DELETE,
 * and graceful session termination through the real transport layer.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    createAuthStrategy: vi.fn(() => ({
      verify: vi.fn(
        async (headers: Record<string, string | string[] | undefined>) => {
          const fp =
            typeof headers["x-test-fingerprint"] === "string"
              ? headers["x-test-fingerprint"]
              : "fp-test";
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
        }
      ),
      getCredentialFingerprint: vi.fn(
        async (headers: Record<string, string | string[] | undefined>) => {
          return typeof headers["x-test-fingerprint"] === "string"
            ? headers["x-test-fingerprint"]
            : "fp-test";
        }
      ),
    })),
    validateSessionReuse: vi.fn(
      async (
        authStrategy: any,
        sessionServiceStore: any,
        headers: any,
        sessionId: string
      ) => {
        const requestFingerprint = authStrategy.getCredentialFingerprint
          ? await authStrategy.getCredentialFingerprint(headers)
          : (await authStrategy.verify(headers)).credentialFingerprint;

        if (
          requestFingerprint &&
          !sessionServiceStore.validateFingerprint(sessionId, requestFingerprint)
        ) {
          return {
            valid: false,
            reason: "Credential fingerprint mismatch",
            storedFingerprint: sessionServiceStore.getFingerprint(sessionId),
            requestFingerprint,
          };
        }

        return { valid: true, requestFingerprint };
      }
    ),
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
  const services = new Map<string, any>();
  const fingerprints = new Map<string, string>();
  const authContexts = new Map<string, any>();
  const store = {
    set(
      sessionId: string,
      sessionServices: any,
      credentialFingerprint?: string
    ) {
      services.set(sessionId, sessionServices);
      if (credentialFingerprint)
        fingerprints.set(sessionId, credentialFingerprint);
    },
    get(sessionId: string) {
      return services.get(sessionId);
    },
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
      return store._forceFull ?? false;
    },
    get size() {
      return services.size;
    },
    _forceFull: false as boolean,
  };
  return {
    sessionServiceStore: store,
    createSessionServices: vi.fn(() => mockServices),
  };
});

import { createMcpHttpServer } from "../../src/mcp-server/transports/streamable-http-transport.js";
import { sessionServiceStore } from "../../src/services/session-services.js";

const logger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};
logger.child.mockReturnValue(logger);

const config: any = {
  serviceName: "cm360-mcp-lifecycle-test",
  port: 3008,
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
  otelServiceName: "cm360-mcp-lifecycle-test",
  otelExporterOtlpTracesEndpoint: undefined,
  otelExporterOtlpMetricsEndpoint: undefined,
  cm360ApiBaseUrl: "https://dfareporting.googleapis.com/dfareporting/v5",
  cm360RateLimitPerMinute: 100,
};

function buildPayload(method: string, id: number) {
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "vitest", version: "1.0.0" },
      },
    };
  }

  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name: "cm360_list_entities",
      arguments: {
        profileId: "12345",
        entityType: "campaign",
      },
    },
  };
}

async function postMcp(
  app: any,
  method: "initialize" | "tools/call",
  id: number,
  sessionId?: string,
  fingerprint?: string
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2025-03-26",
    authorization: "Bearer mock-google-token",
  };
  if (sessionId) {
    headers["mcp-session-id"] = sessionId;
  }
  if (fingerprint) {
    headers["x-test-fingerprint"] = fingerprint;
  }

  return app.request("http://localhost/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(buildPayload(method, id)),
  });
}

function extractSessionId(
  response: any,
  bodyText: string
): string | undefined {
  let body: any = undefined;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = undefined;
  }
  return (
    response.headers.get("mcp-session-id") ??
    body?.result?.sessionId ??
    body?.sessionId
  );
}

describe("cm360-mcp transport session lifecycle", () => {
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

  it("existing session requests succeed at capacity", async () => {
    // Create a session first while not at capacity
    const initResponse = await postMcp(
      app,
      "initialize",
      1,
      undefined,
      "fp-capacity"
    );
    const initText = await initResponse.clone().text();
    const sessionId = extractSessionId(initResponse, initText);
    expect(sessionId).toBeDefined();

    // Set capacity to full
    (sessionServiceStore as any)._forceFull = true;

    try {
      logger.error.mockClear();

      // Existing session should still work
      const existingResponse = await postMcp(
        app,
        "tools/call",
        2,
        sessionId as string,
        "fp-capacity"
      );
      expect(existingResponse.status).toBe(200);
      const responseText = await existingResponse.text();
      expect(responseText.length).toBeGreaterThan(0);
      expect(responseText).not.toContain("\"error\"");
      expect(
        logger.error.mock.calls.some((call: unknown[]) =>
          JSON.stringify(call).includes("Already connected to a transport")
        )
      ).toBe(false);
    } finally {
      (sessionServiceStore as any)._forceFull = false;
    }
  });

  it("new session creation returns 503 at capacity", async () => {
    (sessionServiceStore as any)._forceFull = true;

    try {
      const response = await postMcp(
        app,
        "initialize",
        10,
        undefined,
        "fp-new"
      );
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toContain("capacity");
    } finally {
      (sessionServiceStore as any)._forceFull = false;
    }
  });

  it("DELETE /mcp rejects credential mismatch", async () => {
    // Create a session with fingerprint "fp-owner"
    const initResponse = await postMcp(
      app,
      "initialize",
      20,
      undefined,
      "fp-owner"
    );
    const initText = await initResponse.clone().text();
    const sessionId = extractSessionId(initResponse, initText);
    expect(sessionId).toBeDefined();

    // Try to DELETE with a different fingerprint
    const deleteResponse = await app.request("http://localhost/mcp", {
      method: "DELETE",
      headers: {
        "mcp-session-id": sessionId as string,
        authorization: "Bearer mock-google-token",
        "x-test-fingerprint": "fp-attacker",
      },
    });
    expect(deleteResponse.status).toBe(401);
    const body = await deleteResponse.json();
    expect(body.error).toContain("credential mismatch");
  });

  it("DELETE /mcp succeeds with matching credentials", async () => {
    const initResponse = await postMcp(
      app,
      "initialize",
      30,
      undefined,
      "fp-delete-ok"
    );
    const initText = await initResponse.clone().text();
    const sessionId = extractSessionId(initResponse, initText);
    expect(sessionId).toBeDefined();

    const deleteResponse = await app.request("http://localhost/mcp", {
      method: "DELETE",
      headers: {
        "mcp-session-id": sessionId as string,
        authorization: "Bearer mock-google-token",
        "x-test-fingerprint": "fp-delete-ok",
      },
    });
    expect(deleteResponse.status).toBe(200);
    const body = await deleteResponse.json();
    expect(body.status).toBe("terminated");

    // Post-termination: session should be gone
    const postTerminateResponse = await postMcp(
      app,
      "tools/call",
      31,
      sessionId as string,
      "fp-delete-ok"
    );
    expect(postTerminateResponse.status).toBe(404);
  });
});
