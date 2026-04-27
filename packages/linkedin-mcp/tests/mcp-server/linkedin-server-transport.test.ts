import { describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  connect: vi.fn(),
  registerTools: vi.fn(),
  registerResources: vi.fn(),
  registerPrompts: vi.fn(),
  createHttpTransport: vi.fn(),
  startHttpServer: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: vi.fn().mockImplementation(() => ({ connect: hoisted.connect })),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({ kind: "stdio" })),
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    extractZodShape: vi.fn((schema: unknown) => schema),
    registerToolsFromDefinitions: hoisted.registerTools,
    registerStaticResourcesFromDefinitions: hoisted.registerResources,
    registerPromptsFromDefinitions: hoisted.registerPrompts,
    InteractionLogger: vi.fn().mockImplementation(() => ({ kind: "logger" })),
    createMcpHttpTransport: hoisted.createHttpTransport,
    startMcpHttpServer: hoisted.startHttpServer,
    createAuthStrategy: vi.fn(() => ({ authType: "jwt" })),
  };
});

import { createMcpServer, runStdioServer } from "../../src/mcp-server/server.js";
import {
  createMcpHttpServer,
  startHttpServer,
} from "../../src/mcp-server/transports/streamable-http-transport.js";

describe("LinkedIn server + transport", () => {
  it("registers tools/resources/prompts and connects stdio", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
    const server = await createMcpServer(logger, "session-1", "test-bucket");

    expect(server).toBeDefined();
    expect(hoisted.registerTools).toHaveBeenCalledOnce();
    expect(hoisted.registerResources).toHaveBeenCalledOnce();
    expect(hoisted.registerPrompts).toHaveBeenCalledOnce();

    await runStdioServer(server, logger);
    expect(hoisted.connect).toHaveBeenCalledOnce();
  });

  it("builds HTTP transport via shared factory", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
    const config = {
      mcpAuthMode: "linkedin-bearer",
      mcpAuthSecretKey: "secret",
      linkedinApiBaseUrl: "https://api.linkedin.com",
      linkedinApiVersion: "202409",
      linkedinAccessToken: "token",
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
