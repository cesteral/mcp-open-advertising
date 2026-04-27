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
import { createToolExamplesResource, createServerCapabilitiesResource } from "@cesteral/shared";
import type { Resource } from "../types.js";

const toolExamplesResource = createToolExamplesResource(allTools, "dbm-mcp");
const serverCapabilitiesResource = createServerCapabilitiesResource({
  serverName: "dbm-mcp",
  allToolNames: [...allTools.map((tool) => tool.name), "dbm_run_custom_query_async"],
  toolGroups: {
    delivery: ["dbm_get_campaign_delivery", "dbm_get_pacing_status"],
    performance: ["dbm_get_performance_metrics", "dbm_get_historical_metrics"],
    custom: ["dbm_run_custom_query", "dbm_run_custom_query_async"],
  },
  commonWorkflows: ["delivery_troubleshooting", "custom_query", "large_report_task"],
  discoveryFlow: [
    "Use dbm_get_campaign_delivery or dbm_get_pacing_status for quick campaign health checks.",
    "Read metric-types://all, filter-types://all, and compatibility-rules://all before custom reports.",
    "Use dbm_run_custom_query_async for large reports when the client supports MCP Tasks.",
  ],
  relatedResources: [
    "metric-types://all",
    "filter-types://all",
    "compatibility-rules://all",
    "report-types://all",
    "query-examples://all",
    "tool-examples://dbm-mcp/all",
  ],
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
