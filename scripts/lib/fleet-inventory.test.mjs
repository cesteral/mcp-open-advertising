// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Fleet inventory completeness (see fleet-inventory.mjs). Static: reads files,
// boots nothing, needs no build, so it fails in seconds on a missed list.

import { describe, expect, it } from "vitest";
import { ROOT } from "./boot-server.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CENSUS,
  DEPLOY_CONSUMERS,
  DEPLOY_SITE_FILES,
  DERIVED,
  INVENTORY_SITES,
  censusShortfalls,
  checkFleetInventory,
  hardcodedServerLists,
  mentionCount,
  readRegistry,
  serverTokens,
} from "./fleet-inventory.mjs";

describe("fleet inventory", () => {
  it("every hand-maintained server list matches registry.json", () => {
    // A failure names the file, the list inside it, and what breaks if the
    // server stays out of it. Add the server there; do not edit this test.
    expect(checkFleetInventory(ROOT)).toEqual([]);
  });

  it("no site is vacuous: an extra registry server is reported missing from every list", () => {
    const registry = readRegistry(ROOT);
    const template = registry.servers[0];
    const fake = {
      ...template,
      package: "zzfake-mcp",
      port: 3999,
      tool_prefix: "zzfake",
      tools: [],
      auth: { modes: ["zzfake-bearer"] },
    };
    const violations = checkFleetInventory(ROOT, {
      ...registry,
      servers: [...registry.servers, fake],
    });

    expect(violations).toContain(
      "registry.json: lists zzfake-mcp, but packages/zzfake-mcp does not exist"
    );
    for (const site of INVENTORY_SITES) {
      // The auth-mode dropdown lists modes; every other site lists packages
      // (the deploy sites expect the stable ones, and the fake is stable).
      const token =
        site.expected && !DEPLOY_SITE_FILES.includes(site.file) ? "zzfake-bearer" : "zzfake-mcp";
      const hits = violations.filter((v) => v.startsWith(`${site.file} [`) && v.includes(token));
      expect(hits.length, `${site.file} never reported ${token}`).toBeGreaterThan(0);
    }
    // The census flags it too, in every censused file.
    for (const [file, decision] of Object.entries(CENSUS)) {
      if (decision !== true) continue;
      expect(
        violations.some((v) => v.startsWith(`${file}: mentions zzfake-mcp on 0 line(s)`)),
        `${file} census never reported zzfake-mcp`
      ).toBe(true);
    }
  });

  it("an experimental server is in every listing site and in no deploy site", () => {
    // Deploy lists cover stable servers only: an experimental server is never
    // built into an image, given a Cloud Run service or published.
    const registry = readRegistry(ROOT);
    const fake = {
      ...registry.servers[0],
      package: "zzexp-mcp",
      port: 3998,
      tool_prefix: "zzexp",
      tools: [],
      status: "experimental",
      auth: { modes: ["zzexp-bearer"] },
    };
    const violations = checkFleetInventory(ROOT, {
      ...registry,
      servers: [...registry.servers, fake],
    });
    for (const file of new Set(INVENTORY_SITES.map((s) => s.file))) {
      const mentions = violations.filter((v) => v.startsWith(file) && v.includes("zzexp"));
      if (DEPLOY_SITE_FILES.includes(file)) {
        expect(mentions, `${file} must not want an experimental server`).toEqual([]);
      } else {
        expect(mentions.length, `${file} must still list an experimental server`).toBeGreaterThan(
          0
        );
      }
    }
  });

  it("an experimental server listed in a deploy site is reported", () => {
    const registry = readRegistry(ROOT);
    const servers = registry.servers.map((s) =>
      s.package === "msads-mcp" ? { ...s, status: "experimental" } : s
    );
    const violations = checkFleetInventory(ROOT, { ...registry, servers });
    for (const file of DEPLOY_SITE_FILES) {
      expect(
        violations.some(
          (v) => v.startsWith(`${file} [`) && v.includes("msads-mcp, which is experimental")
        ),
        file
      ).toBe(true);
    }
  });

  it("every deploy consumer reads the stable list, never the full one", () => {
    for (const file of DEPLOY_CONSUMERS) {
      const text = readFileSync(join(ROOT, file), "utf8");
      expect(text, file).toContain("fleet.mjs deployable");
      expect(text, file).not.toMatch(/fleet\.mjs"? servers/);
    }
    // Terraform reads registry.json itself and filters on status.
    expect(readFileSync(join(ROOT, "terraform/main.tf"), "utf8")).toMatch(
      /fleet_service_names = \[for s in .*registry\.json.*\.servers : s\.package if .*status.*== "stable"\]/
    );
  });

  it("registry port and tool_prefix must agree with the code", () => {
    const registry = readRegistry(ROOT);
    const servers = registry.servers.map((s) =>
      s.package === "msads-mcp" ? { ...s, port: 3001, tool_prefix: "microsoft" } : s
    );
    const violations = checkFleetInventory(ROOT, { ...registry, servers });
    expect(violations).toEqual(
      expect.arrayContaining([
        "registry.json: port 3001 is used by both dbm-mcp and msads-mcp",
        "registry.json msads-mcp: port 3001, but packages/msads-mcp/src/config/index.ts defaults to 3013",
        'registry.json msads-mcp: tool_prefix "microsoft", but its tools share "msads"',
      ])
    );
  });

  it("every derived file still reads the registry", () => {
    for (const { file, reads } of DERIVED) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).toContain(reads);
    }
  });

  it("every inventory file either is censused or records why it cannot be", () => {
    for (const file of new Set(INVENTORY_SITES.map((s) => s.file))) {
      const decision = CENSUS[file];
      expect(decision, file).toBeDefined();
      if (decision !== true) expect(String(decision).length, file).toBeGreaterThan(30);
    }
  });
});

describe("census", () => {
  const packages = ["dbm-mcp", "ttd-mcp", "amazon-dsp-mcp", "meta-mcp"];

  it("counts lines in every spelling, without matching inside other words", () => {
    const text = [
      'module "amazon_dsp_mcp" {',
      "  secret_names = local.amazon_dsp_secret_names",
      "COPY packages/amazon-dsp-mcp/package.json",
      "metadata = {}",
    ].join("\n");
    expect(mentionCount(text, "amazon-dsp-mcp")).toBe(3);
    expect(mentionCount(text, "meta-mcp")).toBe(0);
  });

  it("flags a server missing from a list no site names; extras are harmless", () => {
    const text = [
      "list_a = [dbm-mcp, ttd-mcp, amazon-dsp-mcp, meta-mcp]".replaceAll(", ", "\n"),
      "list_b = [dbm_x, ttd_x, meta_x]".replaceAll(", ", "\n"), // amazon_dsp missing
      "# example: ./dev.sh dbm-mcp", // extra mention
    ].join("\n");
    expect(censusShortfalls(text, packages)).toEqual([
      { pkg: "amazon-dsp-mcp", count: 1, mode: 2 },
    ]);
  });
});

describe("serverTokens", () => {
  it("finds hyphenated package names and ignores non-server words", () => {
    expect(serverTokens('SERVERS=("dbm-mcp" "amazon-dsp-mcp") shared mcp')).toEqual([
      "dbm-mcp",
      "amazon-dsp-mcp",
    ]);
  });
});

describe("hardcodedServerLists", () => {
  it("flags a one-line list and a vertical list, not single mentions", () => {
    const text = [
      "# Usage: ./dev.sh dbm-mcp", // 1: one mention, fine
      'SERVICES="dbm-mcp ttd-mcp"', // 2: one-line list
      "",
      "SERVERS=(",
      "  dbm-mcp", // 5: start of a vertical list
      "  ttd-mcp",
      "  meta-mcp",
      ")",
      'echo "deploying dbm-mcp"', // 9: lone mention
    ].join("\n");
    expect(hardcodedServerLists(text)).toEqual([2, 5]);
  });

  it("finds nothing in a file that reads the registry", () => {
    expect(
      hardcodedServerLists(
        'SERVER_LIST="$(node scripts/fleet.mjs servers)"\nSERVERS=($SERVER_LIST)'
      )
    ).toEqual([]);
  });
});

describe("site extractors", () => {
  const site = (file) => INVENTORY_SITES.find((s) => s.file === file);

  it("cloudbuild: only the static images: entries are a site", () => {
    const text = [
      'SERVICES="$(cat /workspace/.fleet-services)"',
      "images:",
      "  - 'r/dbm-mcp:${SHORT_SHA}'",
      "  - 'r/dbm-mcp:${_ENVIRONMENT}-latest'",
    ].join("\n");
    expect(
      site("cloudbuild.yaml")
        .lists(text)
        .map((l) => l.names)
    ).toEqual([["dbm-mcp"], ["dbm-mcp"]]);
  });

  it("platform-mapping: planned rows do not count as current", () => {
    const text = [
      "## Current Platforms",
      "| Meta | `packages/meta-mcp` | x | Active |",
      "## Planned/Target Platforms",
      "| Reddit | `packages/reddit-mcp` | x |",
    ].join("\n");
    expect(site("docs/guides/platform-mapping.md").lists(text)[0].names).toEqual(["meta-mcp"]);
  });
});
