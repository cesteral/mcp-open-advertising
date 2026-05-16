// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `@cesteral/meta-mcp/testkit` — public testing surface for downstream
 * consumers (notably `cesteral-intelligence`'s preview test suite) and
 * upstream conformance tests.
 *
 * Exports:
 * - `MetaWriteFixture` and related types
 * - `getFixtures(operation?, entityKind?)` — filterable fixture registry
 * - `assertContract(operation, entityKind, fixture)` — runs the platform's
 *   symbolic apply and throws on mismatch with `expectedPostState`
 * - `applyMetaPatch` — re-exported from the tool's symbolic-apply helper so
 *   consumers can wire their own assertions
 *
 * NOTE: scrubbed fixtures are hand-authored for round 1. A live-capture +
 * scrub script (`scripts/capture-fixtures.ts`) is deferred — see
 * docs/plans/2026-05-13-mcp-server-write-contract-declaration.md.
 */

import { applyMetaPatch } from "../mcp-server/tools/utils/dry-run.js";
import type { MetaEntityKindKey, MetaOperation, MetaWriteFixture } from "./types.js";
import { allFixtures } from "./fixtures/index.js";

export type {
  MetaEntityKindKey,
  MetaFixtureArgs,
  MetaOperation,
  MetaWriteFixture,
} from "./types.js";

export { applyMetaPatch } from "../mcp-server/tools/utils/dry-run.js";

/**
 * Return fixtures matching the given filters. Both args are optional —
 * omit either to return everything matching the other.
 */
export function getFixtures(
  operation?: MetaOperation,
  entityKind?: MetaEntityKindKey
): readonly MetaWriteFixture[] {
  return allFixtures.filter(
    (fx) =>
      (operation == null || fx.operation === operation) &&
      (entityKind == null || fx.entityKind === entityKind)
  );
}

/**
 * Run the platform's symbolic apply against the fixture's pre-state + args
 * and assert deep-equality against `expectedPostState`. Throws on mismatch.
 *
 * `operation` and `entityKind` are passed for caller-side selection; the
 * fixture itself is the source of truth for inputs.
 */
export function assertContract(
  operation: MetaOperation,
  entityKind: MetaEntityKindKey,
  fixture: MetaWriteFixture
): void {
  if (fixture.operation !== operation) {
    throw new Error(
      `assertContract: fixture.operation=${fixture.operation} does not match expected ${operation}`
    );
  }
  if (fixture.entityKind !== entityKind) {
    throw new Error(
      `assertContract: fixture.entityKind=${fixture.entityKind} does not match expected ${entityKind}`
    );
  }
  const got = applyMetaPatch(
    fixture.args.entityType,
    fixture.args.entityId,
    fixture.preState,
    fixture.args.data
  );
  if (got == null) {
    throw new Error(`assertContract(${fixture.description}): symbolic apply returned undefined`);
  }
  // Stable JSON deep-equal — keeps the assertion test-runner-agnostic.
  const a = JSON.stringify(got);
  const b = JSON.stringify(fixture.expectedPostState);
  if (a !== b) {
    throw new Error(
      `assertContract(${fixture.description}): symbolic post-state did not match expected.\n` +
        `expected: ${b}\n     got: ${a}`
    );
  }
}
