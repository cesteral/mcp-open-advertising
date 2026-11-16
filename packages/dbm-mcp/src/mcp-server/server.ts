// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTaskStore } from "@modelcontextprotocol/sdk/experimental/tasks";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { promptRegistry } from "./prompts/index.js";
import { createPlatformMcpServer } from "@cesteral/shared";
import { sessionServiceStore } from "../services/session-services.js";
import { registerRunCustomQueryAsyncTool } from "./tools/definitions/run-custom-query-async.tool.js";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

/**
 * Interaction-log workflow id per tool. Every tool registered through the
 * factory must appear here, and nothing else may
 * (`scripts/lib/workflow-id-maps.test.mjs`); a missing entry logs the tool's
 * calls with no workflowId. `dbm_run_custom_query_async` is registered by
 * `registerAsyncTaskTool`, not the factory, so no workflow id reaches it.
 */
export const dbmWorkflowIdByToolName: Record<string, string> = {
  dbm_get_campaign_delivery: "mcp.troubleshoot.delivery",
  dbm_get_performance_metrics: "mcp.troubleshoot.delivery",
  dbm_get_historical_metrics: "mcp.troubleshoot.delivery",
  dbm_get_pacing_status: "mcp.troubleshoot.delivery",
  dbm_run_custom_query: "mcp.execute.dbm_custom_query",
};

/**
 * Create and configure MCP server instance
 */
export async function createMcpServer(
  logger: Logger,
  sessionId?: string,
  gcsBucket?: string
): Promise<McpServer> {
  // Backing store for MCP Tasks (dbm_run_custom_query_async). Without a store
  // AND the `tasks` capability, the SDK rejects every task-augmented call
  // ("Server does not support task creation") and the tool — registered with
  // taskSupport "required" — was unusable.
  //
  // One store per McpServer, i.e. per session: InMemoryTaskStore ignores the
  // sessionId it is handed, so a process-wide store would let one session
  // list or read another session's task results. The trade-off is that a task
  // lives on the instance that created it — on a scaled-out deploy a
  // tasks/get routed to another instance reports "task not found".
  const taskStore = new InMemoryTaskStore();

  const server = await createPlatformMcpServer({
    sdk: { McpServer, ResourceTemplate },
    logger,
    sessionId,
    gcsBucket,
    packageName: "dbm-mcp",
    platform: "dbm",
    // `cancel` is deliberately not advertised: marking a task cancelled
    // cannot stop the Bid Manager report already running upstream.
    extraCapabilities: { tasks: { list: {}, requests: { tools: { call: {} } } } },
    taskStore,
    version: packageJson.version,
    description:
      "DV360 reporting and metrics via Bid Manager API v2. Provides read-only access to campaign delivery, performance, pacing, and historical data.",
    instructions:
      "DV360 reporting server. Provides read-only access to campaign delivery metrics, performance data, pacing, and historical trends via Bid Manager API v2. " +
      "Start with dbm_get_campaign_delivery or dbm_get_pacing_status. Use dbm_run_custom_query for advanced Bid Manager reports. " +
      "See MCP Resources for metric/filter references and query examples.",
    tools: allTools,
    resources: allResources,
    prompts: promptRegistry.values(),
    workflowIdByToolName: dbmWorkflowIdByToolName,
    sessionServiceStore,
  });

  // Register task-based tools
  registerRunCustomQueryAsyncTool(server, logger, sessionId);

  // The store's TTL timers hold finished task results; release them with the
  // session instead of letting them sit until the (long) TTL elapses.
  const closeServer = server.close.bind(server);
  server.close = async () => {
    try {
      await closeServer();
    } finally {
      taskStore.cleanup();
    }
  };

  return server;
}

/**
 * Connect server to stdio transport (for local MCP client testing)
 */
export async function runStdioServer(server: McpServer, logger: Logger): Promise<void> {
  logger.info("Starting MCP server with stdio transport");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");
}
