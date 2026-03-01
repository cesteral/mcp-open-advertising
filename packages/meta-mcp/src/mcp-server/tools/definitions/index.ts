/**
 * Tool definitions barrel export
 *
 * 18 tools total:
 *   6 core: list entities, get entity, create entity, update entity, delete entity, list ad accounts
 *   2 insights: get insights, get insights breakdowns
 *   2 targeting: search targeting, get targeting options
 *   4 bulk: bulk update status, bulk create entities, bulk update entities, adjust bids
 *   3 specialized: duplicate entity, get delivery estimate, get ad previews
 *   1 validation: validate entity (client-side)
 */

export { listEntitiesTool } from "./list-entities.tool.js";
export { getEntityTool } from "./get-entity.tool.js";
export { createEntityTool } from "./create-entity.tool.js";
export { updateEntityTool } from "./update-entity.tool.js";
export { deleteEntityTool } from "./delete-entity.tool.js";
export { listAdAccountsTool } from "./list-ad-accounts.tool.js";
export { getInsightsTool } from "./get-insights.tool.js";
export { getInsightsBreakdownsTool } from "./get-insights-breakdowns.tool.js";
export { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
export { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
export { searchTargetingTool } from "./search-targeting.tool.js";
export { getTargetingOptionsTool } from "./get-targeting-options.tool.js";
export { duplicateEntityTool } from "./duplicate-entity.tool.js";
export { getDeliveryEstimateTool } from "./get-delivery-estimate.tool.js";
export { getAdPreviewsTool } from "./get-ad-previews.tool.js";
export { validateEntityTool } from "./validate-entity.tool.js";
export { adjustBidsTool } from "./adjust-bids.tool.js";
export { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";

import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { createEntityTool } from "./create-entity.tool.js";
import { updateEntityTool } from "./update-entity.tool.js";
import { deleteEntityTool } from "./delete-entity.tool.js";
import { listAdAccountsTool } from "./list-ad-accounts.tool.js";
import { getInsightsTool } from "./get-insights.tool.js";
import { getInsightsBreakdownsTool } from "./get-insights-breakdowns.tool.js";
import { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
import { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
import { searchTargetingTool } from "./search-targeting.tool.js";
import { getTargetingOptionsTool } from "./get-targeting-options.tool.js";
import { duplicateEntityTool } from "./duplicate-entity.tool.js";
import { getDeliveryEstimateTool } from "./get-delivery-estimate.tool.js";
import { getAdPreviewsTool } from "./get-ad-previews.tool.js";
import { validateEntityTool } from "./validate-entity.tool.js";
import { adjustBidsTool } from "./adjust-bids.tool.js";
import { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
import type { ToolDefinitionForFactory } from "@cesteral/shared";

export const allTools: ToolDefinitionForFactory[] = [
  // ── Core CRUD ──
  listEntitiesTool,
  getEntityTool,
  createEntityTool,
  updateEntityTool,
  deleteEntityTool,
  // ── Account ──
  listAdAccountsTool,
  // ── Insights ──
  getInsightsTool,
  getInsightsBreakdownsTool,
  // ── Bulk Operations ──
  bulkUpdateStatusTool,
  bulkCreateEntitiesTool,
  bulkUpdateEntitiesTool,
  // ── Targeting ──
  searchTargetingTool,
  getTargetingOptionsTool,
  // ── Specialized ──
  duplicateEntityTool,
  getDeliveryEstimateTool,
  getAdPreviewsTool,
  // ── Bulk Operations (continued) ──
  adjustBidsTool,
  // ── Validation ──
  validateEntityTool,
];
