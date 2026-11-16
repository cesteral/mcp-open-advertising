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
 * factory except the generated `gads_search_tools` must appear here, and
 * nothing else may (`scripts/lib/workflow-id-maps.test.mjs`); a missing
 * entry logs the tool's calls with no workflowId.
 */
export const gadsWorkflowIdByToolName: Record<string, string> = {
  // Read tools
  gads_gaql_search: "mcp.execute.gads_entity_read",
  gads_list_accounts: "mcp.execute.gads_entity_read",
  gads_get_entity: "mcp.execute.gads_entity_read",
  gads_list_entities: "mcp.execute.gads_entity_read",
  gads_get_insights: "mcp.execute.gads_entity_read",
  gads_validate_entity: "mcp.execute.gads_entity_read",
  // Write tools
  gads_create_entity: "mcp.execute.gads_entity_management",
  gads_update_entity: "mcp.execute.gads_entity_management",
  gads_remove_entity: "mcp.execute.gads_entity_management",
  gads_adjust_bids: "mcp.execute.gads_entity_management",
  gads_bulk_mutate: "mcp.execute.gads_bulk_operations",
  gads_bulk_create_entities: "mcp.execute.gads_bulk_operations",
  gads_bulk_update_status: "mcp.execute.gads_bulk_operations",
  // Preview
  gads_get_ad_preview: "mcp.execute.gads_entity_read",
  // Pacing
  gads_get_pacing_status: "mcp.execute.gads_entity_read",
  // Duplicate and media uploads
  gads_duplicate_entity: "mcp.execute.gads_entity_management",
  gads_upload_image: "mcp.execute.gads_entity_management",
  gads_upload_video: "mcp.execute.gads_entity_management",
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
    packageName: "gads-mcp",
    platform: "google_ads",
    version: packageJson.version,
    description:
      "Google Ads campaign management and reporting via Google Ads REST API v26. " +
      "Supports GAQL queries, account listing, and full CRUD for 6 entity types " +
      "(campaign, adGroup, ad, keyword, campaignBudget, asset) with bulk operations.",
    instructions:
      "Google Ads campaign management and reporting server. Supports GAQL queries and full CRUD for 6 entity types via Google Ads REST API v26. " +
      "Use gads_list_accounts to discover accounts, gads_gaql_search for flexible queries. " +
      "See MCP Resources for GAQL syntax reference and entity schema details.",
    tools: allTools,
    resources: allResources,
    prompts: promptRegistry.values(),
    workflowIdByToolName: gadsWorkflowIdByToolName,
    manifestUrl: new URL("../cesteral-manifest.json", import.meta.url),
    sessionServiceStore,
    dropSessionOnAuthError: true,
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
