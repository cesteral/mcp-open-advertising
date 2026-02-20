import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("../../src/utils/telemetry.js", () => ({
  withToolSpan: vi.fn().mockImplementation((_name, _input, fn) => fn({})),
  withSpan: vi.fn().mockImplementation((_name, fn) => fn()),
  setSpanAttribute: vi.fn(),
  recordSpanError: vi.fn(),
}));

vi.mock("../../src/utils/metrics.js", () => ({
  recordToolExecution: vi.fn(),
  recordEvaluatorFinding: vi.fn(),
  recordEvaluatorRecommendation: vi.fn(),
  recordWorkflowCallDepth: vi.fn(),
}));

import { registerToolsFromDefinitions } from "../../src/utils/tool-handler-factory.js";
import type { SessionAuthContext } from "../../src/auth/auth-strategy.js";
import type { Logger } from "pino";

function createMockServer() {
  const handlers = new Map<string, (args: unknown) => Promise<unknown>>();
  return {
    server: { elicitInput: vi.fn() },
    registerTool: vi.fn((name: string, _config: unknown, handler: (args: unknown) => Promise<unknown>) => {
      handlers.set(name, handler);
    }),
    callTool: async (name: string, args: unknown) => {
      const handler = handlers.get(name);
      if (!handler) throw new Error(`Tool ${name} not registered`);
      return handler(args);
    },
  };
}

function createMockLogger(): Logger {
  const childLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue(childLogger),
  } as unknown as Logger;
}

describe("tool-handler-factory authorization", () => {
  let server: ReturnType<typeof createMockServer>;
  let logger: ReturnType<typeof createMockLogger>;

  const testTool = {
    name: "test_tool",
    description: "Test tool",
    inputSchema: z.object({
      advertiserId: z.string(),
      value: z.string(),
    }),
    logic: vi.fn().mockResolvedValue({ ok: true }),
  };

  beforeEach(() => {
    server = createMockServer();
    logger = createMockLogger();
    testTool.logic.mockClear();
  });

  function register(authContextResolver?: () => SessionAuthContext | undefined) {
    registerToolsFromDefinitions({
      server,
      tools: [testTool],
      logger,
      sessionId: "s1",
      transformSchema: (s) => s,
      createRequestContext: ({ operation }) => ({
        requestId: "req-1",
        timestamp: new Date().toISOString(),
        operation,
      }),
      authContextResolver,
    });
  }

  it("blocks tool call when advertiserId not in allowedAdvertisers", async () => {
    const authContext: SessionAuthContext = {
      authInfo: { clientId: "user@test.com", authType: "jwt" },
      allowedAdvertisers: ["adv123", "adv456"],
    };

    register(() => authContext);

    const result = await server.callTool("test_tool", {
      advertiserId: "adv999",
      value: "hello",
    });

    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toContain("Access denied");
    expect(testTool.logic).not.toHaveBeenCalled();
  });

  it("allows tool call when advertiserId is in allowedAdvertisers", async () => {
    const authContext: SessionAuthContext = {
      authInfo: { clientId: "user@test.com", authType: "jwt" },
      allowedAdvertisers: ["adv123", "adv456"],
    };

    register(() => authContext);

    const result = await server.callTool("test_tool", {
      advertiserId: "adv123",
      value: "hello",
    });

    expect((result as any).isError).toBeUndefined();
    expect(testTool.logic).toHaveBeenCalled();
  });

  it("treats empty allowedAdvertisers as deny-all for scoped params", async () => {
    const authContext: SessionAuthContext = {
      authInfo: { clientId: "user@test.com", authType: "jwt" },
      allowedAdvertisers: [],
    };

    register(() => authContext);

    const result = await server.callTool("test_tool", {
      advertiserId: "any-id",
      value: "hello",
    });

    expect((result as any).isError).toBe(true);
    expect(testTool.logic).not.toHaveBeenCalled();
  });

  it("skips authorization when allowedAdvertisers is undefined", async () => {
    const authContext: SessionAuthContext = {
      authInfo: { clientId: "user@test.com", authType: "google-service_account" },
    };

    register(() => authContext);

    const result = await server.callTool("test_tool", {
      advertiserId: "any-id",
      value: "hello",
    });

    expect((result as any).isError).toBeUndefined();
    expect(testTool.logic).toHaveBeenCalled();
  });

  it("skips authorization when no authContextResolver provided", async () => {
    register();

    const result = await server.callTool("test_tool", {
      advertiserId: "any-id",
      value: "hello",
    });

    expect((result as any).isError).toBeUndefined();
    expect(testTool.logic).toHaveBeenCalled();
  });

  it("allows tool with no advertiser params even when allowedAdvertisers set", async () => {
    const noAdvTool = {
      name: "no_adv_tool",
      description: "Tool without advertiser params",
      inputSchema: z.object({ query: z.string() }),
      logic: vi.fn().mockResolvedValue({ ok: true }),
    };

    const authContext: SessionAuthContext = {
      authInfo: { clientId: "user@test.com", authType: "jwt" },
      allowedAdvertisers: ["adv123"],
    };

    registerToolsFromDefinitions({
      server,
      tools: [noAdvTool],
      logger,
      sessionId: "s1",
      transformSchema: (s) => s,
      createRequestContext: ({ operation }) => ({
        requestId: "req-1",
        timestamp: new Date().toISOString(),
        operation,
      }),
      authContextResolver: () => authContext,
    });

    const result = await server.callTool("no_adv_tool", { query: "test" });
    expect((result as any).isError).toBeUndefined();
    expect(noAdvTool.logic).toHaveBeenCalled();
  });

  it("blocks tool call when customerIds has unauthorized value", async () => {
    const bulkTool = {
      name: "bulk_tool",
      description: "Bulk tool",
      inputSchema: z.object({
        customerIds: z.array(z.string()),
      }),
      logic: vi.fn().mockResolvedValue({ ok: true }),
    };

    const authContext: SessionAuthContext = {
      authInfo: { clientId: "user@test.com", authType: "jwt" },
      allowedAdvertisers: ["100", "200"],
    };

    registerToolsFromDefinitions({
      server,
      tools: [bulkTool],
      logger,
      sessionId: "s1",
      transformSchema: (s) => s,
      createRequestContext: ({ operation }) => ({
        requestId: "req-1",
        timestamp: new Date().toISOString(),
        operation,
      }),
      authContextResolver: () => authContext,
    });

    const result = await server.callTool("bulk_tool", { customerIds: ["100", "999"] });

    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toContain("Access denied");
    expect(bulkTool.logic).not.toHaveBeenCalled();
  });

  it("allows tool call when all customerIds are authorized", async () => {
    const bulkTool = {
      name: "bulk_tool_ok",
      description: "Bulk tool",
      inputSchema: z.object({
        customerIds: z.array(z.string()),
      }),
      logic: vi.fn().mockResolvedValue({ ok: true }),
    };

    const authContext: SessionAuthContext = {
      authInfo: { clientId: "user@test.com", authType: "jwt" },
      allowedAdvertisers: ["100", "200"],
    };

    registerToolsFromDefinitions({
      server,
      tools: [bulkTool],
      logger,
      sessionId: "s1",
      transformSchema: (s) => s,
      createRequestContext: ({ operation }) => ({
        requestId: "req-1",
        timestamp: new Date().toISOString(),
        operation,
      }),
      authContextResolver: () => authContext,
    });

    const result = await server.callTool("bulk_tool_ok", { customerIds: ["100", "200"] });

    expect((result as any).isError).toBeUndefined();
    expect(bulkTool.logic).toHaveBeenCalled();
  });
});
