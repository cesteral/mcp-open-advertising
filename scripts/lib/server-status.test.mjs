// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.

import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

  it.each([
    ["a missing status", {}],
    ["a misspelled status", { status: "Stable" }],
  ])(
    "fleet.mjs refuses to list anything for %s, so no deploy proceeds without the server",
    (_label, extra) => {
      // A typo must not silently drop a live server from deploy: Terraform would
      // plan to destroy its Cloud Run service. Every subcommand fails closed.
      const tmp = mkdtempSync(join(tmpdir(), "fleet-status-"));
      try {
        mkdirSync(join(tmp, "scripts/lib"), { recursive: true });
        cpSync(join(ROOT, "scripts/fleet.mjs"), join(tmp, "scripts/fleet.mjs"));
        cpSync(
          join(ROOT, "scripts/lib/server-status.mjs"),
          join(tmp, "scripts/lib/server-status.mjs")
        );
        writeFileSync(
          join(tmp, "registry.json"),
          JSON.stringify({
            servers: [
              { package: "a-mcp", port: 1, status: "stable" },
              { package: "b-mcp", port: 2, ...extra },
            ],
          })
        );
        for (const args of [["deployable"], ["servers"], ["port", "a-mcp"]]) {
          const r = spawnSync("node", [join(tmp, "scripts/fleet.mjs"), ...args], {
            encoding: "utf8",
          });
          expect(r.status, args.join(" ")).not.toBe(0);
          expect(r.stdout, args.join(" ")).toBe("");
          expect(r.stderr).toContain("b-mcp: registry `status`");
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  );
});
