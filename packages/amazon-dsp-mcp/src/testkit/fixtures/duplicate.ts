// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for the `amazon_dsp_duplicate_entity`
 * write surface (order + lineItem), in Unified API shapes (#234).
 *
 * The copy does not exist yet, so `entityId` is the empty placeholder and
 * `data` is the landing-status overlay (the copy lands PAUSED — the only
 * create state Amazon accepts for DSP campaigns / ad groups) the dry-run
 * applies to the SOURCE (`preState`). `applyAmazonDspPatch(entityType, "",
 * source, overlay, accountId)` yields the copy's canonical projection. The
 * tool's dry-run additionally strips the source's read-only fields before
 * snapshotting; none of them change the canonical projection here (the
 * currency is USD either way, and a campaign's schedule comes from flights).
 */

import type { AmazonDspWriteFixture } from "../types.js";
import { campaign, adGroup, advertiserId, profileId } from "./unified-shapes.js";

/** duplicate: order copy lands PAUSED (projected from source). */
export const duplicateOrder: AmazonDspWriteFixture = {
  contractToolSlug: "duplicate_entity",
  operation: "duplicate",
  entityKind: "order",
  args: {
    entityType: "order",
    profileId,
    accountId: advertiserId,
    entityId: "",
    data: { state: "PAUSED" },
  },
  preState: campaign("cmp-REDACTED-1", "Source Order", "ENABLED", 40000),
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "order",
    platformEntityId: "",
    displayName: "Source Order",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 4_000_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-12-31T00:00:00Z" },
  },
  description: "duplicate: order copy lands PAUSED, budget preserved (projected from source)",
};

/** duplicate: line-item copy lands PAUSED (projected from source). */
export const duplicateLineItem: AmazonDspWriteFixture = {
  contractToolSlug: "duplicate_entity",
  operation: "duplicate",
  entityKind: "lineItem",
  args: {
    entityType: "lineItem",
    profileId,
    accountId: advertiserId,
    entityId: "",
    data: { state: "PAUSED" },
  },
  preState: adGroup("adg-REDACTED-1", "Source Line Item", "ENABLED", 20),
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "line_item",
    platformEntityId: "",
    displayName: "Source Line Item",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: {
      daily: { amountMinor: 2_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-06-30T00:00:00Z" },
  },
  description: "duplicate: line-item copy lands PAUSED, budget preserved (projected from source)",
};

export const allDuplicateFixtures: readonly AmazonDspWriteFixture[] = [
  duplicateOrder,
  duplicateLineItem,
];
