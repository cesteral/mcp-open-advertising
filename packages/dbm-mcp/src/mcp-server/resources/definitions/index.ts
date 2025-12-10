/**
 * MCP Resources - Barrel Export
 */

export { metricTypesResource } from "./metric-types.resource.js";
export { filterTypesResource } from "./filter-types.resource.js";
export { queryExamplesResource, QUERY_EXAMPLES } from "./query-examples.resource.js";
export { reportTypesResource } from "./report-types.resource.js";
export { compatibilityRulesResource } from "./compatibility-rules.resource.js";

import { metricTypesResource } from "./metric-types.resource.js";
import { filterTypesResource } from "./filter-types.resource.js";
import { queryExamplesResource } from "./query-examples.resource.js";
import { reportTypesResource } from "./report-types.resource.js";
import { compatibilityRulesResource } from "./compatibility-rules.resource.js";
import type { Resource } from "../types.js";

/**
 * All resources for registration
 */
export const allResources: Resource[] = [
  metricTypesResource,
  filterTypesResource,
  queryExamplesResource,
  reportTypesResource,
  compatibilityRulesResource,
];
