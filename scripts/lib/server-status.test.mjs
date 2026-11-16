// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkStatuses, deployableServers, isDeployable } from "./server-status.mjs";

const ROOT = join(import.meta.dirname, "../..");
const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));

describe("server status", () => {
  it("every registry server declares a known status", () => {
    expect(checkStatuses(registry)).toEqual([]);
  });

  it("a missing or unknown status fails", () => {
    expect(
      checkStatuses({
        servers: [{ package: "a-mcp" }, { package: "b-mcp", status: "beta" }],
      })
    ).toEqual([
      "a-mcp: registry `status` must be one of experimental, stable (got undefined)",
      'b-mcp: registry `status` must be one of experimental, stable (got "beta")',
    ]);
  });

  it("deployable excludes experimental servers", () => {
    const servers = [
      { package: "a-mcp", status: "stable" },
      { package: "b-mcp", status: "experimental" },
    ];
    expect(deployableServers({ servers }).map((s) => s.package)).toEqual(["a-mcp"]);
    expect(isDeployable(servers[1])).toBe(false);
  });

  it("fleet.mjs deployable prints the stable servers in registry order", () => {
    const out = execFileSync("node", [join(ROOT, "scripts/fleet.mjs"), "deployable"], {
      encoding: "utf8",
    });
    expect(out.trim().split("\n")).toEqual(deployableServers(registry).map((s) => s.package));
  });
});
