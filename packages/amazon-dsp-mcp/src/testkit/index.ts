// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `@cesteral/amazon-dsp-mcp/testkit` — public testing surface for downstream
 * consumers (notably `cesteral-intelligence`'s preview test suite) and
 * upstream conformance tests.
 *
 * Exports:
 * - `AmazonDspWriteFixture` and related types
 * - `getFixtures(operation?, entityKind?)` — filterable fixture registry
 * - `assertContract(operation, entityKind, fixture)` — runs the platform's
 *   symbolic apply and throws on mismatch with `expectedPostState`
 * - `applyAmazonDspPatch` — re-exported from the tool's symbolic-apply helper
 *   so consumers can wire their own assertions
 */

import { applyAmazonDspPatch } from "../mcp-server/tools/utils/dry-run.js";
import { applyCommitmentPatch } from "../mcp-server/tools/utils/commitment-dry-run.js";
import type { AmazonDspEntityKindKey, AmazonDspOperation, AmazonDspWriteFixture } from "./types.js";
import { allFixtures } from "./fixtures/index.js";

export type {
  AmazonDspEntityKindKey,
  AmazonDspFixtureArgs,
  AmazonDspOperation,
  AmazonDspWriteFixture,
} from "./types.js";

export { applyAmazonDspPatch } from "../mcp-server/tools/utils/dry-run.js";
export { applyCommitmentPatch } from "../mcp-server/tools/utils/commitment-dry-run.js";

/**
 * Return fixtures matching the given filters. Both args are optional —
 * omit either to return everything matching the other.
 */
export function getFixtures(
  operation?: AmazonDspOperation,
  entityKind?: AmazonDspEntityKindKey
): readonly AmazonDspWriteFixture[] {
  return allFixtures.filter(
    (fx) =>
      (operation == null || fx.operation === operation) &&
      (entityKind == null || fx.entityKind === entityKind)
  );
}

/**
 * Run the platform's symbolic apply against the fixture's pre-state + args
 * and assert deep-equality against `expectedPostState`. Throws on mismatch.
 */
export function assertContract(
  operation: AmazonDspOperation,
  entityKind: AmazonDspEntityKindKey,
  fixture: AmazonDspWriteFixture
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
  const got =
    fixture.entityKind === "commitment"
      ? applyCommitmentPatch(
          fixture.args.commitmentId,
          fixture.args.profileId,
          fixture.preState,
          fixture.args.data
        )
      : applyAmazonDspPatch(
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
