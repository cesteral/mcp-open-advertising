// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tool definitions barrel export
 */

export { getCampaignDeliveryTool } from "./get-campaign-delivery.tool.js";
export { getPerformanceMetricsTool } from "./get-performance-metrics.tool.js";
export { getHistoricalMetricsTool } from "./get-historical-metrics.tool.js";
export { getPacingStatusTool } from "./get-pacing-status.tool.js";
export { runCustomQueryTool } from "./run-custom-query.tool.js";

// Export all tools as an array for easy registration
import { getCampaignDeliveryTool } from "./get-campaign-delivery.tool.js";
import { getPerformanceMetricsTool } from "./get-performance-metrics.tool.js";
import { getHistoricalMetricsTool } from "./get-historical-metrics.tool.js";
import { getPacingStatusTool } from "./get-pacing-status.tool.js";
import { runCustomQueryTool } from "./run-custom-query.tool.js";
import { conformanceTools, type ToolDefinitionForFactory } from "@cesteral/shared";

const productionTools: ToolDefinitionForFactory[] = [
  getCampaignDeliveryTool,
  getPerformanceMetricsTool,
  getHistoricalMetricsTool,
  getPacingStatusTool,
  runCustomQueryTool,
];

/**
 * All tool definitions for the DBM MCP server.
 * Used by server.ts for registration via registerToolsFromDefinitions().
 * Conformance tools are only included when MCP_INCLUDE_CONFORMANCE_TOOLS=true.
 */
export const allTools: ToolDefinitionForFactory[] = [
  ...productionTools,
  ...(process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true" ? conformanceTools : []),
];
