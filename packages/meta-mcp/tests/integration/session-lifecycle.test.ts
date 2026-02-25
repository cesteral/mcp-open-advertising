import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual<any>("@cesteral/shared");
  return {
    ...actual,
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

vi.mock("../../src/auth/meta-auth-strategy.js", () => {
  return {
    MetaBearerAuthStrategy: class {
      constructor(_baseUrl: string, _logger?: unknown) {}

      async verify(headers: Record<string, string | string[] | undefined>) {
        const fp =
          typeof headers["x-test-fingerprint"] === "string"
            ? headers["x-test-fingerprint"]
            : "fp-test";
        return {
          authInfo: { clientId: "user-123", subject: "Test User", authType: "meta-bearer" },
          platformAuthAdapter: {
            getAccessToken: async () => "mock-token",
            userId: "user-123",
          },
          credentialFingerprint: fp,
        };
      }

      async getCredentialFingerprint(
        headers: Record<string, string | string[] | undefined>
      ) {
        return typeof headers["x-test-fingerprint"] === "string"
          ? headers["x-test-fingerprint"]
          : "fp-test";
      }
    },
  };
});

const mockState = vi.hoisted(() => ({
  metaService: {
    getEntity: vi.fn(),
  },
}));

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
    createSessionServices: vi.fn(() => ({
      httpClient: {} as any,
      metaService: {
        ...mockState.metaService,
        createEntity: vi.fn(),
        updateEntity: vi.fn(),
        deleteEntity: vi.fn(),
      } as any,
      metaInsightsService: { getInsights: vi.fn() } as any,
      metaTargetingService: { searchTargeting: vi.fn() } as any,
      findingBuffer: { push: vi.fn(), clear: vi.fn().mockReturnValue([]) },
      workflowTracker: {
        recordToolCall: vi.fn(),
        startWorkflow: vi.fn(),
        completeWorkflow: vi.fn(),
      },
    })),
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
  metaApiBaseUrl: "https://graph.test/v21.0",
  metaApiVersion: "v21.0",
  metaRateLimitPerMinute: 200,
  metaAccessToken: undefined,
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
      name: "meta_get_entity",
      arguments: {
        entityType: "campaign",
        entityId: "123456",
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
    authorization: "Bearer mock-meta-token",
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

describe("meta-mcp transport session lifecycle", () => {
  let app: any;
  let shutdown: () => Promise<void>;

  beforeAll(() => {
    mockState.metaService.getEntity.mockResolvedValue({
      id: "123456",
      name: "Test Campaign",
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
        authorization: "Bearer mock-meta-token",
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
        authorization: "Bearer mock-meta-token",
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
