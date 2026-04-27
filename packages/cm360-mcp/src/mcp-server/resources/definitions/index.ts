// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * CM360 MCP Resources - Definitions Barrel Export
 */

export { entityHierarchyResource } from "./entity-hierarchy.resource.js";
export { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
export { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
export { reportingReferenceResource } from "./reporting-reference.resource.js";
export { targetingReferenceResource } from "./targeting-reference.resource.js";

import { entityHierarchyResource } from "./entity-hierarchy.resource.js";
import { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
import { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
import { reportingReferenceResource } from "./reporting-reference.resource.js";
import { targetingReferenceResource } from "./targeting-reference.resource.js";
import { allTools } from "../../tools/definitions/index.js";
import { createToolExamplesResource, createServerCapabilitiesResource } from "@cesteral/shared";
import type { Resource } from "../types.js";

const toolExamplesResource = createToolExamplesResource(allTools, "cm360-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "cm360-mcp",
  toolGroups: {
    crud: [
      "cm360_list_entities",
      "cm360_get_entity",
      "cm360_create_entity",
      "cm360_update_entity",
      "cm360_delete_entity",
    ],
    account: ["cm360_list_user_profiles"],
    reporting: [
      "cm360_get_report",
      "cm360_submit_report",
      "cm360_check_report_status",
      "cm360_download_report",
    ],
    bulk: ["cm360_bulk_update_status", "cm360_bulk_create_entities", "cm360_bulk_update_entities"],
    specialized: ["cm360_get_ad_preview", "cm360_list_targeting_options"],
    validation: ["cm360_validate_entity"],
  },
  commonWorkflows: ["campaign_setup", "reporting", "floodlight_tracking"],
  startHere: "cm360_list_user_profiles",
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
  reportingReferenceResource,
  targetingReferenceResource,
  ...(toolExamplesResource ? [toolExamplesResource as unknown as Resource] : []),
  serverCapabilitiesResource as unknown as Resource,
];
