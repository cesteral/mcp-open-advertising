#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { V1_SCHEMA_EXTRACTION_CONFIG } from "../config/v1-schema-extraction.config.js";
import { filterSpecByOperationIds } from "./lib/filter-spec.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..");

async function main(): Promise<void> {
  const cfg = V1_SCHEMA_EXTRACTION_CONFIG;
  const specPath = path.resolve(PACKAGE_ROOT, cfg.inputSpecPath);

  let raw: string;
  try {
    raw = await fs.readFile(specPath, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `OpenAPI spec not found at ${cfg.inputSpecPath}.\n` +
          `This file is gitignored — place a copy of the Amazon Ads API v1 spec there before running this generator.\n` +
          `See docs/plans/2026-05-28-amazon-dsp-v1-commitments-design.md §5.\n` +
          `Note: this generator is contributor-only and is NOT run by CI; CI builds against the committed src/generated/v1/* output.`
      );
    }
    throw e;
  }

  const fullSpec = JSON.parse(raw);
  const filtered = filterSpecByOperationIds(fullSpec, cfg.rootOperations);

  const filteredAbs = path.resolve(PACKAGE_ROOT, cfg.output.filteredSpecPath);
  await fs.mkdir(path.dirname(filteredAbs), { recursive: true });
  await fs.writeFile(filteredAbs, JSON.stringify(filtered, null, 2), "utf-8");

  const schemaCount = Object.keys(filtered.components.schemas).length;
  const pathCount = Object.keys(filtered.paths).length;
  console.log(
    `Filtered spec: ${pathCount} paths, ${schemaCount} schemas (from ${
      Object.keys(fullSpec.components.schemas).length
    })`
  );

  const typesAbs = path.resolve(PACKAGE_ROOT, cfg.output.typesPath);
  const zodAbs = path.resolve(PACKAGE_ROOT, cfg.output.zodPath);
  await fs.mkdir(path.dirname(typesAbs), { recursive: true });
  await fs.mkdir(path.dirname(zodAbs), { recursive: true });

  execSync(`pnpm exec openapi-typescript "${filteredAbs}" -o "${typesAbs}"`, {
    cwd: PACKAGE_ROOT,
    stdio: "inherit",
  });

  execSync(`pnpm exec openapi-zod-client "${filteredAbs}" -o "${zodAbs}" --export-schemas`, {
    cwd: PACKAGE_ROOT,
    stdio: "inherit",
  });

  // Post-process the openapi-zod-client output. Three transforms:
  // 1. Drop the `@zodios/core` import — we are not shipping the Zodios runtime.
  // 2. Drop everything from `const endpoints = makeApi(...)` onward (endpoints,
  //    `export const api`, `createApiClient`) — same reason. This avoids a
  //    runtime dependency on @zodios/core and stops the compiler from trying
  //    to serialize the huge inferred types of that runtime.
  // 3. Drop the `export const schemas = { ... }` bag and instead promote every
  //    top-level `const X = z…` to `export const X = z…`. The bag forces TS to
  //    serialize the tuple of all 229 schemas in one declaration, which trips
  //    TS7056 "inferred type too large to serialize" under composite/declaration.
  //    Per-schema exports stay small enough for TS to infer individually.
  let zodSource = await fs.readFile(zodAbs, "utf-8");

  zodSource = zodSource.replace(
    /^import\s*\{\s*makeApi,\s*Zodios,\s*type\s+ZodiosOptions\s*\}\s*from\s*"@zodios\/core";\s*\n/m,
    ""
  );

  const endpointsIdx = zodSource.indexOf("\nconst endpoints = makeApi(");
  if (endpointsIdx === -1) {
    throw new Error(
      `Post-processing failed: could not locate \`const endpoints = makeApi(\` in ${cfg.output.zodPath}.\n` +
        `openapi-zod-client output shape may have changed.`
    );
  }
  zodSource = `${zodSource.slice(0, endpointsIdx).trimEnd()}\n`;

  const schemasBagMatch = zodSource.match(/\n\s*export const schemas = \{[\s\S]*?\n\};\s*$/);
  if (!schemasBagMatch) {
    throw new Error(
      `Post-processing failed: could not locate \`export const schemas = { ... };\` bag in ${cfg.output.zodPath}.\n` +
        `openapi-zod-client output shape may have changed.`
    );
  }
  zodSource = zodSource.slice(0, schemasBagMatch.index).trimEnd() + "\n";

  // Per-schema export + `z.ZodTypeAny` annotation. Two things at once:
  //   `^const Foo = `         → `^export const Foo: z.ZodTypeAny = `
  // The `z.ZodTypeAny` annotation stops TypeScript from trying to infer the
  // full schema type at the declaration site, which would otherwise trip
  // TS7056 on the deeply-nested forecast/spend schemas under declaration
  // emission. Precise types are reconstituted in the hand-written shim at
  // src/services/amazon-dsp/v1-schemas.ts via `as z.ZodType<...>` casts that
  // pair each schema with its openapi-typescript-emitted interface.
  zodSource = zodSource.replace(
    /^const ([A-Za-z_$][A-Za-z0-9_$]*) = /gm,
    "export const $1: z.ZodTypeAny = "
  );

  await fs.writeFile(zodAbs, zodSource, "utf-8");

  console.log(
    `Generated: ${cfg.output.typesPath}, ${cfg.output.zodPath} (zodios runtime stripped, per-schema exports)`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
