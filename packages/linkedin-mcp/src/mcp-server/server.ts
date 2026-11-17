// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
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
 * factory except the generated `linkedin_search_tools` must appear here, and
 * nothing else may (`scripts/lib/workflow-id-maps.test.mjs`); a missing
 * entry logs the tool's calls with no workflowId.
 */
export const linkedInWorkflowIdByToolName: Record<string, string> = {
  // Read operations
  linkedin_list_entities: "mcp.execute.linkedin_entity_read",
  linkedin_get_entity: "mcp.execute.linkedin_entity_read",
  linkedin_list_ad_accounts: "mcp.execute.linkedin_entity_read",
  // Write operations
  linkedin_create_entity: "mcp.execute.linkedin_entity_update",
  linkedin_update_entity: "mcp.execute.linkedin_entity_update",
  linkedin_delete_entity: "mcp.execute.linkedin_entity_update",
  // Analytics
  linkedin_get_analytics: "mcp.execute.linkedin_analytics",
  linkedin_get_analytics_breakdowns: "mcp.execute.linkedin_analytics",
  // Bulk operations
  linkedin_bulk_update_status: "mcp.execute.linkedin_bulk_operations",
  linkedin_bulk_create_entities: "mcp.execute.linkedin_bulk_operations",
  linkedin_bulk_update_entities: "mcp.execute.linkedin_bulk_operations",
  linkedin_adjust_bids: "mcp.execute.linkedin_bulk_operations",
  // Targeting
  linkedin_search_targeting: "mcp.execute.linkedin_entity_read",
  linkedin_get_targeting_options: "mcp.execute.linkedin_entity_read",
  linkedin_get_audience_count: "mcp.execute.linkedin_entity_read",
  // Specialized
  linkedin_duplicate_entity: "mcp.execute.linkedin_entity_update",
  linkedin_get_delivery_forecast: "mcp.execute.linkedin_entity_read",
  linkedin_get_ad_preview: "mcp.execute.linkedin_entity_read",
  linkedin_upload_image: "mcp.execute.linkedin_entity_update",
  linkedin_upload_video: "mcp.execute.linkedin_entity_update",
  linkedin_validate_entity: "mcp.execute.linkedin_entity_read",
  // Pacing
  linkedin_get_pacing_status: "mcp.execute.linkedin_entity_read",
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
    packageName: "linkedin-mcp",
    platform: "linkedin_ads",
    version: packageJson.version,
    description:
      "LinkedIn Ads campaign management, analytics, and optimization via the versioned LinkedIn Marketing API. Supports 5 entity types (adAccount, campaignGroup, campaign, creative, conversionRule), analytics with pivot breakdowns, bulk operations, targeting search, delivery forecasts, and ad previews.",
    instructions:
      "LinkedIn Ads campaign management server. Supports 5 entity types (adAccount, campaignGroup, campaign, creative, conversionRule), analytics, targeting, and bulk operations via the versioned LinkedIn Marketing API. " +
      "Use linkedin_list_ad_accounts to discover accounts, linkedin_list_entities to browse entities. " +
      "See MCP Resources for entity schemas and MCP Prompts for workflow guidance.",
    tools: allTools,
    resources: allResources,
    prompts: promptRegistry.values(),
    workflowIdByToolName: linkedInWorkflowIdByToolName,
    manifestUrl: new URL("../cesteral-manifest.json", import.meta.url),
    sessionServiceStore,
  });
}

/**
 * Connect server to stdio transport
 */
export async function runStdioServer(server: McpServer, logger: Logger): Promise<void> {
  logger.info("Starting MCP server with stdio transport");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");
}
