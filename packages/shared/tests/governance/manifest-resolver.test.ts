// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadManifestEntries, createManifestEntryResolver } from "../../src/index.js";

const MANIFEST = {
  manifestVersion: 1,
  packageName: "@cesteral/meta-mcp",
  packageVersion: "1.2.0",
  generatedAt: "2026-06-02T00:00:00.000Z",
  tools: [
    { toolName: "meta_get_entity", definitionHash: "a".repeat(64) },
    { toolName: "meta_update_entity", definitionHash: "b".repeat(64) },
    { toolName: "meta_create_entity", definitionHash: "c".repeat(64), hashAlg: "rfc8785" },
    { toolName: "meta_pause_entity", definitionHash: "d".repeat(64), hashAlg: "cesteral-c14n-v1" },
    // An algorithm this build cannot interpret: the entry must not resolve at all.
    { toolName: "meta_future_entity", definitionHash: "e".repeat(64), hashAlg: "rfc9999" },
    { toolName: "meta_odd_entity", definitionHash: "f".repeat(64), hashAlg: 7 },
  ],
};

let dir: string;
let manifestPath: string;
let badPath: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "cesteral-manifest-"));
  manifestPath = join(dir, "cesteral-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(MANIFEST), "utf8");
  badPath = join(dir, "broken.json");
  writeFileSync(badPath, "{ not json", "utf8");
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("loadManifestEntries", () => {
  it("maps toolName → { definitionHash } and omits hashAlg when the entry has none", () => {
    const map = loadManifestEntries(manifestPath);
    expect(map.get("meta_update_entity")).toEqual({ definitionHash: "b".repeat(64) });
    expect(map.get("meta_get_entity")).toEqual({ definitionHash: "a".repeat(64) });
    // Absent means cesteral-c14n-v1; the resolver must not invent a value.
    expect(map.get("meta_get_entity")).not.toHaveProperty("hashAlg");
  });

  it("carries the entry's hashAlg through", () => {
    const map = loadManifestEntries(manifestPath);
    expect(map.get("meta_create_entity")).toEqual({
      definitionHash: "c".repeat(64),
      hashAlg: "rfc8785",
    });
    expect(map.get("meta_pause_entity")).toEqual({
      definitionHash: "d".repeat(64),
      hashAlg: "cesteral-c14n-v1",
    });
  });

  it("does not resolve an entry whose hashAlg it cannot interpret (fails closed)", () => {
    const map = loadManifestEntries(manifestPath);
    expect(map.has("meta_future_entity")).toBe(false);
    expect(map.has("meta_odd_entity")).toBe(false);
    // ...without disturbing its neighbours.
    expect(map.get("meta_update_entity")).toEqual({ definitionHash: "b".repeat(64) });
  });

  it("returns an empty map for a missing file (graceful)", () => {
    const map = loadManifestEntries(join(dir, "nope.json"));
    expect(map.size).toBe(0);
  });

  it("returns an empty map for malformed JSON (graceful)", () => {
    expect(loadManifestEntries(badPath).size).toBe(0);
  });
});

describe("createManifestEntryResolver", () => {
  it("resolves a known tool and returns undefined for unknown", () => {
    const resolve = createManifestEntryResolver(manifestPath);
    expect(resolve("meta_update_entity")).toEqual({ definitionHash: "b".repeat(64) });
    expect(resolve("meta_create_entity")?.hashAlg).toBe("rfc8785");
    expect(resolve("meta_unknown_tool")).toBeUndefined();
  });

  it("resolves everything to undefined when the manifest is absent", () => {
    const resolve = createManifestEntryResolver(join(dir, "nope.json"));
    expect(resolve("meta_update_entity")).toBeUndefined();
  });

  it("accepts a file URL as well as a path", () => {
    const resolve = createManifestEntryResolver(new URL(`file://${manifestPath}`));
    expect(resolve("meta_get_entity")).toEqual({ definitionHash: "a".repeat(64) });
  });
});
