// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Public testkit types for the Amazon DSP platform package.
 *
 * Consumers (e.g. `cesteral-intelligence`) import these from
 * `@cesteral/amazon-dsp-mcp/testkit` to verify their own preview/symbolic-apply
 * implementations against canonical fixture pairs the platform owns. Mirrors
 * the Meta / DV360 testkit shape.
 */

import type { NormalizedEntitySnapshot } from "@cesteral/shared";

/**
 * Canonical operation labels across governed Amazon DSP write surfaces.
 * `update_budget` / `pause` / `resume` belong to `amazon_dsp_update_entity`
 * (order + lineItem). `update` is the commitment surface's single operation
 * and matches `resolveCommitmentDispatchedCapability()` in commitment-dry-run.ts.
 * Fixtures pin one operation each so consumers can filter.
 */
export type AmazonDspOperation = "update_budget" | "pause" | "resume" | "update";

/**
 * Governed entity kinds, labelled with the upstream input key. `order` is the
 * campaign-level object and `lineItem` the ad-group-level object (both via
 * `amazon_dsp_update_entity`'s `entityType` input). `commitment` is the v1
 * commitment surface (via `amazon_dsp_update_commitment`'s `commitmentId` input);
 * commitment fixtures stash the commitment ID in `AmazonDspFixtureArgs.entityId`
 * so the fixture-args shape stays uniform.
 */
export type AmazonDspEntityKindKey = "order" | "lineItem" | "commitment";

export interface AmazonDspFixtureArgs {
  /** Mirrors the `entityType` input on `amazon_dsp_update_entity`. */
  entityType: AmazonDspEntityKindKey;
  /** Mirrors the `profileId` input — the Amazon DSP advertiser ID (scrubbed). */
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
export interface AmazonDspWriteFixture {
  /** Canonical operation this fixture exercises. */
  operation: AmazonDspOperation;
  /** Upstream entity-kind key. */
  entityKind: AmazonDspEntityKindKey;
  /** Inputs to the write tool (scrubbed). */
  args: AmazonDspFixtureArgs;
  /** Pre-write entity, as `amazon_dsp_get_entity` would return it (scrubbed). */
  preState: Record<string, unknown>;
  /** Expected post-write canonical snapshot. */
  expectedPostState: NormalizedEntitySnapshot;
  /** Human-readable description used as the fixture's test name. */
  description: string;
}
