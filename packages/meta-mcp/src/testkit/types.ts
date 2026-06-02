// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Public testkit types for the Meta platform package.
 *
 * Consumers (e.g. `cesteral-intelligence`) import these from
 * `@cesteral/meta-mcp/testkit` to verify their own preview/symbolic-apply
 * implementations against canonical fixture pairs the platform owns.
 */

import type { NormalizedEntitySnapshot } from "@cesteral/shared";

/**
 * Canonical operation labels for round-1 governance. The Meta `update_entity`
 * tool dispatches to these via the `data` payload (no separate operation
 * input). Fixtures pin one operation per fixture so consumers can filter.
 */
export type MetaOperation = "update_budget" | "pause" | "resume" | "delete" | "create";

/**
 * Round-1 entity kinds with canonical-snapshot coverage.
 */
export type MetaEntityKindKey = "campaign" | "adSet" | "ad";

export interface MetaFixtureArgs {
  /** Mirrors the `entityType` input on `meta_update_entity`. */
  entityType: MetaEntityKindKey;
  /** Mirrors the `entityId` input. Always scrubbed. */
  entityId: string;
  /** Mirrors the `data` input — the partial fields to write. */
  data: Record<string, unknown>;
}

/**
 * One state-transition fixture: `args` + `preState` symbolically applied
 * yields `expectedPostState`. `assertContract` runs that check.
 */
export interface MetaWriteFixture {
  /** Governed write contract this fixture proves. */
  contractToolSlug: "update_entity" | "delete_entity" | "create_entity";
  /** Canonical operation this fixture exercises. */
  operation: MetaOperation;
  /** Canonical entity kind. */
  entityKind: MetaEntityKindKey;
  /** Inputs to the write tool (scrubbed). */
  args: MetaFixtureArgs;
  /** Pre-write entity, as `meta_get_entity` would return it (scrubbed). */
  preState: Record<string, unknown>;
  /** Expected post-write canonical snapshot. */
  expectedPostState: NormalizedEntitySnapshot;
  /** Human-readable description used as the fixture's test name. */
  description: string;
}
