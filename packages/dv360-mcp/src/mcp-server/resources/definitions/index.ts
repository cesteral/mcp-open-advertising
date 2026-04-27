// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

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
import { allTools } from "../../tools/definitions/index.js";
import { createServerCapabilitiesResource } from "@cesteral/shared";

import type { ResourceDefinition } from "../utils/types.js";

const sharedCapabilities = createServerCapabilitiesResource({
  serverName: "dv360-mcp",
  allTools,
  toolGroups: {
    crud: [
      "dv360_list_entities",
      "dv360_get_entity",
      "dv360_create_entity",
      "dv360_update_entity",
      "dv360_delete_entity",
    ],
    bulk: [
      "dv360_bulk_create_entities",
      "dv360_bulk_update_entities",
      "dv360_bulk_update_status",
      "dv360_adjust_line_item_bids",
    ],
    customBidding: [
      "dv360_create_custom_bidding_algorithm",
      "dv360_manage_custom_bidding_script",
      "dv360_manage_custom_bidding_rules",
      "dv360_list_custom_bidding_algorithms",
    ],
    targeting: [
      "dv360_list_assigned_targeting",
      "dv360_get_assigned_targeting",
      "dv360_create_assigned_targeting",
      "dv360_delete_assigned_targeting",
      "dv360_validate_targeting_config",
    ],
    media: ["dv360_upload_image", "dv360_upload_video"],
    delivery: ["dv360_get_delivery_estimate", "dv360_get_pacing_status"],
    preview: ["dv360_get_ad_preview"],
    specialized: ["dv360_duplicate_entity"],
    validation: ["dv360_validate_entity"],
  },
  commonWorkflows: ["full_campaign_setup_workflow", "targeting_assignment", "custom_bidding_setup"],
  discoveryFlow: [
    "Read server-capabilities://dv360-mcp/overview to choose a capability group.",
    "Read entity-schema://{entityType} and entity-fields://{entityType} before entity writes.",
    "Read targeting-types://all and targeting-schema://{targetingType} before targeting writes.",
    "Read entity-examples://{entityType} for concrete payload shape.",
  ],
  relatedResources: [
    "entity-schema://all",
    "entity-fields://all",
    "entity-examples://all",
    "targeting-types://all",
    "targeting-schema://all",
  ],
  startHere: "dv360_list_entities",
});

const serverCapabilitiesResource: ResourceDefinition = {
  uriTemplate: "server-capabilities://dv360-mcp/overview",
  name: sharedCapabilities.name,
  description: sharedCapabilities.description,
  mimeType: "application/json",
  read: async () => ({
    uri: "server-capabilities://dv360-mcp/overview",
    mimeType: "application/json",
    text: await sharedCapabilities.getContent(),
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
