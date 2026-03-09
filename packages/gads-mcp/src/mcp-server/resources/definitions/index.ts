/**
 * Google Ads MCP Resources - Definitions Barrel Export
 */

export { entityHierarchyResource } from "./entity-hierarchy.resource.js";
export { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
export { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
export { gaqlReferenceResource } from "./gaql-reference.resource.js";

import { entityHierarchyResource } from "./entity-hierarchy.resource.js";
import { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
import { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
import { gaqlReferenceResource } from "./gaql-reference.resource.js";
import { allTools } from "../../tools/definitions/index.js";
import {
  createToolExamplesResource,
  createServerCapabilitiesResource,
} from "@cesteral/shared";
import type { Resource } from "../types.js";

const toolExamplesResource = createToolExamplesResource(allTools, "gads-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "gads-mcp",
  toolGroups: {
    read: ["gads_gaql_search", "gads_list_accounts", "gads_get_entity", "gads_list_entities", "gads_get_insights"],
    write: ["gads_create_entity", "gads_update_entity", "gads_remove_entity"],
    bulk: ["gads_bulk_mutate", "gads_bulk_update_status", "gads_adjust_bids"],
    validation: ["gads_validate_entity"],
  },
  commonWorkflows: ["campaign_setup", "performance_analysis", "bulk_status_update"],
  startHere: "gads_list_accounts",
});

/**
 * All resources for registration
 */
export const allResources: Resource[] = [
  entityHierarchyResource,
  entitySchemaAllResource,
  ...entitySchemaResources,
  entityExampleAllResource,
  ...entityExampleResources,
  gaqlReferenceResource,
  ...(toolExamplesResource ? [toolExamplesResource as unknown as Resource] : []),
  serverCapabilitiesResource as unknown as Resource,
];
