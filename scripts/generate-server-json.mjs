#!/usr/bin/env node

/**
 * Generates official MCP Registry server.json files from the canonical registry.json.
 *
 * Reads registry.json (rich metadata) + each package.json (mcpName, version, npm identifier)
 * and outputs server.json in the official MCP Registry schema format into each package directory.
 *
 * Usage: node scripts/generate-server-json.mjs [--check]
 *   --check   Validate existing server.json files match what would be generated (CI mode)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SCHEMA_URL =
  "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

function loadRegistry() {
  const registryPath = join(ROOT, "registry.json");
  return JSON.parse(readFileSync(registryPath, "utf-8"));
}

function loadPackageJson(packageName) {
  const pkgPath = join(ROOT, "packages", packageName, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`package.json not found: ${pkgPath}`);
  }
  return JSON.parse(readFileSync(pkgPath, "utf-8"));
}

function buildServerJson(serverEntry, packageJson, registry) {
  const serverJson = {
    $schema: SCHEMA_URL,
    name: packageJson.mcpName,
    title: serverEntry.title,
    description: serverEntry.description,
    repository: {
      url: registry.repository,
      source: "github",
    },
    version: packageJson.version,
    remotes: [
      {
        type: "streamable-http",
        url: registry.remoteUrlTemplate,
        variables: {
          host: {
            description: "Hostname of your deployed server instance (e.g., my-dv360-mcp-abc123.run.app)",
            isRequired: true,
          },
        },
      },
    ],
    packages: [
      {
        registryType: "npm",
        identifier: packageJson.name,
        version: packageJson.version,
        transport: {
          type: "stdio",
        },
      },
    ],
  };

  return serverJson;
}

function main() {
  const checkMode = process.argv.includes("--check");
  const registry = loadRegistry();
  let allMatch = true;
  let generated = 0;

  for (const server of registry.servers) {
    const packageJson = loadPackageJson(server.package);

    if (!packageJson.mcpName) {
      console.error(`ERROR: ${server.package}/package.json missing mcpName`);
      process.exit(1);
    }

    const serverJson = buildServerJson(server, packageJson, registry);
    const output = JSON.stringify(serverJson, null, 2) + "\n";
    const outputPath = join(
      ROOT,
      "packages",
      server.package,
      "server.json"
    );

    if (checkMode) {
      if (!existsSync(outputPath)) {
        console.error(`MISSING: ${server.package}/server.json`);
        allMatch = false;
        continue;
      }
      const existing = readFileSync(outputPath, "utf-8");
      if (existing !== output) {
        console.error(
          `STALE: ${server.package}/server.json — run 'node scripts/generate-server-json.mjs' to regenerate`
        );
        allMatch = false;
      }
    } else {
      writeFileSync(outputPath, output);
      generated++;
      console.log(`  ${server.package}/server.json`);
    }
  }

  if (checkMode) {
    if (allMatch) {
      console.log("All server.json files are up to date.");
    } else {
      process.exit(1);
    }
  } else {
    console.log(`\nGenerated ${generated} server.json files.`);
  }
}

main();
