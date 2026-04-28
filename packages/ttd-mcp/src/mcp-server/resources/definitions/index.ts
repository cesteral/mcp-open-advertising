// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * TTD MCP Resources - Definitions Barrel Export
 */

export { entityHierarchyResource } from "./entity-hierarchy.resource.js";
export { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
export { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
export { reportReferenceResource } from "./report-reference.resource.js";
export { graphqlReferenceResource } from "./graphql-reference.resource.js";

import { entityHierarchyResource } from "./entity-hierarchy.resource.js";
import { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
import { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
import { reportReferenceResource } from "./report-reference.resource.js";
import { graphqlReferenceResource } from "./graphql-reference.resource.js";
import { allTools } from "../../tools/definitions/index.js";
import { createToolExamplesResource, createServerCapabilitiesResource } from "@cesteral/shared";
import type { Resource } from "../types.js";

const toolExamplesResource = createToolExamplesResource(allTools, "ttd-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "ttd-mcp",
  allTools,
  toolGroups: {
    context: ["ttd_get_context"],
    crud: [
      "ttd_list_entities",
      "ttd_get_entity",
      "ttd_create_entity",
      "ttd_update_entity",
      "ttd_delete_entity",
    ],
    campaignWorkflows: [
      "ttd_create_campaigns",
      "ttd_update_campaigns",
      "ttd_create_ad_groups",
      "ttd_update_ad_groups",
      "ttd_get_job_status",
      "ttd_get_campaign_version",
    ],
    reporting: [
      "ttd_get_report",
      "ttd_download_report",
      "ttd_submit_report",
      "ttd_check_report_status",
      "ttd_execute_entity_report",
      "ttd_get_entity_report_types",
      "ttd_list_report_types",
      "ttd_get_report_type_schema",
    ],
    reportSchedules: [
      "ttd_create_report_schedule",
      "ttd_update_report_schedule",
      "ttd_list_report_schedules",
      "ttd_get_report_schedule",
      "ttd_delete_report_schedule",
      "ttd_rerun_report_schedule",
      "ttd_cancel_report_execution",
      "ttd_get_report_executions",
    ],
    reportTemplates: [
      "ttd_list_report_templates",
      "ttd_create_report_template",
      "ttd_update_report_template",
      "ttd_get_report_template",
      "ttd_create_template_schedule",
    ],
    bulk: [
      "ttd_bulk_create_entities",
      "ttd_bulk_update_entities",
      "ttd_bulk_update_status",
      "ttd_archive_entities",
      "ttd_adjust_bids",
    ],
    graphql: [
      "ttd_graphql_query",
      "ttd_graphql_query_bulk",
      "ttd_graphql_mutation_bulk",
      "ttd_graphql_bulk_job",
      "ttd_graphql_cancel_bulk_job",
    ],
    bidListsAndSeeds: ["ttd_manage_bid_list", "ttd_bulk_manage_bid_lists", "ttd_manage_seed"],
    dataJobs: ["ttd_get_first_party_data_job", "ttd_get_third_party_data_job"],
    passthrough: ["ttd_rest_request"],
    preview: ["ttd_get_ad_preview"],
    validation: ["ttd_validate_entity"],
  },
  commonWorkflows: [
    "campaign_setup",
    "ad_group_setup",
    "performance_reporting",
    "report_schedule_management",
    "bulk_status_update",
    "graphql_bulk_operations",
  ],
  discoveryFlow: [
    "Read server-capabilities://ttd-mcp/overview to choose a capability group.",
    "Read entity-hierarchy://all and entity-schema://{entityType} before entity writes.",
    "Read report-reference://all before report or schedule tools.",
    "Read graphql-reference://all before GraphQL passthrough or bulk GraphQL tools.",
    "Use tool-examples://ttd-mcp/all only when concrete payload examples are needed.",
  ],
  relatedResources: [
    "entity-hierarchy://all",
    "entity-schema://all",
    "entity-examples://all",
    "report-reference://all",
    "graphql-reference://all",
    "tool-examples://ttd-mcp/all",
  ],
  startHere: "ttd_get_context",
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
  reportReferenceResource,
  graphqlReferenceResource,
  ...(toolExamplesResource ? [toolExamplesResource as unknown as Resource] : []),
  serverCapabilitiesResource as unknown as Resource,
];
