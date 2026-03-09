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
    delivery: ["get_campaign_delivery", "get_pacing_status"],
    performance: ["get_performance_metrics", "get_historical_metrics"],
    custom: ["run_custom_query"],
  },
  commonWorkflows: ["delivery_troubleshooting"],
  startHere: "get_campaign_delivery",
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
