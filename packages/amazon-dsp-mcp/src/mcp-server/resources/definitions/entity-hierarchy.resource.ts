// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Amazon DSP Entity Hierarchy Resource (Unified API, #234)
 */
import type { Resource } from "../types.js";
import {
  AMAZON_DSP_ENTITY_CONTRACT,
  unifiedEntityPath,
} from "../../../services/amazon-dsp/amazon-dsp-api-contract.js";

let cachedContent: string | undefined;

function formatEntityHierarchyMarkdown(): string {
  const contracts = Object.values(AMAZON_DSP_ENTITY_CONTRACT);
  const rows = contracts
    .map(
      (c) =>
        `| **${c.canonicalType}** | ${c.unified.resource} | ${c.idField} | ${c.unified.idFilter ? `\`${c.unified.idFilter}\`` : "— (no ID filter)"} |`
    )
    .join("\n");

  const pathRows = contracts
    .flatMap((c) => {
      const r = c.unified.resource;
      const name = c.displayName.toLowerCase();
      const out = [
        `| \`POST\` | \`${unifiedEntityPath("query", r)}\` | List / get ${name} (${c.unified.operations.query}) |`,
        `| \`POST\` | \`${unifiedEntityPath("create", r)}\` | Create ${name} (${c.unified.operations.create}) |`,
      ];
      if (c.unified.operations.update) {
        out.push(
          `| \`POST\` | \`${unifiedEntityPath("update", r)}\` | Update ${name} (${c.unified.operations.update}) |`
        );
      }
      if (c.unified.operations.delete) {
        out.push(
          `| \`POST\` | \`${unifiedEntityPath("delete", r)}\` | Delete ${name} (${c.unified.operations.delete}) |`
        );
      }
      if (c.legacyArchive) {
        out.push(
          `| \`PUT\` | \`${c.legacyArchive.pathTemplate}\` | LEGACY archive of ${name} (no Unified equivalent; unverified) |`
        );
      }
      return out;
    })
    .join("\n");

  return `# Amazon DSP Entity Hierarchy

Entity management runs on the Amazon Ads **Unified API** (\`/adsApi/v1/*\`). Every call is a
\`POST\` carrying \`Amazon-Ads-AccountId\` (the tools' \`accountId\`: the DSP advertiser ID) and
\`Amazon-Ads-ClientId\`. Source: amzn/ads-advanced-tools-docs \`unified-api-dsp.json\` and its DSP
migration guide.

## Relationship Diagram

\`\`\`
Advertiser account (accountId → Amazon-Ads-AccountId header)
  └── Order (Unified campaign, campaignId)
        └── Line Item (Unified ad group, adGroupId)
              ├── Target (targetId)
              └── Creative Association (Unified ad association, adAssociationId)
                    └── Creative (Unified ad, adId)
\`\`\`

## Entity Types

| Entity Type | Unified Resource | ID Field | Query ID Filter |
|-------------|------------------|----------|-----------------|
${rows}

## API Path Reference

| Method | Path | Description |
|--------|------|-------------|
${pathRows}

## Creation Order
1. \`order\` — created PAUSED (the only create state Amazon accepts for DSP campaigns)
2. \`lineItem\` with \`campaignId\` — created PAUSED
3. \`target\`s with \`adGroupId\`
4. \`creative\` (ad), then a \`creativeAssociation\` linking \`adId\` to \`adGroupId\`
5. Set the line items and the order to ENABLED (\`amazon_dsp_bulk_update_status\`)

## Key Notes
- The entity-type names (\`order\`, \`lineItem\`, \`creative\`, \`target\`, \`creativeAssociation\`) are kept from the pre-Unified surface; responses use Unified field names.
- Queries paginate with \`nextToken\`; list responses carry the resource key (e.g. \`campaigns\`) plus \`nextToken\`.
- Writes answer a 207 multi-status \`{ success: [{ index, <item> }], error: [{ index, errors: [...] }] }\`.
- \`state\` on update is ENABLED | PAUSED only. Removal: Unified delete for targets and ad associations; orders and line items fall back to the LEGACY archive call; ads cannot be removed.
- Targets cannot be read or updated one at a time (no targetId query filter, no update operation).
- Amazon DSP reporting uses DSP reports v3: \`POST /accounts/{accountId}/dsp/reports\` and \`GET /accounts/{accountId}/dsp/reports/{reportId}\`, where \`accountId\` is the DSP advertiser ID (see \`reporting-reference://amazonDsp\`).
`;
}

export const entityHierarchyResource: Resource = {
  uri: "entity-hierarchy://amazonDsp/all",
  name: "Amazon DSP Entity Hierarchy",
  description:
    "Parent-child relationships between Amazon DSP entities, Unified API paths, and creation ordering",
  mimeType: "text/markdown",
  getContent: () => {
    cachedContent ??= formatEntityHierarchyMarkdown();
    return cachedContent;
  },
};
