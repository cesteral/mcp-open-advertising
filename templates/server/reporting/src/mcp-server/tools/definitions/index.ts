// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tool definitions: the reporting type's requirements (scripts/lib/contract-tiers.mjs),
 * account discovery and tool search.
 * {{#writes}}
 * The async report trio: submit_report is a governed stub until implemented.
 * {{/writes}}
 */

export { listAccountsTool } from "./list-accounts.tool.js";
export { getReportTool } from "./get-report.tool.js";
// {{#writes}}
export { submitReportTool } from "./submit-report.tool.js";
export { checkReportStatusTool } from "./check-report-status.tool.js";
export { downloadReportTool } from "./download-report.tool.js";
// {{/writes}}
export { getPacingStatusTool } from "./get-pacing-status.tool.js";

import { listAccountsTool } from "./list-accounts.tool.js";
import { getReportTool } from "./get-report.tool.js";
// {{#writes}}
import { submitReportTool } from "./submit-report.tool.js";
import { checkReportStatusTool } from "./check-report-status.tool.js";
import { downloadReportTool } from "./download-report.tool.js";
// {{/writes}}
import { getPacingStatusTool } from "./get-pacing-status.tool.js";
import {
  conformanceTools,
  createToolSearchTool,
  type ToolDefinitionForFactory,
} from "@cesteral/shared";

const productionTools: ToolDefinitionForFactory[] = [
  listAccountsTool,
  getReportTool,
  // {{#writes}}
  submitReportTool,
  checkReportStatusTool,
  downloadReportTool,
  // {{/writes}}
  getPacingStatusTool,
  createToolSearchTool({ platform: "{{key}}", getTools: () => allTools }),
];

/** Conformance tools are included only when MCP_INCLUDE_CONFORMANCE_TOOLS=true. */
export const allTools: ToolDefinitionForFactory[] = [
  ...productionTools,
  ...(process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true" ? conformanceTools : []),
];
