export * from "./definitions/get-campaign-delivery.tool.js";
export * from "./definitions/get-performance-metrics.tool.js";
export * from "./definitions/get-historical-metrics.tool.js";
export * from "./definitions/get-pacing-status.tool.js";
export * from "./definitions/run-custom-query.tool.js";

// Import tool definitions for allTools array
import { getCampaignDeliveryTool } from "./definitions/get-campaign-delivery.tool.js";
import { getPerformanceMetricsTool } from "./definitions/get-performance-metrics.tool.js";
import { getHistoricalMetricsTool } from "./definitions/get-historical-metrics.tool.js";
import { getPacingStatusTool } from "./definitions/get-pacing-status.tool.js";
import { runCustomQueryTool } from "./definitions/run-custom-query.tool.js";
import type { ToolDefinitionForFactory } from "@bidshifter/shared";

/**
 * All tool definitions for the DBM MCP server.
 * Used by server.ts for registration via registerToolsFromDefinitions().
 */
export const allTools: ToolDefinitionForFactory[] = [
  getCampaignDeliveryTool,
  getPerformanceMetricsTool,
  getHistoricalMetricsTool,
  getPacingStatusTool,
  runCustomQueryTool,
];
