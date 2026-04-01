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
import {
  createToolExamplesResource,
  createServerCapabilitiesResource,
} from "@cesteral/shared";
import type { Resource } from "../types.js";

const toolExamplesResource = createToolExamplesResource(allTools, "ttd-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "ttd-mcp",
  toolGroups: {
    crud: ["ttd_list_entities", "ttd_get_entity", "ttd_create_entity", "ttd_update_entity", "ttd_delete_entity"],
    reporting: ["ttd_get_report", "ttd_download_report", "ttd_submit_report", "ttd_check_report_status"],
    bulk: ["ttd_bulk_create_entities", "ttd_bulk_update_entities", "ttd_bulk_update_status", "ttd_archive_entities", "ttd_adjust_bids"],
    graphql: ["ttd_graphql_query", "ttd_graphql_query_bulk", "ttd_graphql_mutation_bulk", "ttd_graphql_bulk_job", "ttd_graphql_cancel_bulk_job"],
    validation: ["ttd_validate_entity"],
  },
  commonWorkflows: ["campaign_setup", "performance_reporting", "bulk_status_update"],
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