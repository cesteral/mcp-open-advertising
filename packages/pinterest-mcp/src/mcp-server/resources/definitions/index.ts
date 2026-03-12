/**
 * Pinterest MCP Resources - Definitions Barrel Export
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

const toolExamplesResource = createToolExamplesResource(allTools, "pinterest-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "pinterest-mcp",
  toolGroups: {
    crud: ["pinterest_list_entities", "pinterest_get_entity", "pinterest_create_entity", "pinterest_update_entity", "pinterest_delete_entity"],
    account: ["pinterest_list_ad_accounts"],
    reporting: ["pinterest_get_report", "pinterest_get_report_breakdowns", "pinterest_submit_report", "pinterest_check_report_status", "pinterest_download_report"],
    bulk: ["pinterest_bulk_update_status", "pinterest_bulk_create_entities", "pinterest_bulk_update_entities", "pinterest_adjust_bids"],
    targeting: ["pinterest_search_targeting", "pinterest_get_targeting_options"],
    specialized: ["pinterest_duplicate_entity", "pinterest_get_audience_estimate", "pinterest_get_ad_preview"],
    validation: ["pinterest_validate_entity"],
  },
  commonWorkflows: ["campaign_setup", "async_reporting", "audience_targeting"],
  startHere: "pinterest_list_ad_accounts",
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
