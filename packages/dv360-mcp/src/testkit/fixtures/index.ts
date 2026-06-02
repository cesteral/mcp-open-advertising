// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for round-1 DV360 write operations.
 *
 * Hand-authored against scrubbed advertiser/entity IDs. Live capture +
 * scrub script is deferred — see plan §"Per-Platform Testkit Subpath Export".
 *
 * `expectedPostState` mirrors what `applyDv360Patch(args.entityType, args.ids,
 * preState, args.data, args.updateMask)` produces. Conformance test in
 * `tests/testkit/conformance.test.ts` enforces this.
 *
 * Currency note: round-1 canonical shape defaults to USD because DV360
 * advertiser currency isn't carried on the entity directly. Scrubbed
 * fixtures reuse that default.
 */

import type { Dv360WriteFixture } from "../types.js";

/** $50/day baseline budget segment (50,000,000 micros = 5,000 cents = $50). */
const baseSegment = {
  budgetAmountMicros: "50000000",
  dateRange: {
    startDate: { year: 2026, month: 1, day: 1 },
    endDate: { year: 2026, month: 12, day: 31 },
  },
};

const advertiserId = "advertiser-REDACTED-001";

/** update_budget: insertion-order budget increase (one segment, $50 → $75). */
export const updateBudgetIncreaseInsertionOrder: Dv360WriteFixture = {
  contractToolSlug: "update_entity",
  operation: "update_budget",
  entityKind: "insertionOrder",
  args: {
    entityType: "insertionOrder",
    ids: { advertiserId, insertionOrderId: "io-REDACTED-1" },
    data: {
      budget: {
        budgetSegments: [
          {
            budgetAmountMicros: "75000000",
            dateRange: {
              startDate: { year: 2026, month: 1, day: 1 },
              endDate: { year: 2026, month: 12, day: 31 },
            },
          },
        ],
      },
    },
    updateMask: "budget.budgetSegments",
  },
  preState: {
    name: `advertisers/${advertiserId}/insertionOrders/io-REDACTED-1`,
    insertionOrderId: "io-REDACTED-1",
    displayName: "Sample Insertion Order",
    entityStatus: "ENTITY_STATUS_ACTIVE",
    budget: {
      budgetUnit: "BUDGET_UNIT_CURRENCY",
      automationType: "INSERTION_ORDER_AUTOMATION_TYPE_BUDGET",
      budgetSegments: [baseSegment],
    },
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "dv360",
    entityKind: "insertion_order",
    platformEntityId: "io-REDACTED-1",
    displayName: "Sample Insertion Order",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "ENTITY_STATUS_ACTIVE" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 7500, currency: "USD" },
      segments: [
        {
          amountMinor: 7500,
          currency: "USD",
          startAt: "2026-01-01",
          endAt: "2026-12-31",
        },
      ],
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "update_budget: insertion-order single-segment budget increase $50 → $75",
};

/** update_budget: line-item budget decrease ($50 → $30). */
export const updateBudgetDecreaseLineItem: Dv360WriteFixture = {
  contractToolSlug: "update_entity",
  operation: "update_budget",
  entityKind: "lineItem",
  args: {
    entityType: "lineItem",
    ids: {
      advertiserId,
      insertionOrderId: "io-REDACTED-1",
      lineItemId: "li-REDACTED-1",
    },
    data: {
      budget: {
        budgetAllocationType: "LINE_ITEM_BUDGET_ALLOCATION_TYPE_FIXED",
        budgetUnit: "BUDGET_UNIT_CURRENCY",
        maxAmount: "30000000",
      },
    },
    updateMask: "budget.maxAmount",
  },
  preState: {
    name: `advertisers/${advertiserId}/lineItems/li-REDACTED-1`,
    lineItemId: "li-REDACTED-1",
    insertionOrderId: "io-REDACTED-1",
    displayName: "Sample Line Item",
    entityStatus: "ENTITY_STATUS_ACTIVE",
    budget: {
      budgetAllocationType: "LINE_ITEM_BUDGET_ALLOCATION_TYPE_FIXED",
      budgetUnit: "BUDGET_UNIT_CURRENCY",
      maxAmount: "50000000",
    },
  },
  // The canonical shape for line items in round 1 doesn't surface
  // `budget.maxAmount` (no segments) — the snapshot leaves budget.lifetime
  // null. The fixture still exercises the symbolic-apply path so an
  // accidental schema regression (e.g. emitting a non-null lifetime from a
  // missing segments array) shows up as a contract break.
  expectedPostState: {
    schemaVersion: 1,
    platform: "dv360",
    entityKind: "line_item",
    platformEntityId: "li-REDACTED-1",
    displayName: "Sample Line Item",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "ENTITY_STATUS_ACTIVE" },
    budget: {
      daily: null,
      lifetime: null,
      segments: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description:
    "update_budget: line-item maxAmount decrease $50 → $30 (lifetime stays null — round-1 canonical shape covers segments only)",
};

/** pause: line-item ACTIVE → PAUSED. */
export const pauseLineItemFromActive: Dv360WriteFixture = {
  contractToolSlug: "update_entity",
  operation: "pause",
  entityKind: "lineItem",
  args: {
    entityType: "lineItem",
    ids: {
      advertiserId,
      insertionOrderId: "io-REDACTED-2",
      lineItemId: "li-REDACTED-2",
    },
    data: { entityStatus: "ENTITY_STATUS_PAUSED" },
    updateMask: "entityStatus",
  },
  preState: {
    name: `advertisers/${advertiserId}/lineItems/li-REDACTED-2`,
    lineItemId: "li-REDACTED-2",
    insertionOrderId: "io-REDACTED-2",
    displayName: "Sample Line Item 2",
    entityStatus: "ENTITY_STATUS_ACTIVE",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "dv360",
    entityKind: "line_item",
    platformEntityId: "li-REDACTED-2",
    displayName: "Sample Line Item 2",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "ENTITY_STATUS_PAUSED" },
    budget: { daily: null, lifetime: null, segments: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "pause: line-item ACTIVE → PAUSED",
};

/** pause: insertion-order ACTIVE → PAUSED (preserves budget shape). */
export const pauseInsertionOrderFromActive: Dv360WriteFixture = {
  contractToolSlug: "update_entity",
  operation: "pause",
  entityKind: "insertionOrder",
  args: {
    entityType: "insertionOrder",
    ids: { advertiserId, insertionOrderId: "io-REDACTED-3" },
    data: { entityStatus: "ENTITY_STATUS_PAUSED" },
    updateMask: "entityStatus",
  },
  preState: {
    name: `advertisers/${advertiserId}/insertionOrders/io-REDACTED-3`,
    insertionOrderId: "io-REDACTED-3",
    displayName: "Sample Insertion Order 3",
    entityStatus: "ENTITY_STATUS_ACTIVE",
    budget: {
      budgetUnit: "BUDGET_UNIT_CURRENCY",
      automationType: "INSERTION_ORDER_AUTOMATION_TYPE_BUDGET",
      budgetSegments: [baseSegment],
    },
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "dv360",
    entityKind: "insertion_order",
    platformEntityId: "io-REDACTED-3",
    displayName: "Sample Insertion Order 3",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "ENTITY_STATUS_PAUSED" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 5000, currency: "USD" },
      segments: [
        {
          amountMinor: 5000,
          currency: "USD",
          startAt: "2026-01-01",
          endAt: "2026-12-31",
        },
      ],
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "pause: insertion-order ACTIVE → PAUSED (budget preserved)",
};

/** resume: line-item PAUSED → ACTIVE. */
export const resumeLineItemFromPaused: Dv360WriteFixture = {
  contractToolSlug: "update_entity",
  operation: "resume",
  entityKind: "lineItem",
  args: {
    entityType: "lineItem",
    ids: {
      advertiserId,
      insertionOrderId: "io-REDACTED-4",
      lineItemId: "li-REDACTED-4",
    },
    data: { entityStatus: "ENTITY_STATUS_ACTIVE" },
    updateMask: "entityStatus",
  },
  preState: {
    name: `advertisers/${advertiserId}/lineItems/li-REDACTED-4`,
    lineItemId: "li-REDACTED-4",
    insertionOrderId: "io-REDACTED-4",
    displayName: "Sample Line Item 4",
    entityStatus: "ENTITY_STATUS_PAUSED",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "dv360",
    entityKind: "line_item",
    platformEntityId: "li-REDACTED-4",
    displayName: "Sample Line Item 4",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "ENTITY_STATUS_ACTIVE" },
    budget: { daily: null, lifetime: null, segments: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "resume: line-item PAUSED → ACTIVE",
};

/** resume: insertion-order PAUSED → ACTIVE. */
export const resumeInsertionOrderFromPaused: Dv360WriteFixture = {
  contractToolSlug: "update_entity",
  operation: "resume",
  entityKind: "insertionOrder",
  args: {
    entityType: "insertionOrder",
    ids: { advertiserId, insertionOrderId: "io-REDACTED-5" },
    data: { entityStatus: "ENTITY_STATUS_ACTIVE" },
    updateMask: "entityStatus",
  },
  preState: {
    name: `advertisers/${advertiserId}/insertionOrders/io-REDACTED-5`,
    insertionOrderId: "io-REDACTED-5",
    displayName: "Sample Insertion Order 5",
    entityStatus: "ENTITY_STATUS_PAUSED",
    budget: {
      budgetUnit: "BUDGET_UNIT_CURRENCY",
      automationType: "INSERTION_ORDER_AUTOMATION_TYPE_BUDGET",
      budgetSegments: [baseSegment],
    },
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "dv360",
    entityKind: "insertion_order",
    platformEntityId: "io-REDACTED-5",
    displayName: "Sample Insertion Order 5",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "ENTITY_STATUS_ACTIVE" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 5000, currency: "USD" },
      segments: [
        {
          amountMinor: 5000,
          currency: "USD",
          startAt: "2026-01-01",
          endAt: "2026-12-31",
        },
      ],
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "resume: insertion-order PAUSED → ACTIVE (budget preserved)",
};

/**
 * delete: DV360 hard-deletes; the canonical post-state is the entity with
 * `ENTITY_STATUS_DELETED` (canonical `deleted`). Modeled as an entityStatus
 * patch so `applyDv360Patch` yields the deleted post-state. One per governed
 * kind (campaign / insertion_order / line_item).
 */
export const deleteCampaign: Dv360WriteFixture = {
  contractToolSlug: "delete_entity",
  operation: "delete",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    ids: { advertiserId, campaignId: "campaign-REDACTED-9" },
    data: { entityStatus: "ENTITY_STATUS_DELETED" },
    updateMask: "entityStatus",
  },
  preState: {
    name: `advertisers/${advertiserId}/campaigns/campaign-REDACTED-9`,
    campaignId: "campaign-REDACTED-9",
    displayName: "Retired Campaign",
    entityStatus: "ENTITY_STATUS_ARCHIVED",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "dv360",
    entityKind: "campaign",
    platformEntityId: "campaign-REDACTED-9",
    displayName: "Retired Campaign",
    accountId: advertiserId,
    status: { canonical: "deleted", platformRaw: "ENTITY_STATUS_DELETED" },
    budget: { daily: null, lifetime: null, segments: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "delete: campaign → ENTITY_STATUS_DELETED (canonical deleted)",
};

export const deleteInsertionOrder: Dv360WriteFixture = {
  contractToolSlug: "delete_entity",
  operation: "delete",
  entityKind: "insertionOrder",
  args: {
    entityType: "insertionOrder",
    ids: { advertiserId, insertionOrderId: "io-REDACTED-9" },
    data: { entityStatus: "ENTITY_STATUS_DELETED" },
    updateMask: "entityStatus",
  },
  preState: {
    name: `advertisers/${advertiserId}/insertionOrders/io-REDACTED-9`,
    insertionOrderId: "io-REDACTED-9",
    displayName: "Retired Insertion Order",
    entityStatus: "ENTITY_STATUS_ARCHIVED",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "dv360",
    entityKind: "insertion_order",
    platformEntityId: "io-REDACTED-9",
    displayName: "Retired Insertion Order",
    accountId: advertiserId,
    status: { canonical: "deleted", platformRaw: "ENTITY_STATUS_DELETED" },
    budget: { daily: null, lifetime: null, segments: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "delete: insertion-order → ENTITY_STATUS_DELETED (canonical deleted)",
};

export const deleteLineItem: Dv360WriteFixture = {
  contractToolSlug: "delete_entity",
  operation: "delete",
  entityKind: "lineItem",
  args: {
    entityType: "lineItem",
    ids: { advertiserId, lineItemId: "li-REDACTED-9" },
    data: { entityStatus: "ENTITY_STATUS_DELETED" },
    updateMask: "entityStatus",
  },
  preState: {
    name: `advertisers/${advertiserId}/lineItems/li-REDACTED-9`,
    lineItemId: "li-REDACTED-9",
    displayName: "Retired Line Item",
    entityStatus: "ENTITY_STATUS_ARCHIVED",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "dv360",
    entityKind: "line_item",
    platformEntityId: "li-REDACTED-9",
    displayName: "Retired Line Item",
    accountId: advertiserId,
    status: { canonical: "deleted", platformRaw: "ENTITY_STATUS_DELETED" },
    budget: { daily: null, lifetime: null, segments: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "delete: line-item → ENTITY_STATUS_DELETED (canonical deleted)",
};

/**
 * create fixtures. Create has no pre-existing entity, so `preState` is empty
 * and the new entity's own ID is a placeholder (`*-REDACTED-NEW`) folded into
 * `ids` — mirroring how the tool's `after` snapshot identifies the created
 * resource. `updateMask` names every create field so `applyDv360Patch` overlays
 * them onto the empty base.
 */
export const createCampaign: Dv360WriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    ids: { advertiserId, campaignId: "campaign-REDACTED-NEW" },
    data: { displayName: "New Campaign", entityStatus: "ENTITY_STATUS_PAUSED" },
    updateMask: "displayName,entityStatus",
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "dv360",
    entityKind: "campaign",
    platformEntityId: "campaign-REDACTED-NEW",
    displayName: "New Campaign",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "ENTITY_STATUS_PAUSED" },
    budget: { daily: null, lifetime: null, segments: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "create: campaign (would-be-created, paused)",
};

export const createInsertionOrder: Dv360WriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "insertionOrder",
  args: {
    entityType: "insertionOrder",
    ids: { advertiserId, insertionOrderId: "io-REDACTED-NEW" },
    data: {
      displayName: "New Insertion Order",
      entityStatus: "ENTITY_STATUS_PAUSED",
      budget: { budgetSegments: [baseSegment] },
    },
    updateMask: "displayName,entityStatus,budget.budgetSegments",
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "dv360",
    entityKind: "insertion_order",
    platformEntityId: "io-REDACTED-NEW",
    displayName: "New Insertion Order",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "ENTITY_STATUS_PAUSED" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 5000, currency: "USD" },
      segments: [
        {
          amountMinor: 5000,
          currency: "USD",
          startAt: "2026-01-01",
          endAt: "2026-12-31",
        },
      ],
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "create: insertion-order (would-be-created, $50 single-segment)",
};

export const createLineItem: Dv360WriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "lineItem",
  args: {
    entityType: "lineItem",
    ids: { advertiserId, lineItemId: "li-REDACTED-NEW" },
    data: { displayName: "New Line Item", entityStatus: "ENTITY_STATUS_PAUSED" },
    updateMask: "displayName,entityStatus",
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "dv360",
    entityKind: "line_item",
    platformEntityId: "li-REDACTED-NEW",
    displayName: "New Line Item",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "ENTITY_STATUS_PAUSED" },
    budget: { daily: null, lifetime: null, segments: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "create: line-item (would-be-created, paused)",
};

export const allFixtures: readonly Dv360WriteFixture[] = [
  updateBudgetIncreaseInsertionOrder,
  updateBudgetDecreaseLineItem,
  pauseLineItemFromActive,
  pauseInsertionOrderFromActive,
  resumeLineItemFromPaused,
  resumeInsertionOrderFromPaused,
  deleteCampaign,
  deleteInsertionOrder,
  deleteLineItem,
  createCampaign,
  createInsertionOrder,
  createLineItem,
];
