// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Public testkit types for the LinkedIn Ads platform package.
 *
 * Consumers (e.g. `cesteral-intelligence`) import these from
 * `@cesteral/linkedin-mcp/testkit` to verify their own preview/symbolic-apply
 * implementations against canonical fixture pairs the platform owns. Mirrors
 * the Amazon DSP / Meta / DV360 testkit shape.
 */

import type { NormalizedEntitySnapshot } from "@cesteral/shared";

/**
 * Canonical operation labels for round-3 governance. The LinkedIn
 * `update_entity` tool dispatches to these via the `data` payload (no separate
 * operation input). Fixtures pin one operation per fixture so consumers can
 * filter.
 */
export type LinkedInOperation =
  | "update_budget"
  | "pause"
  | "resume"
  | "delete"
  | "create"
  | "duplicate";

/**
 * Governed entity kinds, labelled with the upstream `entityType` input key.
 * Governed scope is `campaign` only — `campaignGroup` is intentionally out of
 * scope (governance taxonomy decision pending).
 */
export type LinkedInEntityKindKey = "campaign";

export interface LinkedInFixtureArgs {
  /** Mirrors the `entityType` input on `linkedin_update_entity`. */
  entityType: LinkedInEntityKindKey;
  /** Mirrors the `entityUrn` input — the LinkedIn entity URN (scrubbed). */
  entityUrn: string;
  /** Mirrors the `data` input — the partial fields to write. */
  data: Record<string, unknown>;
}

/**
 * One state-transition fixture: `args` + `preState` symbolically applied
 * yields `expectedPostState`. `assertContract` runs that check.
 */
export interface LinkedInWriteFixture {
  /** Governed write contract this fixture proves. */
  contractToolSlug: "update_entity" | "delete_entity" | "create_entity" | "duplicate_entity";
  /** Canonical operation this fixture exercises. */
  operation: LinkedInOperation;
  /** Upstream entity-kind key. */
  entityKind: LinkedInEntityKindKey;
  /** Inputs to the write tool (scrubbed). */
  args: LinkedInFixtureArgs;
  /** Pre-write entity, as `linkedin_get_entity` would return it (scrubbed). */
  preState: Record<string, unknown>;
  /** Expected post-write canonical snapshot. */
  expectedPostState: NormalizedEntitySnapshot;
  /** Human-readable description used as the fixture's test name. */
  description: string;
}
