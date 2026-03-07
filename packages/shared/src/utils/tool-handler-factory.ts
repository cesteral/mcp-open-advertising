/**
 * Tool Handler Factory
 *
 * Extracts common MCP tool registration boilerplate into a reusable handler.
 * All MCP servers use this to register tools with consistent context creation,
 * telemetry, error handling, and metrics.
 *
 * Compliant with MCP Specification 2025-11-25:
 * - Forwards title, annotations, outputSchema to the SDK
 * - Returns structuredContent alongside content when outputSchema is defined
 * - Uses structural typing to avoid coupling the shared package to the MCP SDK
 */

import type { Logger } from "pino";
import { z } from "zod";
import { withToolSpan, setSpanAttribute, recordSpanError } from "./telemetry.js";
import { ErrorHandler, McpError } from "./mcp-errors.js";
import { recordToolExecution } from "./metrics.js";
import { type InteractionLogger, type InteractionLogEntry, sanitizeParams } from "./interaction-logger.js";
import type { SessionAuthContext } from "../auth/auth-strategy.js";

/**
 * Default maximum character length for text content blocks in tool responses.
 * Prevents context window overflow for AI agents processing large responses.
 * Can be overridden per-server via RegisterToolsOptions.responseCharacterLimit.
 */
export const RESPONSE_CHARACTER_LIMIT = 25_000;

const ADVERTISER_PARAM_KEYS = ["advertiserId", "customerId", "partnerId", "adAccountId"] as const;
const ADVERTISER_PARAM_ARRAY_KEYS = ["advertiserIds", "customerIds", "adAccountIds"] as const;

/**
 * Normalize a Meta ad account ID by stripping the `act_` prefix.
 * This allows allowedAdvertisers to store bare numeric IDs while
 * tool params may arrive with the `act_` prefix.
 */
function normalizeAccountId(id: string): string {
  return id.startsWith("act_") ? id.slice(4) : id;
}

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
  sendLoggingMessage?: (params: { level: string; logger?: string; data?: unknown }) => Promise<void>;
  [key: string]: unknown;
}

/**
 * A concrete input example for a tool, used to improve tool selection
 * and usage accuracy. Embedded into tool descriptions for MCP clients
 * and available as structured data for Anthropic API's input_examples.
 */
export interface ToolInputExample {
  /** Short label describing the scenario, e.g. "Create a TTD campaign" */
  label: string;
  /** Complete input payload — must validate against the tool's inputSchema */
  input: Record<string, unknown>;
}

/**
 * Format ToolInputExample[] into a markdown section appended to tool descriptions.
 * Returns empty string when examples is undefined or empty.
 */
export function formatExamplesForDescription(examples?: ToolInputExample[]): string {
  if (!examples || examples.length === 0) return "";

  const blocks = examples.map(
    (ex) => `**${ex.label}:**\n\`\`\`json\n${JSON.stringify(ex.input, null, 2)}\n\`\`\``
  );

  return `\n\n### Examples\n\n${blocks.join("\n\n")}`;
}

/**
 * Tool annotations per MCP Spec 2025-11-25
 */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolInteractionContext {
  toolName: string;
  operation: string;
  workflowId?: string;
  platform?: string;
  packageName?: string;
  requestId: string;
}

/**
 * Minimal tool definition interface — matches all server packages.
 * Includes all fields from MCP Spec 2025-11-25 (title, annotations, outputSchema).
 */
export interface ToolDefinitionForFactory {
  name: string;
  title?: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
  annotations?: ToolAnnotations;
  inputExamples?: ToolInputExample[];
  logic: (
    input: any,
    context: any,
    sdkContext?: any
  ) => Promise<any>;
  responseFormatter?: (result: any, input: any) => any[];
}

/**
 * Tool registration config passed to McpServer.registerTool().
 * Matches the MCP SDK's expected config shape including 2025-11-25 fields.
 */
interface ToolRegistrationConfig {
  title?: string;
  description: string;
  inputSchema: any;
  outputSchema?: any;
  annotations?: ToolAnnotations;
}

/**
 * Structural type for McpServer — avoids direct dependency on @modelcontextprotocol/sdk.
 * Uses `any` for the elicitInput param to accommodate SDK's specific union type.
 */
interface McpServerLike {
  server: {
    elicitInput: (params: any) => Promise<any>;
  };
  sendLoggingMessage(params: { level: string; logger?: string; data?: unknown }): Promise<void>;
  registerTool(
    name: string,
    config: ToolRegistrationConfig,
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
   * Transform a Zod schema into the format expected by server.registerTool().
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
  /**
   * Controls JSON formatting for default text responses when no custom responseFormatter is provided.
   * `compact` reduces token usage and is recommended when outputSchema is present.
   */
  defaultTextFormat?: "compact" | "pretty";
  platform?: string;
  packageName?: string;
  /**
   * Optional workflow id map to annotate executions by tool name.
   */
  workflowIdByToolName?: Record<string, string>;
  /**
   * Optional interaction logger for persisting tool execution data to JSONL.
   * Writes are fire-and-forget.
   */
  interactionLogger?: InteractionLogger;
  /**
   * Optional resolver to access session auth context for authorization + audit logging.
   */
  authContextResolver?: () => SessionAuthContext | undefined;
  /**
   * Maximum character length for text content blocks in tool responses.
   * Text blocks exceeding this limit are truncated with a diagnostic message.
   * Defaults to RESPONSE_CHARACTER_LIMIT (25,000).
   */
  responseCharacterLimit?: number;
}

function estimatePayloadBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf-8");
  } catch {
    return 0;
  }
}

/**
 * Truncate text content blocks that exceed the character limit.
 * Non-text content blocks (e.g. image, resource) are passed through unchanged.
 *
 * @returns A new content array with oversized text blocks truncated and a
 *          diagnostic message appended indicating how much was omitted.
 */
export function truncateTextContent(
  content: Array<{ type: string; text?: string; [key: string]: unknown }>,
  limit: number,
): Array<{ type: string; text?: string; [key: string]: unknown }> {
  return content.map((block) => {
    if (block.type !== "text" || typeof block.text !== "string") {
      return block;
    }
    if (block.text.length <= limit) {
      return block;
    }

    const originalLength = block.text.length;
    const truncatedText =
      block.text.slice(0, limit) +
      `\n\n--- Response truncated (${limit.toLocaleString("en-US")} of ${originalLength.toLocaleString("en-US")} characters shown). Use pagination parameters or filters to narrow results. ---`;

    return { ...block, text: truncatedText };
  });
}

/**
 * Register all tools on an McpServer with standardized handling.
 *
 * This eliminates ~90 lines of duplicated boilerplate per server by
 * centralising: OTEL spans, input validation, context creation,
 * elicitation wiring, response formatting, error handling, and metrics.
 *
 * MCP Spec 2025-11-25 compliance:
 * - Forwards title, annotations, outputSchema to the SDK
 * - Returns structuredContent alongside content when outputSchema is defined
 */
export function registerToolsFromDefinitions(opts: RegisterToolsOptions): void {
  const {
    server,
    tools,
    logger,
    sessionId,
    transformSchema,
    createRequestContext,
    defaultTextFormat = "compact",
    platform,
    packageName,
    workflowIdByToolName = {},
    interactionLogger,
    authContextResolver,
    responseCharacterLimit = RESPONSE_CHARACTER_LIMIT,
  } = opts;

  if (!Number.isFinite(responseCharacterLimit) || responseCharacterLimit < 1) {
    throw new Error(`responseCharacterLimit must be a positive finite number, got ${responseCharacterLimit}`);
  }

  const auditLogger = logger.child({ component: "audit" });

  for (const tool of tools) {
    // Build registration config with all MCP 2025-11-25 fields
    const transformedInputSchema = transformSchema(tool.inputSchema);

    // Embed input examples into description for universal MCP client compatibility
    const descriptionWithExamples = tool.description + formatExamplesForDescription(tool.inputExamples);

    const toolConfig: ToolRegistrationConfig = {
      description: descriptionWithExamples,
      inputSchema: transformedInputSchema,
    };

    // Forward optional title (human-readable display name)
    if (tool.title) {
      toolConfig.title = tool.title;
    }

    // Forward optional annotations (readOnlyHint, destructiveHint, etc.)
    if (tool.annotations) {
      toolConfig.annotations = tool.annotations;
    }

    // Forward optional outputSchema for structured content validation
    let transformedOutputSchema: unknown;
    if (tool.outputSchema) {
      transformedOutputSchema = transformSchema(tool.outputSchema);
      toolConfig.outputSchema = transformedOutputSchema;
    }

    const schemaSizeLog: Record<string, unknown> = {
      toolName: tool.name,
      inputSchemaBytes: estimatePayloadBytes(transformedInputSchema),
    };
    if (transformedOutputSchema !== undefined) {
      schemaSizeLog.outputSchemaBytes = estimatePayloadBytes(transformedOutputSchema);
    }
    logger.debug(schemaSizeLog, "Tool schema sizes");

    server.registerTool(
      tool.name,
      toolConfig,
      async (args: unknown) => {
        logger.info({ toolName: tool.name, arguments: args }, "Handling tool call");

        // Send MCP logging notification for tool invocation
        server.sendLoggingMessage({
          level: "info",
          logger: tool.name,
          data: `Invoking tool: ${tool.name}`,
        }).catch(() => { /* ignore if no client connected */ });

        const startTime = Date.now();

        return withToolSpan(tool.name, (args as Record<string, unknown>) || {}, async () => {
          let requestId: string | undefined;
          let resolvedAuthContext: SessionAuthContext | undefined;
          let auditedIdentifiers: Record<string, string | string[]> = {};

          try {
            const context = createRequestContext({
              operation: `HandleToolRequest:${tool.name}`,
              additionalContext: {
                toolName: tool.name,
                input: args,
              },
            });
            requestId = context.requestId;

            const validatedInput = tool.inputSchema.parse(args);
            setSpanAttribute("tool.input.validated", true);

            // ── Authorization check ──────────────────────────────────────
            if (authContextResolver) {
              resolvedAuthContext = authContextResolver();
              if (resolvedAuthContext && resolvedAuthContext.allowedAdvertisers !== undefined) {
                const input = validatedInput as Record<string, unknown>;
                const allowedAdvertisers = resolvedAuthContext.allowedAdvertisers;

                for (const key of ADVERTISER_PARAM_KEYS) {
                  const value = input[key];
                  if (typeof value === "string") {
                    auditedIdentifiers[key] = value;
                    const normalizedValue = normalizeAccountId(value);
                    if (!allowedAdvertisers.some((a) => normalizeAccountId(a) === normalizedValue)) {
                      auditLogger.warn(
                        {
                          event: "tool_access_denied",
                          sessionId,
                          clientId: resolvedAuthContext.authInfo.clientId,
                          authType: resolvedAuthContext.authInfo.authType,
                          tool: tool.name,
                          [key]: value,
                          authorized: false,
                          reason: "advertiser not in allowed scope",
                        },
                        "Authorization denied"
                      );

                      recordToolExecution(tool.name, "error", Date.now() - startTime);

                      return {
                        content: [
                          {
                            type: "text" as const,
                            text: "Access denied: " + key + ' "' + value + '" is not in your authorized scope.',
                          },
                        ],
                        isError: true,
                      };
                    }
                  }
                }

                for (const key of ADVERTISER_PARAM_ARRAY_KEYS) {
                  const value = input[key];
                  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
                    const ids = value as string[];
                    auditedIdentifiers[key] = ids;
                    const deniedId = ids.find((id) => !allowedAdvertisers.some((a) => normalizeAccountId(a) === normalizeAccountId(id)));
                    if (deniedId) {
                      auditLogger.warn(
                        {
                          event: "tool_access_denied",
                          sessionId,
                          clientId: resolvedAuthContext.authInfo.clientId,
                          authType: resolvedAuthContext.authInfo.authType,
                          tool: tool.name,
                          [key]: deniedId,
                          authorized: false,
                          reason: "advertiser not in allowed scope",
                        },
                        "Authorization denied"
                      );

                      recordToolExecution(tool.name, "error", Date.now() - startTime);

                      return {
                        content: [
                          {
                            type: "text" as const,
                            text: "Access denied: " + key + ' contains ID "' + deniedId + '" outside your authorized scope.',
                          },
                        ],
                        isError: true,
                      };
                    }
                  }
                }
              }
            }

            const sdkContext: ToolSdkContext = {
              requestId: context.requestId,
              sessionId,
              elicitInput: async (params) => {
                return server.server.elicitInput(params);
              },
              sendLoggingMessage: async (params) => {
                return server.sendLoggingMessage(params);
              },
            };
            const interactionContext: ToolInteractionContext = {
              toolName: tool.name,
              operation: `tool:${tool.name}`,
              workflowId: workflowIdByToolName[tool.name],
              platform,
              packageName,
              requestId: context.requestId,
            };
            if (platform) setSpanAttribute("mcp.platform", platform);
            if (packageName) setSpanAttribute("mcp.server.package", packageName);
            if (interactionContext.workflowId) {
              setSpanAttribute("mcp.workflow.id", interactionContext.workflowId);
            }

            const result = await tool.logic(validatedInput, context, sdkContext);
            setSpanAttribute("mcp.tool.execution.success", true);

            const durationMs = Date.now() - startTime;
            setSpanAttribute("mcp.tool.execution.latency_ms", durationMs);

            // ── Interaction logging (fire-and-forget) ────────────────────
            if (interactionLogger) {
              const logEntry: InteractionLogEntry = {
                ts: new Date().toISOString(),
                sessionId: sessionId ?? "unknown",
                tool: tool.name,
                params: sanitizeParams(args) as Record<string, unknown>,
                success: true,
                durationMs,
                workflowId: interactionContext.workflowId,
                platform,
                packageName,
                requestId: context.requestId,
              };
              interactionLogger.append(logEntry);
            }

            const rawContent = tool.responseFormatter
              ? tool.responseFormatter(result, validatedInput)
              : [
                  {
                    type: "text" as const,
                    text:
                      defaultTextFormat === "pretty"
                        ? JSON.stringify(result, null, 2)
                        : JSON.stringify(result),
                  },
                ];

            // Truncate oversized text content blocks to prevent context window overflow
            const content = truncateTextContent(rawContent, responseCharacterLimit);

            if (content.some((block, i) => block !== rawContent[i])) {
              logger.warn(
                { toolName: tool.name, requestId: context.requestId, limit: responseCharacterLimit },
                "Tool response text truncated"
              );
            }

            if (tool.outputSchema && tool.responseFormatter) {
              const hasVerbosePayloadText = content.some(
                (item) =>
                  item?.type === "text" &&
                  typeof item.text === "string" &&
                  (item.text.includes("Full Data:") || item.text.length > 6_000)
              );
              if (hasVerbosePayloadText) {
                logger.warn(
                  { toolName: tool.name },
                  "Structured tool response text appears verbose; prefer concise summaries with structuredContent"
                );
              }
            }

            logger.info(
              { toolName: tool.name, requestId: context.requestId },
              "Tool executed successfully"
            );

            // Send MCP logging notification for successful completion
            server.sendLoggingMessage({
              level: "info",
              logger: tool.name,
              data: `Tool ${tool.name} completed successfully`,
            }).catch(() => { /* ignore if no client connected */ });

            if (resolvedAuthContext) {
              auditLogger.info(
                {
                  event: "tool_access",
                  sessionId,
                  clientId: resolvedAuthContext.authInfo.clientId,
                  authType: resolvedAuthContext.authInfo.authType,
                  tool: tool.name,
                  authorized: true,
                  durationMs,
                  success: true,
                  ...auditedIdentifiers,
                },
                "Tool access"
              );
            }

            recordToolExecution(tool.name, "success", Date.now() - startTime);

            // MCP Spec 2025-11-25: return structuredContent alongside content
            // when outputSchema is defined. This enables typed result parsing.
            if (tool.outputSchema) {
              return {
                content,
                structuredContent: result,
              };
            }

            return { content };
          } catch (error) {
            recordSpanError(error as Error);
            setSpanAttribute("mcp.tool.execution.success", false);
            if (error instanceof McpError) {
              setSpanAttribute("mcp.tool.error_class", error.code);
            }

            recordToolExecution(tool.name, "error", Date.now() - startTime);

            if (resolvedAuthContext) {
              auditLogger.info(
                {
                  event: "tool_access",
                  sessionId,
                  clientId: resolvedAuthContext.authInfo.clientId,
                  authType: resolvedAuthContext.authInfo.authType,
                  tool: tool.name,
                  authorized: true,
                  durationMs: Date.now() - startTime,
                  success: false,
                  ...auditedIdentifiers,
                },
                "Tool access (error)"
              );
            }

            // Log failed interactions
            if (interactionLogger) {
              const errorLogEntry: InteractionLogEntry = {
                ts: new Date().toISOString(),
                sessionId: sessionId ?? "unknown",
                tool: tool.name,
                params: sanitizeParams(args) as Record<string, unknown>,
                success: false,
                durationMs: Date.now() - startTime,
                workflowId: workflowIdByToolName[tool.name],
                platform,
                packageName,
                requestId,
              };
              interactionLogger.append(errorLogEntry);
            }

            const mcpError = ErrorHandler.handleError(
              error,
              { operation: `tool:${tool.name}`, input: args },
              logger
            );

            // Send MCP logging notification for tool failure
            server.sendLoggingMessage({
              level: "error",
              logger: tool.name,
              data: `Tool ${tool.name} failed: ${(error as Error).message}`,
            }).catch(() => { /* ignore if no client connected */ });

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
