/**
 * Snapchat MCP Resources - Definitions Barrel Export
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

const toolExamplesResource = createToolExamplesResource(allTools, "snapchat-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "snapchat-mcp",
  toolGroups: {
    crud: ["snapchat_list_entities", "snapchat_get_entity", "snapchat_create_entity", "snapchat_update_entity", "snapchat_delete_entity"],
    account: ["snapchat_list_ad_accounts"],
    reporting: ["snapchat_get_report", "snapchat_get_report_breakdowns", "snapchat_submit_report", "snapchat_check_report_status", "snapchat_download_report"],
    bulk: ["snapchat_bulk_update_status", "snapchat_bulk_create_entities", "snapchat_bulk_update_entities", "snapchat_adjust_bids"],
    targeting: ["snapchat_search_targeting", "snapchat_get_targeting_options"],
    specialized: ["snapchat_duplicate_entity", "snapchat_get_audience_estimate", "snapchat_get_ad_preview"],
    validation: ["snapchat_validate_entity"],
  },
  commonWorkflows: ["campaign_setup", "async_reporting", "audience_targeting"],
  startHere: "snapchat_list_ad_accounts",
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
