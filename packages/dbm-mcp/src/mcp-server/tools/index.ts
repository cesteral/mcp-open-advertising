export * from "./definitions/get-campaign-delivery.tool.js";
export * from "./definitions/get-performance-metrics.tool.js";
export * from "./definitions/get-historical-metrics.tool.js";
export * from "./definitions/get-platform-entities.tool.js";
export * from "./definitions/get-pacing-status.tool.js";

// Import tool definitions for allTools array
import { getCampaignDeliveryTool } from "./definitions/get-campaign-delivery.tool.js";
import { getPerformanceMetricsTool } from "./definitions/get-performance-metrics.tool.js";
import { getHistoricalMetricsTool } from "./definitions/get-historical-metrics.tool.js";
import { getPlatformEntitiesTool } from "./definitions/get-platform-entities.tool.js";
import { getPacingStatusTool } from "./definitions/get-pacing-status.tool.js";

/**
 * All tool definitions for the DBM MCP server.
 * Used by server.ts for registration.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const allTools: any[] = [
  getCampaignDeliveryTool,
  getPerformanceMetricsTool,
  getHistoricalMetricsTool,
  getPlatformEntitiesTool,
  getPacingStatusTool,
];
