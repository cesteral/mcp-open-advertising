// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadManifestDefinitionHashes, createDefinitionHashResolver } from "../../src/index.js";

const MANIFEST = {
  manifestVersion: 1,
  packageName: "@cesteral/meta-mcp",
  packageVersion: "1.2.0",
  generatedAt: "2026-06-02T00:00:00.000Z",
  tools: [
    { toolName: "meta_get_entity", definitionHash: "a".repeat(64) },
    { toolName: "meta_update_entity", definitionHash: "b".repeat(64) },
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

describe("loadManifestDefinitionHashes", () => {
  it("maps toolName → definitionHash", () => {
    const map = loadManifestDefinitionHashes(manifestPath);
    expect(map.get("meta_update_entity")).toBe("b".repeat(64));
    expect(map.get("meta_get_entity")).toBe("a".repeat(64));
  });

  it("returns an empty map for a missing file (graceful)", () => {
    const map = loadManifestDefinitionHashes(join(dir, "nope.json"));
    expect(map.size).toBe(0);
  });

  it("returns an empty map for malformed JSON (graceful)", () => {
    expect(loadManifestDefinitionHashes(badPath).size).toBe(0);
  });
});

describe("createDefinitionHashResolver", () => {
  it("resolves a known tool and returns undefined for unknown", () => {
    const resolve = createDefinitionHashResolver(manifestPath);
    expect(resolve("meta_update_entity")).toBe("b".repeat(64));
    expect(resolve("meta_unknown_tool")).toBeUndefined();
  });

  it("resolves everything to undefined when the manifest is absent", () => {
    const resolve = createDefinitionHashResolver(join(dir, "nope.json"));
    expect(resolve("meta_update_entity")).toBeUndefined();
  });

  it("accepts a file URL as well as a path", () => {
    const resolve = createDefinitionHashResolver(new URL(`file://${manifestPath}`));
    expect(resolve("meta_get_entity")).toBe("a".repeat(64));
  });
});
