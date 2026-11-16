// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Tool definitions. The scaffold ships the management server type's MUST
 * tools (scripts/lib/contract-tiers.mjs), account discovery and tool search. The create, update,
 * delete and bulk-status tools are governed stubs until implemented.
 */

export { listAccountsTool } from "./list-accounts.tool.js";
export { listEntitiesTool } from "./list-entities.tool.js";
export { getEntityTool } from "./get-entity.tool.js";
export { createEntityTool } from "./create-entity.tool.js";
export { updateEntityTool } from "./update-entity.tool.js";
export { deleteEntityTool } from "./delete-entity.tool.js";
export { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
export { validateEntityTool } from "./validate-entity.tool.js";
export { getPacingStatusTool } from "./get-pacing-status.tool.js";

import { listAccountsTool } from "./list-accounts.tool.js";
import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { createEntityTool } from "./create-entity.tool.js";
import { updateEntityTool } from "./update-entity.tool.js";
import { deleteEntityTool } from "./delete-entity.tool.js";
import { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
import { validateEntityTool } from "./validate-entity.tool.js";
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
  createEntityTool,
  updateEntityTool,
  deleteEntityTool,
  bulkUpdateStatusTool,
  validateEntityTool,
  getPacingStatusTool,
  createToolSearchTool({ platform: "{{key}}", getTools: () => allTools }),
];

/** Conformance tools are included only when MCP_INCLUDE_CONFORMANCE_TOOLS=true. */
export const allTools: ToolDefinitionForFactory[] = [
  ...productionTools,
  ...(process.env.MCP_INCLUDE_CONFORMANCE_TOOLS === "true" ? conformanceTools : []),
];
