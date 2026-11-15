// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// #241: every server's `initialize` result carries the display metadata a
// client shows in its server picker — `title` and `websiteUrl` from
// registry.json, via @cesteral/shared's buildServerInfo — checked over the
// wire, so a server that builds its serverInfo by hand again fails here.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./boot-server.mjs";
import { serverSnapshot } from "./fleet-snapshot-inject.mjs";

const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));
const byPackage = new Map(registry.servers.map((s) => [s.package, s]));
const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

describe("serverInfo carries registry display metadata", () => {
  it("covers every registry server", () => {
    expect(packages).toEqual([...byPackage.keys()].sort());
  });

  it.each(packages)("%s", (pkg) => {
    const info = serverSnapshot(pkg).serverVersion;
    const version = JSON.parse(
      readFileSync(join(ROOT, "packages", pkg, "package.json"), "utf8")
    ).version;
    expect(info).toMatchObject({
      name: pkg,
      title: byPackage.get(pkg).title,
      version,
      websiteUrl: registry.repository,
    });
    expect(typeof info.description).toBe("string");
    expect(info).not.toHaveProperty("icons");
  });
});
