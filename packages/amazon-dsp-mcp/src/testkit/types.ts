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
export type AmazonDspOperation = "update_budget" | "pause" | "resume" | "update" | "create";

/**
 * Governed entity kinds, labelled with the upstream input key. `order` is the
 * campaign-level object and `lineItem` the ad-group-level object (both via
 * `amazon_dsp_update_entity`'s `entityType` input). `commitment` is the v1
 * commitment surface via `amazon_dsp_update_commitment`.
 */
export type AmazonDspEntityKindKey = "order" | "lineItem" | "commitment";

export interface AmazonDspUpdateEntityFixtureArgs {
  /** Mirrors the `entityType` input on `amazon_dsp_update_entity`. */
  entityType: Exclude<AmazonDspEntityKindKey, "commitment">;
  /** Mirrors the `profileId` input — the Amazon DSP advertiser ID (scrubbed). */
  profileId: string;
  /** Mirrors the `entityId` input (scrubbed). */
  entityId: string;
  /** Mirrors the `data` input — the partial fields to write. */
  data: Record<string, unknown>;
}

export interface AmazonDspUpdateCommitmentFixtureArgs {
  /** Mirrors the `profileId` input — the Amazon DSP advertiser ID (scrubbed). */
  profileId: string;
  /** Mirrors the `commitmentId` input (scrubbed). */
  commitmentId: string;
  /** Mirrors the `data` input — the partial fields to write. */
  data: Record<string, unknown>;
}

export type AmazonDspFixtureArgs =
  | AmazonDspUpdateEntityFixtureArgs
  | AmazonDspUpdateCommitmentFixtureArgs;

/**
 * One state-transition fixture: `args` + `preState` symbolically applied
 * yields `expectedPostState`. `assertContract` runs that check.
 */
interface AmazonDspFixtureBase {
  /** Canonical operation this fixture exercises. */
  operation: AmazonDspOperation;
  /** Pre-write entity, as `amazon_dsp_get_entity` would return it (scrubbed). */
  preState: Record<string, unknown>;
  /** Expected post-write canonical snapshot. */
  expectedPostState: NormalizedEntitySnapshot;
  /** Human-readable description used as the fixture's test name. */
  description: string;
}

export type AmazonDspWriteFixture =
  | (AmazonDspFixtureBase & {
      /** Governed write contract this fixture proves. */
      contractToolSlug: "update_entity";
      /** Upstream entity-kind key. */
      entityKind: Exclude<AmazonDspEntityKindKey, "commitment">;
      /** Inputs to the write tool (scrubbed). */
      args: AmazonDspUpdateEntityFixtureArgs;
    })
  | (AmazonDspFixtureBase & {
      /** Governed write contract this fixture proves. */
      contractToolSlug: "update_commitment";
      /** Upstream entity-kind key. */
      entityKind: "commitment";
      /** Inputs to the write tool (scrubbed). */
      args: AmazonDspUpdateCommitmentFixtureArgs;
    })
  | (AmazonDspFixtureBase & {
      /** Governed write contract this fixture proves. */
      contractToolSlug: "create_entity";
      /** Upstream entity-kind key. */
      entityKind: Exclude<AmazonDspEntityKindKey, "commitment">;
      /**
       * Inputs to `amazon_dsp_create_entity` (scrubbed). Reuses the
       * update-entity arg shape; `entityId` is the would-be-created placeholder
       * (empty string) since create has no pre-existing ID.
       */
      args: AmazonDspUpdateEntityFixtureArgs;
    });
