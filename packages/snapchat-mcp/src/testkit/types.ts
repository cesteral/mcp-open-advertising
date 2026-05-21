// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Public testkit types for the Snapchat platform package.
 *
 * Consumers (e.g. `cesteral-intelligence`) import these from
 * `@cesteral/snapchat-mcp/testkit` to verify their own preview/symbolic-apply
 * implementations against canonical fixture pairs the platform owns. Mirrors
 * the Amazon DSP / Meta / DV360 testkit shape.
 */

import type { NormalizedEntitySnapshot } from "@cesteral/shared";

/**
 * Canonical operation labels for round-4 governance. The Snapchat
 * `update_entity` tool dispatches to these via the `data` payload (no separate
 * operation input). Fixtures pin one operation per fixture so consumers can
 * filter.
 */
export type SnapchatOperation = "update_budget" | "pause" | "resume";

/**
 * Governed entity kinds, labelled with the upstream `entityType` input key.
 * `campaign` is the campaign-level object, `adGroup` the Snapchat "ad squad"
 * (ad-group tier), and `ad` the ad-level object.
 */
export type SnapchatEntityKindKey = "campaign" | "adGroup" | "ad";

export interface SnapchatFixtureArgs {
  /** Mirrors the `entityType` input on `snapchat_update_entity`. */
  entityType: SnapchatEntityKindKey;
  /** Mirrors the `adAccountId` input — the Snapchat advertiser ID (scrubbed). */
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
export interface SnapchatWriteFixture {
  /** Canonical operation this fixture exercises. */
  operation: SnapchatOperation;
  /** Upstream entity-kind key. */
  entityKind: SnapchatEntityKindKey;
  /** Inputs to the write tool (scrubbed). */
  args: SnapchatFixtureArgs;
  /** Pre-write entity, as `snapchat_get_entity` would return it (scrubbed). */
  preState: Record<string, unknown>;
  /** Expected post-write canonical snapshot. */
  expectedPostState: NormalizedEntitySnapshot;
  /** Human-readable description used as the fixture's test name. */
  description: string;
}
