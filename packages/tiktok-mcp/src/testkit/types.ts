// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Public testkit types for the TikTok platform package.
 *
 * Consumers (e.g. `cesteral-intelligence`) import these from
 * `@cesteral/tiktok-mcp/testkit` to verify their own preview/symbolic-apply
 * implementations against canonical fixture pairs the platform owns. Mirrors
 * the Amazon DSP / Meta / DV360 testkit shape.
 */

import type { NormalizedEntitySnapshot } from "@cesteral/shared";

/**
 * Canonical operation labels for round-3 governance. The TikTok
 * `update_entity` tool dispatches to these via the `data` payload (no separate
 * operation input). Fixtures pin one operation per fixture so consumers can
 * filter.
 */
export type TiktokOperation = "update_budget" | "pause" | "resume" | "create";

/**
 * Governed entity kinds, labelled with the upstream `entityType` input key.
 * `campaign` is the campaign-level object, `adGroup` the ad-group-level
 * object, `ad` the ad-level object.
 */
export type TiktokEntityKindKey = "campaign" | "adGroup" | "ad";

export interface TiktokFixtureArgs {
  /** Mirrors the `entityType` input on `tiktok_update_entity`. */
  entityType: TiktokEntityKindKey;
  /** Mirrors the `advertiserId` input — the TikTok advertiser ID (scrubbed). */
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
export interface TiktokWriteFixture {
  /** Governed write contract this fixture proves. */
  contractToolSlug: "update_entity" | "create_entity";
  /** Canonical operation this fixture exercises. */
  operation: TiktokOperation;
  /** Upstream entity-kind key. */
  entityKind: TiktokEntityKindKey;
  /** Inputs to the write tool (scrubbed). */
  args: TiktokFixtureArgs;
  /** Pre-write entity, as `tiktok_get_entity` would return it (scrubbed). */
  preState: Record<string, unknown>;
  /** Expected post-write canonical snapshot. */
  expectedPostState: NormalizedEntitySnapshot;
  /** Human-readable description used as the fixture's test name. */
  description: string;
}
