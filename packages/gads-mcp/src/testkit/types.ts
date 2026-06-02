// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Public testkit types for the Google Ads platform package.
 *
 * Consumers (e.g. `cesteral-intelligence`) import these from
 * `@cesteral/gads-mcp/testkit` to verify their own preview/symbolic-apply
 * implementations against canonical fixture pairs the platform owns. Mirrors
 * the Meta / DV360 testkit shape.
 */

import type { NormalizedEntitySnapshot } from "@cesteral/shared";

/**
 * Canonical operation labels for round-2 governance. The Google Ads
 * `update_entity` tool dispatches to these via the `data` + `updateMask`
 * payload (no separate operation input). Fixtures pin one operation per
 * fixture so consumers can filter.
 */
export type GAdsOperation = "update_budget" | "pause" | "resume" | "delete" | "create";

/**
 * Governed entity kinds, labelled with the upstream camelCase `entityType`
 * input key (not the canonical snake_case kind — see the R2-U1 mapping table).
 */
export type GAdsEntityKindKey = "campaign" | "adGroup" | "campaignBudget";

export interface GAdsFixtureArgs {
  /** Mirrors the `entityType` input on `gads_update_entity`. */
  entityType: GAdsEntityKindKey;
  /** Mirrors the `customerId` input (scrubbed). */
  customerId: string;
  /** Mirrors the `entityId` input (scrubbed). */
  entityId: string;
  /** Mirrors the `data` input — the partial fields to write. */
  data: Record<string, unknown>;
  /** Mirrors the `updateMask` input — comma-separated field names. */
  updateMask: string;
}

/**
 * One state-transition fixture: `args` + `preState` symbolically applied
 * yields `expectedPostState`. `assertContract` runs that check.
 */
export interface GAdsWriteFixture {
  /** Governed write contract this fixture proves. */
  contractToolSlug: "update_entity" | "remove_entity" | "create_entity";
  /** Canonical operation this fixture exercises. */
  operation: GAdsOperation;
  /** Upstream entity-kind key. */
  entityKind: GAdsEntityKindKey;
  /** Inputs to the write tool (scrubbed). */
  args: GAdsFixtureArgs;
  /**
   * Pre-write entity resource, un-nested from the `googleAds:search` result
   * row exactly as `gads_get_entity` would surface it (scrubbed).
   */
  preState: Record<string, unknown>;
  /** Expected post-write canonical snapshot. */
  expectedPostState: NormalizedEntitySnapshot;
  /** Human-readable description used as the fixture's test name. */
  description: string;
}
