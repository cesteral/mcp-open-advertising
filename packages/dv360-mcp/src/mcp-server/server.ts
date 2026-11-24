// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { allTools } from "./tools/index.js";
import { allResources, allTemplatedResources } from "./resources/index.js";
import { promptRegistry } from "./prompts/index.js";
import { createPlatformMcpServer } from "@cesteral/shared";
import { sessionServiceStore } from "../services/session-services.js";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

/**
 * Interaction-log workflow id per tool. Every tool registered through the
 * factory except the generated `dv360_search_tools` must appear here, and
 * nothing else may (`scripts/lib/workflow-id-maps.test.mjs`); a missing
 * entry logs the tool's calls with no workflowId.
 */
export const dv360WorkflowIdByToolName: Record<string, string> = {
  // Read operations
  dv360_get_entity: "mcp.execute.dv360_entity_read",
  dv360_list_entities: "mcp.execute.dv360_entity_read",
  // Write operations
  dv360_update_entity: "mcp.execute.dv360_entity_update",
  dv360_create_entity: "mcp.execute.dv360_entity_update",
  dv360_delete_entity: "mcp.execute.dv360_entity_update",
  // Delivery troubleshooting
  dv360_adjust_line_item_bids: "mcp.troubleshoot.delivery",
  dv360_bulk_create_entities: "mcp.execute.dv360_bulk",
  dv360_bulk_update_entities: "mcp.execute.dv360_bulk",
  dv360_bulk_update_status: "mcp.troubleshoot.delivery",
  // Custom bidding
  dv360_create_custom_bidding_algorithm: "mcp.execute.dv360_entity_update",
  dv360_manage_custom_bidding_script: "mcp.execute.dv360_entity_update",
  dv360_manage_custom_bidding_rules: "mcp.execute.dv360_entity_update",
  dv360_list_custom_bidding_algorithms: "mcp.execute.dv360_entity_read",
  // Targeting
  dv360_list_assigned_targeting: "mcp.execute.dv360_targeting",
  dv360_get_assigned_targeting: "mcp.execute.dv360_targeting",
  dv360_create_assigned_targeting: "mcp.execute.dv360_targeting",
  dv360_delete_assigned_targeting: "mcp.execute.dv360_targeting",
  dv360_validate_targeting_config: "mcp.execute.dv360_targeting",
  dv360_validate_entity: "mcp.execute.dv360_entity_read",
  // Preview
  dv360_get_ad_preview: "mcp.execute.dv360_entity_read",
  // Media uploads
  dv360_upload_image: "mcp.execute.dv360_entity_update",
  dv360_upload_video: "mcp.execute.dv360_entity_update",
  dv360_attach_creative: "mcp.execute.dv360_entity_update",
  // Specialized
  dv360_duplicate_entity: "mcp.execute.dv360_entity_update",
  dv360_get_delivery_estimate: "mcp.execute.dv360_entity_read",
  // Pacing
  dv360_get_pacing_status: "mcp.execute.dv360_entity_read",
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
    packageName: "dv360-mcp",
    platform: "dv360",
    version: packageJson.version,
    description:
      "DV360 campaign entity management via Display & Video 360 API. Supports CRUD operations on campaigns, insertion orders, line items, and targeting.",
    instructions:
      "DV360 campaign management server. Supports CRUD for campaigns, insertion orders, line items, and targeting via Display & Video 360 API. " +
      "Use dv360_list_entities to discover entities, MCP Resources (entity-schema://{entityType}) for field details, " +
      "and MCP Prompts (dv360_full_campaign_setup_workflow) for multi-step workflows.",
    tools: allTools,
    resources: allResources,
    templatedResources: allTemplatedResources,
    prompts: promptRegistry.values(),
    workflowIdByToolName: dv360WorkflowIdByToolName,
    manifestUrl: new URL("../cesteral-manifest.json", import.meta.url),
    sessionServiceStore,
  });
}
