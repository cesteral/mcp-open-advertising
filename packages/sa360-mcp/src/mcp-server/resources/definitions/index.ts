// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * SA360 MCP Resources - Definitions Barrel Export
 */

export { entityHierarchyResource } from "./entity-hierarchy.resource.js";
export { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
export { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
export { queryReferenceResource } from "./query-reference.resource.js";
export { conversionReferenceResource } from "./conversion-reference.resource.js";
export { insightsReferenceResource } from "./insights-reference.resource.js";

import { entityHierarchyResource } from "./entity-hierarchy.resource.js";
import { entitySchemaResources, entitySchemaAllResource } from "./entity-schemas.resource.js";
import { entityExampleResources, entityExampleAllResource } from "./entity-examples.resource.js";
import { queryReferenceResource } from "./query-reference.resource.js";
import { conversionReferenceResource } from "./conversion-reference.resource.js";
import { insightsReferenceResource } from "./insights-reference.resource.js";
import type { Resource } from "../types.js";

/**
 * All definition-level resources (excluding shared tool examples / server capabilities)
 */
export const definitionResources: Resource[] = [
  entityHierarchyResource,
  entitySchemaAllResource,
  ...entitySchemaResources,
  entityExampleAllResource,
  ...entityExampleResources,
  queryReferenceResource,
  conversionReferenceResource,
  insightsReferenceResource,
];
