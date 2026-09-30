// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Finds every GAQL field this package names in its source: default SELECTs,
 * tool descriptions and examples, prompts, and resources.
 *
 * Used twice, so the two can never disagree: `extract-discovery.ts` keeps the
 * schemas these fields pass through, and `gaql-fields-discovery.test.ts`
 * resolves each field against that extract. A field is `resource.field[.sub]`
 * whose first segment is a GoogleAdsRow field (a GAQL resource, `metrics` or
 * `segments`), so prose and import paths such as `metrics.js` are skipped.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const FIELD_PATTERN = /\b([a-z][a-z0-9_]*)((?:\.[a-z][a-z0-9_]*)+)\b/g;
const FILE_EXTENSIONS = new Set(["js", "ts", "json", "md"]);

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

/**
 * @param srcDir directory to scan (recursively, `.ts` files)
 * @param rowResources GoogleAdsRow field names in snake_case
 * @returns field → the files (relative to srcDir) that name it
 */
export function collectGaqlFieldRefs(
  srcDir: string,
  rowResources: ReadonlySet<string>
): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  for (const file of listSourceFiles(srcDir)) {
    const text = readFileSync(file, "utf-8");
    for (const match of text.matchAll(FIELD_PATTERN)) {
      const [field, resource, rest] = match;
      if (!rowResources.has(resource)) continue;
      const last = rest.slice(rest.lastIndexOf(".") + 1);
      if (FILE_EXTENSIONS.has(last)) continue;
      const files = refs.get(field) ?? [];
      const rel = relative(srcDir, file);
      if (!files.includes(rel)) files.push(rel);
      refs.set(field, files);
    }
  }
  return refs;
}

export const camelToSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
export const snakeToCamel = (s: string) =>
  s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
