// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Hermetic check of every default GAQL SELECT field against the pinned API
 * version's schema, taken from Google's own Discovery document.
 *
 * All HTTP in this package's suite is mocked, so nothing else notices a field
 * the API no longer has. That is how `campaign.start_date` / `end_date`
 * (removed in v23 in favour of `start_date_time` / `end_date_time`) shipped:
 * the whole campaign SELECT fails upstream once one field is unrecognized.
 *
 * The fixture is an extract of https://googleads.googleapis.com/$discovery/rest?version=v23
 * (property names only). Regenerate it when the API version is bumped.
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

interface DiscoveryExtract {
  resources: Record<string, string>;
  schemas: Record<string, Record<string, string | null>>;
}

const extract = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../fixtures/google-ads-v23-discovery-extract.json"
    ),
    "utf-8"
  )
) as DiscoveryExtract;

const snakeToCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

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

function selectedFields(query: string): string[] {
  const match = /^SELECT (.+?) FROM /.exec(query);
  if (!match) throw new Error(`not a SELECT: ${query}`);
  return match[1].split(",").map((f) => f.trim());
}

describe("default GAQL SELECT fields exist in the v23 Discovery schema", () => {
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

describe("documented create payloads use v23 field names", () => {
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
