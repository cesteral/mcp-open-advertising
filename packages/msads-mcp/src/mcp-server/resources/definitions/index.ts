// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

export { entityHierarchyResource } from "./entity-hierarchy.resource.js";
export { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
export { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
export { reportingReferenceResource } from "./reporting-reference.resource.js";

import { entityHierarchyResource } from "./entity-hierarchy.resource.js";
import { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
import { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
import { reportingReferenceResource } from "./reporting-reference.resource.js";
import { productionTools as allTools } from "../../tools/definitions/index.js";
import { createToolExamplesResource, createServerCapabilitiesResource } from "@cesteral/shared";
import type { Resource } from "../types.js";

const toolExamplesResource = createToolExamplesResource(allTools, "msads-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "msads-mcp",
  allTools,
  toolGroups: {
    account: ["msads_list_accounts"],
    crud: [
      "msads_list_entities",
      "msads_get_entity",
      "msads_create_entity",
      "msads_update_entity",
      "msads_delete_entity",
    ],
    reporting: [
      "msads_get_report",
      "msads_get_report_breakdowns",
      "msads_submit_report",
      "msads_check_report_status",
      "msads_download_report",
    ],
    reportSchedules: [
      "msads_create_report_schedule",
      "msads_list_report_schedules",
      "msads_delete_report_schedule",
    ],
    bulk: [
      "msads_bulk_create_entities",
      "msads_bulk_update_entities",
      "msads_bulk_update_status",
      "msads_adjust_bids",
    ],
    targeting: ["msads_manage_criterions", "msads_manage_ad_extensions", "msads_search_targeting"],
    specialized: ["msads_get_ad_details", "msads_import_from_google"],
    validation: ["msads_validate_entity"],
  },
  commonWorkflows: [
    "campaign_setup",
    "async_reporting",
    "report_schedule_management",
    "google_import",
  ],
  discoveryFlow: [
    "Read server-capabilities://msads-mcp/overview to choose a capability group.",
    "Call msads_list_accounts to discover accessible CustomerId/AccountId pairs.",
    "Read entity-hierarchy://all and entity-schema://{entityType} before entity writes.",
    "Read reporting-reference://all before report tools or schedule management.",
    "Use tool-examples://msads-mcp/all only when concrete payload examples are needed.",
  ],
  relatedResources: [
    "entity-hierarchy://all",
    "entity-schema://all",
    "entity-examples://all",
    "reporting-reference://all",
    "tool-examples://msads-mcp/all",
  ],
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
