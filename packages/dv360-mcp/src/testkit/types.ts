// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Public testkit types for the DV360 platform package.
 *
 * Mirrors the Meta testkit shape; consumers ingest both via
 * `@cesteral/dv360-mcp/testkit`.
 */

import type { NormalizedEntitySnapshot } from "@cesteral/shared";

export type Dv360Operation = "update_budget" | "pause" | "resume" | "delete";

export type Dv360EntityKindKey = "campaign" | "insertionOrder" | "lineItem";

export interface Dv360FixtureArgs {
  /** Mirrors the `entityType` input on `dv360_update_entity`. */
  entityType: Dv360EntityKindKey;
  /**
   * Parent + entity IDs as resolved by the entity-id-extraction helper.
   * Always scrubbed.
   */
  ids: Record<string, string>;
  /** Mirrors the `data` input — partial fields to PATCH. */
  data: Record<string, unknown>;
  /** Mirrors the `updateMask` input — comma-separated dotted-path fields. */
  updateMask: string;
}

export interface Dv360WriteFixture {
  /** Governed write contract this fixture proves. */
  contractToolSlug: "update_entity" | "delete_entity";
  operation: Dv360Operation;
  entityKind: Dv360EntityKindKey;
  args: Dv360FixtureArgs;
  /** Pre-write entity, as `dv360_get_entity` would return it (scrubbed). */
  preState: Record<string, unknown>;
  /** Expected post-write canonical snapshot. */
  expectedPostState: NormalizedEntitySnapshot;
  description: string;
}
