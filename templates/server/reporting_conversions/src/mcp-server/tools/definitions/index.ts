// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tool definitions: the reporting_conversions type's requirements (scripts/lib/contract-tiers.mjs),
 * account discovery and tool search.
 * {{#writes}}
 * The async report trio and the conversion upload: submit_report and
 * insert_conversions are governed stubs until implemented.
 * {{/writes}}
 */

export { listAccountsTool } from "./list-accounts.tool.js";
export { listEntitiesTool } from "./list-entities.tool.js";
export { getEntityTool } from "./get-entity.tool.js";
export { validateEntityTool } from "./validate-entity.tool.js";
export { getReportTool } from "./get-report.tool.js";
// {{#writes}}
export { submitReportTool } from "./submit-report.tool.js";
export { checkReportStatusTool } from "./check-report-status.tool.js";
export { downloadReportTool } from "./download-report.tool.js";
export { insertConversionsTool } from "./insert-conversions.tool.js";
// {{/writes}}
export { getPacingStatusTool } from "./get-pacing-status.tool.js";

import { listAccountsTool } from "./list-accounts.tool.js";
import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { validateEntityTool } from "./validate-entity.tool.js";
import { getReportTool } from "./get-report.tool.js";
// {{#writes}}
import { submitReportTool } from "./submit-report.tool.js";
import { checkReportStatusTool } from "./check-report-status.tool.js";
import { downloadReportTool } from "./download-report.tool.js";
import { insertConversionsTool } from "./insert-conversions.tool.js";
// {{/writes}}
import { getPacingStatusTool } from "./get-pacing-status.tool.js";
import {
  conformanceTools,
  createToolSearchTool,
  type ToolDefinitionForFactory,
} from "@cesteral/shared";

const productionTools: ToolDefinitionForFactory[] = [
  listAccountsTool,
  listEntitiesTool,
  getEntityTool,
  validateEntityTool,
  getReportTool,
  // {{#writes}}
  submitReportTool,
  checkReportStatusTool,
  downloadReportTool,
  insertConversionsTool,
  // {{/writes}}
  getPacingStatusTool,
  createToolSearchTool({ platform: "{{key}}", getTools: () => allTools }),
];

/** Conformance tools are included only when MCP_INCLUDE_CONFORMANCE_TOOLS=true. */
export const allTools: ToolDefinitionForFactory[] = [
  ...productionTools,
  ...(process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true" ? conformanceTools : []),
];
