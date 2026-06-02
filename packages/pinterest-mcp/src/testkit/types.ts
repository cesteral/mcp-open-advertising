// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Public testkit types for the Pinterest platform package.
 *
 * Consumers (e.g. `cesteral-intelligence`) import these from
 * `@cesteral/pinterest-mcp/testkit` to verify their own preview/symbolic-apply
 * implementations against canonical fixture pairs the platform owns. Mirrors
 * the Amazon DSP / Meta / DV360 testkit shape.
 */

import type { NormalizedEntitySnapshot } from "@cesteral/shared";

/**
 * Canonical operation labels for round-4 governance. The Pinterest
 * `update_entity` tool dispatches to these via the `data` payload (no separate
 * operation input). Fixtures pin one operation per fixture so consumers can
 * filter.
 */
export type PinterestOperation = "update_budget" | "pause" | "resume" | "create" | "duplicate";

/**
 * Governed entity kinds, labelled with the upstream `entityType` input key.
 * `campaign` is the campaign-level object, `adGroup` the ad-group-level object,
 * `ad` the ad-level object.
 */
export type PinterestEntityKindKey = "campaign" | "adGroup" | "ad";

export interface PinterestFixtureArgs {
  /** Mirrors the `entityType` input on `pinterest_update_entity`. */
  entityType: PinterestEntityKindKey;
  /** Mirrors the `adAccountId` input — the Pinterest advertiser ID (scrubbed). */
  adAccountId: string;
  /** Mirrors the `entityId` input (scrubbed). */
  entityId: string;
  /** Mirrors the `data` input — the partial fields to write. */
  data: Record<string, unknown>;
}

/**
 * One state-transition fixture: `args` + `preState` symbolically applied
 * yields `expectedPostState`. `assertContract` runs that check.
 */
export interface PinterestWriteFixture {
  /** Governed write contract this fixture proves. */
  contractToolSlug: "update_entity" | "create_entity" | "duplicate_entity";
  /** Canonical operation this fixture exercises. */
  operation: PinterestOperation;
  /** Upstream entity-kind key. */
  entityKind: PinterestEntityKindKey;
  /** Inputs to the write tool (scrubbed). */
  args: PinterestFixtureArgs;
  /** Pre-write entity, as `pinterest_get_entity` would return it (scrubbed). */
  preState: Record<string, unknown>;
  /** Expected post-write canonical snapshot. */
  expectedPostState: NormalizedEntitySnapshot;
  /** Human-readable description used as the fixture's test name. */
  description: string;
}
