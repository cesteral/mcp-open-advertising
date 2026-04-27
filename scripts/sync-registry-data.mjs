#!/usr/bin/env node

/**
 * Generates packages/shared/src/utils/registry-data.generated.ts from registry.json.
 *
 * The generated module bundles registry metadata into @cesteral/shared so
 * runtime code (server-card endpoint, CLI, etc.) can derive title and
 * supported auth modes from a single source of truth.
 *
 * Run automatically as a prebuild step; safe to run any time after editing
 * registry.json.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REGISTRY_PATH = join(ROOT, "registry.json");
const OUT_PATH = join(ROOT, "packages/shared/src/utils/registry-data.generated.ts");

const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));

const slim = {
  protocol_version: registry.protocol_version,
  servers: registry.servers.map((s) => ({
    package: s.package,
    title: s.title,
    description: s.description,
    runtime_description: s.runtime_description,
    platform: s.platform,
    platform_display_name: s.platform_display_name,
    documentation_url: s.documentation_url,
    auth: { modes: s.auth.modes },
  })),
};

const banner = `// AUTO-GENERATED from registry.json by scripts/sync-registry-data.mjs.
// Do not edit by hand — re-run \`pnpm sync-registry-data\` after editing registry.json.
`;

const body = `export interface RegistryServerEntry {
  readonly package: string;
  readonly title: string;
  readonly description: string;
  readonly runtime_description: string;
  readonly platform: string;
  readonly platform_display_name: string;
  readonly documentation_url: string;
  readonly auth: { readonly modes: readonly string[] };
}

export interface RegistryData {
  readonly protocol_version: string;
  readonly servers: readonly RegistryServerEntry[];
}

export const REGISTRY_DATA: RegistryData = ${JSON.stringify(slim, null, 2)} as const;
`;

writeFileSync(OUT_PATH, banner + "\n" + body);
console.log(`Wrote ${OUT_PATH}`);
