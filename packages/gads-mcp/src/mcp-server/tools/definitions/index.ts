/**
 * Tool definitions barrel export
 *
 * 14 tools total:
 *   5 read:  gaql search, list accounts, get entity, list entities, get insights
 *   7 write: create entity, update entity, remove entity, bulk mutate, bulk create entities, bulk update status, adjust bids
 *   1 validate: validate entity (dry-run via validateOnly)
 *   1 preview: get ad preview
 */

export { gaqlSearchTool } from "./gaql-search.tool.js";
export { listAccountsTool } from "./list-accounts.tool.js";
export { getEntityTool } from "./get-entity.tool.js";
export { listEntitiesTool } from "./list-entities.tool.js";
export { getInsightsTool } from "./get-insights.tool.js";
export { createEntityTool } from "./create-entity.tool.js";
export { updateEntityTool } from "./update-entity.tool.js";
export { removeEntityTool } from "./remove-entity.tool.js";
export { bulkMutateTool } from "./bulk-mutate.tool.js";
export { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
export { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
export { validateEntityTool } from "./validate-entity.tool.js";
export { adjustBidsTool } from "./adjust-bids.tool.js";
export { getAdPreviewTool } from "./get-ad-preview.tool.js";

import { gaqlSearchTool } from "./gaql-search.tool.js";
import { listAccountsTool } from "./list-accounts.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { listEntitiesTool } from "./list-entities.tool.js";
import { getInsightsTool } from "./get-insights.tool.js";
import { createEntityTool } from "./create-entity.tool.js";
import { updateEntityTool } from "./update-entity.tool.js";
import { removeEntityTool } from "./remove-entity.tool.js";
import { bulkMutateTool } from "./bulk-mutate.tool.js";
import { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
import { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
import { validateEntityTool } from "./validate-entity.tool.js";
import { adjustBidsTool } from "./adjust-bids.tool.js";
import { getAdPreviewTool } from "./get-ad-preview.tool.js";
import { conformanceTools, type ToolDefinitionForFactory } from "@cesteral/shared";

const productionTools: ToolDefinitionForFactory[] = [
  // ── Read Tools ──
  gaqlSearchTool,
  listAccountsTool,
  getEntityTool,
  listEntitiesTool,
  getInsightsTool,
  // ── Write Tools ──
  createEntityTool,
  updateEntityTool,
  removeEntityTool,
  bulkMutateTool,
  bulkCreateEntitiesTool,
  bulkUpdateStatusTool,
  adjustBidsTool,
  // ── Validate Tools ──
  validateEntityTool,
  // ── Preview ──
  getAdPreviewTool,
];

/**
 * All tool definitions for the Google Ads MCP server.
 * Conformance tools are only included when MCP_INCLUDE_CONFORMANCE_TOOLS=true.
 */
export const allTools: ToolDefinitionForFactory[] = [
  ...productionTools,
  ...(process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true" ? conformanceTools : []),
];
