// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// One platform key per server (see platform-keys.mjs). The per-server half
// boots each built server and reads its real tools/list, so the annotations
// checked are the ones a client and the governance layer receive.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withServerClient, listRawTools, ROOT } from "./boot-server.mjs";
import { checkGovernedTools, checkRegistryKeys } from "./platform-keys.mjs";

const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));

const governed = (name, platform, slug) => ({
  name,
  annotations: { cesteral: { platform, contractPlatformSlug: slug } },
});

describe("platform keys: registry", () => {
  it("every platform_key is valid, unique, and equal to the tool prefix unless recorded", () => {
    expect(checkRegistryKeys(registry)).toEqual([]);
  });

  it("a new server whose key differs from its prefix fails", () => {
    const v = checkRegistryKeys({
      servers: [{ package: "reddit-mcp", platform_key: "reddit_ads", tool_prefix: "reddit" }],
    });
    expect(v).toContain(
      'reddit-mcp: platform_key "reddit_ads" must equal tool_prefix "reddit" (one key everywhere)'
    );
  });

  it("a legacy entry whose mismatch is gone fails, so the list only shrinks", () => {
    const v = checkRegistryKeys({
      servers: [{ package: "gads-mcp", platform_key: "gads", tool_prefix: "gads" }],
    });
    expect(v).toContain("gads-mcp: KEY_DIFFERS_FROM_PREFIX entry is no longer needed; remove it");
  });

  it("two servers cannot share a key", () => {
    const v = checkRegistryKeys({
      servers: [
        { package: "a-mcp", platform_key: "x", tool_prefix: "x" },
        { package: "b-mcp", platform_key: "x", tool_prefix: "x" },
      ],
    });
    expect(v).toContain('platform_key "x" is used by both a-mcp and b-mcp');
  });
});

describe("platform keys: governed tools carry the key", () => {
  // One test per server, like the other boot-based checks: a server's cold
  // boot can take seconds on a loaded machine.
  it.each(registry.servers.map((s) => [s.package, s]))(
    "%s",
    async (_pkg, server) => {
      const tools = await withServerClient(server.package, listRawTools);
      expect(checkGovernedTools(server, tools)).toEqual([]);
    },
    60_000
  );

  it("a governed tool with another slug or platform fails", () => {
    const server = { package: "reddit-mcp", platform_key: "reddit" };
    expect(
      checkGovernedTools(server, [governed("reddit_update_entity", "reddit_ads", "reddit_ads")])
    ).toEqual([
      'reddit_update_entity: contractPlatformSlug "reddit_ads" must equal reddit-mcp\'s platform_key "reddit"',
      'reddit_update_entity: cesteral.platform "reddit_ads" must equal reddit-mcp\'s platform_key "reddit"',
    ]);
  });

  it("a legacy annotation entry no tool needs any more fails", () => {
    const server = { package: "meta-mcp", platform_key: "meta" };
    expect(checkGovernedTools(server, [governed("meta_update_entity", "meta", "meta")])).toEqual([
      "meta-mcp: ANNOTATION_PLATFORM_DIFFERS entry is no longer needed; remove it",
    ]);
  });
});
