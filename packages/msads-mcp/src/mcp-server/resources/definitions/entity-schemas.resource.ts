// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import type { Resource } from "../types.js";
import { getSupportedEntityTypes, getEntityConfig } from "../../tools/utils/entity-mapping.js";

export const entitySchemaAllResource: Resource = {
  uri: "msads://entity-schemas",
  name: "Microsoft Ads Entity Schemas (All)",
  description: "Schema overview for all Microsoft Ads entity types",
  mimeType: "text/markdown",
  getContent: () => {
    const types = getSupportedEntityTypes();
    const lines = types.map((t) => {
      const config = getEntityConfig(t);
      return `- **${t}** (${config.displayName}): ID field \`${config.idField}\`, plural \`${config.pluralName}\`, batch limit ${config.batchLimit}`;
    });
    return `# Microsoft Ads Entity Schemas\n\n${lines.join("\n")}\n\nSee individual entity-schema resources for detailed field information.`;
  },
};

function createEntitySchemaResource(entityType: string): Resource {
  const config = getEntityConfig(entityType as any);
  return {
    uri: `msads://entity-schema/${entityType}`,
    name: `Microsoft Ads ${config.displayName} Schema`,
    description: `Field schema for ${config.displayName} entities`,
    mimeType: "text/markdown",
    getContent: () => `# ${config.displayName} Schema

## API Operations
- **Add**: \`${config.addOperation}\`
- **GetByIds**: \`${config.getByIdsOperation}\`
- **Update**: \`${config.updateOperation}\`
- **Delete**: \`${config.deleteOperation}\`
${config.getByAccountOperation ? `- **GetByAccount**: \`${config.getByAccountOperation}\`` : ""}
${config.getByParentOperation ? `- **GetByParent**: \`${config.getByParentOperation}\` (parent field: \`${config.parentIdField}\`)` : ""}

## Key Fields
- **Id** (long): Entity identifier (read-only after creation)
- **Status** (string): Active, Paused, or Deleted
${config.parentIdField ? `- **${config.parentIdField}** (long): Parent entity ID` : ""}

## Batch Limits
- Maximum ${config.batchLimit} entities per Add/Update call

## Request Format
Wrap entities in \`${config.pluralName}\` array:
\`\`\`json
{
  "${config.pluralName}": [
    { "Id": 123, "Status": "Active" }
  ]
}
\`\`\`
`,
  };
}

export const entitySchemaResources: Resource[] = getSupportedEntityTypes().map(createEntitySchemaResource);