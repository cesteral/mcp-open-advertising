// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// `pnpm promote:server <key>`: make an experimental server stable, so publish
// and deploy cover it.
//
// It owns two things only: the registry `status` flip and the server's entries
// in the deploy lists (DEPLOY_SITE_FILES). It first checks the entry as stable
// against the whole contract tier (MUSTs and SHOULD exceptions), so a promotion
// can never leave CI red on contract-tiers. That proves the contract is
// complete, not that the writes work: wire-request coverage still blocks the
// merge until each write has a wire test. Pure: it writes nothing; applyPlan
// does.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkContractTiers } from "../lib/contract-tiers.mjs";
import { names } from "./entries.mjs";
import { replaceRegistryEntry } from "./add-writes.mjs";
import { ScaffoldError, format } from "./scaffold.mjs";
import { insertIntoSites } from "./sites.mjs";

/** Returns `{ writes, created: [], modified }`. */
export async function planPromotion(root, key) {
  const read = (p) => readFileSync(join(root, p), "utf8");
  const registryText = read("registry.json");
  const registry = JSON.parse(registryText);
  const entry = registry.servers.find((s) => s.tool_prefix === key);
  if (!entry) throw new ScaffoldError(`no server with tool_prefix "${key}" in registry.json`);
  if (entry.status === "stable") throw new ScaffoldError(`${entry.package} is already stable`);

  const stable = { ...entry, status: "stable" };
  const violations = checkContractTiers({ servers: [stable] });
  if (violations.length) {
    throw new ScaffoldError(
      `${entry.package} cannot be promoted until it meets its whole contract:\n  ${violations.join("\n  ")}`
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
  return { writes, created: [], modified: [...writes.keys()] };
}
