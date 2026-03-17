// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tool definitions barrel export
 *
 * 20 tools total:
 *   5 core: list entities, get entity, create entity, update entity, delete entity
 *   1 account: list advertisers
 *   5 reporting: get report, get report breakdowns, submit report, check report status, download report
 *   3 bulk: bulk update status, bulk create entities, bulk update entities
 *   1 bids: adjust bids
 *   2 targeting: search targeting, get targeting options
 *   2 specialized: get audience estimate, get ad preview
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
export { submitReportTool } from "./submit-report.tool.js";
export { checkReportStatusTool } from "./check-report-status.tool.js";
export { downloadReportTool } from "./download-report.tool.js";
export { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
export { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
export { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
export { adjustBidsTool } from "./adjust-bids.tool.js";
export { searchTargetingTool } from "./search-targeting.tool.js";
export { getTargetingOptionsTool } from "./get-targeting-options.tool.js";
export { getAudienceEstimateTool } from "./get-audience-estimate.tool.js";
export { getAdPreviewTool } from "./get-ad-preview.tool.js";
export { validateEntityTool } from "./validate-entity.tool.js";

import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { createEntityTool } from "./create-entity.tool.js";
import { updateEntityTool } from "./update-entity.tool.js";
import { deleteEntityTool } from "./delete-entity.tool.js";
import { listAdvertisersTool } from "./list-advertisers.tool.js";
import { getReportTool } from "./get-report.tool.js";
import { getReportBreakdownsTool } from "./get-report-breakdowns.tool.js";
import { submitReportTool } from "./submit-report.tool.js";
import { checkReportStatusTool } from "./check-report-status.tool.js";
import { downloadReportTool } from "./download-report.tool.js";
import { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
import { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
import { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
import { adjustBidsTool } from "./adjust-bids.tool.js";
import { searchTargetingTool } from "./search-targeting.tool.js";
import { getTargetingOptionsTool } from "./get-targeting-options.tool.js";
import { getAudienceEstimateTool } from "./get-audience-estimate.tool.js";
import { getAdPreviewTool } from "./get-ad-preview.tool.js";
import { validateEntityTool } from "./validate-entity.tool.js";
import { conformanceTools, type ToolDefinitionForFactory } from "@cesteral/shared";

const productionTools: ToolDefinitionForFactory[] = [
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
  submitReportTool,
  checkReportStatusTool,
  downloadReportTool,
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
  getAudienceEstimateTool,
  getAdPreviewTool,
  // ── Validation ──
  validateEntityTool,
];

/**
 * All tool definitions for the AmazonDsp Ads MCP server.
 * Conformance tools are only included when MCP_INCLUDE_CONFORMANCE_TOOLS=true.
 */
export const allTools: ToolDefinitionForFactory[] = [
  ...productionTools,
  ...(process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true" ? conformanceTools : []),
];
