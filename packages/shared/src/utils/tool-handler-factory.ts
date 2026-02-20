/**
 * Tool Handler Factory
 *
 * Extracts common MCP tool registration boilerplate into a reusable handler.
 * Both dbm-mcp and dv360-mcp servers use this to register tools with
 * consistent context creation, telemetry, error handling, and metrics.
 *
 * Compliant with MCP Specification 2025-11-25:
 * - Forwards title, annotations, outputSchema to the SDK
 * - Returns structuredContent alongside content when outputSchema is defined
 * - Uses structural typing to avoid coupling the shared package to the MCP SDK
 */

import type { Logger } from "pino";
import type { z } from "zod";
import { randomUUID } from "node:crypto";
import { withToolSpan, withSpan, setSpanAttribute, recordSpanError } from "./telemetry.js";
import { ErrorHandler, EvaluatorIssueClass, JsonRpcErrorCode, McpError } from "./mcp-errors.js";
import {
  recordToolExecution,
  recordEvaluatorFinding,
  recordEvaluatorRecommendation,
  recordWorkflowCallDepth,
} from "./metrics.js";
import { type InteractionLogger, type InteractionLogEntry, sanitizeParams } from "./interaction-logger.js";
import type { FindingBuffer } from "./finding-types.js";

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
 * Tool annotations per MCP Spec 2025-11-25
 */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolInteractionIssue {
  class: EvaluatorIssueClass;
  message: string;
  isRecoverable?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ToolInteractionEvaluation {
  issues: ToolInteractionIssue[];
  inputQualityScore?: number;
  efficiencyScore?: number;
  recommendationAction?: "none" | "log_only" | "propose_playbook_delta" | "block";
}

export interface ToolInteractionContext {
  toolName: string;
  operation: string;
  workflowId?: string;
  platform?: string;
  packageName?: string;
  requestId: string;
}

export interface ToolExecutionSnapshot {
  args: unknown;
  validatedInput: unknown;
  context: ToolRequestContext;
  result: unknown;
  durationMs: number;
}

/**
 * Minimal tool definition interface — matches both server packages.
 * Includes all fields from MCP Spec 2025-11-25 (title, annotations, outputSchema).
 */
export interface ToolDefinitionForFactory {
  name: string;
  title?: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
  annotations?: ToolAnnotations;
  logic: (
    input: any,
    context: any,
    sdkContext?: any
  ) => Promise<any>;
  inputRefiner?: (
    input: any,
    context: ToolInteractionContext,
    sdkContext?: ToolSdkContext
  ) => Promise<any>;
  postExecutionEvaluator?: (
    snapshot: ToolExecutionSnapshot,
    context: ToolInteractionContext,
    sdkContext?: ToolSdkContext
  ) => Promise<ToolInteractionEvaluation>;
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
   * Shared evaluator config for all registered tools.
   */
  evaluator?: {
    enabled: boolean;
    observeOnly?: boolean;
    evaluate?: (
      snapshot: ToolExecutionSnapshot,
      context: ToolInteractionContext,
      sdkContext?: ToolSdkContext
    ) => Promise<ToolInteractionEvaluation>;
  };
  /**
   * Optional interaction logger for persisting tool execution data to JSONL.
   * Fires after evaluation completes. Writes are fire-and-forget.
   */
  interactionLogger?: InteractionLogger;
  /**
   * Optional learning extractor that auto-generates learnings from repeated evaluator findings.
   * Fires after evaluation completes. Writes are fire-and-forget.
   */
  learningExtractor?: {
    processEvaluation(toolName: string, issues: ToolInteractionIssue[]): void;
  };
  /**
   * Optional per-session finding buffer for persisted evaluator findings.
   */
  findingBuffer?: FindingBuffer;
}

function estimatePayloadBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf-8");
  } catch {
    return 0;
  }
}

function clampScore(value: number | undefined): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }
  return Math.min(1, Math.max(0, value));
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
    evaluator,
    interactionLogger,
    learningExtractor,
    findingBuffer,
  } = opts;

  for (const tool of tools) {
    // Build registration config with all MCP 2025-11-25 fields
    const transformedInputSchema = transformSchema(tool.inputSchema);
    const toolConfig: ToolRegistrationConfig = {
      description: tool.description,
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

        const startTime = Date.now();

        return withToolSpan(tool.name, (args as Record<string, unknown>) || {}, async () => {
          // Declared outside try so they're accessible in the catch block
          // for error-path interaction logging.
          let requestId: string | undefined;
          const issues: ToolInteractionIssue[] = [];
          let inputQualityScore: number | undefined;
          let efficiencyScore: number | undefined;
          let recommendationAction:
            | "none"
            | "log_only"
            | "propose_playbook_delta"
            | "block"
            | undefined;

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

            const sdkContext: ToolSdkContext = {
              requestId: context.requestId,
              sessionId,
              elicitInput: async (params) => {
                return server.server.elicitInput(params);
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
            setSpanAttribute("mcp.tool.retry_count", 0);

            const refinedInput = tool.inputRefiner
              ? await tool.inputRefiner(validatedInput, interactionContext, sdkContext)
              : validatedInput;

            if (tool.inputRefiner) {
              setSpanAttribute("mcp.evaluator.input_refiner.enabled", true);
            }

            const result = await tool.logic(refinedInput, context, sdkContext);
            setSpanAttribute("mcp.tool.execution.success", true);

            const durationMs = Date.now() - startTime;
            setSpanAttribute("mcp.tool.execution.latency_ms", durationMs);

            const executionSnapshot: ToolExecutionSnapshot = {
              args,
              validatedInput: refinedInput,
              context,
              result,
              durationMs,
            };

            const observeOnly = evaluator?.observeOnly ?? true;
            const hasEvaluator = Boolean(
              (evaluator?.enabled && evaluator.evaluate) || tool.postExecutionEvaluator
            );
            if (hasEvaluator) {
              await withSpan(
                `tool.${tool.name}.evaluation`,
                async () => {
                  if (evaluator?.enabled && evaluator.evaluate) {
                    const globalEvaluation = await evaluator.evaluate(
                      executionSnapshot,
                      interactionContext,
                      sdkContext
                    );
                    if (globalEvaluation?.issues?.length) {
                      issues.push(...globalEvaluation.issues);
                    }
                    inputQualityScore = clampScore(globalEvaluation?.inputQualityScore);
                    efficiencyScore = clampScore(globalEvaluation?.efficiencyScore);
                    recommendationAction = globalEvaluation?.recommendationAction;
                  }

                  if (tool.postExecutionEvaluator) {
                    const localEvaluation = await tool.postExecutionEvaluator(
                      executionSnapshot,
                      interactionContext,
                      sdkContext
                    );
                    if (localEvaluation?.issues?.length) {
                      issues.push(...localEvaluation.issues);
                    }
                    inputQualityScore = clampScore(
                      localEvaluation?.inputQualityScore ?? inputQualityScore
                    );
                    efficiencyScore = clampScore(
                      localEvaluation?.efficiencyScore ?? efficiencyScore
                    );
                    recommendationAction =
                      localEvaluation?.recommendationAction ?? recommendationAction;
                  }
                },
                {
                  "mcp.tool.name": tool.name,
                  "mcp.workflow.id": interactionContext.workflowId ?? "unknown",
                }
              );

              const resolvedAction = recommendationAction ?? "none";
              setSpanAttribute("mcp.evaluator.observe_only", observeOnly);
              setSpanAttribute("mcp.evaluator.issues.count", issues.length);
              setSpanAttribute("mcp.evaluator.recommendation.action", resolvedAction);
              if (inputQualityScore !== undefined) {
                setSpanAttribute("mcp.evaluator.input_quality_score", inputQualityScore);
              }
              if (efficiencyScore !== undefined) {
                setSpanAttribute("mcp.evaluator.efficiency_score", efficiencyScore);
              }
              recordEvaluatorRecommendation(tool.name, resolvedAction, observeOnly);

              if (interactionContext.workflowId) {
                await withSpan(
                  `workflow.${interactionContext.workflowId}.refinement_decision`,
                  async () => undefined,
                  {
                    "mcp.workflow.id": interactionContext.workflowId,
                    "mcp.tool.name": tool.name,
                    "mcp.evaluator.issues.count": issues.length,
                    "mcp.evaluator.observe_only": observeOnly,
                    "mcp.evaluator.recommendation.action": resolvedAction,
                  }
                );
              }
            }

            if (findingBuffer && hasEvaluator) {
              findingBuffer.push({
                id: randomUUID(),
                sessionId: sessionId ?? "unknown",
                timestamp: new Date().toISOString(),
                toolName: tool.name,
                workflowId: interactionContext.workflowId,
                platform: interactionContext.platform ?? "unknown",
                serverPackage: interactionContext.packageName ?? "unknown",
                issues: issues.map((issue) => ({
                  class: issue.class,
                  message: issue.message,
                  isRecoverable: issue.isRecoverable,
                  metadata: issue.metadata,
                })),
                inputQualityScore,
                efficiencyScore,
                recommendationAction: recommendationAction ?? "none",
                durationMs,
              });
            }

            // Fire-and-forget: feed evaluator findings to learning extractor
            if (learningExtractor && issues.length > 0) {
              try {
                learningExtractor.processEvaluation(tool.name, issues);
              } catch {
                // Non-critical — don't block tool response
              }
            }

            if (issues.length > 0) {
              for (const issue of issues) {
                recordEvaluatorFinding(tool.name, issue.class, issue.isRecoverable ?? true);
              }

              if (
                recommendationAction === "block" &&
                !observeOnly &&
                issues.some((issue) => issue.isRecoverable === false)
              ) {
                throw new McpError(
                  JsonRpcErrorCode.ValidationError,
                  "Interaction evaluator blocked tool execution due to non-recoverable issues",
                  {
                    toolName: tool.name,
                    requestId: context.requestId,
                    issues,
                  }
                );
              }
            }

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
              if (issues.length > 0) {
                logEntry.evaluatorIssues = issues.map((i) => i.class);
              }
              if (inputQualityScore !== undefined) {
                logEntry.inputQualityScore = inputQualityScore;
              }
              if (efficiencyScore !== undefined) {
                logEntry.efficiencyScore = efficiencyScore;
              }
              if (recommendationAction) {
                logEntry.recommendationAction = recommendationAction;
              }
              interactionLogger.append(logEntry);
            }

            const content = tool.responseFormatter
              ? tool.responseFormatter(result, refinedInput)
              : [
                  {
                    type: "text" as const,
                    text:
                      defaultTextFormat === "pretty"
                        ? JSON.stringify(result, null, 2)
                        : JSON.stringify(result),
                  },
                ];

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

            recordToolExecution(tool.name, "success", Date.now() - startTime);
            recordWorkflowCallDepth(workflowIdByToolName[tool.name], 1);

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

            // Log failed interactions with any evaluator data collected before failure
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
              if (issues.length > 0) {
                errorLogEntry.evaluatorIssues = issues.map((i) => i.class);
              }
              if (inputQualityScore !== undefined) {
                errorLogEntry.inputQualityScore = inputQualityScore;
              }
              if (efficiencyScore !== undefined) {
                errorLogEntry.efficiencyScore = efficiencyScore;
              }
              if (recommendationAction) {
                errorLogEntry.recommendationAction = recommendationAction;
              }
              interactionLogger.append(errorLogEntry);
            }

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
