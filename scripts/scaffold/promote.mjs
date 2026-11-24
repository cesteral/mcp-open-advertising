// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// `pnpm promote:server <key>`: make an experimental server stable, so publish
// and deploy cover it.
//
// It owns two things only: the registry `status` flip and the server's entries
// in the deploy lists (DEPLOY_SITE_FILES). It first checks the entry as stable
// against the whole contract tier (MUSTs and SHOULD exceptions), so a promotion
// can never leave CI red on contract-tiers. It also requires the registry
// `client` block (the credentials the generated Claude Code and Codex configs
// use), because a stable server is published and those configs `npx` it. That proves the contract is
// complete, not that the writes work: wire-request coverage still blocks the
// merge until each write has a wire test. Pure: it writes nothing; applyPlan
// does.
//
// The scaffold's own wording still calls the server experimental after the
// flip (the server.ts description clients see in serverInfo, README,
// CLAUDE.md, package.json). Those files are the contributor's, so promotion
// lists the lines (`stale`) for the CLI to print and never rewrites them.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkClientBlocks } from "../lib/client-configs.mjs";
import { checkContractTiers } from "../lib/contract-tiers.mjs";
import { DEPLOY_SITE_FILES, serverTokens } from "../lib/fleet-inventory.mjs";
import { names } from "./entries.mjs";
import { replaceRegistryEntry } from "./add-writes.mjs";
import { ScaffoldError, format } from "./scaffold.mjs";
import { insertIntoSites } from "./sites.mjs";

/** The package files whose scaffold wording names the server's status. */
export const STATUS_WORDING_FILES = [
  "src/mcp-server/server.ts",
  "README.md",
  "CLAUDE.md",
  "package.json",
];

/**
 * `{ path, line, text }` for each line that still calls the server
 * experimental: in its package's STATUS_WORDING_FILES and its registry
 * description (`line` 0: the field, not a line of registry.json).
 */
export function staleStatusWording(root, entry) {
  const out = [];
  for (const file of STATUS_WORDING_FILES) {
    const path = join("packages", entry.package, file);
    if (!existsSync(join(root, path))) continue;
    readFileSync(join(root, path), "utf8")
      .split("\n")
      .forEach((text, i) => {
        if (/experimental/i.test(text)) out.push({ path, line: i + 1, text: text.trim() });
      });
  }
  if (/experimental/i.test(entry.description ?? "")) {
    out.push({ path: "registry.json", line: 0, text: `description: ${entry.description}` });
  }
  return out;
}

/** Returns `{ writes, created: [], modified, stale }` (see staleStatusWording). */
export async function planPromotion(root, key) {
  const read = (p) => readFileSync(join(root, p), "utf8");
  const registryText = read("registry.json");
  const registry = JSON.parse(registryText);
  const entry = registry.servers.find((s) => s.tool_prefix === key);
  if (!entry) throw new ScaffoldError(`no server with tool_prefix "${key}" in registry.json`);
  if (entry.status === "stable") throw new ScaffoldError(`${entry.package} is already stable`);

  const stable = { ...entry, status: "stable" };
  const violations = [...checkContractTiers({ servers: [stable] }), ...checkClientBlocks([stable])];
  if (violations.length) {
    throw new ScaffoldError(
      `${entry.package} cannot be promoted until it meets its whole contract:\n  ${violations.join("\n  ")}`
    );
  }

  // Promotion adds the deploy entries; one that exists already (secrets added
  // early, a half-finished promotion) would become a duplicate key.
  const listed = DEPLOY_SITE_FILES.filter((f) => serverTokens(read(f)).includes(entry.package));
  if (listed.length) {
    throw new ScaffoldError(
      `${listed.join(", ")} already lists ${entry.package}; remove those entries (promotion adds them) and run it again`
    );
  }

  const site = {
    ...names(key),
    displayName: entry.platform_display_name,
    authMode: entry.auth.modes[0],
    // Only the JWT key: a reference to a secret that does not exist yet fails
    // the deploy, so the platform's credential secrets are added by hand.
    secretEnvVars: {
      MCP_AUTH_SECRET_KEY: { secret_name: "cesteral-jwt-secret-key", version: "latest" },
    },
  };
  const writes = new Map([
    ...(await format(
      new Map([["registry.json", replaceRegistryEntry(registryText, entry.package, stable)]])
    )),
    ...insertIntoSites(read, site, { listing: false }),
  ]);
  return {
    writes,
    created: [],
    modified: [...writes.keys()],
    stale: staleStatusWording(root, entry),
  };
}
