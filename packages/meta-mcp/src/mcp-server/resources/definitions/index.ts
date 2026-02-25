/**
 * Meta MCP Resources - Definitions Barrel Export
 */

export { entityHierarchyResource } from "./entity-hierarchy.resource.js";
export { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
export { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
export { insightsReferenceResource } from "./insights-reference.resource.js";
export { targetingReferenceResource } from "./targeting-reference.resource.js";

import { entityHierarchyResource } from "./entity-hierarchy.resource.js";
import { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
import { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
import { insightsReferenceResource } from "./insights-reference.resource.js";
import { targetingReferenceResource } from "./targeting-reference.resource.js";
import type { Resource } from "../types.js";

/**
 * All resources for registration (14 total)
 */
export const allResources: Resource[] = [
  entityHierarchyResource,
  entitySchemaAllResource,
  ...entitySchemaResources,
  entityExampleAllResource,
  ...entityExampleResources,
  insightsReferenceResource,
  targetingReferenceResource,
];
