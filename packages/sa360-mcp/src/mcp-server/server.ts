// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { promptRegistry } from "./prompts/index.js";
import { createPlatformMcpServer } from "@cesteral/shared";
import { sessionServiceStore } from "../services/session-services.js";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

/**
 * Interaction-log workflow id per tool. Every tool registered through the
 * factory except the generated `sa360_search_tools` must appear here, and
 * nothing else may (`scripts/lib/workflow-id-maps.test.mjs`); a missing
 * entry logs the tool's calls with no workflowId.
 */
export const sa360WorkflowIdByToolName: Record<string, string> = {
  // Read tools
  sa360_gaql_search: "mcp.execute.sa360_query",
  sa360_list_accounts: "mcp.execute.sa360_query",
  sa360_get_entity: "mcp.execute.sa360_query",
  sa360_list_entities: "mcp.execute.sa360_query",
  sa360_get_insights: "mcp.execute.sa360_query",
  sa360_get_insights_breakdowns: "mcp.execute.sa360_query",
  sa360_list_custom_columns: "mcp.execute.sa360_query",
  sa360_search_fields: "mcp.execute.sa360_query",
  // Write tools (v2 API)
  sa360_insert_conversions: "mcp.execute.sa360_conversions",
  sa360_update_conversions: "mcp.execute.sa360_conversions",
  // Validation tools
  sa360_validate_conversion: "mcp.execute.sa360_validation",
  // Pacing, reports and change history (all reads are queries)
  sa360_get_pacing_status: "mcp.execute.sa360_query",
  sa360_list_report_columns: "mcp.execute.sa360_query",
  sa360_submit_report: "mcp.execute.sa360_query",
  sa360_check_report_status: "mcp.execute.sa360_query",
  sa360_download_report: "mcp.execute.sa360_query",
  sa360_get_change_history: "mcp.execute.sa360_query",
};

/**
 * Create and configure MCP server instance
 */
export async function createMcpServer(
  logger: Logger,
  sessionId?: string,
  gcsBucket?: string
): Promise<McpServer> {
  return createPlatformMcpServer({
    sdk: { McpServer, ResourceTemplate },
    logger,
    sessionId,
    gcsBucket,
    packageName: "sa360-mcp",
    platform: "sa360",
    version: packageJson.version,
    description:
      "Search Ads 360 reporting and conversion upload server. " +
      "Provides cross-engine unified reporting via SA360 Reporting API v0 and " +
      "offline conversion upload via legacy v2 API. " +
      "Supports 8 entity types (customer, campaign, adGroup, adGroupAd, " +
      "adGroupCriterion, campaignCriterion, biddingStrategy, conversionAction).",
    instructions:
      "Search Ads 360 reporting and conversion upload server. " +
      "Use sa360_list_accounts to discover accounts, sa360_gaql_search for flexible queries. " +
      "SA360 provides cross-engine reporting across Google Ads, Microsoft Ads, Yahoo Japan, and Baidu. " +
      "Entity data is read-only; only conversion upload is supported for writes.",
    tools: allTools,
    resources: allResources,
    prompts: promptRegistry.values(),
    workflowIdByToolName: sa360WorkflowIdByToolName,
    manifestUrl: new URL("../cesteral-manifest.json", import.meta.url),
    sessionServiceStore,
  });
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
