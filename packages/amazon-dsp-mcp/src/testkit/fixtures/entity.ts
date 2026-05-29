// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for the `amazon_dsp_update_entity`
 * write surface (order + lineItem).
 *
 * Every fixture is hand-authored against scrubbed advertiser/entity IDs. A
 * live capture + scrub script is deferred — this surface covers one fixture
 * per governed (operation, entityKind) pair within order + lineItem.
 *
 * `expectedPostState` is the canonical snapshot that
 * `applyAmazonDspPatch(entityType, entityId, preState, data)` must produce.
 * The conformance test in
 * `packages/amazon-dsp-mcp/tests/testkit/conformance.test.ts` enforces this.
 *
 * Amazon DSP budget amounts are in the advertiser-currency major units; the
 * canonical snapshot stores minor units, so amounts are ×100. `order` carries
 * a flat `budget` number; `lineItem` carries a nested `{ budgetType, budget }`.
 */

import type { AmazonDspWriteFixture } from "../types.js";

const advertiserId = "advertiser-REDACTED-001";

/** update_budget: order lifetime budget increase ($50,000 → $75,000). */
export const updateBudgetOrder: AmazonDspWriteFixture = {
  operation: "update_budget",
  entityKind: "order",
  args: {
    entityType: "order",
    profileId: advertiserId,
    entityId: "ord-REDACTED-1",
    data: { budget: 75000 },
  },
  preState: {
    orderId: "ord-REDACTED-1",
    name: "Sample Order",
    state: "ENABLED",
    advertiserId,
    budget: 50000,
    budgetType: "LIFETIME",
    currencyCode: "USD",
    startDateTime: "2026-01-01T00:00:00Z",
    endDateTime: "2026-12-31T00:00:00Z",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "order",
    platformEntityId: "ord-REDACTED-1",
    displayName: "Sample Order",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "ENABLED" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 7_500_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-12-31T00:00:00Z" },
  },
  description: "update_budget: order lifetime budget increase $50,000 → $75,000",
};

/** update_budget: line-item daily budget increase ($5 → $10). */
export const updateBudgetLineItem: AmazonDspWriteFixture = {
  operation: "update_budget",
  entityKind: "lineItem",
  args: {
    entityType: "lineItem",
    profileId: advertiserId,
    entityId: "li-REDACTED-1",
    data: { budget: { budgetType: "DAILY", budget: 1000 } },
  },
  preState: {
    lineItemId: "li-REDACTED-1",
    name: "Sample Line Item",
    state: "ENABLED",
    orderId: "ord-REDACTED-1",
    advertiserId,
    budget: { budgetType: "DAILY", budget: 500 },
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "line_item",
    platformEntityId: "li-REDACTED-1",
    displayName: "Sample Line Item",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "ENABLED" },
    budget: {
      daily: { amountMinor: 100_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "update_budget: line-item daily budget increase $5 → $10",
};

/** pause: order ENABLED → PAUSED (budget preserved). */
export const pauseOrder: AmazonDspWriteFixture = {
  operation: "pause",
  entityKind: "order",
  args: {
    entityType: "order",
    profileId: advertiserId,
    entityId: "ord-REDACTED-2",
    data: { state: "PAUSED" },
  },
  preState: {
    orderId: "ord-REDACTED-2",
    name: "Sample Order 2",
    state: "ENABLED",
    advertiserId,
    budget: 50000,
    budgetType: "LIFETIME",
    currencyCode: "USD",
    startDateTime: "2026-01-01T00:00:00Z",
    endDateTime: "2026-12-31T00:00:00Z",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "order",
    platformEntityId: "ord-REDACTED-2",
    displayName: "Sample Order 2",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 5_000_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-12-31T00:00:00Z" },
  },
  description: "pause: order transition ENABLED → PAUSED (budget preserved)",
};

/** pause: line-item ENABLED → PAUSED (budget preserved). */
export const pauseLineItem: AmazonDspWriteFixture = {
  operation: "pause",
  entityKind: "lineItem",
  args: {
    entityType: "lineItem",
    profileId: advertiserId,
    entityId: "li-REDACTED-2",
    data: { state: "PAUSED" },
  },
  preState: {
    lineItemId: "li-REDACTED-2",
    name: "Sample Line Item 2",
    state: "ENABLED",
    orderId: "ord-REDACTED-2",
    advertiserId,
    budget: { budgetType: "DAILY", budget: 500 },
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "line_item",
    platformEntityId: "li-REDACTED-2",
    displayName: "Sample Line Item 2",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: {
      daily: { amountMinor: 50_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "pause: line-item transition ENABLED → PAUSED (budget preserved)",
};

/** resume: order PAUSED → ENABLED (budget preserved). */
export const resumeOrder: AmazonDspWriteFixture = {
  operation: "resume",
  entityKind: "order",
  args: {
    entityType: "order",
    profileId: advertiserId,
    entityId: "ord-REDACTED-3",
    data: { state: "ENABLED" },
  },
  preState: {
    orderId: "ord-REDACTED-3",
    name: "Sample Order 3",
    state: "PAUSED",
    advertiserId,
    budget: 50000,
    budgetType: "LIFETIME",
    currencyCode: "USD",
    startDateTime: "2026-01-01T00:00:00Z",
    endDateTime: "2026-12-31T00:00:00Z",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "order",
    platformEntityId: "ord-REDACTED-3",
    displayName: "Sample Order 3",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "ENABLED" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 5_000_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-12-31T00:00:00Z" },
  },
  description: "resume: order transition PAUSED → ENABLED (budget preserved)",
};

/** resume: line-item PAUSED → ENABLED (budget preserved). */
export const resumeLineItem: AmazonDspWriteFixture = {
  operation: "resume",
  entityKind: "lineItem",
  args: {
    entityType: "lineItem",
    profileId: advertiserId,
    entityId: "li-REDACTED-3",
    data: { state: "ENABLED" },
  },
  preState: {
    lineItemId: "li-REDACTED-3",
    name: "Sample Line Item 3",
    state: "PAUSED",
    orderId: "ord-REDACTED-3",
    advertiserId,
    budget: { budgetType: "DAILY", budget: 500 },
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "line_item",
    platformEntityId: "li-REDACTED-3",
    displayName: "Sample Line Item 3",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "ENABLED" },
    budget: {
      daily: { amountMinor: 50_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "resume: line-item transition PAUSED → ENABLED (budget preserved)",
};
