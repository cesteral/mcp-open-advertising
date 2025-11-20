/**
 * Resource definitions barrel export
 */

export { entitySchemaResource } from "./entity-schema.resource.js";
export { entityFieldsResource } from "./entity-fields.resource.js";
export { entityExamplesResource } from "./entity-examples.resource.js";

// Export all resources as an array for easy registration
import { entitySchemaResource } from "./entity-schema.resource.js";
import { entityFieldsResource } from "./entity-fields.resource.js";
import { entityExamplesResource } from "./entity-examples.resource.js";

export const allResources = [
  entitySchemaResource,
  entityFieldsResource,
  entityExamplesResource,
];
