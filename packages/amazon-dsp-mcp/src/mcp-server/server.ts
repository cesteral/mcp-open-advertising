// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

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
 * factory except the generated `amazon_dsp_search_tools` must appear here, and
 * nothing else may (`scripts/lib/workflow-id-maps.test.mjs`); a missing
 * entry logs the tool's calls with no workflowId.
 */
export const amazonDspWorkflowIdByToolName: Record<string, string> = {
  // Read operations
  amazon_dsp_list_entities: "mcp.execute.amazon_dsp_entity_read",
  amazon_dsp_get_entity: "mcp.execute.amazon_dsp_entity_read",
  amazon_dsp_list_advertisers: "mcp.execute.amazon_dsp_entity_read",
  // Write operations
  amazon_dsp_create_entity: "mcp.execute.amazon_dsp_entity_update",
  amazon_dsp_update_entity: "mcp.execute.amazon_dsp_entity_update",
  amazon_dsp_delete_entity: "mcp.execute.amazon_dsp_entity_update",
  // Reporting
  amazon_dsp_get_report: "mcp.execute.amazon_dsp_reporting",
  amazon_dsp_get_report_breakdowns: "mcp.execute.amazon_dsp_reporting",
  amazon_dsp_submit_report: "mcp.execute.amazon_dsp_reporting",
  amazon_dsp_check_report_status: "mcp.execute.amazon_dsp_reporting",
  amazon_dsp_download_report: "mcp.execute.amazon_dsp_reporting",
  // Bulk operations
  amazon_dsp_bulk_update_status: "mcp.execute.amazon_dsp_bulk_operations",
  amazon_dsp_bulk_create_entities: "mcp.execute.amazon_dsp_bulk_operations",
  amazon_dsp_bulk_update_entities: "mcp.execute.amazon_dsp_bulk_operations",
  amazon_dsp_adjust_bids: "mcp.execute.amazon_dsp_bulk_operations",
  // Specialized
  amazon_dsp_duplicate_entity: "mcp.execute.amazon_dsp_entity_update",
  amazon_dsp_get_ad_preview: "mcp.execute.amazon_dsp_entity_read",
  amazon_dsp_validate_entity: "mcp.execute.amazon_dsp_entity_read",
  // Pacing
  amazon_dsp_get_pacing_status: "mcp.execute.amazon_dsp_entity_read",
  // Media uploads
  amazon_dsp_upload_video: "mcp.execute.amazon_dsp_entity_update",
  // Commitments and forecasts
  amazon_dsp_list_commitments: "mcp.execute.amazon_dsp_entity_read",
  amazon_dsp_get_commitments: "mcp.execute.amazon_dsp_entity_read",
  amazon_dsp_get_commitment: "mcp.execute.amazon_dsp_entity_read",
  amazon_dsp_get_commitment_spend: "mcp.execute.amazon_dsp_entity_read",
  amazon_dsp_create_commitment: "mcp.execute.amazon_dsp_entity_update",
  amazon_dsp_update_commitment: "mcp.execute.amazon_dsp_entity_update",
  amazon_dsp_get_campaign_forecast: "mcp.execute.amazon_dsp_entity_read",
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
    packageName: "amazon-dsp-mcp",
    platform: "amazon_dsp",
    version: packageJson.version,
    description:
      "Amazon DSP campaign management and reporting via the Amazon Advertising API. Supports campaign, ad group, creative, audience, profile-scoped auth, async reporting, targeting, and preview workflows.",
    instructions:
      "Amazon DSP campaign management and reporting server. Supports campaign, ad group, creative, audience, async reporting, targeting, and bulk operations via the Amazon Advertising API. " +
      "Use amazon_dsp_list_advertisers to discover accounts, amazon_dsp_list_entities to browse entities. " +
      "See MCP Resources for entity schemas and MCP Prompts for workflow guidance.",
    tools: allTools,
    resources: allResources,
    prompts: promptRegistry.values(),
    workflowIdByToolName: amazonDspWorkflowIdByToolName,
    manifestUrl: new URL("../cesteral-manifest.json", import.meta.url),
    sessionServiceStore,
    dropSessionOnAuthError: true,
    reportCsv: {
      store: reportCsvStore,
      platformLabel: "Amazon DSP",
      downloadToolName: "amazon_dsp_download_report",
    },
  });
}
