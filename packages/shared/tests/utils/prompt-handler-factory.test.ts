import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerPromptsFromDefinitions, type PromptDefinitionForFactory } from "../../src/utils/prompt-handler-factory.js";
import type { Logger } from "pino";

function createMockServer() {
  return {
    registerPrompt: vi.fn(),
  };
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger;
}

describe("registerPromptsFromDefinitions", () => {
  let server: ReturnType<typeof createMockServer>;
  let logger: Logger;

  beforeEach(() => {
    server = createMockServer();
    logger = createMockLogger();
  });

  it("should register all prompts on the server", () => {
    const prompts: PromptDefinitionForFactory[] = [
      {
        name: "test_prompt",
        description: "A test prompt",
        arguments: [{ name: "arg1", description: "First arg", required: true }],
        generateMessage: (args) => `Hello ${args?.arg1 || "world"}`,
      },
      {
        name: "simple_prompt",
        description: "A simple prompt",
        generateMessage: () => "Simple message",
      },
    ];

    registerPromptsFromDefinitions({ server, prompts, logger });

    expect(server.registerPrompt).toHaveBeenCalledTimes(2);
    expect(server.registerPrompt.mock.calls[0][0]).toBe("test_prompt");
    expect(server.registerPrompt.mock.calls[1][0]).toBe("simple_prompt");
  });

  it("should call handler that returns correct message format", async () => {
    const prompts: PromptDefinitionForFactory[] = [
      {
        name: "greeting",
        description: "A greeting",
        generateMessage: (args) => `Hello ${args?.name || "user"}`,
      },
    ];

    registerPromptsFromDefinitions({ server, prompts, logger });

    const handler = server.registerPrompt.mock.calls[0][2];
    const result = await handler({ name: "Alice" });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.type).toBe("text");
    expect(result.messages[0].content.text).toBe("Hello Alice");
  });

  it("should handle undefined args gracefully", async () => {
    const prompts: PromptDefinitionForFactory[] = [
      {
        name: "no_args",
        description: "No args prompt",
        generateMessage: () => "Static message",
      },
    ];

    registerPromptsFromDefinitions({ server, prompts, logger });

    const handler = server.registerPrompt.mock.calls[0][2];
    const result = await handler(undefined);

    expect(result.messages[0].content.text).toBe("Static message");
  });

  it("should build argsSchema from prompt arguments", () => {
    const prompts: PromptDefinitionForFactory[] = [
      {
        name: "with_args",
        description: "Has args",
        arguments: [
          { name: "required_arg", description: "Required", required: true },
          { name: "optional_arg", description: "Optional", required: false },
        ],
        generateMessage: () => "msg",
      },
    ];

    registerPromptsFromDefinitions({ server, prompts, logger });

    const config = server.registerPrompt.mock.calls[0][1];
    expect(config.argsSchema).toBeDefined();
    expect(config.argsSchema.required_arg).toBeDefined();
    expect(config.argsSchema.optional_arg).toBeDefined();
  });

  it("should log prompt count after registration", () => {
    registerPromptsFromDefinitions({ server, prompts: [], logger });
    expect(logger.info).toHaveBeenCalledWith({ promptCount: 0 }, "Registered MCP prompts");
  });
});
