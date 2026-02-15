/**
 * Tool definitions barrel export
 *
 * 9 tools total:
 *   4 read:  gaql search, list accounts, get entity, list entities
 *   5 write: create entity, update entity, remove entity, bulk mutate, bulk update status
 */

export { gaqlSearchTool } from "./gaql-search.tool.js";
export { listAccountsTool } from "./list-accounts.tool.js";
export { getEntityTool } from "./get-entity.tool.js";
export { listEntitiesTool } from "./list-entities.tool.js";
export { createEntityTool } from "./create-entity.tool.js";
export { updateEntityTool } from "./update-entity.tool.js";
export { removeEntityTool } from "./remove-entity.tool.js";
export { bulkMutateTool } from "./bulk-mutate.tool.js";
export { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";

import { gaqlSearchTool } from "./gaql-search.tool.js";
import { listAccountsTool } from "./list-accounts.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { listEntitiesTool } from "./list-entities.tool.js";
import { createEntityTool } from "./create-entity.tool.js";
import { updateEntityTool } from "./update-entity.tool.js";
import { removeEntityTool } from "./remove-entity.tool.js";
import { bulkMutateTool } from "./bulk-mutate.tool.js";
import { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
import type { ToolDefinitionForFactory } from "@cesteral/shared";

export const allTools: ToolDefinitionForFactory[] = [
  // ── Read Tools ──
  gaqlSearchTool,
  listAccountsTool,
  getEntityTool,
  listEntitiesTool,
  // ── Write Tools ──
  createEntityTool,
  updateEntityTool,
  removeEntityTool,
  bulkMutateTool,
  bulkUpdateStatusTool,
];
