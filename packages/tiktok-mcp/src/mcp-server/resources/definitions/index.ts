/**
 * TikTok MCP Resources - Definitions Barrel Export
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

const toolExamplesResource = createToolExamplesResource(allTools, "tiktok-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "tiktok-mcp",
  toolGroups: {
    crud: ["tiktok_list_entities", "tiktok_get_entity", "tiktok_create_entity", "tiktok_update_entity", "tiktok_delete_entity"],
    account: ["tiktok_list_advertisers"],
    reporting: ["tiktok_get_report", "tiktok_get_report_breakdowns", "tiktok_submit_report", "tiktok_check_report_status", "tiktok_download_report"],
    bulk: ["tiktok_bulk_update_status", "tiktok_bulk_create_entities", "tiktok_bulk_update_entities", "tiktok_adjust_bids"],
    targeting: ["tiktok_search_targeting", "tiktok_get_targeting_options"],
    specialized: ["tiktok_duplicate_entity", "tiktok_get_audience_estimate", "tiktok_get_ad_preview"],
    validation: ["tiktok_validate_entity"],
  },
  commonWorkflows: ["campaign_setup", "async_reporting", "audience_targeting"],
  startHere: "tiktok_list_advertisers",
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
