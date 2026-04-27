// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Amazon DSP Entity Schema Resources
 */
import type { Resource } from "../types.js";
import {
  AMAZON_DSP_CANONICAL_ENTITY_TYPES,
  AMAZON_DSP_ENTITY_CONTRACT,
  type AmazonDspCanonicalEntityType,
} from "../../../services/amazon-dsp/amazon-dsp-api-contract.js";

function buildEntitySchemaMarkdown(entityType: AmazonDspCanonicalEntityType): string {
  const contract = AMAZON_DSP_ENTITY_CONTRACT[entityType];
  const requiredFields = contract.requiredOnCreate
    .map(
      (rule) => `- \`${rule.field}\` (${rule.expectedType})${rule.hint ? ` — ${rule.hint}` : ""}`
    )
    .join("\n");
  const aliases = contract.aliases.length > 0 ? contract.aliases.join(", ") : "None";
  const notes = contract.notes.map((note) => `- ${note}`).join("\n");

  return `# Amazon DSP ${contract.displayName} Schema

## Entity Names
- Canonical MCP type: \`${contract.canonicalType}\`
- Accepted aliases: ${aliases}

## Endpoint Contract
- List: \`GET ${contract.listPath}\`
- Get: \`GET ${contract.getPath}\`
- Create: \`POST ${contract.createPath}\`
- Update: \`PUT ${contract.updatePath}\`
- List filter: \`${contract.listFilterParam}\`
- Primary ID field: \`${contract.idField}\`
- List response key: \`${contract.responseKey}\`

## Required Fields For Create
${requiredFields}

## Read-Only Fields
${contract.readOnlyFields.map((field) => `- \`${field}\``).join("\n")}

## Notes
${notes}
`;
}

function buildAllSchemasMarkdown(): string {
  return AMAZON_DSP_CANONICAL_ENTITY_TYPES.map(buildEntitySchemaMarkdown).join("\n\n---\n\n");
}

export const entitySchemaResources: Resource[] = AMAZON_DSP_CANONICAL_ENTITY_TYPES.map(
  (entityType) => ({
    uri: `entity-schema://amazonDsp/${entityType}`,
    name: `Amazon DSP ${entityType} Schema`,
    description: `Field reference for Amazon DSP ${entityType} entity including required fields, optional fields, and read-only fields`,
    mimeType: "text/markdown",
    getContent: () => buildEntitySchemaMarkdown(entityType),
  })
);

export const entitySchemaAllResource: Resource = {
  uri: "entity-schema://amazonDsp/all",
  name: "Amazon DSP All Entity Schemas",
  description: "Combined field reference for all Amazon DSP entity types",
  mimeType: "text/markdown",
  getContent: buildAllSchemasMarkdown,
};
