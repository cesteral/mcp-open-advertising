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
 * factory except the generated `cm360_search_tools` must appear here, and
 * nothing else may (`scripts/lib/workflow-id-maps.test.mjs`); a missing
 * entry logs the tool's calls with no workflowId.
 */
export const cm360WorkflowIdByToolName: Record<string, string> = {
  // Read operations
  cm360_list_user_profiles: "mcp.execute.cm360_entity_read",
  cm360_get_entity: "mcp.execute.cm360_entity_read",
  cm360_list_entities: "mcp.execute.cm360_entity_read",
  cm360_validate_entity: "mcp.execute.cm360_entity_read",
  cm360_get_ad_preview: "mcp.execute.cm360_entity_read",
  cm360_list_targeting_options: "mcp.execute.cm360_targeting",
  // Write operations
  cm360_create_entity: "mcp.execute.cm360_entity_update",
  cm360_update_entity: "mcp.execute.cm360_entity_update",
  cm360_delete_entity: "mcp.execute.cm360_entity_update",
  // Bulk operations
  cm360_bulk_update_status: "mcp.execute.cm360_bulk",
  cm360_bulk_create_entities: "mcp.execute.cm360_bulk",
  cm360_bulk_update_entities: "mcp.execute.cm360_bulk",
  // Reporting
  cm360_get_report: "mcp.execute.cm360_reporting",
  cm360_submit_report: "mcp.execute.cm360_reporting",
  cm360_check_report_status: "mcp.execute.cm360_reporting",
  cm360_download_report: "mcp.execute.cm360_reporting",
  // Pacing
  cm360_get_pacing_status: "mcp.execute.cm360_entity_read",
  // Report breakdowns and schedules
  cm360_get_report_breakdowns: "mcp.execute.cm360_reporting",
  cm360_create_report_schedule: "mcp.execute.cm360_reporting",
  cm360_list_report_schedules: "mcp.execute.cm360_reporting",
  cm360_delete_report_schedule: "mcp.execute.cm360_reporting",
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
    packageName: "cm360-mcp",
    platform: "cm360",
    version: packageJson.version,
    description:
      "Campaign Manager 360 ad serving and trafficking management via CM360 API v5. Supports CRUD operations on campaigns, placements, ads, creatives, floodlight activities, and async reporting.",
    instructions:
      "CM360 campaign management and reporting server. Use cm360_list_user_profiles to discover your profileId first. " +
      "Supports CRUD for campaigns, placements, ads, creatives, sites, advertisers, and floodlight activities via CM360 API v5. " +
      "Async reporting via cm360_get_report (blocking) or cm360_submit_report + cm360_check_report_status + cm360_download_report (non-blocking).",
    tools: allTools,
    resources: allResources,
    prompts: promptRegistry.values(),
    workflowIdByToolName: cm360WorkflowIdByToolName,
    manifestUrl: new URL("../cesteral-manifest.json", import.meta.url),
    sessionServiceStore,
  });
}
