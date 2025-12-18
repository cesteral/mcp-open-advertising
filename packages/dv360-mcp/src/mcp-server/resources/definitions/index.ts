/**
 * Resource definitions barrel export
 */

// Entity Resources
export { entitySchemaResource } from "./entity-schema.resource.js";
export { entityFieldsResource } from "./entity-fields.resource.js";
export { entityExamplesResource } from "./entity-examples.resource.js";

// Targeting Resources
export { targetingTypesResource } from "./targeting-types.resource.js";
export { targetingSchemaResource } from "./targeting-schema.resource.js";

// Export all resources as an array for easy registration
import { entitySchemaResource } from "./entity-schema.resource.js";
import { entityFieldsResource } from "./entity-fields.resource.js";
import { entityExamplesResource } from "./entity-examples.resource.js";
import { targetingTypesResource } from "./targeting-types.resource.js";
import { targetingSchemaResource } from "./targeting-schema.resource.js";

export const allResources = [
  // Entity Resources
  entitySchemaResource,
  entityFieldsResource,
  entityExamplesResource,
  // Targeting Resources
  targetingTypesResource,
  targetingSchemaResource,
];
