// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

import { describe, expect, it } from "vitest";
import {
  CONFIG_LINES,
  SHADOWED,
  TEMPLATE_DIR,
  TEMPLATE_TOOLS,
  TEMPLATE_TYPES,
  layerFiles,
  renderTemplate,
} from "./render.mjs";
import { currentRender, readFixture } from "./render-fixture.mjs";

const vars = {
  key: "foo_bar",
  package: "foo-bar-mcp",
  Pascal: "FooBar",
  ENV: "FOO_BAR",
  displayName: "Foo Bar Ads",
  port: "3014",
  baseUrl: "https://api.foobar.example",
  docsUrl: "https://developers.foobar.example/docs",
  rateLimitPerMinute: "25",
};

// The stubbed variant (`--with-writes`); most assertions below hold for it.
const rendered = renderTemplate(TEMPLATE_DIR, "management", vars, { writes: true });
// The default: an experimental, read-only server.
const readOnly = renderTemplate(TEMPLATE_DIR, "management", vars);
const WRITE_TOOLS = ["create_entity", "update_entity", "delete_entity", "bulk_update_status"].map(
  (t) => `foo_bar_${t}`
);

describe("scaffold: template layers", () => {
  it("the management render matches the checked-in fixture", () => {
    // A template change shows as a diff of fixtures/management-render.json:
    // run `node scripts/scaffold/render-fixture.mjs --update` and review it.
    expect(currentRender()).toEqual(readFixture());
  });

  it("no type layer shadows an earlier layer's file unless SHADOWED says why", () => {
    for (const [type, { layers }] of Object.entries(TEMPLATE_TYPES)) {
      const seen = new Map();
      for (const layer of layers) {
        for (const path of layerFiles(TEMPLATE_DIR, layer)) {
          if (seen.has(path)) {
            expect(
              SHADOWED,
              `${type}: ${layer} shadows ${seen.get(path)}'s ${path}`
            ).toHaveProperty(path);
          }
          seen.set(path, layer);
        }
      }
    }
  });

  it("an unknown type throws", () => {
    expect(() => renderTemplate(TEMPLATE_DIR, "bogus", vars)).toThrow(
      /unknown server type "bogus"/
    );
  });
});

describe("scaffold: management template", () => {
  it("renders every file with no placeholder left", () => {
    expect(rendered.size).toBeGreaterThan(20);
    for (const [path, text] of rendered) {
      expect(path).not.toContain("{{");
      expect(text, path).not.toContain("{{");
    }
  });

  it("the read-only render has no write tool, no manifest wiring and no section marker", () => {
    for (const [path, text] of readOnly) {
      expect(text, path).not.toContain("{{");
      for (const tool of WRITE_TOOLS) expect(text, `${path} names ${tool}`).not.toContain(tool);
    }
    // The pattern definition-hash-resolver-coverage.test.ts forbids on an ungoverned server.
    expect(readOnly.get("src/mcp-server/server.ts")).not.toMatch(/manifestUrl:\s*new URL\(/);
    expect(
      [...readOnly.keys()].filter(
        (p) =>
          p.endsWith("-entity.tool.ts") &&
          !p.includes("get-") &&
          !p.includes("list-") &&
          !p.includes("validate-")
      )
    ).toEqual([]);
    expect(readOnly.has("src/mcp-server/tools/utils/not-implemented.ts")).toBe(false);
  });

  it("the stubbed render wires the manifest and names every write tool", () => {
    expect(rendered.get("src/mcp-server/server.ts")).toMatch(/manifestUrl: new URL/);
    const all = [...rendered.values()].join("\n");
    for (const tool of WRITE_TOOLS) expect(all).toContain(tool);
  });

  it("TEMPLATE_TOOLS without writes matches the read-only barrel", () => {
    const names = new Set(["foo_bar_search_tools"]);
    for (const [path, text] of readOnly) {
      if (!path.startsWith("src/mcp-server/tools/definitions/")) continue;
      for (const m of text.matchAll(/(?:TOOL_NAME =|toolName:) "([a-z0-9_]+)"/g)) names.add(m[1]);
    }
    expect([...names].sort()).toEqual([...TEMPLATE_TOOLS("foo_bar")].sort());
  });

  it("paths use the key", () => {
    expect(rendered.has("src/auth/foo_bar-auth-adapter.ts")).toBe(true);
    expect(rendered.has("src/services/foo_bar/foo_bar-http-client.ts")).toBe(true);
  });

  it("an unknown placeholder is an error, not left in the output", () => {
    const { displayName: _omit, ...partial } = vars;
    expect(() => renderTemplate(TEMPLATE_DIR, "management", partial, { writes: true })).toThrow(
      /\{\{displayName\}\}/
    );
  });

  it("CONFIG_LINES point at the values", () => {
    const lines = rendered.get("src/config/index.ts").split("\n");
    expect(lines[CONFIG_LINES.baseUrl - 1]).toContain("https://api.foobar.example");
    expect(lines[CONFIG_LINES.rateLimit - 1]).toContain("default(25)");
  });

  it("the account header the adapter reads is the one clients are told to send", () => {
    // A multi-word key once read `x-foo_bar-account-id` while CORS, docs and
    // errors said X-FooBar-Account-Id, so every bearer session failed.
    const adapter = rendered.get("src/auth/foo_bar-auth-adapter.ts");
    const transport = rendered.get("src/mcp-server/transports/streamable-http-transport.ts");
    const read = adapter.match(/extractHeader\(headers, "(x-[^"]*account-id)"\)/i)?.[1];
    expect(read).toBe("X-FooBar-Account-Id");
    expect(transport).toContain(`"${read}"`);
  });

  it("rate-limit buckets are scoped to the credential, never to a caller-named account alone", () => {
    // #237: a bucket keyed only on the account id (or a fixed key) is shared
    // across tenants, so one tenant can drain another's quota.
    const service = rendered.get("src/services/foo_bar/foo_bar-service.ts");
    const keys = [...service.matchAll(/consume\(\s*(`[^`]*`|"[^"]*")/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(key, key).toMatch(/^`foo_bar:user:\$\{[^}]+\}/);
  });

  it("server.ts uses createPlatformMcpServer with the literals the fleet checks read", () => {
    // platform-keys reads `platform: "<key>"` and the definition-hash resolver
    // coverage reads `manifestUrl: new URL(...)` from server.ts as source text.
    const server = rendered.get("src/mcp-server/server.ts");
    expect(server).toContain("createPlatformMcpServer(");
    expect(server).toMatch(/^\s+platform: "foo_bar",$/m);
    expect(server).toMatch(
      /^\s+manifestUrl: new URL\("\.\.\/cesteral-manifest\.json", import\.meta\.url\),$/m
    );
  });

  it("the package runs the fleet's shared test suites", () => {
    for (const [file, suite] of [
      ["tests/schema-size.test.ts", "describeSchemaSizeGuard"],
      ["tests/cross-server-contract.test.ts", "describeCrossServerContract"],
      ["tests/integration/server-card.test.ts", "describeServerCard"],
    ]) {
      expect(rendered.get(file) ?? "", file).toContain(suite);
    }
  });

  it("TEMPLATE_TOOLS matches the rendered tool barrel", () => {
    // A Set: write tools also name their read partner with `toolName:`.
    const names = new Set();
    for (const [path, text] of rendered) {
      if (!path.startsWith("src/mcp-server/tools/definitions/")) continue;
      for (const m of text.matchAll(/(?:TOOL_NAME =|toolName:) "([a-z0-9_]+)"/g)) names.add(m[1]);
    }
    names.add("foo_bar_search_tools");
    expect([...names].sort()).toEqual([...TEMPLATE_TOOLS("foo_bar", { writes: true })].sort());
  });
});
