// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Amazon DSP Entity Hierarchy Resource
 */
import type { Resource } from "../types.js";
import { AMAZON_DSP_ENTITY_CONTRACT } from "../../../services/amazon-dsp/amazon-dsp-api-contract.js";

let cachedContent: string | undefined;

function formatEntityHierarchyMarkdown(): string {
  const rows = Object.values(AMAZON_DSP_ENTITY_CONTRACT)
    .map(
      (contract) =>
        `| **${contract.canonicalType}** | \`${contract.listPath}?${contract.listFilterParam}=...\` | \`${contract.getPath}\` | ${contract.idField} |`
    )
    .join("\n");

  const pathRows = Object.values(AMAZON_DSP_ENTITY_CONTRACT)
    .flatMap((contract) => [
      `| \`GET\` | \`${contract.listPath}?${contract.listFilterParam}=...\` | List ${contract.displayName.toLowerCase()} records |`,
      `| \`GET\` | \`${contract.getPath}\` | Get ${contract.displayName.toLowerCase()} |`,
      `| \`POST\` | \`${contract.createPath}\` | Create ${contract.displayName.toLowerCase()} |`,
      `| \`PUT\` | \`${contract.updatePath}\` | Update ${contract.displayName.toLowerCase()} |`,
    ])
    .join("\n");

  return `# Amazon DSP Entity Hierarchy

## Relationship Diagram

\`\`\`
Advertiser
  └── Campaign / Order
        └── Ad Group / Line Item
              ├── Target
              └── Creative Association
                    └── Creative
\`\`\`

## Entity Types

| Entity Type | List Endpoint | Get Endpoint | ID Field |
|-------------|---------------|--------------|----------|
${rows}

## API Path Reference

| Method | Path | Description |
|--------|------|-------------|
${pathRows}

## Key Notes
- MCP accepts both \`campaign\` and \`order\` as the same entity type.
- MCP accepts both \`adGroup\` and \`lineItem\` as the same entity type.
- Amazon DSP reporting v3 uses \`POST /reporting/reports\` and \`GET /reporting/reports/{reportId}\`.
- List responses are modeled as JSON objects containing the entity-specific response key plus \`totalResults\`.
- Entity support in this MCP is intentionally narrower than the full Amazon Ads surface; Guidance, Quick Actions, and newer targeting APIs remain follow-up work.
`;
}

export const entityHierarchyResource: Resource = {
  uri: "entity-hierarchy://amazonDsp/all",
  name: "Amazon DSP Entity Hierarchy",
  description:
    "Parent-child relationships between Amazon DSP entities, API patterns, and creation ordering",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatEntityHierarchyMarkdown();
    return cachedContent;
  },
};
