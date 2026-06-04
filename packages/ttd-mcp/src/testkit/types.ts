// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Public testkit types for the TTD platform package.
 *
 * Consumers (e.g. `cesteral-intelligence`) import these from
 * `@cesteral/ttd-mcp/testkit` to verify their own preview/symbolic-apply
 * implementations against canonical fixture pairs the platform owns. Mirrors
 * the Amazon DSP / Meta / DV360 testkit shape.
 */

import type { NormalizedEntitySnapshot } from "@cesteral/shared";

/**
 * Canonical operation labels for round-3 governance. The TTD `update_entity`
 * tool dispatches to these via the `data` payload (no separate operation
 * input). Fixtures pin one operation per fixture so consumers can filter.
 */
export type TtdOperation = "update_budget" | "pause" | "resume" | "create" | "delete";

/**
 * Governed entity kinds, labelled with the upstream `entityType` input key.
 * `campaign` is the campaign-level object, `adGroup` the ad-group-level object.
 */
export type TtdEntityKindKey = "campaign" | "adGroup";

export interface TtdFixtureArgs {
  /** Mirrors the `entityType` input on `ttd_update_entity`. */
  entityType: TtdEntityKindKey;
  /** Mirrors the `advertiserId` input — the TTD advertiser ID (scrubbed). */
  advertiserId: string;
  /** Mirrors the `entityId` input (scrubbed). */
  entityId: string;
  /** Mirrors the `data` input — the partial fields to write. */
  data: Record<string, unknown>;
}

/**
 * One state-transition fixture: `args` + `preState` symbolically applied
 * yields `expectedPostState`. `assertContract` runs that check.
 */
export interface TtdWriteFixture {
  /** Governed write contract this fixture proves. */
  contractToolSlug: "update_entity" | "create_entity" | "delete_entity";
  /** Canonical operation this fixture exercises. */
  operation: TtdOperation;
  /** Upstream entity-kind key. */
  entityKind: TtdEntityKindKey;
  /** Inputs to the write tool (scrubbed). */
  args: TtdFixtureArgs;
  /** Pre-write entity, as `ttd_get_entity` would return it (scrubbed). */
  preState: Record<string, unknown>;
  /** Expected post-write canonical snapshot. */
  expectedPostState: NormalizedEntitySnapshot;
  /** Human-readable description used as the fixture's test name. */
  description: string;
}
