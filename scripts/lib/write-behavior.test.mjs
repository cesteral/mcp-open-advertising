// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Behavioral companion to write-coverage.test.mjs (issue #107).
//
// write-coverage.test.mjs trusts each tool's SELF-DECLARED `readOnlyHint` to
// decide what counts as a write that must be governed. This test adds an
// independent, behavior-derived net: it statically detects tools whose handler
// reaches an unambiguous mutating HTTP verb (PUT / PATCH / DELETE) and asserts
// they are labeled `readOnlyHint: false`. A destructive call mislabeled
// `readOnlyHint: true` (or with the hint omitted) would slip past the coverage
// ratchet — this catches it.
//
// Sound subset by design (see write-behavior.mjs): POST is not treated as a
// write (reads legitimately POST), verb calls are matched only on HTTP-client
// receivers, and one hop of service indirection is resolved. The check never
// false-positives; it only ever ADDS coverage on top of the annotation ratchet.

import { describe, expect, it } from "vitest";
import { detectWriteTools, findMislabeledWrites, mcpPackages } from "./write-behavior.mjs";

const packages = mcpPackages();

describe("write-behavior detection (issue #107: writes must declare readOnlyHint:false)", () => {
  for (const pkg of packages) {
    it(`${pkg}: every tool reaching PUT/PATCH/DELETE is labeled readOnlyHint:false`, () => {
      const violations = findMislabeledWrites(pkg);
      const report = violations
        .map(
          (v) =>
            `  - ${v.tool} (${v.file}): readOnlyHint=${v.readOnlyHint} but reaches a ` +
            `mutating verb ${v.inline ? "inline" : `via ${v.viaMethods.join(", ")}`}`
        )
        .join("\n");
      expect(
        violations,
        `Tool(s) in ${pkg} mutate live platform state (PUT/PATCH/DELETE) but are not ` +
          `declared readOnlyHint:false — set readOnlyHint:false and add a cesteral ` +
          `governance contract so the coverage ratchet governs them:\n${report}`
      ).toEqual([]);
    });
  }

  // Guard against the detector silently becoming a no-op: if a refactor moves
  // HTTP calls behind a shape this heuristic no longer recognizes, the per-
  // package assertions above would pass vacuously (zero detected → zero
  // violations). Anchor on known REST (verb-based) platforms whose entity
  // writes MUST stay detectable, so a broken matcher trips here.
  for (const pkg of ["meta-mcp", "dv360-mcp", "msads-mcp"].filter((p) => packages.includes(p))) {
    it(`${pkg}: detector still recognizes its delete_entity write (not a no-op)`, () => {
      const detected = detectWriteTools(pkg).map((t) => t.tool);
      expect(detected.some((name) => /delete_entity$/.test(name))).toBe(true);
    });
  }
});
