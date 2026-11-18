import { describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  connect: vi.fn(),
  createPlatformMcpServer: vi.fn(),
  createHttpTransport: vi.fn(),
  startHttpServer: vi.fn(),
}));

// The real module stays underneath: @cesteral/shared's HTTP transport imports
// WebStandardStreamableHTTPServerTransport from it (#242).
vi.mock("@modelcontextprotocol/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  McpServer: vi.fn().mockImplementation(function () {
    return {
      connect: hoisted.connect,
      registerResource: vi.fn(),
    };
  }),
  ResourceTemplate: vi.fn().mockImplementation(function (uriTemplate: string) {
    return { uriTemplate };
  }),
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    createPlatformMcpServer: hoisted.createPlatformMcpServer,
    createTransportEntrypoints: vi.fn(() => ({
      createMcpHttpServer: hoisted.createHttpTransport,
      startHttpServer: hoisted.startHttpServer,
    })),
    createAuthStrategy: vi.fn(() => ({ authType: "jwt" })),
  };
});

import { createMcpServer } from "../../src/mcp-server/server.js";
import {
  createMcpHttpServer,
  startHttpServer,
} from "../../src/mcp-server/transports/streamable-http-transport.js";

describe("Pinterest server + transport", () => {
  it("builds the server through the shared factory", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
    hoisted.createPlatformMcpServer.mockImplementationOnce(
      async (opts: { sdk: { McpServer: new (...args: unknown[]) => unknown } }) =>
        new opts.sdk.McpServer({}, {})
    );
    const server = await createMcpServer(logger, "session-1", "test-bucket");

    expect(server).toBeDefined();
    expect(hoisted.createPlatformMcpServer).toHaveBeenCalledOnce();
    expect(hoisted.createPlatformMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({
        packageName: "pinterest-mcp",
        platform: "pinterest",
        sessionId: "session-1",
        gcsBucket: "test-bucket",
      })
    );
  });

  it("builds HTTP transport via shared factory", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
    const config = {
      mcpAuthMode: "pinterest-bearer",
      mcpAuthSecretKey: "secret",
      pinterestApiBaseUrl: "https://business-api.pinterest.com",
      pinterestAccessToken: "token",
      pinterestAdvertiserId: "123",
    } as any;

    hoisted.createHttpTransport.mockReturnValueOnce({
      app: { ok: true },
      shutdown: async () => {},
    });
    hoisted.startHttpServer.mockResolvedValueOnce({ app: { ok: true }, shutdown: async () => {} });

    const http = createMcpHttpServer(config, logger);
    expect(http.app).toEqual({ ok: true });
    expect(hoisted.createHttpTransport).toHaveBeenCalledOnce();

    await startHttpServer(config, logger);
    expect(hoisted.startHttpServer).toHaveBeenCalledOnce();
  });
});
