/**
 * #741 H-2, sink level: the canary must not survive the REAL tool-handler path.
 *
 * `error-canary-redaction.test.ts` proves `McpError.message` is redacted at
 * construction and that `ErrorHandler.handleError` writes a clean Pino record —
 * both by calling the real functions. But its MCP-response and notification
 * cases RECONSTRUCT the emitted shapes (`JSON.stringify({ error: err.message …
 * })`) instead of driving the handler, so they cannot fail if a sink is pointed
 * back at the raw thrown error.
 *
 * That was not hypothetical. Reverting `tool-handler-factory.ts`'s notification
 * from `mcpError.message` to `(error as Error).message` left the entire shared
 * suite green — 902 tests, zero failures. Declaring is not enforcing; asserting
 * the shape you expect is not asserting the shape that is emitted.
 *
 * These tests execute `registerToolsFromDefinitions` and read what the server
 * and the interaction logger actually received.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import {
  registerToolsFromDefinitions,
  type ToolDefinitionForFactory,
} from "../../src/utils/tool-handler-factory.js";
import { createRequestContext } from "../../src/utils/request-context.js";
import { McpError, JsonRpcErrorCode } from "../../src/utils/mcp-errors.js";

const CANARY = "1//0eXaMpLeCaNaRyRefreshTokenValue";

/** The shape `retryable-fetch` builds: raw upstream body inside the message. */
const UPSTREAM_MESSAGE =
  `Google Ads API request failed: 401 Unauthorized — ` +
  JSON.stringify({ error: "invalid_grant", refresh_token: CANARY });

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(function (this: unknown) {
      return this;
    }),
  } as unknown as Parameters<typeof registerToolsFromDefinitions>[0]["logger"];
}

function createMockServer() {
  const handlers = new Map<string, (args: unknown) => Promise<unknown>>();
  const sendLoggingMessage = vi.fn().mockResolvedValue(undefined);
  return {
    registerTool: vi.fn(
      (name: string, _cfg: unknown, handler: (a: unknown) => Promise<unknown>) => {
        handlers.set(name, handler);
      }
    ),
    server: { sendLoggingMessage },
    sendLoggingMessage,
    getHandler: (name: string) => handlers.get(name),
  };
}

/** Register one tool whose logic throws `error`, and invoke it. */
async function runFailingTool(error: unknown) {
  const logger = createMockLogger();
  const server = createMockServer();
  const captured: Array<Record<string, unknown>> = [];

  const tools: ToolDefinitionForFactory[] = [
    {
      name: "canary_tool",
      description: "Throws an upstream-shaped error",
      inputSchema: z.object({ id: z.string() }),
      logic: async () => {
        throw error;
      },
    },
  ];

  registerToolsFromDefinitions({
    server: server as never,
    tools,
    logger,
    sessionId: "stdio",
    transformSchema: (schema) => schema,
    createRequestContext,
    interactionLogger: {
      append: (e: Record<string, unknown>) => captured.push(e),
      logFailure: (e: Record<string, unknown>) =>
        captured.push({ ...e, type: "tool_failure", success: false }),
    } as never,
  });

  const result = (await server.getHandler("canary_tool")!({ id: "x" })) as {
    isError?: boolean;
    content?: Array<{ text?: string }>;
  };

  return { result, server, logger, captured };
}

describe("#741 H-2 — the canary must not survive the real handler path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the canary out of the MCP logging NOTIFICATION for an McpError throw", async () => {
    const { server } = await runFailingTool(
      new McpError(JsonRpcErrorCode.Unauthorized, UPSTREAM_MESSAGE)
    );

    expect(server.sendLoggingMessage).toHaveBeenCalled();
    const sent = JSON.stringify(server.sendLoggingMessage.mock.calls);
    expect(sent).not.toContain(CANARY);
  });

  it("keeps the canary out of the notification for a PLAIN error throw", async () => {
    // The case where the sink's choice of source is load-bearing: raw and
    // converted messages diverge only here, because the McpError constructor
    // redacts on conversion while the original error is untouched.
    const { server } = await runFailingTool(new Error(`upstream rejected: ${UPSTREAM_MESSAGE}`));

    const sent = JSON.stringify(server.sendLoggingMessage.mock.calls);
    expect(sent).not.toContain(CANARY);
  });

  it("keeps the canary out of the MCP error RESPONSE returned to the client", async () => {
    const { result } = await runFailingTool(
      new McpError(JsonRpcErrorCode.Unauthorized, UPSTREAM_MESSAGE, {
        errorBody: JSON.stringify({ refresh_token: CANARY }),
      })
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it("keeps the canary out of the interaction-log failure entry", async () => {
    const { captured } = await runFailingTool(
      new McpError(JsonRpcErrorCode.Unauthorized, UPSTREAM_MESSAGE, {
        errorBody: JSON.stringify({ refresh_token: CANARY }),
      })
    );

    const failure = captured.find((e) => e.type === "tool_failure");
    expect(failure, "the tool failure should have been logged").toBeDefined();
    expect(JSON.stringify(failure)).not.toContain(CANARY);
  });

  it("keeps the canary out of everything the logger was handed", async () => {
    const { logger } = await runFailingTool(
      new McpError(JsonRpcErrorCode.Unauthorized, UPSTREAM_MESSAGE)
    );

    const written = JSON.stringify([
      (logger.error as ReturnType<typeof vi.fn>).mock.calls,
      (logger.warn as ReturnType<typeof vi.fn>).mock.calls,
      (logger.info as ReturnType<typeof vi.fn>).mock.calls,
    ]);
    expect(written).not.toContain(CANARY);
  });

  it("still reports the failure usefully — redaction, not suppression", async () => {
    const { result } = await runFailingTool(
      new McpError(JsonRpcErrorCode.Unauthorized, UPSTREAM_MESSAGE)
    );

    const text = JSON.stringify(result);
    expect(text).toContain("401");
    expect(text).toContain("invalid_grant");
    expect(text).toContain("[REDACTED]");
  });
});
