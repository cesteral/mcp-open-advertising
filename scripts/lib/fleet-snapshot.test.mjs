// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// The fleet snapshot is what most root suites read instead of booting a server
// of their own, so a snapshot that quietly came back thin would turn all of
// them vacuous at once. This pins its shape. That it is the same answer a live
// boot gives is tools-list-determinism.test.mjs, which compares every server's
// fresh boot with it.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./boot-server.mjs";
import { fleetPackages } from "./fleet-snapshot.mjs";
import { serverSnapshot } from "./fleet-snapshot-inject.mjs";

const registry = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));

describe("fleet snapshot", () => {
  it("covers every registry server", () => {
    expect(fleetPackages()).toEqual(registry.servers.map((s) => s.package).sort());
  });

  it.each(fleetPackages())("%s: carries tools, prompts and resources", (pkg) => {
    const snapshot = serverSnapshot(pkg);
    expect(snapshot.serverVersion.name).toBe(pkg);
    expect(snapshot.tools.length).toBeGreaterThan(0);
    expect(snapshot.prompts.length).toBeGreaterThan(0);
    expect(snapshot.resources.length).toBeGreaterThan(0);
    for (const { prompt, renders } of snapshot.prompts) {
      expect(renders.length, `${pkg} ${prompt.name}: not rendered`).toBeGreaterThan(0);
      for (const { text } of renders) expect(text.length).toBeGreaterThan(0);
    }
  });

  it("fails loudly for a package it did not boot", () => {
    expect(() => serverSnapshot("nope-mcp")).toThrow(/No fleet snapshot for nope-mcp/);
  });
});
