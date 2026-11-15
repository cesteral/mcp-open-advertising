// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { promptRegistry } from "./prompts/index.js";
import { createPlatformMcpServer } from "@cesteral/shared";
import { reportCsvStore, sessionServiceStore } from "../services/session-services.js";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

/**
 * Interaction-log workflow id per tool. Every tool registered through the
 * factory except the generated `tiktok_search_tools` must appear here, and
 * nothing else may (`scripts/lib/workflow-id-maps.test.mjs`); a missing
 * entry logs the tool's calls with no workflowId.
 */
export const tiktokWorkflowIdByToolName: Record<string, string> = {
  // Read operations
  tiktok_list_entities: "mcp.execute.tiktok_entity_read",
  tiktok_get_entity: "mcp.execute.tiktok_entity_read",
  tiktok_list_advertisers: "mcp.execute.tiktok_entity_read",
  // Write operations
  tiktok_create_entity: "mcp.execute.tiktok_entity_update",
  tiktok_update_entity: "mcp.execute.tiktok_entity_update",
  tiktok_delete_entity: "mcp.execute.tiktok_entity_update",
  // Upgraded Smart+ (the create path for Sales / App Promotion / Lead Generation from 2027-01-01)
  tiktok_get_smart_plus_entity: "mcp.execute.tiktok_entity_read",
  tiktok_create_smart_plus_entity: "mcp.execute.tiktok_entity_update",
  tiktok_update_smart_plus_entity: "mcp.execute.tiktok_entity_update",
  tiktok_update_smart_plus_status: "mcp.execute.tiktok_entity_update",
  // Reporting
  tiktok_get_report: "mcp.execute.tiktok_reporting",
  tiktok_get_report_breakdowns: "mcp.execute.tiktok_reporting",
  // Bulk operations
  tiktok_bulk_update_status: "mcp.execute.tiktok_bulk_operations",
  tiktok_bulk_create_entities: "mcp.execute.tiktok_bulk_operations",
  tiktok_bulk_update_entities: "mcp.execute.tiktok_bulk_operations",
  tiktok_adjust_bids: "mcp.execute.tiktok_bulk_operations",
  // Targeting
  tiktok_search_targeting: "mcp.execute.tiktok_entity_read",
  tiktok_get_targeting_options: "mcp.execute.tiktok_entity_read",
  // Specialized
  tiktok_duplicate_entity: "mcp.execute.tiktok_entity_update",
  tiktok_get_audience_estimate: "mcp.execute.tiktok_entity_read",
  tiktok_get_ad_preview: "mcp.execute.tiktok_entity_read",
  tiktok_validate_entity: "mcp.execute.tiktok_entity_read",
  // Pacing
  tiktok_get_pacing_status: "mcp.execute.tiktok_entity_read",
  // Async reports
  tiktok_submit_report: "mcp.execute.tiktok_reporting",
  tiktok_check_report_status: "mcp.execute.tiktok_reporting",
  tiktok_download_report: "mcp.execute.tiktok_reporting",
  // Media uploads
  tiktok_upload_image: "mcp.execute.tiktok_entity_update",
  tiktok_upload_video: "mcp.execute.tiktok_entity_update",
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
    packageName: "tiktok-mcp",
    platform: "tiktok",
    version: packageJson.version,
    description:
      "TikTok Ads campaign management and reporting via TikTok Marketing API v1.3. Supports 3 entity types (campaign, adGroup, ad), async reporting with breakdowns, bulk operations, targeting search, and audience estimation.",
    instructions:
      "TikTok Ads campaign management and reporting server. Supports 3 entity types (campaign, adGroup, ad), async reporting, targeting, and bulk operations via TikTok Marketing API v1.3. " +
      "Use tiktok_list_advertisers for the bound advertiser's account info, tiktok_list_entities to browse entities. " +
      "See MCP Resources for entity schemas and MCP Prompts for workflow guidance.",
    tools: allTools,
    resources: allResources,
    prompts: promptRegistry.values(),
    workflowIdByToolName: tiktokWorkflowIdByToolName,
    manifestUrl: new URL("../cesteral-manifest.json", import.meta.url),
    sessionServiceStore,
    reportCsv: {
      store: reportCsvStore,
      platformLabel: "TikTok",
      downloadToolName: "tiktok_download_report",
    },
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
