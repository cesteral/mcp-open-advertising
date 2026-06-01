// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Public testkit types for the CM360 platform package.
 *
 * Consumers (e.g. `cesteral-intelligence`) import these from
 * `@cesteral/cm360-mcp/testkit` to verify their own preview/symbolic-apply
 * implementations against canonical fixture pairs the platform owns. Mirrors
 * the Amazon DSP / Meta / DV360 testkit shape.
 */

import type { NormalizedEntitySnapshot } from "@cesteral/shared";

/**
 * Canonical operation labels for round-4 governance. The CM360
 * `cm360_update_entity` tool dispatches to these via the `data` payload (no
 * separate operation input). Fixtures pin one operation per fixture so
 * consumers can filter.
 *
 * CM360 carries no budget on campaigns/ads, so `update_budget` is not a
 * coverable operation here. Campaigns expose only an `archived` flag (no
 * platform-native paused state), so `pause` / `resume` are ad-only.
 */
export type Cm360Operation = "pause" | "resume" | "update_status";

/**
 * Governed entity kinds, labelled with the upstream `entityType` input key.
 */
export type Cm360EntityKindKey = "campaign" | "ad";

export interface Cm360FixtureArgs {
  /** Mirrors the `entityType` input on `cm360_update_entity`. */
  entityType: Cm360EntityKindKey;
  /** Mirrors the `profileId` input — the CM360 user profile ID (scrubbed). */
  profileId: string;
  /** Mirrors the `entityId` input (scrubbed). */
  entityId: string;
  /** Mirrors the `data` input — the partial fields to write. */
  data: Record<string, unknown>;
}

/**
 * One state-transition fixture: `args` + `preState` symbolically applied
 * yields `expectedPostState`. `assertContract` runs that check.
 */
export interface Cm360WriteFixture {
  /** Governed write contract this fixture proves. */
  contractToolSlug: "update_entity";
  /** Canonical operation this fixture exercises. */
  operation: Cm360Operation;
  /** Upstream entity-kind key. */
  entityKind: Cm360EntityKindKey;
  /** Inputs to the write tool (scrubbed). */
  args: Cm360FixtureArgs;
  /** Pre-write entity, as `cm360_get_entity` would return it (scrubbed). */
  preState: Record<string, unknown>;
  /** Expected post-write canonical snapshot. */
  expectedPostState: NormalizedEntitySnapshot;
  /** Human-readable description used as the fixture's test name. */
  description: string;
}
