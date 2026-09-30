// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Hermetic check of GAQL fields and create payloads against the pinned API
 * version's schema, taken from Google's own Discovery document.
 *
 * All HTTP in this package's suite is mocked, so nothing else notices a field
 * the API no longer has. That is how `campaign.start_date` / `end_date`
 * (removed in v23 in favour of `start_date_time` / `end_date_time`) shipped:
 * the whole campaign SELECT fails upstream once one field is unrecognized.
 * `metrics.video_views`, `metrics.video_view_rate` and `metrics.quality_score`
 * sat in the reference resources the same way, naming fields that no
 * supported version has.
 *
 * The fixture is written by `scripts/extract-discovery.ts` for the version in
 * src/config/index.ts. Regenerate it (`pnpm run extract:discovery`) when the
 * version is bumped; the first test fails until you do.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  buildGetByIdQuery,
  buildListQuery,
} from "../../src/mcp-server/tools/utils/gaql-helpers.js";
import {
  getEntityTypeEnum,
  type GAdsEntityType,
} from "../../src/mcp-server/tools/utils/entity-mapping.js";
import { createEntityTool } from "../../src/mcp-server/tools/definitions/create-entity.tool.js";
import { entityExampleAllResource } from "../../src/mcp-server/resources/definitions/entity-examples.resource.js";
import { collectGaqlFieldRefs, snakeToCamel } from "../../scripts/lib/gaql-field-refs.js";

interface DiscoveryExtract {
  _provenance: { version: string; revision: string };
  resources: Record<string, string | null>;
  schemas: Record<string, Record<string, string | null>>;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const extract = JSON.parse(
  readFileSync(join(HERE, "../fixtures/google-ads-discovery-extract.json"), "utf-8")
) as DiscoveryExtract;
const VERSION = extract._provenance.version;

/** Resolve `resource.field.sub_field` through the extract; returns an error string or null. */
function resolveGaqlField(field: string): string | null {
  const [resource, ...path] = field.split(".");
  let schemaName: string | null | undefined = extract.resources[resource];
  if (!schemaName) return `unknown GAQL resource "${resource}"`;
  for (const segment of path) {
    const schema = extract.schemas[schemaName!];
    if (!schema) return `schema ${schemaName} not in the extract (regenerate it)`;
    const prop = snakeToCamel(segment);
    if (!(prop in schema)) return `${schemaName} has no property "${prop}" (from "${segment}")`;
    schemaName = schema[prop];
  }
  return null;
}

/** Fields src/ names only to say they were removed; they must stay unresolvable. */
const NAMED_AS_REMOVED = new Set(["campaign.start_date", "campaign.end_date"]);
/** Placeholders in GAQL syntax templates (`SELECT metrics.metric1, ...`). */
const PLACEHOLDERS = new Set(["metrics.metric1", "segments.segment1"]);

function selectedFields(query: string): string[] {
  const match = /^SELECT (.+?) FROM /.exec(query);
  if (!match) throw new Error(`not a SELECT: ${query}`);
  return match[1].split(",").map((f) => f.trim());
}

describe(`GAQL fields exist in the ${VERSION} Discovery schema`, () => {
  it("the extract matches the version src/config pins", () => {
    const config = readFileSync(join(HERE, "../../src/config/index.ts"), "utf-8");
    expect(/googleads\.googleapis\.com\/(v\d+)/.exec(config)?.[1]).toBe(VERSION);
  });

  for (const entityType of getEntityTypeEnum() as GAdsEntityType[]) {
    it(`${entityType}: every list/get field resolves`, () => {
      const fields = new Set([
        ...selectedFields(buildListQuery(entityType)),
        ...selectedFields(buildGetByIdQuery(entityType, "1")),
      ]);
      const unresolved = [...fields]
        .map((f) => [f, resolveGaqlField(f)] as const)
        .filter(([, err]) => err !== null);
      expect(unresolved).toEqual([]);
    });
  }

  it("the resolver rejects the v22 campaign date fields (guards the guard)", () => {
    expect(resolveGaqlField("campaign.start_date")).toMatch(/no property "startDate"/);
    expect(resolveGaqlField("campaign.end_date")).toMatch(/no property "endDate"/);
    expect(resolveGaqlField("campaign.start_date_time")).toBeNull();
  });

  it("campaign SELECT uses start_date_time / end_date_time", () => {
    const fields = selectedFields(buildListQuery("campaign"));
    expect(fields).toContain("campaign.start_date_time");
    expect(fields).toContain("campaign.end_date_time");
    expect(fields).not.toContain("campaign.start_date");
    expect(fields).not.toContain("campaign.end_date");
  });

  it("campaign SELECT carries the EU political-advertising declaration (so duplicates keep it)", () => {
    expect(selectedFields(buildListQuery("campaign"))).toContain(
      "campaign.contains_eu_political_advertising"
    );
  });

  it("every GAQL field named anywhere in src/ resolves (descriptions, prompts, resources)", () => {
    const refs = collectGaqlFieldRefs(
      join(HERE, "../../src"),
      new Set(Object.keys(extract.resources))
    );
    expect(refs.size).toBeGreaterThan(50);
    const unresolved = [...refs]
      .filter(([field]) => !NAMED_AS_REMOVED.has(field) && !PLACEHOLDERS.has(field))
      .map(([field, files]) => ({ field, files, error: resolveGaqlField(field) }))
      .filter((r) => r.error !== null);
    expect(unresolved).toEqual([]);
  });

  it("each field named as removed is still absent (drop it from the list once the text goes)", () => {
    for (const field of NAMED_AS_REMOVED) expect(resolveGaqlField(field)).not.toBeNull();
  });
});

/** mutate-JSON `data` keys for an entity type → the Discovery resource schema they must exist on. */
const MUTATE_SCHEMA_BY_ENTITY: Record<string, string> = {
  campaign: "Resources__Campaign",
  campaignBudget: "Resources__CampaignBudget",
  adGroup: "Resources__AdGroup",
};

function unknownDataKeys(entityType: string, data: Record<string, unknown>): string[] {
  const schema = extract.schemas[MUTATE_SCHEMA_BY_ENTITY[entityType]];
  return Object.keys(data).filter((key) => !(key in schema));
}

describe(`documented create payloads use ${VERSION} field names`, () => {
  it("gads_create_entity inputExamples: every data key exists on the resource", () => {
    const checked = createEntityTool.inputExamples.filter(
      (ex) => MUTATE_SCHEMA_BY_ENTITY[ex.input.entityType as string]
    );
    expect(checked.length).toBeGreaterThan(0);
    for (const ex of checked) {
      expect({
        label: ex.label,
        unknown: unknownDataKeys(ex.input.entityType as string, ex.input.data as any),
      }).toEqual({ label: ex.label, unknown: [] });
    }
  });

  it("entity-examples resource: every campaign create payload's data keys exist on Campaign", () => {
    const blocks = [...entityExampleAllResource.getContent().matchAll(/```json\n([\s\S]*?)```/g)]
      .map((m) => {
        try {
          return JSON.parse(m[1]) as { entityType?: string; data?: Record<string, unknown> };
        } catch {
          return undefined;
        }
      })
      .filter((b) => b?.entityType === "campaign" && b.data && "name" in b.data);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(unknownDataKeys("campaign", block!.data!)).toEqual([]);
    }
  });
});
