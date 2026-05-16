// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `@cesteral/dv360-mcp/testkit` — public testing surface.
 *
 * Exports:
 * - `Dv360WriteFixture` and related types
 * - `getFixtures(operation?, entityKind?)` — filterable fixture registry
 * - `assertContract(operation, entityKind, fixture)` — runs the platform's
 *   symbolic apply and throws on mismatch
 * - `applyDv360Patch` — re-exported symbolic-apply helper
 */

import { applyDv360Patch } from "../mcp-server/tools/utils/dry-run.js";
import type { Dv360EntityKindKey, Dv360Operation, Dv360WriteFixture } from "./types.js";
import { allFixtures } from "./fixtures/index.js";

export type {
  Dv360EntityKindKey,
  Dv360FixtureArgs,
  Dv360Operation,
  Dv360WriteFixture,
} from "./types.js";

export { applyDv360Patch } from "../mcp-server/tools/utils/dry-run.js";

export function getFixtures(
  operation?: Dv360Operation,
  entityKind?: Dv360EntityKindKey
): readonly Dv360WriteFixture[] {
  return allFixtures.filter(
    (fx) =>
      (operation == null || fx.operation === operation) &&
      (entityKind == null || fx.entityKind === entityKind)
  );
}

export function assertContract(
  operation: Dv360Operation,
  entityKind: Dv360EntityKindKey,
  fixture: Dv360WriteFixture
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
  const got = applyDv360Patch(
    fixture.args.entityType,
    fixture.args.ids,
    fixture.preState,
    fixture.args.data,
    fixture.args.updateMask
  );
  if (got == null) {
    throw new Error(`assertContract(${fixture.description}): symbolic apply returned undefined`);
  }
  const a = JSON.stringify(got);
  const b = JSON.stringify(fixture.expectedPostState);
  if (a !== b) {
    throw new Error(
      `assertContract(${fixture.description}): symbolic post-state did not match expected.\n` +
        `expected: ${b}\n     got: ${a}`
    );
  }
}
