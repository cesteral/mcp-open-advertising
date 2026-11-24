// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { promptRegistry } from "./prompts/index.js";
import { createPlatformMcpServer } from "@cesteral/shared";
import { sessionServiceStore } from "../services/session-services.js";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

/**
 * Interaction-log workflow id per tool. Every tool registered through the
 * factory must appear here, and nothing else may
 * (`scripts/lib/workflow-id-maps.test.mjs`); a missing entry logs the tool's
 * calls with no workflowId.
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
  const server = await createPlatformMcpServer({
    sdk: { McpServer, ResourceTemplate },
    logger,
    sessionId,
    gcsBucket,
    packageName: "dbm-mcp",
    platform: "dbm",
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

  return server;
}
