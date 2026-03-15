// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * MCP Resources - Barrel Export
 */

export { metricTypesResource, metricTypeCategoryResources } from "./metric-types.resource.js";
export { filterTypesResource, filterTypeCategoryResources } from "./filter-types.resource.js";
export { queryExamplesResource, QUERY_EXAMPLES } from "./query-examples.resource.js";
export { reportTypesResource } from "./report-types.resource.js";
export { compatibilityRulesResource } from "./compatibility-rules.resource.js";

import { metricTypesResource, metricTypeCategoryResources } from "./metric-types.resource.js";
import { filterTypesResource, filterTypeCategoryResources } from "./filter-types.resource.js";
import { queryExamplesResource } from "./query-examples.resource.js";
import { reportTypesResource } from "./report-types.resource.js";
import { compatibilityRulesResource } from "./compatibility-rules.resource.js";
import { allTools } from "../../tools/index.js";
import {
  createToolExamplesResource,
  createServerCapabilitiesResource,
} from "@cesteral/shared";
import type { Resource } from "../types.js";

const toolExamplesResource = createToolExamplesResource(allTools, "dbm-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "dbm-mcp",
  toolGroups: {
    delivery: ["dbm_get_campaign_delivery", "dbm_get_pacing_status"],
    performance: ["dbm_get_performance_metrics", "dbm_get_historical_metrics"],
    custom: ["dbm_run_custom_query"],
  },
  commonWorkflows: ["delivery_troubleshooting"],
  startHere: "dbm_get_campaign_delivery",
});

/**
 * All resources for registration
 */
export const allResources: Resource[] = [
  metricTypesResource,
  filterTypesResource,
  ...metricTypeCategoryResources,
  ...filterTypeCategoryResources,
  queryExamplesResource,
  reportTypesResource,
  compatibilityRulesResource,
  ...(toolExamplesResource ? [toolExamplesResource as unknown as Resource] : []),
  serverCapabilitiesResource as unknown as Resource,
];