export { entityHierarchyResource } from "./entity-hierarchy.resource.js";
export { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
export { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
export { reportingReferenceResource } from "./reporting-reference.resource.js";

import { entityHierarchyResource } from "./entity-hierarchy.resource.js";
import { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
import { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
import { reportingReferenceResource } from "./reporting-reference.resource.js";
import { productionTools as allTools } from "../../tools/definitions/index.js";
import {
  createToolExamplesResource,
  createServerCapabilitiesResource,
} from "@cesteral/shared";
import type { Resource } from "../types.js";

const toolExamplesResource = createToolExamplesResource(allTools, "msads-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "msads-mcp",
  toolGroups: {
    crud: ["msads_list_entities", "msads_get_entity", "msads_create_entity", "msads_update_entity", "msads_delete_entity"],
    account: ["msads_list_accounts"],
    reporting: ["msads_get_report", "msads_submit_report", "msads_check_report_status", "msads_download_report"],
    bulk: ["msads_bulk_create_entities", "msads_bulk_update_entities", "msads_bulk_update_status", "msads_adjust_bids"],
    targeting: ["msads_manage_criterions", "msads_manage_ad_extensions"],
    specialized: ["msads_get_ad_preview", "msads_import_from_google"],
    validation: ["msads_validate_entity"],
  },
  commonWorkflows: ["campaign_setup", "async_reporting", "google_import"],
  startHere: "msads_list_accounts",
});

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
