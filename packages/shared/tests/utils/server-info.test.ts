// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { describe, expect, it } from "vitest";
import { buildServerInfo, buildServerCardExtras } from "../../src/utils/server-card-builder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(readFileSync(resolve(__dirname, "../../../../registry.json"), "utf8"));

describe("buildServerInfo (#241)", () => {
  it.each(registry.servers.map((s: { package: string }) => [s.package, s]))(
    "%s: title and websiteUrl come from registry.json",
    (pkg, entry) => {
      const info = buildServerInfo(pkg as string, { version: "9.9.9", description: "d" });
      expect(info).toEqual({
        name: pkg,
        title: (entry as { title: string }).title,
        version: "9.9.9",
        description: "d",
        websiteUrl: registry.repository,
      });
    }
  );

  it("uses the same title as the server card", () => {
    for (const { package: pkg } of registry.servers) {
      expect(buildServerInfo(pkg, { version: "1" }).title).toBe(buildServerCardExtras(pkg).title);
    }
  });

  it("publishes no icons: there is no Cesteral icon asset to point at", () => {
    expect(buildServerInfo("dbm-mcp", { version: "1" })).not.toHaveProperty("icons");
  });

  it("omits description when none is given", () => {
    expect(buildServerInfo("dbm-mcp", { version: "1" })).not.toHaveProperty("description");
  });

  it("throws for a package missing from registry.json", () => {
    expect(() => buildServerInfo("nope-mcp", { version: "1" })).toThrow(/not found in registry/);
  });
});
