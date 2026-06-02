// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Public testkit types for the Microsoft Ads platform package.
 *
 * Consumers (e.g. `cesteral-intelligence`) import these from
 * `@cesteral/msads-mcp/testkit` to verify their own preview/symbolic-apply
 * implementations against canonical fixture pairs the platform owns. Mirrors
 * the Amazon DSP / Meta / DV360 testkit shape.
 */

import type { NormalizedEntitySnapshot } from "@cesteral/shared";

/**
 * Canonical operation labels for round-4 governance. The Microsoft Ads
 * `msads_update_entity` tool dispatches to these via the `data` payload (no
 * separate operation input). Fixtures pin one operation per fixture so
 * consumers can filter.
 */
export type MsAdsOperation = "update_budget" | "pause" | "resume" | "create";

/**
 * Governed entity kinds, labelled with the upstream `entityType` input key.
 * `budget` is the shared/campaign-budget object.
 */
export type MsAdsEntityKindKey = "campaign" | "adGroup" | "ad" | "budget";

export interface MsAdsFixtureArgs {
  /** Mirrors the `entityType` input on `msads_update_entity`. */
  entityType: MsAdsEntityKindKey;
  /** Mirrors the `entityId` input (scrubbed). */
  entityId: string;
  /** Mirrors the `data` input — the partial fields to write. */
  data: Record<string, unknown>;
}

/**
 * One state-transition fixture: `args` + `preState` symbolically applied
 * yields `expectedPostState`. `assertContract` runs that check.
 */
export interface MsAdsWriteFixture {
  /** Governed write contract this fixture proves. */
  contractToolSlug: "update_entity" | "create_entity";
  /** Canonical operation this fixture exercises. */
  operation: MsAdsOperation;
  /** Upstream entity-kind key. */
  entityKind: MsAdsEntityKindKey;
  /** Inputs to the write tool (scrubbed). */
  args: MsAdsFixtureArgs;
  /** Pre-write entity, as `msads_get_entity` would return it (scrubbed). */
  preState: Record<string, unknown>;
  /** Expected post-write canonical snapshot. */
  expectedPostState: NormalizedEntitySnapshot;
  /** Human-readable description used as the fixture's test name. */
  description: string;
}
