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
}));

import { registerToolsFromDefinitions, formatExamplesForDescription, truncateTextContent, RESPONSE_CHARACTER_LIMIT, type ToolDefinitionForFactory, type ToolInputExample } from "../../src/utils/tool-handler-factory.js";
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
    sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
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

  it("does not embed inputExamples into tool description (moved to Resources)", () => {
    const examples: ToolInputExample[] = [
      { label: "Simple query", input: { id: "123" } },
      { label: "With filter", input: { id: "456", filter: "active" } },
    ];

    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "example_tool",
          description: "Base description",
          inputSchema: z.object({ id: z.string(), filter: z.string().optional() }),
          logic: vi.fn().mockResolvedValue({}),
          inputExamples: examples,
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
    });

    const config = server.registerTool.mock.calls[0][1];
    expect(config.description).toBe("Base description");
    expect(config.description).not.toContain("### Examples");
  });

  it("leaves description unchanged when no inputExamples provided", () => {
    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "no_examples_tool",
          description: "Just a description",
          inputSchema: z.object({}),
          logic: vi.fn().mockResolvedValue({}),
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
    });

    const config = server.registerTool.mock.calls[0][1];
    expect(config.description).toBe("Just a description");
    expect(config.description).not.toContain("### Examples");
  });
});

describe("formatExamplesForDescription", () => {
  it("returns empty string for undefined examples", () => {
    expect(formatExamplesForDescription(undefined)).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(formatExamplesForDescription([])).toBe("");
  });

  it("formats examples as markdown with JSON code blocks", () => {
    const examples: ToolInputExample[] = [
      { label: "Test example", input: { key: "value" } },
    ];
    const result = formatExamplesForDescription(examples);

    expect(result).toContain("### Examples");
    expect(result).toContain("**Test example:**");
    expect(result).toContain("```json");
    expect(result).toContain('"key": "value"');
    expect(result).toContain("```");
  });
});

describe("RESPONSE_CHARACTER_LIMIT", () => {
  it("exports the default limit as 25,000", () => {
    expect(RESPONSE_CHARACTER_LIMIT).toBe(25_000);
  });
});

describe("truncateTextContent", () => {
  it("does not truncate text under the limit", () => {
    const content = [{ type: "text", text: "short response" }];
    const result = truncateTextContent(content, 100);
    expect(result).toEqual(content);
    expect(result[0].text).toBe("short response");
  });

  it("does not truncate text exactly at the limit", () => {
    const text = "x".repeat(100);
    const content = [{ type: "text", text }];
    const result = truncateTextContent(content, 100);
    expect(result[0].text).toBe(text);
  });

  it("truncates text exceeding the limit with a diagnostic message", () => {
    const originalText = "a".repeat(200);
    const content = [{ type: "text", text: originalText }];
    const result = truncateTextContent(content, 50);

    expect(result[0].text).toContain("a".repeat(50));
    expect(result[0].text).toContain("--- Response truncated");
    expect(result[0].text).toContain("50 of 200 characters shown");
    expect(result[0].text).toContain("Use pagination parameters or filters to narrow results.");
  });

  it("formats large numbers with locale separators in truncation message", () => {
    const originalText = "b".repeat(45_123);
    const content = [{ type: "text", text: originalText }];
    const result = truncateTextContent(content, 25_000);

    expect(result[0].text).toContain("25,000");
    expect(result[0].text).toContain("45,123");
  });

  it("leaves non-text content blocks untouched", () => {
    const content = [
      { type: "image", data: "base64data", mimeType: "image/png" },
      { type: "resource", uri: "file:///data.csv" },
    ];
    const result = truncateTextContent(content, 10);
    expect(result).toEqual(content);
  });

  it("independently truncates each text block in a multi-block array", () => {
    const content = [
      { type: "text", text: "short" },
      { type: "text", text: "x".repeat(200) },
      { type: "text", text: "also short" },
    ];
    const result = truncateTextContent(content, 50);

    // First block: untouched
    expect(result[0].text).toBe("short");
    // Second block: truncated
    expect(result[1].text).toContain("--- Response truncated");
    expect(result[1].text!.startsWith("x".repeat(50))).toBe(true);
    // Third block: untouched
    expect(result[2].text).toBe("also short");
  });

  it("handles text blocks without a text property gracefully", () => {
    const content = [{ type: "text" }];
    const result = truncateTextContent(content, 10);
    expect(result).toEqual([{ type: "text" }]);
  });
});

describe("registerToolsFromDefinitions - error format consistency", () => {
  let logger: ReturnType<typeof createMockLogger>;
  let server: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    server = createMockServer();
  });

  it("non-production errors return same JSON structure as production errors", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      registerToolsFromDefinitions({
        server,
        tools: [
          {
            name: "failing_tool",
            description: "Fails",
            inputSchema: z.object({}),
            logic: vi.fn().mockRejectedValue(new Error("Tool exploded in dev")),
          },
        ],
        logger,
        transformSchema: (schema) => schema,
        createRequestContext,
      });

      const handler = server.getHandler("failing_tool")!;
      const result = await handler({});

      expect(result.isError).toBe(true);
      const text = result.content[0].text;
      // Must be parseable JSON
      let parsed: any;
      expect(() => { parsed = JSON.parse(text); }).not.toThrow();
      // Must contain the same fields as production (error + code)
      expect(parsed).toHaveProperty("error");
      expect(parsed).toHaveProperty("code");
      expect(parsed.error).toContain("Tool exploded in dev");
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("production errors return JSON with error/code fields", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      registerToolsFromDefinitions({
        server,
        tools: [
          {
            name: "prod_failing_tool",
            description: "Fails in prod",
            inputSchema: z.object({}),
            logic: vi.fn().mockRejectedValue(new Error("Tool exploded in prod")),
          },
        ],
        logger,
        transformSchema: (schema) => schema,
        createRequestContext,
      });

      const handler = server.getHandler("prod_failing_tool")!;
      const result = await handler({});

      expect(result.isError).toBe(true);
      const text = result.content[0].text;
      let parsed: any;
      expect(() => { parsed = JSON.parse(text); }).not.toThrow();
      expect(parsed).toHaveProperty("error");
      expect(parsed).toHaveProperty("code");
      expect(parsed.error).toContain("Tool exploded in prod");
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("non-production errors may include stack field for debugging", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      registerToolsFromDefinitions({
        server,
        tools: [
          {
            name: "stack_tool",
            description: "Fails with stack",
            inputSchema: z.object({}),
            logic: vi.fn().mockRejectedValue(new Error("Stack trace test")),
          },
        ],
        logger,
        transformSchema: (schema) => schema,
        createRequestContext,
      });

      const handler = server.getHandler("stack_tool")!;
      const result = await handler({});

      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      // stack is optional but if present should be a string
      if ("stack" in parsed) {
        expect(typeof parsed.stack).toBe("string");
      }
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});

describe("registerToolsFromDefinitions - response truncation", () => {
  let logger: ReturnType<typeof createMockLogger>;
  let server: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    server = createMockServer();
  });

  it("truncates tool response text exceeding the default limit", async () => {
    const bigPayload = { data: "z".repeat(30_000) };

    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "big_tool",
          description: "Returns big data",
          inputSchema: z.object({}),
          logic: vi.fn().mockResolvedValue(bigPayload),
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
    });

    const handler = server.getHandler("big_tool")!;
    const result = await handler({});

    expect(result.content[0].text).toContain("--- Response truncated");
    // The truncated text starts with the first 25,000 chars of the serialized JSON
    expect(result.content[0].text.length).toBeLessThan(JSON.stringify(bigPayload).length + 200);
  });

  it("does not truncate tool response text under the default limit", async () => {
    const smallPayload = { data: "hello" };

    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "small_tool",
          description: "Returns small data",
          inputSchema: z.object({}),
          logic: vi.fn().mockResolvedValue(smallPayload),
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
    });

    const handler = server.getHandler("small_tool")!;
    const result = await handler({});

    expect(result.content[0].text).toBe(JSON.stringify(smallPayload));
    expect(result.content[0].text).not.toContain("--- Response truncated");
  });

  it("respects custom responseCharacterLimit from options", async () => {
    const payload = { data: "y".repeat(200) };

    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "custom_limit_tool",
          description: "Test custom limit",
          inputSchema: z.object({}),
          logic: vi.fn().mockResolvedValue(payload),
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
      responseCharacterLimit: 50,
    });

    const handler = server.getHandler("custom_limit_tool")!;
    const result = await handler({});

    expect(result.content[0].text).toContain("--- Response truncated");
    expect(result.content[0].text).toContain("50 of");
  });

  it("does not truncate structuredContent even when text content is truncated", async () => {
    const bigResult = { items: Array.from({ length: 500 }, (_, i) => ({ id: i, name: "item-" + "x".repeat(100) })) };

    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "structured_tool",
          description: "Returns structured + text",
          inputSchema: z.object({}),
          outputSchema: z.object({ items: z.array(z.any()) }),
          logic: vi.fn().mockResolvedValue(bigResult),
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
      responseCharacterLimit: 100,
    });

    const handler = server.getHandler("structured_tool")!;
    const result = await handler({});

    // Text content should be truncated
    expect(result.content[0].text).toContain("--- Response truncated");
    // structuredContent should be the full, untruncated result
    expect(result.structuredContent).toEqual(bigResult);
  });

  it("truncates custom responseFormatter output when it exceeds the limit", async () => {
    const formatter = vi.fn().mockReturnValue([
      { type: "text", text: "Summary: short" },
      { type: "text", text: "Details: " + "d".repeat(300) },
    ]);

    registerToolsFromDefinitions({
      server,
      tools: [
        {
          name: "formatted_tool",
          description: "Custom formatted",
          inputSchema: z.object({}),
          logic: vi.fn().mockResolvedValue({}),
          responseFormatter: formatter,
        },
      ],
      logger,
      transformSchema: (schema) => schema,
      createRequestContext,
      responseCharacterLimit: 50,
    });

    const handler = server.getHandler("formatted_tool")!;
    const result = await handler({});

    // First block is under limit — untouched
    expect(result.content[0].text).toBe("Summary: short");
    // Second block exceeds limit — truncated
    expect(result.content[1].text).toContain("--- Response truncated");
  });
});
