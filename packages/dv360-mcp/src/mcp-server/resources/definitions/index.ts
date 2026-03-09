/**
 * Resource definitions barrel export
 */

// Entity Resources
export { entitySchemaResource } from "./entity-schema.resource.js";
export { entityFieldsResource } from "./entity-fields.resource.js";
export { entityExamplesResource } from "./entity-examples.resource.js";

// Targeting Resources
export { targetingTypesResource } from "./targeting-types.resource.js";
export { targetingSchemaResource } from "./targeting-schema.resource.js";

// Export all resources as an array for easy registration
import { entitySchemaResource } from "./entity-schema.resource.js";
import { entityFieldsResource } from "./entity-fields.resource.js";
import { entityExamplesResource } from "./entity-examples.resource.js";
import { targetingTypesResource } from "./targeting-types.resource.js";
import { targetingSchemaResource } from "./targeting-schema.resource.js";

import type { ResourceDefinition } from "../utils/types.js";

const serverCapabilitiesResource: ResourceDefinition = {
  uriTemplate: "server-capabilities://dv360-mcp/overview",
  name: "DV360 MCP Capabilities Overview",
  description: "Structured overview of tool groups, workflows, and entry points for dv360-mcp",
  mimeType: "application/json",
  read: async () => ({
    uri: "server-capabilities://dv360-mcp/overview",
    mimeType: "application/json",
    text: JSON.stringify({
      toolGroups: {
        crud: ["dv360_list_entities", "dv360_get_entity", "dv360_create_entity", "dv360_update_entity", "dv360_delete_entity"],
        bulk: ["dv360_bulk_create_entities", "dv360_bulk_update_entities", "dv360_bulk_update_status", "dv360_adjust_line_item_bids"],
        customBidding: ["dv360_create_custom_bidding_algorithm", "dv360_manage_custom_bidding_script", "dv360_manage_custom_bidding_rules", "dv360_list_custom_bidding_algorithms"],
        targeting: ["dv360_list_assigned_targeting", "dv360_get_assigned_targeting", "dv360_create_assigned_targeting", "dv360_delete_assigned_targeting", "dv360_validate_targeting_config"],
        validation: ["dv360_validate_entity"],
      },
      commonWorkflows: ["full_campaign_setup_workflow"],
      startHere: "dv360_list_entities",
    }, null, 2),
  }),
};

export const allResources = [
  // Entity Resources
  entitySchemaResource,
  entityFieldsResource,
  entityExamplesResource,
  // Targeting Resources
  targetingTypesResource,
  targetingSchemaResource,
  // Server Capabilities
  serverCapabilitiesResource,
];
