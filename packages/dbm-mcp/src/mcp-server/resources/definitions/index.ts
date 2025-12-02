/**
 * MCP Resources - Barrel Export
 */

export { metricTypesResource, METRIC_DOCUMENTATION } from "./metric-types.resource.js";
export { filterTypesResource, FILTER_DOCUMENTATION } from "./filter-types.resource.js";
export { queryExamplesResource, QUERY_EXAMPLES } from "./query-examples.resource.js";

import { metricTypesResource } from "./metric-types.resource.js";
import { filterTypesResource } from "./filter-types.resource.js";
import { queryExamplesResource } from "./query-examples.resource.js";
import type { Resource } from "../types.js";

/**
 * All resources for registration
 */
export const allResources: Resource[] = [
  metricTypesResource,
  filterTypesResource,
  queryExamplesResource,
];
