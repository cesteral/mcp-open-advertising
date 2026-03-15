// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Async (Task-based) version of dbm_run_custom_query.
 *
 * Uses the MCP experimental Tasks API to return a task handle immediately,
 * while the Bid Manager report executes in the background.
 * Clients poll via tasks/getTask and retrieve results via tasks/getTaskResult.
 *
 * @experimental — Tasks API is experimental in MCP spec 2025-11-25
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "pino";
import type {
  CreateTaskRequestHandlerExtra,
  TaskRequestHandlerExtra,
} from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";
import type { CallToolResult, GetTaskResult } from "@modelcontextprotocol/sdk/types.js";
import {
  RunCustomQueryInputSchema,
  runCustomQueryResponseFormatter,
  type RunCustomQueryInput,
  type RunCustomQueryOutput,
} from "./run-custom-query.tool.js";
import { extractZodShape } from "@cesteral/shared";
import { resolveSessionServices } from "../utils/resolve-session.js";
import { validateQueryParams } from "../utils/query-validation.js";
import { McpError, JsonRpcErrorCode } from "../../../utils/errors/index.js";

/**
 * Register the async task-based version of dbm_run_custom_query on the McpServer.
 * Uses server.experimental.tasks.registerToolTask().
 */
export function registerRunCustomQueryAsyncTool(
  server: McpServer,
  logger: Logger,
  sessionId?: string
): void {
  // Extract raw shape from ZodEffects schema — the SDK expects ZodRawShapeCompat
  const inputShape = extractZodShape(RunCustomQueryInputSchema);

  server.experimental.tasks.registerToolTask(
    "dbm_run_custom_query_async",
    {
      title: "Run Custom Query (Async)",
      description:
        "Execute a custom Bid Manager API query asynchronously. Returns a task handle immediately — " +
        "poll via tasks/getTask for status, retrieve results via tasks/getTaskResult when complete. " +
        "Use this for large or complex queries that may take time to execute.\n\n" +
        "Accepts the same parameters as dbm_run_custom_query.",
      inputSchema: inputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      execution: {
        taskSupport: "required",
      },
    },
    {
      /**
       * Called when a client invokes the tool. Creates a task and starts
       * the Bid Manager query in the background.
       */
      createTask: async (
        args: Record<string, unknown>,
        { taskStore }: CreateTaskRequestHandlerExtra
      ) => {
        const input = args as RunCustomQueryInput;

        // Validate params eagerly so we fail fast before creating a task
        const { errors } = validateQueryParams(input, input.strictValidation !== false);
        if (errors.length > 0) {
          throw new McpError(
            JsonRpcErrorCode.InvalidParams,
            `Validation failed: ${errors.map((e) => e.message).join("; ")}`
          );
        }

        // Create the task (5 minute TTL, 3 second poll interval)
        const task = await taskStore.createTask({
          ttl: 5 * 60 * 1000,
          pollInterval: 3000,
        });

        logger.info(
          { taskId: task.taskId, sessionId, reportType: input.reportType },
          "Created async query task"
        );

        // Start background execution
        (async () => {
          try {
            // Resolve session services using the sessionId from the closure
            const sdkContext = sessionId ? { sessionId } : undefined;
            const { bidManagerService } = resolveSessionServices(sdkContext);

            // Execute the query
            const result = await bidManagerService.executeCustomQuery({
              reportType: input.reportType,
              groupBys: input.groupBys,
              metrics: input.metrics,
              filters: input.filters,
              dateRange: input.dateRange,
              outputFormat: input.outputFormat,
            });

            const output: RunCustomQueryOutput = {
              queryId: result.queryId,
              reportId: result.reportId,
              status: result.status,
              rowCount: result.rowCount,
              columns: result.columns,
              data: result.data,
              timestamp: new Date().toISOString(),
            };

            // Format as MCP content
            const content = runCustomQueryResponseFormatter(output, input);

            // Store the result — marks task as completed
            await taskStore.storeTaskResult(task.taskId, "completed", {
              content,
              structuredContent: output,
            });

            logger.info(
              { taskId: task.taskId, rowCount: output.rowCount },
              "Async query task completed"
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            logger.error({ taskId: task.taskId, error: message }, "Async query task failed");

            await taskStore.storeTaskResult(task.taskId, "failed", {
              content: [{ type: "text", text: `Query failed: ${message}` }],
              isError: true,
            });
          }
        })();

        return { task };
      },

      /**
       * Called when a client polls for task status.
       */
      getTask: async (
        _args: Record<string, unknown>,
        { taskId, taskStore }: TaskRequestHandlerExtra
      ) => {
        const task = await taskStore.getTask(taskId);
        return task as unknown as GetTaskResult;
      },

      /**
       * Called when a client requests the final result.
       */
      getTaskResult: async (
        _args: Record<string, unknown>,
        { taskId, taskStore }: TaskRequestHandlerExtra
      ) => {
        const result = await taskStore.getTaskResult(taskId);
        return result as unknown as CallToolResult;
      },
    }
  );

  logger.info("Registered async task-based tool: dbm_run_custom_query_async");
}