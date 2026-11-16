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
 * factory except the generated `pinterest_search_tools` must appear here, and
 * nothing else may (`scripts/lib/workflow-id-maps.test.mjs`); a missing
 * entry logs the tool's calls with no workflowId.
 */
export const pinterestWorkflowIdByToolName: Record<string, string> = {
  // Read operations
  pinterest_list_entities: "mcp.execute.pinterest_entity_read",
  pinterest_get_entity: "mcp.execute.pinterest_entity_read",
  pinterest_list_ad_accounts: "mcp.execute.pinterest_entity_read",
  // Write operations
  pinterest_create_entity: "mcp.execute.pinterest_entity_update",
  pinterest_update_entity: "mcp.execute.pinterest_entity_update",
  pinterest_delete_entity: "mcp.execute.pinterest_entity_update",
  // Reporting
  pinterest_get_report: "mcp.execute.pinterest_reporting",
  pinterest_get_report_breakdowns: "mcp.execute.pinterest_reporting",
  // Bulk operations
  pinterest_bulk_update_status: "mcp.execute.pinterest_bulk_operations",
  pinterest_bulk_create_entities: "mcp.execute.pinterest_bulk_operations",
  pinterest_bulk_update_entities: "mcp.execute.pinterest_bulk_operations",
  // Targeting
  pinterest_search_targeting: "mcp.execute.pinterest_entity_read",
  pinterest_get_targeting_options: "mcp.execute.pinterest_entity_read",
  // Specialized
  pinterest_duplicate_entity: "mcp.execute.pinterest_entity_update",
  pinterest_get_delivery_estimate: "mcp.execute.pinterest_entity_read",
  pinterest_get_ad_preview: "mcp.execute.pinterest_entity_read",
  pinterest_validate_entity: "mcp.execute.pinterest_entity_read",
  // Pacing
  pinterest_get_pacing_status: "mcp.execute.pinterest_entity_read",
  // Async reports
  pinterest_submit_report: "mcp.execute.pinterest_reporting",
  pinterest_check_report_status: "mcp.execute.pinterest_reporting",
  pinterest_download_report: "mcp.execute.pinterest_reporting",
  // Bids and media uploads
  pinterest_adjust_bids: "mcp.execute.pinterest_bulk_operations",
  pinterest_upload_video: "mcp.execute.pinterest_entity_update",
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
    packageName: "pinterest-mcp",
    platform: "pinterest",
    version: packageJson.version,
    description:
      "Pinterest Ads campaign management and reporting via Pinterest Marketing API v5. Supports campaign, ad group, ad, creative, and audience workflows with reporting, targeting, delivery estimates, and previews.",
    instructions:
      "Pinterest Ads campaign management and reporting server. Supports campaign, ad group, ad, creative, and audience workflows with async reporting, targeting, delivery estimates, and bulk operations via Pinterest Marketing API v5. " +
      "Use pinterest_list_ad_accounts to discover accounts, pinterest_list_entities to browse entities. " +
      "See MCP Resources for entity schemas and MCP Prompts for workflow guidance.",
    tools: allTools,
    resources: allResources,
    prompts: promptRegistry.values(),
    workflowIdByToolName: pinterestWorkflowIdByToolName,
    manifestUrl: new URL("../cesteral-manifest.json", import.meta.url),
    sessionServiceStore,
    reportCsv: {
      store: reportCsvStore,
      platformLabel: "Pinterest",
      downloadToolName: "pinterest_download_report",
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
