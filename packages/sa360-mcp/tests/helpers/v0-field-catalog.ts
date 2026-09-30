// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Resolves SA360 query-language field paths against the pinned Reporting API
 * v0 schema (`src/generated/openapi.json`, generated from the v0 Discovery
 * document). Used by tests to prove every field the package puts in a query,
 * or advertises in a catalog, actually exists on `SearchAds360Row`.
 *
 * `ad_group.campaign` → row.adGroup ($ref AdGroup) → AdGroup.campaign (absent) → invalid.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

type JsonSchema = {
  $ref?: string;
  type?: string;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
};

const here = dirname(fileURLToPath(import.meta.url));
const openapi = JSON.parse(
  readFileSync(resolve(here, "../../src/generated/openapi.json"), "utf8")
) as { components: { schemas: Record<string, JsonSchema> } };

const schemas = openapi.components.schemas;
const ROW = schemas["GoogleAdsSearchads360V0Services__SearchAds360Row"];
if (!ROW?.properties) throw new Error("SearchAds360Row missing from generated/openapi.json");

function snakeToCamel(segment: string): string {
  return segment.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function deref(schema: JsonSchema): JsonSchema {
  let s = schema.items ?? schema;
  if (s.$ref) {
    const name = s.$ref.replace("#/components/schemas/", "");
    s = schemas[name] ?? {};
  }
  return s;
}

/** Row resources selectable in FROM / as a field prefix (snake_case). */
export function isV0RowResource(resource: string): boolean {
  return Object.prototype.hasOwnProperty.call(ROW.properties, snakeToCamel(resource));
}

/** True when `field` (e.g. "ad_group_criterion.keyword.text") exists on v0 SearchAds360Row. */
export function isV0Field(field: string): boolean {
  let current: JsonSchema = ROW;
  for (const segment of field.split(".")) {
    const props = current.properties;
    const key = snakeToCamel(segment);
    if (!props || !Object.prototype.hasOwnProperty.call(props, key)) return false;
    current = deref(props[key]);
  }
  return true;
}

/** Extract `resource.field[.sub]` identifiers from a SELECT/WHERE/ORDER BY query string. */
export function extractQueryFields(query: string): string[] {
  const withoutLiterals = query.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  return [...new Set(withoutLiterals.match(/\b[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)+/g) ?? [])];
}

/** Extract the FROM resource of a query. */
export function extractFromResource(query: string): string | undefined {
  return /\bFROM\s+([a-z_][a-z0-9_]*)/i.exec(query)?.[1];
}
