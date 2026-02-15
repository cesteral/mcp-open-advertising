/**
 * Google Ads MCP Resources - Definitions Barrel Export
 */

export { entityHierarchyResource } from "./entity-hierarchy.resource.js";
export { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
export { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
export { gaqlReferenceResource } from "./gaql-reference.resource.js";

import { entityHierarchyResource } from "./entity-hierarchy.resource.js";
import { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
import { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
import { gaqlReferenceResource } from "./gaql-reference.resource.js";
import type { Resource } from "../types.js";

/**
 * All resources for registration (16 total)
 *   1 hierarchy + 1 all-schemas + 6 per-entity schemas + 1 all-examples + 6 per-entity examples + 1 GAQL reference
 */
export const allResources: Resource[] = [
  entityHierarchyResource,
  entitySchemaAllResource,
  ...entitySchemaResources,
  entityExampleAllResource,
  ...entityExampleResources,
  gaqlReferenceResource,
];
