// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Upstream conformance: every fixture in the DV360 testkit registry must round-trip
 * through `assertContract` cleanly.
 */

import { describe, expect, it } from "vitest";

import {
  assertContract,
  getFixtures,
} from "../../src/testkit/index.js";
// Smoke import: must resolve via package.json exports map.
import * as publicTestkit from "@cesteral/dv360-mcp/testkit";

describe("dv360-mcp testkit conformance", () => {
  const fixtures = getFixtures();

  it("ships at least one fixture per round-1 (operation, entityKind) pair", () => {
    const pairs = new Set(fixtures.map((fx) => `${fx.operation}::${fx.entityKind}`));
    expect(pairs).toContain("update_budget::insertionOrder");
    expect(pairs).toContain("update_budget::lineItem");
    expect(pairs).toContain("pause::lineItem");
    expect(pairs).toContain("pause::insertionOrder");
    expect(pairs).toContain("resume::lineItem");
    expect(pairs).toContain("resume::insertionOrder");
  });

  it.each(fixtures.map((fx) => [fx.description, fx]))(
    "assertContract green: %s",
    (_desc, fx) => {
      assertContract(fx.operation, fx.entityKind, fx);
    }
  );

  it("getFixtures filters by operation", () => {
    const pauses = getFixtures("pause");
    expect(pauses.length).toBeGreaterThan(0);
    expect(pauses.every((fx) => fx.operation === "pause")).toBe(true);
  });

  it("getFixtures filters by entityKind", () => {
    const ios = getFixtures(undefined, "insertionOrder");
    expect(ios.length).toBeGreaterThan(0);
    expect(ios.every((fx) => fx.entityKind === "insertionOrder")).toBe(true);
  });

  it("smoke: subpath export resolves and exposes assertContract / getFixtures", () => {
    expect(typeof publicTestkit.assertContract).toBe("function");
    expect(typeof publicTestkit.getFixtures).toBe("function");
    const all = publicTestkit.getFixtures();
    expect(all.length).toBe(fixtures.length);
  });
});
