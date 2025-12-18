/**
 * Tool definitions barrel export
 */

// Tier 1: Entity CRUD Tools (Generic, fully dynamic)
export { listEntitiesTool } from "./list-entities.tool.js";
export { getEntityTool } from "./get-entity.tool.js";
export { createEntityTool } from "./create-entity.tool.js";
export { updateEntityTool } from "./update-entity.tool.js";
export { deleteEntityTool } from "./delete-entity.tool.js";

// Tier 2: Workflow Tools (Domain-Specific)
export { adjustLineItemBidsTool } from "./adjust-line-item-bids.tool.js";
export { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";

// Tier 3: Targeting Tools (CRUD for assignedTargetingOptions)
export { listAssignedTargetingTool } from "./list-assigned-targeting.tool.js";
export { getAssignedTargetingTool } from "./get-assigned-targeting.tool.js";
export { createAssignedTargetingTool } from "./create-assigned-targeting.tool.js";
export { deleteAssignedTargetingTool } from "./delete-assigned-targeting.tool.js";
export { validateTargetingConfigTool } from "./validate-targeting-config.tool.js";

// Export all tools as an array for easy registration
import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { createEntityTool } from "./create-entity.tool.js";
import { updateEntityTool } from "./update-entity.tool.js";
import { deleteEntityTool } from "./delete-entity.tool.js";
import { adjustLineItemBidsTool } from "./adjust-line-item-bids.tool.js";
import { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";
import { listAssignedTargetingTool } from "./list-assigned-targeting.tool.js";
import { getAssignedTargetingTool } from "./get-assigned-targeting.tool.js";
import { createAssignedTargetingTool } from "./create-assigned-targeting.tool.js";
import { deleteAssignedTargetingTool } from "./delete-assigned-targeting.tool.js";
import { validateTargetingConfigTool } from "./validate-targeting-config.tool.js";

export const allTools = [
  // Tier 1: Entity CRUD (generic tools handle all entity types dynamically)
  listEntitiesTool,
  getEntityTool,
  createEntityTool, // Now using simplified schema
  updateEntityTool, // Now using simplified schema
  deleteEntityTool,
  // Tier 2: Workflow Tools
  adjustLineItemBidsTool,
  bulkUpdateStatusTool,
  // Tier 3: Targeting Tools (assignedTargetingOptions CRUD)
  listAssignedTargetingTool,
  getAssignedTargetingTool,
  createAssignedTargetingTool,
  deleteAssignedTargetingTool,
  validateTargetingConfigTool,
];
