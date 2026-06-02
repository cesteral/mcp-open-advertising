// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for the `amazon_dsp_duplicate_entity`
 * write surface (order + lineItem).
 *
 * The copy does not exist yet, so `entityId` is the empty placeholder and
 * `data` is the landing-status overlay (the copy lands in a non-running
 * `PAUSED` state) the dry-run applies to the SOURCE (`preState`).
 * `applyAmazonDspPatch(entityType, "", source, overlay)` must yield the copy's
 * canonical projection — exactly what the tool's dry-run `expectedPostState`
 * produces.
 */

import type { AmazonDspWriteFixture } from "../types.js";

const advertiserId = "advertiser-REDACTED-001";

/** duplicate: order copy lands PAUSED (projected from source). */
export const duplicateOrder: AmazonDspWriteFixture = {
  contractToolSlug: "duplicate_entity",
  operation: "duplicate",
  entityKind: "order",
  args: {
    entityType: "order",
    profileId: advertiserId,
    entityId: "",
    data: { state: "PAUSED" },
  },
  preState: {
    orderId: "ord-REDACTED-1",
    name: "Source Order",
    state: "ENABLED",
    advertiserId,
    budget: 40000,
    budgetType: "LIFETIME",
    currencyCode: "USD",
    startDateTime: "2026-01-01T00:00:00Z",
    endDateTime: "2026-12-31T00:00:00Z",
  },
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
    profileId: advertiserId,
    entityId: "",
    data: { state: "PAUSED" },
  },
  preState: {
    lineItemId: "li-REDACTED-1",
    name: "Source Line Item",
    state: "ENABLED",
    orderId: "ord-REDACTED-1",
    advertiserId,
    budget: { budgetType: "DAILY", budget: 2000 },
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "line_item",
    platformEntityId: "",
    displayName: "Source Line Item",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: {
      daily: { amountMinor: 200_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "duplicate: line-item copy lands PAUSED, budget preserved (projected from source)",
};

export const allDuplicateFixtures: readonly AmazonDspWriteFixture[] = [
  duplicateOrder,
  duplicateLineItem,
];
