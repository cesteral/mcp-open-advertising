// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tool definitions barrel export
 *
 * 15 tools total:
 *   8 read:  sa360 search, list accounts, get entity, list entities, get insights,
 *            get insights breakdowns, list custom columns, search fields
 *   3 async reporting: submit report, check report status, download report (v2 API)
 *   2 write: insert conversions, update conversions (v2 API)
 *   1 validation: validate conversion
 *   1 audit: get change history
 */

export { sa360SearchTool } from "./sa360-search.tool.js";
export { listAccountsTool } from "./list-accounts.tool.js";
export { getEntityTool } from "./get-entity.tool.js";
export { listEntitiesTool } from "./list-entities.tool.js";
export { getInsightsTool } from "./get-insights.tool.js";
export { getInsightsBreakdownsTool } from "./get-insights-breakdowns.tool.js";
export { listCustomColumnsTool } from "./list-custom-columns.tool.js";
export { searchFieldsTool } from "./search-fields.tool.js";
export { insertConversionsTool } from "./insert-conversions.tool.js";
export { updateConversionsTool } from "./update-conversions.tool.js";
export { validateConversionTool } from "./validate-conversion.tool.js";
export { submitReportTool } from "./submit-report.tool.js";
export { checkReportStatusTool } from "./check-report-status.tool.js";
export { downloadReportTool } from "./download-report.tool.js";
export { getChangeHistoryTool } from "./get-change-history.tool.js";

import { sa360SearchTool } from "./sa360-search.tool.js";
import { listAccountsTool } from "./list-accounts.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { listEntitiesTool } from "./list-entities.tool.js";
import { getInsightsTool } from "./get-insights.tool.js";
import { getInsightsBreakdownsTool } from "./get-insights-breakdowns.tool.js";
import { listCustomColumnsTool } from "./list-custom-columns.tool.js";
import { searchFieldsTool } from "./search-fields.tool.js";
import { insertConversionsTool } from "./insert-conversions.tool.js";
import { updateConversionsTool } from "./update-conversions.tool.js";
import { validateConversionTool } from "./validate-conversion.tool.js";
import { submitReportTool } from "./submit-report.tool.js";
import { checkReportStatusTool } from "./check-report-status.tool.js";
import { downloadReportTool } from "./download-report.tool.js";
import { getChangeHistoryTool } from "./get-change-history.tool.js";
import { conformanceTools, type ToolDefinitionForFactory } from "@cesteral/shared";

const productionTools: ToolDefinitionForFactory[] = [
  // ── Read Tools ──
  sa360SearchTool,
  listAccountsTool,
  getEntityTool,
  listEntitiesTool,
  getInsightsTool,
  getInsightsBreakdownsTool,
  listCustomColumnsTool,
  searchFieldsTool,
  // ── Async Reporting (v2 API) ──
  submitReportTool,
  checkReportStatusTool,
  downloadReportTool,
  // ── Write Tools (v2 API) ──
  insertConversionsTool,
  updateConversionsTool,
  // ── Validation Tools ──
  validateConversionTool,
  // ── Audit Tools ──
  getChangeHistoryTool,
];

/**
 * All tool definitions for the SA360 MCP server.
 * Conformance tools are only included when MCP_INCLUDE_CONFORMANCE_TOOLS=true.
 */
export const allTools: ToolDefinitionForFactory[] = [
  ...productionTools,
  ...(process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true" ? conformanceTools : []),
];
