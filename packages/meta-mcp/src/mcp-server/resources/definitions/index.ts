// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Meta MCP Resources - Definitions Barrel Export
 */

export { entityHierarchyResource } from "./entity-hierarchy.resource.js";
export { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
export { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
export { insightsReferenceResource } from "./insights-reference.resource.js";
export { targetingReferenceResource } from "./targeting-reference.resource.js";

import { entityHierarchyResource } from "./entity-hierarchy.resource.js";
import { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
import { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
import { insightsReferenceResource } from "./insights-reference.resource.js";
import { targetingReferenceResource } from "./targeting-reference.resource.js";
import { allTools } from "../../tools/definitions/index.js";
import {
  createToolExamplesResource,
  createServerCapabilitiesResource,
} from "@cesteral/shared";
import type { Resource } from "../types.js";

const toolExamplesResource = createToolExamplesResource(allTools, "meta-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "meta-mcp",
  toolGroups: {
    crud: ["meta_list_entities", "meta_get_entity", "meta_create_entity", "meta_update_entity", "meta_delete_entity"],
    account: ["meta_list_ad_accounts"],
    insights: ["meta_get_insights", "meta_get_insights_breakdowns"],
    bulk: ["meta_bulk_update_status", "meta_bulk_create_entities", "meta_bulk_update_entities", "meta_adjust_bids"],
    targeting: ["meta_search_targeting", "meta_get_targeting_options"],
    specialized: ["meta_duplicate_entity", "meta_get_delivery_estimate", "meta_get_ad_preview"],
    validation: ["meta_validate_entity"],
  },
  commonWorkflows: ["full_campaign_setup_workflow", "performance_analysis", "audience_targeting"],
  startHere: "meta_list_ad_accounts",
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
  insightsReferenceResource,
  targetingReferenceResource,
  ...(toolExamplesResource ? [toolExamplesResource as unknown as Resource] : []),
  serverCapabilitiesResource as unknown as Resource,
];