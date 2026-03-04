/**
 * Tool definitions barrel export
 *
 * 18 tools total:
 *   5 core: list entities, get entity, create entity, update entity, delete entity
 *   1 account: list advertisers
 *   2 reporting: get report, get report breakdowns
 *   3 bulk: bulk update status, bulk create entities, bulk update entities
 *   1 bids: adjust bids
 *   2 targeting: search targeting, get targeting options
 *   3 specialized: duplicate entity, get audience estimate, get ad previews
 *   1 validation: validate entity (client-side)
 */

export { listEntitiesTool } from "./list-entities.tool.js";
export { getEntityTool } from "./get-entity.tool.js";
export { createEntityTool } from "./create-entity.tool.js";
export { updateEntityTool } from "./update-entity.tool.js";
export { deleteEntityTool } from "./delete-entity.tool.js";
export { listAdvertisersTool } from "./list-advertisers.tool.js";
export { getReportTool } from "./get-report.tool.js";
export { getReportBreakdownsTool } from "./get-report-breakdowns.tool.js";
export { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
export { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
export { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
export { adjustBidsTool } from "./adjust-bids.tool.js";
export { searchTargetingTool } from "./search-targeting.tool.js";
export { getTargetingOptionsTool } from "./get-targeting-options.tool.js";
export { duplicateEntityTool } from "./duplicate-entity.tool.js";
export { getAudienceEstimateTool } from "./get-audience-estimate.tool.js";
export { getAdPreviewsTool } from "./get-ad-previews.tool.js";
export { validateEntityTool } from "./validate-entity.tool.js";

import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { createEntityTool } from "./create-entity.tool.js";
import { updateEntityTool } from "./update-entity.tool.js";
import { deleteEntityTool } from "./delete-entity.tool.js";
import { listAdvertisersTool } from "./list-advertisers.tool.js";
import { getReportTool } from "./get-report.tool.js";
import { getReportBreakdownsTool } from "./get-report-breakdowns.tool.js";
import { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
import { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
import { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
import { adjustBidsTool } from "./adjust-bids.tool.js";
import { searchTargetingTool } from "./search-targeting.tool.js";
import { getTargetingOptionsTool } from "./get-targeting-options.tool.js";
import { duplicateEntityTool } from "./duplicate-entity.tool.js";
import { getAudienceEstimateTool } from "./get-audience-estimate.tool.js";
import { getAdPreviewsTool } from "./get-ad-previews.tool.js";
import { validateEntityTool } from "./validate-entity.tool.js";
import type { ToolDefinitionForFactory } from "@cesteral/shared";

export const allTools: ToolDefinitionForFactory[] = [
  // ── Core CRUD ──
  listEntitiesTool,
  getEntityTool,
  createEntityTool,
  updateEntityTool,
  deleteEntityTool,
  // ── Account ──
  listAdvertisersTool,
  // ── Reporting ──
  getReportTool,
  getReportBreakdownsTool,
  // ── Bulk Operations ──
  bulkUpdateStatusTool,
  bulkCreateEntitiesTool,
  bulkUpdateEntitiesTool,
  // ── Bids ──
  adjustBidsTool,
  // ── Targeting ──
  searchTargetingTool,
  getTargetingOptionsTool,
  // ── Specialized ──
  duplicateEntityTool,
  getAudienceEstimateTool,
  getAdPreviewsTool,
  // ── Validation ──
  validateEntityTool,
];
