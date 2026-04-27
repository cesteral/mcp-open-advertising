// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * LinkedIn MCP Resources - Definitions Barrel Export
 */

export { entityHierarchyResource } from "./entity-hierarchy.resource.js";
export { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
export { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
export { analyticsReferenceResource } from "./analytics-reference.resource.js";
export { targetingReferenceResource } from "./targeting-reference.resource.js";

import { entityHierarchyResource } from "./entity-hierarchy.resource.js";
import { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
import { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
import { analyticsReferenceResource } from "./analytics-reference.resource.js";
import { targetingReferenceResource } from "./targeting-reference.resource.js";
import { allTools } from "../../tools/definitions/index.js";
import { createToolExamplesResource, createServerCapabilitiesResource } from "@cesteral/shared";
import type { Resource } from "../types.js";

const toolExamplesResource = createToolExamplesResource(allTools, "linkedin-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "linkedin-mcp",
  toolGroups: {
    crud: [
      "linkedin_list_entities",
      "linkedin_get_entity",
      "linkedin_create_entity",
      "linkedin_update_entity",
      "linkedin_delete_entity",
    ],
    account: ["linkedin_list_ad_accounts"],
    analytics: ["linkedin_get_analytics", "linkedin_get_analytics_breakdowns"],
    bulk: [
      "linkedin_bulk_update_status",
      "linkedin_bulk_create_entities",
      "linkedin_bulk_update_entities",
      "linkedin_adjust_bids",
    ],
    targeting: ["linkedin_search_targeting", "linkedin_get_targeting_options"],
    specialized: [
      "linkedin_duplicate_entity",
      "linkedin_get_delivery_forecast",
      "linkedin_get_ad_preview",
    ],
    validation: ["linkedin_validate_entity"],
  },
  commonWorkflows: ["campaign_setup", "analytics_reporting", "audience_targeting"],
  startHere: "linkedin_list_ad_accounts",
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
  analyticsReferenceResource,
  targetingReferenceResource,
  ...(toolExamplesResource ? [toolExamplesResource as unknown as Resource] : []),
  serverCapabilitiesResource as unknown as Resource,
];
