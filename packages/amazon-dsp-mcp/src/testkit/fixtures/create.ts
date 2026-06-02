// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for the `amazon_dsp_create_entity` write
 * surface (order + lineItem).
 *
 * Create has no pre-existing entity, so `preState` is empty and the would-be
 * entity ID is the empty-string placeholder the symbolic create dry-run emits.
 * `expectedPostState` is the canonical snapshot
 * `applyAmazonDspPatch(entityType, "", {}, data)` must produce — the symbolic
 * apply of the create payload over an empty base.
 *
 * Amazon DSP budget amounts are in advertiser-currency major units (×100 for
 * minor). `order` carries a flat `budget` number with a sibling `budgetType`;
 * `lineItem` carries a nested `{ budgetType, budget }`.
 */

import type { AmazonDspWriteFixture } from "../types.js";

const advertiserId = "advertiser-REDACTED-001";

/** create: order (would-be-created, $40,000 lifetime). */
export const createOrder: AmazonDspWriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "order",
  args: {
    entityType: "order",
    profileId: advertiserId,
    entityId: "",
    data: {
      name: "New Order",
      state: "PAUSED",
      advertiserId,
      budget: 40000,
      budgetType: "LIFETIME",
      currencyCode: "USD",
      startDateTime: "2026-07-01T00:00:00Z",
      endDateTime: "2026-07-31T00:00:00Z",
    },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "order",
    platformEntityId: "",
    displayName: "New Order",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 4_000_000, currency: "USD" },
    },
    schedule: { startAt: "2026-07-01T00:00:00Z", endAt: "2026-07-31T00:00:00Z" },
  },
  description: "create: order (would-be-created, $40,000 lifetime)",
};

/** create: line-item (would-be-created, $20 daily). */
export const createLineItem: AmazonDspWriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "lineItem",
  args: {
    entityType: "lineItem",
    profileId: advertiserId,
    entityId: "",
    data: {
      name: "New Line Item",
      state: "PAUSED",
      orderId: "ord-REDACTED-1",
      advertiserId,
      budget: { budgetType: "DAILY", budget: 2000 },
    },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "line_item",
    platformEntityId: "",
    displayName: "New Line Item",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: {
      daily: { amountMinor: 200_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "create: line-item (would-be-created, $20 daily)",
};

export const allCreateFixtures: readonly AmazonDspWriteFixture[] = [createOrder, createLineItem];
