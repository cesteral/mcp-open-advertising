// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * AmazonDsp MCP Resources - Definitions Barrel Export
 */

export { entityHierarchyResource } from "./entity-hierarchy.resource.js";
export { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
export { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
export { reportingReferenceResource } from "./reporting-reference.resource.js";

import { entityHierarchyResource } from "./entity-hierarchy.resource.js";
import { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
import { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
import { reportingReferenceResource } from "./reporting-reference.resource.js";
import { allTools } from "../../tools/definitions/index.js";
import {
  createToolExamplesResource,
  createServerCapabilitiesResource,
} from "@cesteral/shared";
import type { Resource } from "../types.js";

const toolExamplesResource = createToolExamplesResource(allTools, "amazon-dsp-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "amazon-dsp-mcp",
  toolGroups: {
    crud: ["amazon_dsp_list_entities", "amazon_dsp_get_entity", "amazon_dsp_create_entity", "amazon_dsp_update_entity", "amazon_dsp_delete_entity"],
    account: ["amazon_dsp_list_advertisers"],
    reporting: ["amazon_dsp_get_report", "amazon_dsp_get_report_breakdowns", "amazon_dsp_submit_report", "amazon_dsp_check_report_status", "amazon_dsp_download_report"],
    bulk: ["amazon_dsp_bulk_update_status", "amazon_dsp_bulk_create_entities", "amazon_dsp_bulk_update_entities", "amazon_dsp_adjust_bids"],
    targeting: ["amazon_dsp_search_targeting"],
    specialized: ["amazon_dsp_duplicate_entity", "amazon_dsp_get_ad_preview"],
    validation: ["amazon_dsp_validate_entity"],
  },
  commonWorkflows: ["campaign_setup", "async_reporting", "audience_targeting"],
  startHere: "amazon_dsp_list_advertisers",
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
  ...(toolExamplesResource ? [toolExamplesResource as unknown as Resource] : []),
  serverCapabilitiesResource as unknown as Resource,
];
