// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
//
// Fleet-wide effect-class manifest-coverage guard.
//
// Boots each built server, lists its tools over the real tools/list wire, and
// for every EFFECT-class write tool (annotations.cesteral.kind === "write" &&
// writeClass === "effect") asserts it produces a release-manifest entry with a
// resolvable definitionHash.
//
// Why this exists. The connector verifies effect writes through the identical
// decision-token path as entity writes (Phase 3). Under `enforce`, a tool whose
// definitionHash the connector cannot resolve fails closed
// (DEFINITION_HASH_UNRESOLVED); under `warn` the verdict silently degrades to
// definitionHashVerified:false — which can never satisfy the Phase-4 promotion
// bar (steady ok:true / definitionHashVerified:true). The connector resolves the
// hash from the released `dist/cesteral-manifest.json`, which is built by
// `scripts/generate-manifests.mjs` mapping `toManifestEntry` over each server's
// tools/list and dropping the nulls. `toManifestEntry` today includes ANY tool
// carrying a `cesteral` block — no writeClass filter — so effect tools are
// covered. This guard makes that a permanent invariant: a future change that
// (re-)introduces a writeClass/kind filter, or an effect tool shipped with a
// manifest-rejecting annotation, fails here in CI rather than silently leaving
// the effect contract unverifiable downstream.
//
// This is the effect-side analogue of the entity golden-vector / contractId
// invariants — it asserts the release manifest, the artifact the connector's
// definitionHash resolver reads, actually carries every effect write.

import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { withServerClient, listRawTools, ROOT } from "./boot-server.mjs";
import { toManifestEntry } from "./manifest.mjs";

const HEX_64 = /^[0-9a-f]{64}$/;

const packages = readdirSync(join(ROOT, "packages"))
  .filter((p) => p.endsWith("-mcp"))
  .sort();

function effectWrites(tools) {
  return tools.filter((t) => {
    const c = t.annotations?.cesteral;
    return c?.kind === "write" && c?.writeClass === "effect";
  });
}

// Mutated by the per-package tests, asserted non-zero by the trailing
// non-vacuity guard. Vitest runs tests within a file in registration order, so
// the per-package `it`s (registered first) populate this before the final one
// reads it.
let fleetEffectWriteCount = 0;

describe("effect-class manifest coverage", () => {
  for (const pkg of packages) {
    it(`${pkg}: every effect-class write resolves to a manifest entry with a definitionHash`, async () => {
      const tools = await withServerClient(pkg, listRawTools);
      const effects = effectWrites(tools);
      fleetEffectWriteCount += effects.length;

      for (const tool of effects) {
        // `toManifestEntry` is the exact function `generate-manifests.mjs` maps
        // over tools/list (then filters nulls), so a non-null entry here is
        // precisely the guarantee that the tool lands in the released manifest.
        const entry = toManifestEntry(tool);
        expect(
          entry,
          `${tool.name}: effect-class write produced no manifest entry — it would be ` +
            `absent from dist/cesteral-manifest.json, so the connector cannot resolve its ` +
            `definitionHash (DEFINITION_HASH_UNRESOLVED under enforce; definitionHashVerified:false under warn)`
        ).not.toBeNull();
        expect(
          entry.definitionHash,
          `${tool.name}: manifest entry definitionHash must be a 64-char hex SHA-256`
        ).toMatch(HEX_64);
        expect(entry.toolName, `${tool.name}: manifest entry toolName must match the tool name`).toBe(
          tool.name
        );
      }
    });
  }

  // Non-vacuity guard: if booting silently returned nothing, or the effect-class
  // classification broke, the per-package loops above would pass trivially. The
  // fleet ships effect writes (submit_report, upload_image/video, adjust_bids,
  // …), so a zero count means the guard is not actually exercising anything.
  it("the fleet declares at least one effect-class write (guard is non-vacuous)", () => {
    expect(
      fleetEffectWriteCount,
      "no effect-class write tools found fleet-wide — effect classification or server boot is broken"
    ).toBeGreaterThan(0);
  });
});
