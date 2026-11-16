// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkRegistryKeys } from "../lib/platform-keys.mjs";
import { checkContractTiers } from "../lib/contract-tiers.mjs";
import { validateLedger } from "../check/check-platform-facts.mjs";
import { buildPlatformFacts, buildRegistryEntry, names, nextFreePort } from "./entries.mjs";

const ROOT = join(import.meta.dirname, "../..");
const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));
const ledger = JSON.parse(readFileSync(join(ROOT, "platform-facts.json"), "utf8"));

const opts = {
  key: "foo_bar",
  displayName: "Foo Bar Ads",
  type: "management",
  baseUrl: "https://api.foobar.example",
  docsUrl: "https://developers.foobar.example/docs",
  rateLimitPerMinute: 25,
};

// The template's tool list (Task 3 exports it as TEMPLATE_TOOLS; Task 4 wires it).
const tools = [
  "list_entities",
  "get_entity",
  "create_entity",
  "update_entity",
  "delete_entity",
  "bulk_update_status",
  "validate_entity",
  "get_pacing_status",
  "search_tools",
].map((t) => `foo_bar_${t}`);

const configLines = { baseUrl: 26, rateLimit: 31 };

describe("scaffold: names, registry entry, platform facts", () => {
  it("names() spells the key every way the fleet uses it", () => {
    expect(names("foo_bar")).toEqual({
      key: "foo_bar",
      package: "foo-bar-mcp",
      Pascal: "FooBar",
      ENV: "FOO_BAR",
    });
  });

  it("nextFreePort is one past the highest registry port", () => {
    expect(nextFreePort(registry)).toBe(3014);
  });

  it("the registry entry passes the platform-key and contract-tier checks", () => {
    const entry = buildRegistryEntry({ ...opts, writes: true }, registry, tools);
    const withEntry = { ...registry, servers: [...registry.servers, entry] };
    expect(checkRegistryKeys(withEntry)).toEqual([]);
    expect(checkContractTiers(withEntry)).toEqual([]);
    expect(entry).toMatchObject({
      package: "foo-bar-mcp",
      port: 3014,
      tool_prefix: "foo_bar",
      platform_key: "foo_bar",
      type: "management",
      governed: true,
      auth: { modes: ["foo_bar-bearer", "jwt", "none"] },
      untrustedContent: { pathReporting: "per-response" },
    });
    expect(entry.operational.terminalOperations.map((o) => o.tool)).toEqual([
      "foo_bar_delete_entity",
    ]);
  });

  it("the registry entry has every field the existing entries have", () => {
    const entry = buildRegistryEntry({ ...opts, writes: true }, registry, tools);
    const fields = new Set(registry.servers.flatMap((s) => Object.keys(s)));
    expect([...fields].filter((f) => !(f in entry))).toEqual([]);
  });

  it("a read-only entry is experimental and ungoverned, with exceptions for every missing SHOULD", () => {
    const readTools = tools.filter(
      (t) => !/_(create|update|delete)_entity$|_bulk_update_status$/.test(t)
    );
    const entry = buildRegistryEntry(opts, registry, readTools);
    expect(entry).toMatchObject({ status: "experimental", governed: false });
    expect(entry.operational.terminalOperations).toEqual([]);
    expect(entry.contract.exceptions.map((e) => e.requirement).sort()).toEqual(
      ["account_discovery", "bid_adjustment", "duplicate_entity", "reporting"].sort()
    );
    const withEntry = { ...registry, servers: [...registry.servers, entry] };
    expect(checkContractTiers(withEntry)).toEqual([]);
  });

  it("an entry with write stubs is experimental and governed, its delete terminal", () => {
    const entry = buildRegistryEntry({ ...opts, writes: true }, registry, tools);
    expect(entry).toMatchObject({ status: "experimental", governed: true });
    expect(entry.operational.terminalOperations.map((o) => o.tool)).toEqual([
      "foo_bar_delete_entity",
    ]);
  });

  it("an explicit port is kept", () => {
    expect(buildRegistryEntry({ ...opts, port: 3050 }, registry, tools).port).toBe(3050);
  });

  it("platform facts carry a 180-day deadline and pass the ledger validator", () => {
    const facts = buildPlatformFacts(opts, "2026-11-15", configLines);
    expect(facts.map((f) => f.id)).toEqual(["foo_bar.api_base", "foo_bar.rate_limit_default"]);
    expect(facts[0].verifyBy).toBe("2027-05-14");
    expect(facts[1].value).toBe("default(25)");
    expect(facts.map((f) => f.codeRefs)).toEqual([
      ["packages/foo-bar-mcp/src/config/index.ts:26"],
      ["packages/foo-bar-mcp/src/config/index.ts:31"],
    ]);
    expect(validateLedger({ ...ledger, facts: [...ledger.facts, ...facts] })).toEqual([]);
  });
});
