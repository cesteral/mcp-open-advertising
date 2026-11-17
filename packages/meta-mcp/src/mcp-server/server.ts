// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { fieldRulesResource } from "./resources/definitions/field-rules.resource.js";
import { promptRegistry } from "./prompts/index.js";
import { createPlatformMcpServer } from "@cesteral/shared";
import { sessionServiceStore } from "../services/session-services.js";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

/**
 * Interaction-log workflow id per tool. Every tool registered through the
 * factory except the generated `meta_search_tools` must appear here, and
 * nothing else may (`scripts/lib/workflow-id-maps.test.mjs`); a missing
 * entry logs the tool's calls with no workflowId.
 */
export const metaWorkflowIdByToolName: Record<string, string> = {
  // Read operations
  meta_list_entities: "mcp.execute.meta_entity_read",
  meta_get_entity: "mcp.execute.meta_entity_read",
  meta_list_ad_accounts: "mcp.execute.meta_entity_read",
  // Write operations
  meta_create_entity: "mcp.execute.meta_entity_update",
  meta_update_entity: "mcp.execute.meta_entity_update",
  meta_delete_entity: "mcp.execute.meta_entity_update",
  // Insights
  meta_get_insights: "mcp.execute.meta_insights",
  meta_get_insights_breakdowns: "mcp.execute.meta_insights",
  // Bulk operations
  meta_bulk_update_status: "mcp.execute.meta_bulk_operations",
  meta_bulk_create_entities: "mcp.execute.meta_bulk_operations",
  // Targeting
  meta_search_targeting: "mcp.execute.meta_entity_read",
  meta_get_targeting_options: "mcp.execute.meta_entity_read",
  // Specialized
  meta_duplicate_entity: "mcp.execute.meta_entity_update",
  meta_get_delivery_estimate: "mcp.execute.meta_entity_read",
  meta_get_ad_preview: "mcp.execute.meta_entity_read",
  meta_validate_entity: "mcp.execute.meta_entity_read",
  meta_adjust_bids: "mcp.execute.meta_bulk_operations",
  // Pacing
  meta_get_pacing_status: "mcp.execute.meta_entity_read",
  // Async insights reports
  meta_get_available_metrics: "mcp.execute.meta_insights",
  meta_submit_report: "mcp.execute.meta_insights",
  meta_check_report_status: "mcp.execute.meta_insights",
  meta_download_report: "mcp.execute.meta_insights",
  // Bulk updates, media uploads and budget schedules
  meta_bulk_update_entities: "mcp.execute.meta_bulk_operations",
  meta_upload_image: "mcp.execute.meta_entity_update",
  meta_upload_video: "mcp.execute.meta_entity_update",
  meta_attach_creative: "mcp.execute.meta_entity_update",
  meta_manage_budget_schedule: "mcp.execute.meta_entity_update",
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
    packageName: "meta-mcp",
    platform: "meta",
    version: packageJson.version,
    description:
      "Meta Ads campaign management, reporting, and optimization via the configured Meta Graph API (default: v26.0). Supports 5 entity types (campaign, adSet, ad, adCreative, customAudience), insights with breakdowns, bulk operations, targeting search, entity duplication, delivery estimates, and ad previews.",
    instructions:
      "Meta Ads campaign management server. Supports 5 entity types (campaign, adSet, ad, adCreative, customAudience), insights, targeting, and bulk operations via the configured Meta Graph API (default: v26.0). " +
      "Progressive discovery: (1) start with meta_list_ad_accounts to resolve accessible account IDs, then meta_list_entities to browse campaigns/adSets/ads (always pass `fields` — Graph API returns nothing by default); " +
      "(2) before authoring writes, read MCP Resources entity-schema://all for field shapes, entity-hierarchy://all for campaign→adSet→ad rules, entity-examples://all for payloads, targeting-reference://all for targeting spec, and insights-reference://all for metrics/breakdowns; " +
      "(3) for multi-step flows use MCP Prompts: meta_insights_reporting_workflow, meta_targeting_discovery_workflow, meta_entity_update_workflow, meta_bulk_operations_workflow, meta_entity_duplication_workflow.",
    tools: allTools,
    resources: allResources,
    templatedResources: [fieldRulesResource],
    prompts: promptRegistry.values(),
    workflowIdByToolName: metaWorkflowIdByToolName,
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
