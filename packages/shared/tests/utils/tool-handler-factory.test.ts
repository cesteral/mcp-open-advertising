import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Mock telemetry and metrics
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

import { registerToolsFromDefinitions, type ToolDefinitionForFactory } from "../../src/utils/tool-handler-factory.js";
import { EvaluatorIssueClass } from "../../src/utils/mcp-errors.js";
import { recordToolExecution } from "../../src/utils/metrics.js";

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

function createMockServer() {
  const handlers = new Map<string, (args: unknown) => Promise<unknown>>();

  return {
    server: {
      elicitInput: vi.fn().mockResolvedValue({}),
    },
    registerTool: vi.fn().mockImplementation((name: string, _config: any, handler: any) => {
      handlers.set(name, handler);
    }),
    getHandler: (name: string) => handlers.get(name),
  };
}

function createRequestContext(params: { operation: string; additionalContext: Record<string, unknown> }) {
  return {
    requestId: "req-123",
    timestamp: new Date().toISOString(),
    operation: params.operation,
    ...params.additionalContext,
  };
}

describe("registerToolsFromDefinitions", () => {
  let logger: ReturnType<typeof createMockLogger>;
  let server: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    server = createMockServer();
  });

  it("registers all tools on the server", () => {
    const tools: ToolDefinitionForFactory[] = [
      {
        name: "tool_a",
        description: "Tool A",
        inputSchema: z.object({ id: z.string() }),
        logic: vi.fn().mockResolvedValue({ result: "a" }),
      },
      {
        name: "tool_b",
        description: "Tool B",
        inputSchema: z.object({ count: z.number() }),
        logic: vi.fn().mockResolvedValue({ result: "b" }),
      },
    ];

    registerToolsFromDefinitions({
      server,
      tools,
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
    });

    expect(server.registerTool).toHaveBeenCalledTimes(2);
    expect(server.registerTool.mock.calls[0][0]).toBe("tool_a");
    expect(server.registerTool.mock.calls[1][0]).toBe("tool_b");
  });

  it("logs tool count after registration", () => {
    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "tool_a",
          description: "Tool A",
          inputSchema: z.object({}),
          logic: vi.fn().mockResolvedValue({}),
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
    });

    expect(logger.info).toHaveBeenCalledWith({ toolCount: 1 }, "Registered MCP tools");
  });

  it("forwards title and annotations to registerTool config", () => {
    const tools: ToolDefinitionForFactory[] = [
      {
        name: "read_tool",
        title: "Read Tool",
        description: "Reads data",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true, destructiveHint: false },
        logic: vi.fn().mockResolvedValue({}),
      },
    ];

    registerToolsFromDefinitions({
      server,
      tools,
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
    });

    const config = server.registerTool.mock.calls[0][1];
    expect(config.title).toBe("Read Tool");
    expect(config.annotations).toEqual({ readOnlyHint: true, destructiveHint: false });
  });

  it("executes tool logic with validated input", async () => {
    const logicFn = vi.fn().mockResolvedValue({ data: "result" });

    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "test_tool",
          description: "Test",
          inputSchema: z.object({ id: z.string() }),
          logic: logicFn,
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
    });

    const handler = server.getHandler("test_tool")!;
    const result = await handler({ id: "abc" });

    expect(logicFn).toHaveBeenCalledWith(
      { id: "abc" },
      expect.objectContaining({ requestId: "req-123" }),
      expect.any(Object)
    );
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
  });

  it("returns compact JSON by default", async () => {
    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "test_tool",
          description: "Test",
          inputSchema: z.object({}),
          logic: vi.fn().mockResolvedValue({ key: "value" }),
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
    });

    const handler = server.getHandler("test_tool")!;
    const result = await handler({});

    expect(result.content[0].text).toBe('{"key":"value"}');
  });

  it("returns pretty JSON when defaultTextFormat is 'pretty'", async () => {
    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "test_tool",
          description: "Test",
          inputSchema: z.object({}),
          logic: vi.fn().mockResolvedValue({ key: "value" }),
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
      defaultTextFormat: "pretty",
    });

    const handler = server.getHandler("test_tool")!;
    const result = await handler({});

    expect(result.content[0].text).toBe(JSON.stringify({ key: "value" }, null, 2));
  });

  it("returns structuredContent when outputSchema is defined", async () => {
    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "test_tool",
          description: "Test",
          inputSchema: z.object({}),
          outputSchema: z.object({ data: z.string() }),
          logic: vi.fn().mockResolvedValue({ data: "result" }),
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
    });

    const handler = server.getHandler("test_tool")!;
    const result = await handler({});

    expect(result.structuredContent).toEqual({ data: "result" });
    expect(result.content).toBeDefined();
  });

  it("uses custom responseFormatter when provided", async () => {
    const formatter = vi.fn().mockReturnValue([
      { type: "text", text: "Custom formatted" },
    ]);

    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "test_tool",
          description: "Test",
          inputSchema: z.object({}),
          logic: vi.fn().mockResolvedValue({ raw: "data" }),
          responseFormatter: formatter,
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
    });

    const handler = server.getHandler("test_tool")!;
    const result = await handler({});

    expect(formatter).toHaveBeenCalledWith({ raw: "data" }, {});
    expect(result.content[0].text).toBe("Custom formatted");
  });

  it("returns isError:true on tool logic failure", async () => {
    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "failing_tool",
          description: "Fails",
          inputSchema: z.object({}),
          logic: vi.fn().mockRejectedValue(new Error("Tool exploded")),
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
    });

    const handler = server.getHandler("failing_tool")!;
    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Tool exploded");
  });

  it("records tool execution metrics on success", async () => {
    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "metric_tool",
          description: "Test",
          inputSchema: z.object({}),
          logic: vi.fn().mockResolvedValue({}),
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
    });

    const handler = server.getHandler("metric_tool")!;
    await handler({});

    expect(recordToolExecution).toHaveBeenCalledWith(
      "metric_tool",
      "success",
      expect.any(Number)
    );
  });

  it("records tool execution metrics on error", async () => {
    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "error_tool",
          description: "Fails",
          inputSchema: z.object({}),
          logic: vi.fn().mockRejectedValue(new Error("fail")),
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
    });

    const handler = server.getHandler("error_tool")!;
    await handler({});

    expect(recordToolExecution).toHaveBeenCalledWith(
      "error_tool",
      "error",
      expect.any(Number)
    );
  });

  it("invokes learningExtractor when evaluator issues are present", async () => {
    const processEvaluation = vi.fn();

    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "learning_tool",
          description: "Test",
          inputSchema: z.object({}),
          logic: vi.fn().mockResolvedValue({ ok: true }),
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
      evaluator: {
        enabled: true,
        evaluate: vi.fn().mockResolvedValue({
          issues: [
            {
              class: EvaluatorIssueClass.InputQuality,
              message: "payload too broad",
              isRecoverable: true,
            },
          ],
        }),
      },
      learningExtractor: {
        processEvaluation,
      },
    });

    const handler = server.getHandler("learning_tool")!;
    await handler({});

    expect(processEvaluation).toHaveBeenCalledWith(
      "learning_tool",
      expect.arrayContaining([
        expect.objectContaining({
          class: EvaluatorIssueClass.InputQuality,
        }),
      ]),
      undefined
    );
  });

  it("pushes persisted findings to findingBuffer for evaluated calls", async () => {
    const push = vi.fn();

    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "finding_tool",
          description: "Test",
          inputSchema: z.object({}),
          logic: vi.fn().mockResolvedValue({ ok: true }),
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
      sessionId: "session-test",
      platform: "ttd",
      packageName: "ttd-mcp",
      evaluator: {
        enabled: true,
        evaluate: vi.fn().mockResolvedValue({
          issues: [],
          recommendationAction: "none",
        }),
      },
      findingBuffer: {
        push,
        getAll: vi.fn(),
        getByWorkflow: vi.fn(),
        size: vi.fn(),
        clear: vi.fn(),
      },
    });

    const handler = server.getHandler("finding_tool")!;
    await handler({});

    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-test",
        toolName: "finding_tool",
        platform: "ttd",
        serverPackage: "ttd-mcp",
        recommendationAction: "none",
      })
    );
  });

  it("calls inputRefiner before tool logic when defined", async () => {
    const logicFn = vi.fn().mockResolvedValue({});
    const refiner = vi.fn().mockResolvedValue({ id: "refined-id" });

    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "refined_tool",
          description: "Test",
          inputSchema: z.object({ id: z.string() }),
          logic: logicFn,
          inputRefiner: refiner,
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
    });

    const handler = server.getHandler("refined_tool")!;
    await handler({ id: "original" });

    expect(refiner).toHaveBeenCalledWith(
      { id: "original" },
      expect.objectContaining({ toolName: "refined_tool" }),
      expect.any(Object)
    );
    expect(logicFn).toHaveBeenCalledWith(
      { id: "refined-id" },
      expect.any(Object),
      expect.any(Object)
    );
  });
});
