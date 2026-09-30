#!/usr/bin/env tsx
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Writes tests/fixtures/google-ads-discovery-extract.json from Google's
 * Discovery document for the API version pinned in src/config/index.ts.
 *
 * The extract keeps property names and $ref targets only, for:
 *  - every GoogleAdsRow field (the GAQL resources, `metrics`, `segments`);
 *  - the six resources gads-mcp mutates, plus each schema they reference
 *    directly, so create payloads can be checked key by key;
 *  - every schema on the path of a GAQL field named anywhere in src/.
 *
 * Run after bumping the version: `pnpm run extract:discovery`.
 * `--from <file>` reads a saved Discovery document instead of fetching.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import { camelToSnake, collectGaqlFieldRefs, snakeToCamel } from "./lib/gaql-field-refs.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = path.join(PACKAGE_ROOT, "src", "config", "index.ts");
const OUT_PATH = path.join(PACKAGE_ROOT, "tests", "fixtures", "google-ads-discovery-extract.json");

const MUTATED_RESOURCES = [
  "Resources__Campaign",
  "Resources__CampaignBudget",
  "Resources__AdGroup",
  "Resources__AdGroupAd",
  "Resources__AdGroupCriterion",
  "Resources__Asset",
];

interface DiscoveryProperty {
  $ref?: string;
  items?: { $ref?: string };
}
interface DiscoveryDoc {
  version: string;
  revision: string;
  schemas: Record<string, { properties?: Record<string, DiscoveryProperty> }>;
}

async function main(): Promise<void> {
  const config = await fs.readFile(CONFIG_PATH, "utf-8");
  const version = /googleads\.googleapis\.com\/(v\d+)/.exec(config)?.[1];
  if (!version) throw new Error(`No googleads.googleapis.com/vNN default in ${CONFIG_PATH}`);
  const source = `https://googleads.googleapis.com/$discovery/rest?version=${version}`;

  const fromIndex = process.argv.indexOf("--from");
  let text: string;
  if (fromIndex !== -1) {
    text = await fs.readFile(process.argv[fromIndex + 1], "utf-8");
  } else {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`${source}: ${response.status} ${response.statusText}`);
    text = await response.text();
  }
  const doc = JSON.parse(text) as DiscoveryDoc;
  if (doc.version !== version) {
    throw new Error(`Discovery document is ${doc.version}, config pins ${version}`);
  }

  const prefix = `GoogleAdsGoogleads${version.toUpperCase()}`;
  const schemaOf = (name: string) => doc.schemas[`${prefix}${name}`];
  const refOf = (prop: DiscoveryProperty): string | null => {
    const ref = prop.$ref ?? prop.items?.$ref;
    return ref ? ref.slice(prefix.length) : null;
  };
  const propsOf = (name: string) => {
    const schema = schemaOf(name);
    if (!schema) throw new Error(`Schema ${name} is not in the ${version} Discovery document`);
    return schema.properties ?? {};
  };

  const row = propsOf("Services__GoogleAdsRow");
  const resources = Object.fromEntries(
    Object.entries(row)
      .map(([name, prop]) => [camelToSnake(name), refOf(prop)] as const)
      .sort(([a], [b]) => a.localeCompare(b))
  );

  const keep = new Set<string>();
  for (const name of MUTATED_RESOURCES) {
    keep.add(name);
    for (const prop of Object.values(propsOf(name))) {
      const ref = refOf(prop);
      if (ref) keep.add(ref);
    }
  }
  const refs = collectGaqlFieldRefs(
    path.join(PACKAGE_ROOT, "src"),
    new Set(Object.keys(resources))
  );
  for (const field of refs.keys()) {
    const [resource, ...segments] = field.split(".");
    let schema = resources[resource];
    for (const segment of segments) {
      if (!schema || !schemaOf(schema)) break;
      keep.add(schema);
      const prop = propsOf(schema)[snakeToCamel(segment)];
      schema = prop ? refOf(prop) : null;
    }
  }

  const schemas = Object.fromEntries(
    [...keep].sort().map((name) => [
      name,
      Object.fromEntries(
        Object.entries(propsOf(name))
          .map(([prop, def]) => [prop, refOf(def)] as const)
          .sort(([a], [b]) => a.localeCompare(b))
      ),
    ])
  );

  const extract = {
    _provenance: {
      source,
      version,
      revision: doc.revision,
      generatedBy: "packages/gads-mcp/scripts/extract-discovery.ts",
      note: `Property names and $ref targets only (prefix '${prefix}' stripped). 'resources' is every GoogleAdsRow field; 'schemas' covers the six mutated resources and their direct references, plus every schema on the path of a GAQL field named in src/. Regenerate with \`pnpm run extract:discovery\`.`,
    },
    resources,
    schemas,
  };

  const options = (await prettier.resolveConfig(OUT_PATH)) ?? {};
  const formatted = await prettier.format(JSON.stringify(extract), {
    ...options,
    filepath: OUT_PATH,
  });
  await fs.writeFile(OUT_PATH, formatted, "utf-8");
  console.log(
    `${path.relative(PACKAGE_ROOT, OUT_PATH)}: ${version} rev ${doc.revision}, ` +
      `${Object.keys(resources).length} row fields, ${keep.size} schemas, ${refs.size} GAQL fields in src/`
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
