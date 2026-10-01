// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Amazon DSP Entity Schema Resources
 */
import type { Resource } from "../types.js";
import {
  AMAZON_DSP_CANONICAL_ENTITY_TYPES,
  AMAZON_DSP_ENTITY_CONTRACT,
  unifiedEntityPath,
  type AmazonDspCanonicalEntityType,
} from "../../../services/amazon-dsp/amazon-dsp-api-contract.js";

function buildEntitySchemaMarkdown(entityType: AmazonDspCanonicalEntityType): string {
  const contract = AMAZON_DSP_ENTITY_CONTRACT[entityType];
  const requiredFields = contract.requiredOnCreate
    .map(
      (rule) => `- \`${rule.field}\` (${rule.expectedType})${rule.hint ? ` — ${rule.hint}` : ""}`
    )
    .join("\n");
  const notes = contract.notes.map((note) => `- ${note}`).join("\n");

  return `# Amazon DSP ${contract.displayName} Schema

## Entity Names
- Canonical MCP type: \`${contract.canonicalType}\`

## Endpoint Contract (Unified API)
- Resource: \`${contract.unified.resource}\` (\`POST /adsApi/v1/{create|update|query|delete}/${contract.unified.resource}\`)
- Query: \`POST ${unifiedEntityPath("query", contract.unified.resource)}\` (${contract.unified.operations.query})
- Create: \`POST ${unifiedEntityPath("create", contract.unified.resource)}\` (${contract.unified.operations.create}, batch max ${contract.unified.writeBatchMax})
- Update: ${contract.unified.operations.update ? `\`POST ${unifiedEntityPath("update", contract.unified.resource)}\` (${contract.unified.operations.update})` : `not supported — ${contract.updateUnsupportedReason ?? "no Unified update"}`}
- Delete: ${contract.unified.operations.delete ? `\`POST ${unifiedEntityPath("delete", contract.unified.resource)}\` (${contract.unified.operations.delete})` : contract.legacyArchive ? `no Unified delete — LEGACY \`PUT ${contract.legacyArchive.pathTemplate} { state: "ARCHIVED" }\` (unverified)` : `not supported — ${contract.deleteUnsupportedReason ?? "no Unified delete"}`}
- Primary ID field: \`${contract.idField}\`${contract.unified.idFilter ? ` (query filter \`${contract.unified.idFilter}\`)` : " (no query ID filter — cannot be read by ID)"}
- List filters (\`filters\` keys): ${Object.keys(contract.unified.filterKeys)
    .map((k) => `\`${k}\``)
    .join(", ")}
- Legacy field names mapped on create: ${
    Object.entries(contract.legacyFieldRenames).length
      ? Object.entries(contract.legacyFieldRenames)
          .map(([a, b]) => `\`${a}\` → \`${b}\``)
          .join(", ")
      : "none"
  }

## Required Fields For Create
${contract.createFields.includes("adProduct") ? '`adProduct: "AMAZON_DSP"` is added by the server' : "No `adProduct` on this resource"}${contract.createStateMustBe ? `; \`state\` defaults to ${contract.createStateMustBe} (the only accepted create state)` : ""}.
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
