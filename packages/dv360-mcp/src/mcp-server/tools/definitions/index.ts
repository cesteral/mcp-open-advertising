/**
 * Tool definitions barrel export
 */

// Tier 1: Entity CRUD Tools (Generic)
export { listPartnersTool } from "./list-partners.tool.js";
export { listEntitiesTool } from "./list-entities.tool.js";
export { getEntityTool } from "./get-entity.tool.js";
export { createEntityTool } from "./create-entity.tool.js";
export { updateEntityTool } from "./update-entity.tool.js";
export { deleteEntityTool } from "./delete-entity.tool.js";

// Tier 2: Workflow Tools (Domain-Specific)
export { adjustLineItemBidsTool } from "./adjust-line-item-bids.tool.js";
export { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";

// Export all tools as an array for easy registration
import { listPartnersTool } from "./list-partners.tool.js";
import { listEntitiesTool } from "./list-entities.tool.js";
import { getEntityTool } from "./get-entity.tool.js";
import { createEntityTool } from "./create-entity.tool.js";
import { updateEntityTool } from "./update-entity.tool.js";
import { deleteEntityTool } from "./delete-entity.tool.js";
import { adjustLineItemBidsTool } from "./adjust-line-item-bids.tool.js";
import { bulkUpdateStatusTool } from "./bulk-update-status.tool.js";

export const allTools = [
  // Tier 1: Entity CRUD
  listPartnersTool,
  listEntitiesTool,
  getEntityTool,
  createEntityTool,
  updateEntityTool,
  deleteEntityTool,
  // Tier 2: Workflow Tools
  adjustLineItemBidsTool,
  bulkUpdateStatusTool,
];
