// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { allTools } from "./tools/index.js";
import { allResources } from "./resources/index.js";
import { fieldRulesResource } from "./resources/definitions/field-rules.resource.js";
import { promptRegistry } from "./prompts/index.js";
import { createPlatformMcpServer } from "@cesteral/shared";
import { reportCsvStore, sessionServiceStore } from "../services/session-services.js";
import type { Logger } from "pino";
import packageJson from "../../package.json" with { type: "json" };

/**
 * Interaction-log workflow id per tool. Every tool registered through the
 * factory except the generated `msads_search_tools` must appear here, and
 * nothing else may (`scripts/lib/workflow-id-maps.test.mjs`); a missing
 * entry logs the tool's calls with no workflowId.
 */
export const msadsWorkflowIdByToolName: Record<string, string> = {
  // Read operations
  msads_list_entities: "mcp.execute.msads_entity_read",
  msads_get_entity: "mcp.execute.msads_entity_read",
  msads_list_accounts: "mcp.execute.msads_entity_read",
  // Write operations
  msads_create_entity: "mcp.execute.msads_entity_update",
  msads_update_entity: "mcp.execute.msads_entity_update",
  msads_delete_entity: "mcp.execute.msads_entity_update",
  // Reporting
  msads_get_report: "mcp.execute.msads_reporting",
  msads_submit_report: "mcp.execute.msads_reporting",
  msads_check_report_status: "mcp.execute.msads_reporting",
  msads_download_report: "mcp.execute.msads_reporting",
  // Bulk operations
  msads_bulk_create_entities: "mcp.execute.msads_bulk_operations",
  msads_bulk_update_entities: "mcp.execute.msads_bulk_operations",
  msads_bulk_update_status: "mcp.execute.msads_bulk_operations",
  msads_adjust_bids: "mcp.execute.msads_bulk_operations",
  // Targeting
  msads_manage_ad_extensions: "mcp.execute.msads_entity_update",
  msads_manage_criterions: "mcp.execute.msads_entity_update",
  // Specialized
  msads_get_ad_details: "mcp.execute.msads_entity_read",
  msads_validate_entity: "mcp.execute.msads_entity_read",
  msads_import_from_google: "mcp.execute.msads_entity_update",
  // Pacing
  msads_get_pacing_status: "mcp.execute.msads_entity_read",
  // Duplicate
  msads_duplicate_entity: "mcp.execute.msads_entity_update",
  // Targeting reads
  msads_search_targeting: "mcp.execute.msads_entity_read",
  msads_get_targeting_options: "mcp.execute.msads_entity_read",
  // Report breakdowns and schedules
  msads_get_report_breakdowns: "mcp.execute.msads_reporting",
  msads_create_report_schedule: "mcp.execute.msads_reporting",
  msads_list_report_schedules: "mcp.execute.msads_reporting",
  msads_delete_report_schedule: "mcp.execute.msads_reporting",
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
    packageName: "msads-mcp",
    platform: "msads",
    version: packageJson.version,
    description:
      "Microsoft Advertising (Bing Ads) campaign management and reporting via Microsoft Advertising API v13 JSON endpoints. Supports campaigns, ad groups, ads, keywords, budgets, ad extensions, audiences, labels, and Google Ads import.",
    instructions:
      "Microsoft Advertising campaign management and reporting server. Supports Search, Shopping, Audience, and Performance Max campaigns with async reporting, targeting criterions, bid adjustments, ad extensions, and Google Ads import via Microsoft Advertising API v13 JSON endpoints. " +
      "Use msads_list_accounts to discover accounts, msads_list_entities to browse entities. " +
      "See MCP Resources for entity schemas and MCP Prompts for workflow guidance.",
    tools: allTools,
    resources: allResources,
    templatedResources: [fieldRulesResource],
    prompts: promptRegistry.values(),
    workflowIdByToolName: msadsWorkflowIdByToolName,
    manifestUrl: new URL("../cesteral-manifest.json", import.meta.url),
    sessionServiceStore,
    reportCsv: {
      store: reportCsvStore,
      platformLabel: "Microsoft Ads",
      downloadToolName: "msads_download_report",
    },
  });
}
