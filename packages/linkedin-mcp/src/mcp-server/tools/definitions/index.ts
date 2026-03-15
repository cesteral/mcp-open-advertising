// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tool definitions barrel export
 *
 * 20 tools total:
 *   5 core: list entities, get entity, create entity, update entity, delete entity
 *   1 account: list ad accounts
 *   2 analytics: get analytics, get analytics breakdowns
 *   4 bulk: bulk update status, bulk create entities, bulk update entities, adjust bids
 *   2 targeting: search targeting, get targeting options
 *   5 specialized: duplicate entity, get delivery forecast, get ad preview, upload image, upload video
 *   1 validation: validate entity (client-side)
 */

export { listEntitiesTool } from "./list-entities.tool.js";
export { getEntityTool } from "./get-entity.tool.js";
export { createEntityTool } from "./create-entity.tool.js";
export { updateEntityTool } from "./update-entity.tool.js";
export { deleteEntityTool } from "./delete-entity.tool.js";
export { listAdAccountsTool } from "./list-ad-accounts.tool.js";
export { getAnalyticsTool } from "./get-analytics.tool.js";
export { getAnalyticsBreakdownsTool } from "./get-analytics-breakdowns.tool.js";
export { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
export { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
export { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
export { adjustBidsTool } from "./adjust-bids.tool.js";
export { searchTargetingTool } from "./search-targeting.tool.js";
export { getTargetingOptionsTool } from "./get-targeting-options.tool.js";
export { duplicateEntityTool } from "./duplicate-entity.tool.js";
export { getDeliveryForecastTool } from "./get-delivery-forecast.tool.js";
export { getAdPreviewTool } from "./get-ad-preview.tool.js";
export { validateEntityTool } from "./validate-entity.tool.js";
export { uploadImageTool } from "./upload-image.tool.js";
export { uploadVideoTool } from "./upload-video.tool.js";

import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { createEntityTool } from "./create-entity.tool.js";
import { updateEntityTool } from "./update-entity.tool.js";
import { deleteEntityTool } from "./delete-entity.tool.js";
import { listAdAccountsTool } from "./list-ad-accounts.tool.js";
import { getAnalyticsTool } from "./get-analytics.tool.js";
import { getAnalyticsBreakdownsTool } from "./get-analytics-breakdowns.tool.js";
import { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
import { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
import { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
import { adjustBidsTool } from "./adjust-bids.tool.js";
import { searchTargetingTool } from "./search-targeting.tool.js";
import { getTargetingOptionsTool } from "./get-targeting-options.tool.js";
import { duplicateEntityTool } from "./duplicate-entity.tool.js";
import { getDeliveryForecastTool } from "./get-delivery-forecast.tool.js";
import { getAdPreviewTool } from "./get-ad-preview.tool.js";
import { validateEntityTool } from "./validate-entity.tool.js";
import { uploadImageTool } from "./upload-image.tool.js";
import { uploadVideoTool } from "./upload-video.tool.js";
import { conformanceTools, type ToolDefinitionForFactory } from "@cesteral/shared";

const productionTools: ToolDefinitionForFactory[] = [
  // ── Core CRUD ──
  listEntitiesTool,
  getEntityTool,
  createEntityTool,
  updateEntityTool,
  deleteEntityTool,
  // ── Account ──
  listAdAccountsTool,
  // ── Analytics ──
  getAnalyticsTool,
  getAnalyticsBreakdownsTool,
  // ── Bulk Operations ──
  bulkUpdateStatusTool,
  bulkCreateEntitiesTool,
  bulkUpdateEntitiesTool,
  adjustBidsTool,
  // ── Targeting ──
  searchTargetingTool,
  getTargetingOptionsTool,
  // ── Specialized ──
  duplicateEntityTool,
  getDeliveryForecastTool,
  getAdPreviewTool,
  uploadImageTool,
  uploadVideoTool,
  // ── Validation ──
  validateEntityTool,
];

/**
 * All tool definitions for the LinkedIn Ads MCP server.
 * Conformance tools are only included when MCP_INCLUDE_CONFORMANCE_TOOLS=true.
 */
export const allTools: ToolDefinitionForFactory[] = [
  ...productionTools,
  ...(process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true" ? conformanceTools : []),
];