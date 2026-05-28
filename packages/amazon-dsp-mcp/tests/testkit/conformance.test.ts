// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Upstream conformance: every fixture in the Amazon DSP testkit registry must
 * round-trip through `assertContract` cleanly. This locks the symbolic-apply
 * contract against the canonical state-transition fixtures the platform owns.
 *
 * The smoke test at the bottom imports from the published subpath
 * (`@cesteral/amazon-dsp-mcp/testkit`) rather than the relative path, to
 * verify the package.json `exports` map resolves correctly inside the
 * workspace.
 */

import { describe, expect, it } from "vitest";

import { assertContract, getFixtures } from "../../src/testkit/index.js";
// Smoke import: must resolve via package.json exports map.
import * as publicTestkit from "@cesteral/amazon-dsp-mcp/testkit";

describe("amazon-dsp-mcp testkit conformance", () => {
  const fixtures = getFixtures();

  it("ships at least one fixture per governed (operation, entityKind) pair", () => {
    const pairs = new Set(fixtures.map((fx) => `${fx.operation}::${fx.entityKind}`));
    expect(pairs).toContain("update_budget::order");
    expect(pairs).toContain("update_budget::lineItem");
    expect(pairs).toContain("pause::order");
    expect(pairs).toContain("pause::lineItem");
    expect(pairs).toContain("resume::order");
    expect(pairs).toContain("resume::lineItem");
    expect(pairs).toContain("update::commitment");
  });

  it.each(fixtures.map((fx) => [fx.description, fx]))("assertContract green: %s", (_desc, fx) => {
    // Should not throw.
    assertContract(fx.operation, fx.entityKind, fx);
  });

  it("getFixtures filters by operation", () => {
    const pauses = getFixtures("pause");
    expect(pauses.length).toBeGreaterThan(0);
    expect(pauses.every((fx) => fx.operation === "pause")).toBe(true);
  });

  it("getFixtures filters by entityKind", () => {
    const orders = getFixtures(undefined, "order");
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((fx) => fx.entityKind === "order")).toBe(true);
  });

  it("smoke: subpath export resolves and exposes assertContract / getFixtures", () => {
    expect(typeof publicTestkit.assertContract).toBe("function");
    expect(typeof publicTestkit.getFixtures).toBe("function");
    const all = publicTestkit.getFixtures();
    expect(all.length).toBe(fixtures.length);
  });
});
