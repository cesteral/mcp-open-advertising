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
import { mcpConfig } from "../../../config/index.js";
import {
  computeWorstCaseReportDurationMs,
  type ReportTimingConfig,
} from "../../../services/bid-manager/report-timing.js";

// Hoisted to the fleet-standard module-level const so TOOL_NAME-based static
// tooling (registry scans, manifest checks) resolves this tool like every other.
const TOOL_NAME = "dbm_run_custom_query_async";

/**
 * Headroom on top of the summed sleeps for HTTP latency (create, run, every
 * status poll, the CSV download) and for the client to collect the result.
 */
const TASK_TTL_HEADROOM_MS = 30 * 60 * 1000;

/**
 * Task TTL for the async custom query.
 *
 * The SDK's in-memory task store deletes a task when its TTL elapses
 * *regardless of status*, and the shared helper's 5-minute default is far
 * shorter than a Bid Manager report can legitimately take (~72 min with the
 * default poll/retry config). With that default, a slow report finished into
 * a task that no longer existed and the result was dropped with only a log
 * line. The TTL is therefore derived from the configured worst case. The store
 * restarts the TTL when the result is stored, so the result also stays
 * retrievable for at least this long after completion.
 */
export function computeAsyncQueryTaskTtlMs(config: ReportTimingConfig = mcpConfig): number {
  return computeWorstCaseReportDurationMs(config) + TASK_TTL_HEADROOM_MS;
}

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
      name: TOOL_NAME,
      title: "Run Custom Query (Async)",
      description:
        "Execute a custom Bid Manager API query asynchronously. Returns a task handle immediately — " +
        "poll via tasks/get for status, retrieve results via tasks/result when complete. " +
        "Requires a client that supports MCP task-augmented tools/call; otherwise use dbm_run_custom_query. " +
        "Use this for large or complex queries that may take time to execute.\n\n" +
        "Accepts the same parameters as dbm_run_custom_query.",
      inputSchema: RunCustomQueryInputSchema,
      outputSchema: RunCustomQueryOutputSchema,
      taskTtlMs: computeAsyncQueryTaskTtlMs(),
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
