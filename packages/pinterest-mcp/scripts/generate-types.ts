#!/usr/bin/env node
// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Pinterest API v5 Type Generation Script
 * Fetches the official Pinterest API v5 OpenAPI specification
 * and generates TypeScript types using openapi-typescript.
 *
 * Usage:
 *   pnpm run generate
 *
 * Output:
 *   src/generated/types.ts
 */

import { execSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as prettier from "prettier";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..");

const PINTEREST_OPENAPI_URL =
  "https://raw.githubusercontent.com/pinterest/api-description/main/v5/openapi.json";

const GENERATED_DIR = path.join(PACKAGE_ROOT, "src", "generated");
const TEMP_SPEC_PATH = path.join(GENERATED_DIR, "pinterest-openapi-temp.json");
const TYPES_PATH = path.join(GENERATED_DIR, "types.ts");

async function main(): Promise<void> {
  console.log("Fetching Pinterest API v5 OpenAPI spec...");
  console.log(`  URL: ${PINTEREST_OPENAPI_URL}`);

  const response = await fetch(PINTEREST_OPENAPI_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Pinterest OpenAPI spec: ${response.status} ${response.statusText}`
    );
  }

  const spec = await response.text();

  // Validate it's a JSON OpenAPI 3.0 spec before proceeding
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(spec) as Record<string, unknown>;
  } catch {
    throw new Error(
      "Pinterest OpenAPI spec is not valid JSON. If the spec format has changed to YAML, update this script."
    );
  }

  const openapiVersion = parsed.openapi as string | undefined;
  if (!openapiVersion?.startsWith("3.")) {
    throw new Error(`Not an OpenAPI 3.0 spec: openapi=${openapiVersion ?? "(missing)"}`);
  }

  const infoVersion = (parsed.info as Record<string, unknown>)?.version as string | undefined;
  console.log(
    `  Spec version: Pinterest REST API ${infoVersion ?? "(unknown)"} (OpenAPI ${openapiVersion})`
  );

  await fs.mkdir(GENERATED_DIR, { recursive: true });
  await fs.writeFile(TEMP_SPEC_PATH, spec, "utf-8");
  console.log(`  Temp spec saved to: ${TEMP_SPEC_PATH}`);

  console.log("Generating TypeScript types with openapi-typescript...");
  execSync(`npx openapi-typescript "${TEMP_SPEC_PATH}" -o "${TYPES_PATH}"`, {
    cwd: PACKAGE_ROOT,
    stdio: "inherit",
  });

  await fs.unlink(TEMP_SPEC_PATH);
  console.log(`  Temp spec removed.`);

  // src/generated/ is in .prettierignore because generators emit unformatted
  // code, so a formatted commit would be undone by the next regeneration. This
  // generator formats at emit time instead (with the repo's prettier config),
  // so `pnpm run generate` reproduces the committed file and a regeneration's
  // diff shows spec changes rather than whitespace.
  const generated = await fs.readFile(TYPES_PATH, "utf-8");
  const header = `// Generated from the Pinterest REST API OpenAPI spec, info.version ${infoVersion ?? "(unknown)"}.\n// Regenerate with \`pnpm run generate\`.\n`;
  const prettierConfig = (await prettier.resolveConfig(TYPES_PATH)) ?? {};
  const formatted = await prettier.format(header + generated, {
    ...prettierConfig,
    filepath: TYPES_PATH,
  });
  await fs.writeFile(TYPES_PATH, formatted, "utf-8");
  console.log(`  Formatted with prettier.`);

  console.log(`\nDone! Types written to: src/generated/types.ts`);
}

main().catch((err: unknown) => {
  console.error("Type generation failed:", err);
  process.exit(1);
});
