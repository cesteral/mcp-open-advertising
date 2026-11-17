// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Ratchet (#242): every tool's published definitionHash equals the committed
// baseline. See tool-definition-hashes.mjs for why the baseline exists.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fleetPackages } from "./fleet-snapshot.mjs";
import { toolsOf } from "./fleet-snapshot-inject.mjs";
import {
  SNAPSHOT_PATH,
  definitionHashesOf,
  diffDefinitionHashes,
} from "./tool-definition-hashes.mjs";

const committed = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));

describe("tool definition hashes match the committed baseline (#242)", () => {
  it("every server's published definitionHash values are the committed ones", () => {
    const live = Object.fromEntries(
      fleetPackages().map((pkg) => [pkg, definitionHashesOf(toolsOf(pkg))])
    );
    const { changed, added, removed } = diffDefinitionHashes(committed, live);
    expect(
      { changed, added, removed },
      "A tool's published definition (name, description, inputSchema, outputSchema or " +
        "annotations) no longer matches scripts/lib/tool-definition-hashes.snapshot.json. " +
        "If the change is intended, run `pnpm run build && pnpm sync:tool-definition-hashes` and " +
        "commit the snapshot. If this PR was not meant to change these tools, something " +
        "upstream of every tool moved their wire schemas: the SDK, Zod, or the schema adapter."
    ).toEqual({ changed: [], added: [], removed: [] });
  });

  it("the baseline covers every server", () => {
    expect(Object.keys(committed).sort()).toEqual(fleetPackages());
  });
});

describe("diffDefinitionHashes", () => {
  it("reports changed, added and removed tools separately, per server", () => {
    const committed = { a: { keep: "1", move: "2", gone: "3" }, b: { x: "9" } };
    const live = { a: { keep: "1", move: "2b", fresh: "4" }, c: { y: "8" } };
    expect(diffDefinitionHashes(committed, live)).toEqual({
      changed: ["a/move"],
      added: ["a/fresh", "c/y"],
      removed: ["a/gone", "b/x"],
    });
  });

  it("is empty when nothing moved", () => {
    const same = { a: { t: "1" } };
    expect(diffDefinitionHashes(same, { a: { t: "1" } })).toEqual({
      changed: [],
      added: [],
      removed: [],
    });
  });
});
