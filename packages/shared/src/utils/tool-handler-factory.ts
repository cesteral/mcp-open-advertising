/**
 * Tool Handler Factory
 *
 * Extracts common MCP tool registration boilerplate into a reusable handler.
 * Both dbm-mcp and dv360-mcp servers use this to register tools with
 * consistent context creation, telemetry, error handling, and metrics.
 *
 * Uses structural typing to avoid coupling the shared package to the MCP SDK.
 */

import type { Logger } from "pino";
import type { z } from "zod";
import { withToolSpan, setSpanAttribute, recordSpanError } from "./telemetry.js";
import { ErrorHandler } from "./mcp-errors.js";
import { recordToolExecution } from "./metrics.js";

/**
 * Request context created per tool invocation
 */
export interface ToolRequestContext {
  requestId: string;
  timestamp: string;
  operation?: string;
  [key: string]: unknown;
}

/**
 * SDK context passed to tool logic
 */
export interface ToolSdkContext {
  requestId?: string;
  sessionId?: string;
  elicitInput?: (params: Record<string, unknown>) => Promise<unknown>;
  [key: string]: unknown;
}

/**
 * Minimal tool definition interface — matches both server packages
 */
export interface ToolDefinitionForFactory {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  logic: (
    input: any,
    context: any,
    sdkContext?: any
  ) => Promise<any>;
  responseFormatter?: (result: any, input: any) => any[];
}

/**
 * Structural type for McpServer — avoids direct dependency on @modelcontextprotocol/sdk.
 * Uses `any` for the elicitInput param to accommodate SDK's specific union type.
 */
interface McpServerLike {
  server: {
    elicitInput: (params: any) => Promise<any>;
  };
  registerTool(
    name: string,
    config: { description: string; inputSchema: any },
    handler: (args: any) => Promise<any>
  ): void;
}

/**
 * Options for registerToolsFromDefinitions
 */
export interface RegisterToolsOptions {
  server: McpServerLike;
  tools: ToolDefinitionForFactory[];
  logger: Logger;
  sessionId?: string;
  /**
   * Transform the Zod schema into the format expected by server.registerTool().
   * dbm-mcp converts to JSON Schema; dv360-mcp extracts the raw Zod shape.
   */
  transformSchema: (schema: z.ZodTypeAny) => unknown;
  /**
   * Create a request context per tool invocation.
   * Injected so each server can use its own internal request-context module.
   */
  createRequestContext: (params: {
    operation: string;
    additionalContext: Record<string, unknown>;
  }) => ToolRequestContext;
}

/**
 * Register all tools on an McpServer with standardized handling.
 *
 * This eliminates ~90 lines of duplicated boilerplate per server by
 * centralising: OTEL spans, input validation, context creation,
 * elicitation wiring, response formatting, error handling, and metrics.
 */
export function registerToolsFromDefinitions(opts: RegisterToolsOptions): void {
  const { server, tools, logger, sessionId, transformSchema, createRequestContext } = opts;

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: transformSchema(tool.inputSchema),
      },
      async (args: unknown) => {
        logger.info({ toolName: tool.name, arguments: args }, "Handling tool call");

        const startTime = Date.now();

        return withToolSpan(tool.name, (args as Record<string, unknown>) || {}, async () => {
          try {
            const context = createRequestContext({
              operation: `HandleToolRequest:${tool.name}`,
              additionalContext: {
                toolName: tool.name,
                input: args,
              },
            });

            const validatedInput = tool.inputSchema.parse(args);
            setSpanAttribute("tool.input.validated", true);

            const sdkContext: ToolSdkContext = {
              requestId: context.requestId,
              sessionId,
              elicitInput: async (params) => {
                return server.server.elicitInput(params);
              },
            };

            const result = await tool.logic(validatedInput, context, sdkContext);
            setSpanAttribute("tool.execution.success", true);

            const content = tool.responseFormatter
              ? tool.responseFormatter(result, validatedInput)
              : [
                  {
                    type: "text" as const,
                    text: JSON.stringify(result, null, 2),
                  },
                ];

            logger.info(
              { toolName: tool.name, requestId: context.requestId },
              "Tool executed successfully"
            );

            recordToolExecution(tool.name, "success", Date.now() - startTime);

            return { content };
          } catch (error) {
            recordSpanError(error as Error);
            setSpanAttribute("tool.execution.success", false);

            recordToolExecution(tool.name, "error", Date.now() - startTime);

            const mcpError = ErrorHandler.handleError(
              error,
              { operation: `tool:${tool.name}`, input: args },
              logger
            );

            const isProduction = process.env.NODE_ENV === "production";
            const sanitizedData = ErrorHandler.sanitizeErrorData(mcpError.data);
            const errorMessage = isProduction
              ? mcpError.message
              : `Error: ${mcpError.message}`;

            return {
              content: [
                {
                  type: "text" as const,
                  text: isProduction
                    ? JSON.stringify({
                        error: errorMessage,
                        code: mcpError.code,
                        ...(sanitizedData && { data: sanitizedData }),
                      })
                    : `Error: ${mcpError.message}`,
                },
              ],
              isError: true,
            };
          }
        });
      }
    );
  }

  logger.info({ toolCount: tools.length }, "Registered MCP tools");
}
