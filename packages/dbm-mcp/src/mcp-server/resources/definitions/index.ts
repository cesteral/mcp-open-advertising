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
import type { Resource } from "../types.js";

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
];
