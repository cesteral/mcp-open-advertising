// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for the `amazon_dsp_create_entity` write
 * surface (order + lineItem), in Unified API shapes (#234).
 *
 * Create has no pre-existing entity, so `preState` is empty and the would-be
 * entity ID is the empty-string placeholder the symbolic create dry-run emits.
 * `expectedPostState` is the canonical snapshot
 * `applyAmazonDspPatch(entityType, "", {}, data, accountId)` must produce —
 * the symbolic apply of the create payload over an empty base. `data` carries
 * `state: "PAUSED"` explicitly, as the create translation adds it.
 *
 * Budgets are `budgets[]` (`DSPCreateBudget`, value only — no currency on a
 * create payload, so the snapshot falls back to USD). A campaign's schedule
 * comes from its `flights[]`.
 */

import type { AmazonDspWriteFixture } from "../types.js";
import { monetaryBudget, advertiserId, profileId } from "./unified-shapes.js";

/** create: order (would-be-created, $40,000 lifetime). */
export const createOrder: AmazonDspWriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "order",
  args: {
    entityType: "order",
    profileId,
    accountId: advertiserId,
    entityId: "",
    data: {
      name: "New Order",
      state: "PAUSED",
      budgets: [monetaryBudget(40000, "LIFETIME")],
      flights: [
        {
          startDateTime: "2026-07-01T00:00:00Z",
          endDateTime: "2026-07-31T00:00:00Z",
          budget: {
            budgetType: "MONETARY",
            budgetValue: { monetaryBudgetValue: { monetaryBudget: { value: 40000 } } },
          },
        },
      ],
      optimizations: { bidSettings: { bidStrategy: "SPEND_BUDGET_IN_FULL" } },
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
    profileId,
    accountId: advertiserId,
    entityId: "",
    data: {
      name: "New Line Item",
      state: "PAUSED",
      campaignId: "cmp-REDACTED-1",
      budgets: [monetaryBudget(20, "DAILY")],
      startDateTime: "2026-07-01T00:00:00Z",
      endDateTime: "2026-07-31T00:00:00Z",
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
      daily: { amountMinor: 2_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: "2026-07-01T00:00:00Z", endAt: "2026-07-31T00:00:00Z" },
  },
  description: "create: line-item (would-be-created, $20 daily)",
};

export const allCreateFixtures: readonly AmazonDspWriteFixture[] = [createOrder, createLineItem];
