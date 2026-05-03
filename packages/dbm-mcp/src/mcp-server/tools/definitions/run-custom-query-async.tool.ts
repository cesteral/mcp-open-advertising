// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Async (Task-based) version of dbm_run_custom_query.
 *
 * Uses MCP Tasks (SEP-1686) to return a task handle immediately while the
 * Bid Manager report executes in the background. Wired through the shared
 * `registerAsyncTaskTool` helper so the tool only describes its inputs,
 * outputs, validation, work, and formatter.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "pino";
import { registerAsyncTaskTool, McpError, JsonRpcErrorCode } from "@cesteral/shared";
import {
  RunCustomQueryInputSchema,
  RunCustomQueryOutputSchema,
  runCustomQueryLogic,
  runCustomQueryResponseFormatter,
  type RunCustomQueryInput,
} from "./run-custom-query.tool.js";
import { validateQueryParams } from "../utils/query-validation.js";

export function registerRunCustomQueryAsyncTool(
  server: McpServer,
  logger: Logger,
  sessionId?: string
): void {
  registerAsyncTaskTool({
    server: server as unknown as Parameters<typeof registerAsyncTaskTool>[0]["server"],
    logger,
    sessionId,
    invalidParams: (message) => new McpError(JsonRpcErrorCode.InvalidParams, message),
    config: {
      name: "dbm_run_custom_query_async",
      title: "Run Custom Query (Async)",
      description:
        "Execute a custom Bid Manager API query asynchronously. Returns a task handle immediately — " +
        "poll via tasks/getTask for status, retrieve results via tasks/getTaskResult when complete. " +
        "Use this for large or complex queries that may take time to execute.\n\n" +
        "Accepts the same parameters as dbm_run_custom_query.",
      inputSchema: RunCustomQueryInputSchema,
      outputSchema: RunCustomQueryOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      validate: (input: RunCustomQueryInput) => {
        const { errors } = validateQueryParams(input, input.strictValidation !== false);
        return errors.map((e) => ({
          message: e.message,
          nextAction: e.resourceUri
            ? `Read MCP resource ${e.resourceUri} for allowed values, then retry dbm_run_custom_query_async.`
            : "Read filter-types://all, metric-types://all, or report-types://all for allowed query values, then retry dbm_run_custom_query_async.",
        }));
      },
      execute: async (input: RunCustomQueryInput, ctx) => {
        const sdkContext = ctx.sessionId ? { sessionId: ctx.sessionId } : undefined;
        return runCustomQueryLogic(
          input,
          {
            requestId: ctx.requestId,
            timestamp: new Date().toISOString(),
            operation: "dbm_run_custom_query_async",
          },
          sdkContext
        );
      },
      formatContent: (output, input: RunCustomQueryInput) =>
        runCustomQueryResponseFormatter(output, input),
    },
  });
}
