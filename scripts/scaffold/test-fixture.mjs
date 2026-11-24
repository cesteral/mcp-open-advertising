// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Test helper: a throwaway repo root holding the files the scaffold reads and
// edits, so new:server, --add-write-stubs and promote:server run without
// touching the checkout. Imported by the scaffold's *.test.mjs files only.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DERIVED, INVENTORY_SITES } from "../lib/fleet-inventory.mjs";

export const ROOT = join(import.meta.dirname, "../..");
export const TODAY = "2026-11-15";

export const SCAFFOLD_OPTS = {
  key: "foo_bar",
  displayName: "Foo Bar Ads",
  type: "management",
  baseUrl: "https://api.foobar.example",
  docsUrl: "https://developers.foobar.example/docs",
  rateLimitPerMinute: 25,
};

export const COPIED = [
  "registry.json",
  "platform-facts.json",
  "README.md",
  "LICENSE.md",
  "docs/architecture/platform-facts-ledger.md",
  // The reporting platform enums checkPlatformNames holds to the registry.
  "packages/shared/src/utils/reporting/report-errors.ts",
  "packages/shared/src/schemas/report-schedule.ts",
  ...new Set(INVENTORY_SITES.map((s) => s.file)),
  ...DERIVED.map((d) => d.file),
];

/** A temp root with COPIED plus every package's config (the inventory reads ports). */
export function makeTempRepo() {
  const tmp = mkdtempSync(join(tmpdir(), "scaffold-"));
  for (const file of new Set(COPIED)) {
    mkdirSync(dirname(join(tmp, file)), { recursive: true });
    cpSync(join(ROOT, file), join(tmp, file));
  }
  const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));
  for (const { package: pkg } of registry.servers) {
    for (const file of ["src/config/index.ts", "src/mcp-server/server.ts"]) {
      const path = `packages/${pkg}/${file}`;
      mkdirSync(dirname(join(tmp, path)), { recursive: true });
      cpSync(join(ROOT, path), join(tmp, path));
    }
  }
  return tmp;
}

/** Every file under `dir`, relative to it, with its text. */
export function filesUnder(dir, base = dir, out = new Map()) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) filesUnder(abs, base, out);
    else out.set(abs.slice(base.length + 1), readFileSync(abs, "utf8"));
  }
  return out;
}

/**
 * Gives the scaffolded server (by `tool_prefix`) the `client` block promotion
 * requires. A scaffold has none on purpose: it is never published, and the
 * credentials are the contributor's to write.
 */
export function addClientBlock(root, key) {
  const path = join(root, "registry.json");
  const registry = JSON.parse(readFileSync(path, "utf8"));
  const entry = registry.servers.find((s) => s.tool_prefix === key);
  entry.client = {
    stdio: {
      env: [
        {
          name: "FOO_BAR_ACCESS_TOKEN",
          requirement: "required",
          secret: true,
          description: "Foo Bar API access token.",
        },
      ],
    },
    http: {
      headers: [
        {
          name: "Authorization",
          requirement: "required",
          env: "FOO_BAR_ACCESS_TOKEN",
          prefix: "Bearer ",
          description: "Foo Bar access token.",
        },
      ],
    },
  };
  writeFileSync(path, JSON.stringify(registry, null, 2) + "\n");
}
