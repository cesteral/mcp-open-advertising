// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tool definitions barrel export
 *
 * 20 tools total:
 *   7 core CRUD: list user profiles, list entities, get entity, create entity, update entity, delete entity, validate entity
 *   5 reporting: get report, get report breakdowns, submit report, check report status, download report
 *   3 scheduling: create report schedule, list report schedules, delete report schedule
 *   3 bulk: bulk update status, bulk create entities, bulk update entities
 *   2 specialized: get ad preview, list targeting options
 */

export { listUserProfilesTool } from "./list-user-profiles.tool.js";
export { listEntitiesTool } from "./list-entities.tool.js";
export { getEntityTool } from "./get-entity.tool.js";
export { createEntityTool } from "./create-entity.tool.js";
export { updateEntityTool } from "./update-entity.tool.js";
export { deleteEntityTool } from "./delete-entity.tool.js";
export { validateEntityTool } from "./validate-entity.tool.js";
export { getReportTool } from "./get-report.tool.js";
export { getReportBreakdownsTool } from "./get-report-breakdowns.tool.js";
export { submitReportTool } from "./submit-report.tool.js";
export { checkReportStatusTool } from "./check-report-status.tool.js";
export { downloadReportTool } from "./download-report.tool.js";
export { createReportScheduleTool } from "./create-report-schedule.tool.js";
export { listReportSchedulesTool } from "./list-report-schedules.tool.js";
export { deleteReportScheduleTool } from "./delete-report-schedule.tool.js";
export { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
export { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
export { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
export { getAdPreviewTool } from "./get-ad-preview.tool.js";
export { listTargetingOptionsTool } from "./list-targeting-options.tool.js";

import { listUserProfilesTool } from "./list-user-profiles.tool.js";
import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { createEntityTool } from "./create-entity.tool.js";
import { updateEntityTool } from "./update-entity.tool.js";
import { deleteEntityTool } from "./delete-entity.tool.js";
import { validateEntityTool } from "./validate-entity.tool.js";
import { getReportTool } from "./get-report.tool.js";
import { getReportBreakdownsTool } from "./get-report-breakdowns.tool.js";
import { submitReportTool } from "./submit-report.tool.js";
import { checkReportStatusTool } from "./check-report-status.tool.js";
import { downloadReportTool } from "./download-report.tool.js";
import { createReportScheduleTool } from "./create-report-schedule.tool.js";
import { listReportSchedulesTool } from "./list-report-schedules.tool.js";
import { deleteReportScheduleTool } from "./delete-report-schedule.tool.js";
import { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
import { bulkCreateEntitiesTool } from "./bulk-create-entities.tool.js";
import { bulkUpdateEntitiesTool } from "./bulk-update-entities.tool.js";
import { getAdPreviewTool } from "./get-ad-preview.tool.js";
import { listTargetingOptionsTool } from "./list-targeting-options.tool.js";
import { conformanceTools, type ToolDefinitionForFactory } from "@cesteral/shared";

const productionTools: ToolDefinitionForFactory[] = [
  // ── Core CRUD ──
  listUserProfilesTool,
  listEntitiesTool,
  getEntityTool,
  createEntityTool,
  updateEntityTool,
  deleteEntityTool,
  validateEntityTool,
  // ── Reporting ──
  getReportTool,
  getReportBreakdownsTool,
  submitReportTool,
  checkReportStatusTool,
  downloadReportTool,
  // ── Scheduling ──
  createReportScheduleTool,
  listReportSchedulesTool,
  deleteReportScheduleTool,
  // ── Bulk Operations ──
  bulkUpdateStatusTool,
  bulkCreateEntitiesTool,
  bulkUpdateEntitiesTool,
  // ── Specialized ──
  getAdPreviewTool,
  listTargetingOptionsTool,
];

/**
 * All tool definitions for the CM360 MCP server.
 * Conformance tools are only included when MCP_INCLUDE_CONFORMANCE_TOOLS=true.
 */
export const allTools: ToolDefinitionForFactory[] = [
  ...productionTools,
  ...(process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true" ? conformanceTools : []),
];