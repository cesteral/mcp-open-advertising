// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { promptRegistry } from "./prompts/index.js";
import { createPlatformMcpServer } from "@cesteral/shared";
import { reportCsvStore, sessionServiceStore } from "../services/session-services.js";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

/**
 * Interaction-log workflow id per tool. Every tool registered through the
 * factory except the generated `snapchat_search_tools` must appear here, and
 * nothing else may (`scripts/lib/workflow-id-maps.test.mjs`); a missing
 * entry logs the tool's calls with no workflowId.
 */
export const snapchatWorkflowIdByToolName: Record<string, string> = {
  // Read operations
  snapchat_list_entities: "mcp.execute.snapchat_entity_read",
  snapchat_get_entity: "mcp.execute.snapchat_entity_read",
  snapchat_list_ad_accounts: "mcp.execute.snapchat_entity_read",
  // Write operations
  snapchat_create_entity: "mcp.execute.snapchat_entity_update",
  snapchat_update_entity: "mcp.execute.snapchat_entity_update",
  snapchat_delete_entity: "mcp.execute.snapchat_entity_update",
  // Reporting
  snapchat_get_report: "mcp.execute.snapchat_reporting",
  snapchat_get_report_breakdowns: "mcp.execute.snapchat_reporting",
  // Bulk operations
  snapchat_bulk_update_status: "mcp.execute.snapchat_bulk_operations",
  snapchat_bulk_create_entities: "mcp.execute.snapchat_bulk_operations",
  snapchat_bulk_update_entities: "mcp.execute.snapchat_bulk_operations",
  snapchat_adjust_bids: "mcp.execute.snapchat_bulk_operations",
  // Targeting
  snapchat_search_targeting: "mcp.execute.snapchat_entity_read",
  snapchat_get_targeting_options: "mcp.execute.snapchat_entity_read",
  // Specialized
  snapchat_get_audience_estimate: "mcp.execute.snapchat_entity_read",
  snapchat_get_ad_preview: "mcp.execute.snapchat_entity_read",
  snapchat_validate_entity: "mcp.execute.snapchat_entity_read",
  // Pacing
  snapchat_get_pacing_status: "mcp.execute.snapchat_entity_read",
  // Async reports
  snapchat_submit_report: "mcp.execute.snapchat_reporting",
  snapchat_check_report_status: "mcp.execute.snapchat_reporting",
  snapchat_download_report: "mcp.execute.snapchat_reporting",
  // Duplicate and media uploads
  snapchat_duplicate_entity: "mcp.execute.snapchat_entity_update",
  snapchat_upload_image: "mcp.execute.snapchat_entity_update",
  snapchat_upload_video: "mcp.execute.snapchat_entity_update",
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
    packageName: "snapchat-mcp",
    platform: "snapchat",
    version: packageJson.version,
    description:
      "Snapchat Ads campaign management and reporting via the Snap Marketing API. Supports campaign, ad squad, ad, creative, and audience workflows with reporting, targeting, bid adjustments, and previews.",
    instructions:
      "Snapchat Ads campaign management and reporting server. Supports campaign, ad squad, ad, creative, and audience workflows with async reporting, targeting, bid adjustments, and bulk operations via the Snap Marketing API. " +
      "Progressive discovery: (1) start with snapchat_list_ad_accounts to resolve accessible account IDs, then snapchat_list_entities to browse campaigns/adSquads/ads/creatives; " +
      "(2) before authoring writes, read MCP Resources entity-schema://snapchat/all for field shapes, entity-hierarchy://snapchat/all for parent/child rules, entity-examples://snapchat/all for payloads, and reporting-reference://snapchat for stats fields and breakdowns; " +
      "(3) for multi-step flows use MCP Prompts: snapchat_campaign_setup_workflow, snapchat_reporting_workflow, snapchat_targeting_discovery_workflow, creative_upload_workflow, snapchat_bulk_operations_workflow.",
    tools: allTools,
    resources: allResources,
    prompts: promptRegistry.values(),
    workflowIdByToolName: snapchatWorkflowIdByToolName,
    manifestUrl: new URL("../cesteral-manifest.json", import.meta.url),
    sessionServiceStore,
    reportCsv: {
      store: reportCsvStore,
      platformLabel: "Snapchat",
      downloadToolName: "snapchat_download_report",
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
