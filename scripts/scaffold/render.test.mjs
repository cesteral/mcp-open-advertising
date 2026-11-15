// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { CONFIG_LINES, TEMPLATE_DIR, TEMPLATE_TOOLS, renderTemplate } from "./render.mjs";

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

const rendered = renderTemplate(join(TEMPLATE_DIR, "management"), vars);

describe("scaffold: management template", () => {
  it("renders every file with no placeholder left", () => {
    expect(rendered.size).toBeGreaterThan(20);
    for (const [path, text] of rendered) {
      expect(path).not.toContain("{{");
      expect(text, path).not.toContain("{{");
    }
  });

  it("paths use the key", () => {
    expect(rendered.has("src/auth/foo_bar-auth-adapter.ts")).toBe(true);
    expect(rendered.has("src/services/foo_bar/foo_bar-http-client.ts")).toBe(true);
  });

  it("an unknown placeholder is an error, not left in the output", () => {
    const { displayName: _omit, ...partial } = vars;
    expect(() => renderTemplate(join(TEMPLATE_DIR, "management"), partial)).toThrow(
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

  it("TEMPLATE_TOOLS matches the rendered tool barrel", () => {
    // A Set: write tools also name their read partner with `toolName:`.
    const names = new Set();
    for (const [path, text] of rendered) {
      if (!path.startsWith("src/mcp-server/tools/definitions/")) continue;
      for (const m of text.matchAll(/(?:TOOL_NAME =|toolName:) "([a-z0-9_]+)"/g)) names.add(m[1]);
    }
    names.add("foo_bar_search_tools");
    expect([...names].sort()).toEqual([...TEMPLATE_TOOLS("foo_bar")].sort());
  });
});
