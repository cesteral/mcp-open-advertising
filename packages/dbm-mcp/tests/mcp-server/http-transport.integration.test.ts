import { afterEach, describe, expect, it, vi } from "vitest";
import type http from "http";
import { createMcpHttpServer } from "../../src/mcp-server/transports/http-transport.js";
import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: "debug",
  } as any;
}

function createTestConfig() {
  return {
    serviceName: "dbm-mcp",
    nodeEnv: "test",
    mcpAllowedOrigins: undefined,
    mcpStatefulSessionTimeoutMs: 60_000,
    reportPollInitialDelayMs: 100,
    reportPollMaxDelayMs: 1_000,
    reportPollMaxRetries: 2,
    reportQueryRetries: 1,
    reportRetryCooldownMs: 100,
  } as any;
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000,
  intervalMs = 25,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe("http transport session lifecycle", () => {
  let server: http.Server | undefined;
  let shutdown: (() => Promise<void>) | undefined;
  let restoreFetch: (() => void) | undefined;

  afterEach(async () => {
    if (restoreFetch) {
      restoreFetch();
      restoreFetch = undefined;
    }
    if (shutdown) {
      await shutdown();
      shutdown = undefined;
    }
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it("registers and cleans session services on SSE connect/close", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://oauth2.googleapis.com/token") {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            access_token: "test-access-token",
            expires_in: 3600,
          }),
          text: async () =>
            JSON.stringify({
              access_token: "test-access-token",
              expires_in: 3600,
            }),
        } as Response;
      }
      return originalFetch(input as any, init);
    }) as any;
    restoreFetch = () => {
      globalThis.fetch = originalFetch;
    };

    const logger = createMockLogger();
    const { app, activeTransports, shutdown: shutdownFn } = createMcpHttpServer(
      createTestConfig(),
      logger,
    );
    shutdown = shutdownFn;

    server = app.listen(0, "127.0.0.1");
    const listenResult = await new Promise<{
      listening: boolean;
      error?: NodeJS.ErrnoException;
    }>((resolve) => {
      server!.once("listening", () => resolve({ listening: true }));
      server!.once("error", (error) =>
        resolve({ listening: false, error: error as NodeJS.ErrnoException }),
      );
    });

    // Some restricted sandboxes disallow binding sockets during tests.
    // In those environments, skip the live transport assertion path.
    if (!listenResult.listening) {
      if (listenResult.error?.code === "EPERM") {
        return;
      }
      throw listenResult.error;
    }
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to get server address");
    }

    const controller = new AbortController();
    const sseResponse = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: "GET",
      headers: {
        "X-Google-Auth-Type": "oauth2",
        "X-Google-Client-Id": "client-id",
        "X-Google-Client-Secret": "client-secret",
        "X-Google-Refresh-Token": "refresh-token",
      },
      signal: controller.signal,
    });

    expect(sseResponse.ok).toBe(true);

    await waitFor(() => activeTransports.size === 1);
    const sessionId = activeTransports.keys().next().value as string;

    const services = resolveSessionServices({ sessionId });
    expect(services.bidManagerService).toBeDefined();

    controller.abort();
    sseResponse.body?.cancel();

    await waitFor(() => activeTransports.size === 0);
    expect(() => resolveSessionServices({ sessionId })).toThrow(
      `No session services found for sessionId "${sessionId}"`,
    );
  }, 15_000);
});
