// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for the `amazon_dsp_update_entity`
 * write surface (order + lineItem), in Unified API shapes (#234).
 *
 * Every fixture is hand-authored against scrubbed advertiser/entity IDs. The
 * entity shapes follow unified-api-dsp.json `DSPCampaign` / `DSPAdGroup`
 * (amzn/ads-advanced-tools-docs @ e25aace0); they are not live captures.
 *
 * `expectedPostState` is the canonical snapshot that
 * `applyAmazonDspPatch(entityType, entityId, preState, data, accountId)` must
 * produce. The conformance test in
 * `packages/amazon-dsp-mcp/tests/testkit/conformance.test.ts` enforces this.
 *
 * Budgets are `budgets[]` of `DSPBudget` (`recurrenceTimePeriod` DAILY →
 * canonical daily, LIFETIME → canonical lifetime), in advertiser-currency
 * major units; the canonical snapshot stores minor units (×100). An update
 * patch's budget carries only `value` (`DSPCreateMonetaryBudget`), so the
 * currency comes from the entity being updated.
 */

import type { AmazonDspWriteFixture } from "../types.js";
import { campaign, adGroup, monetaryBudget, advertiserId, profileId } from "./unified-shapes.js";

/** update_budget: order lifetime budget increase ($50,000 → $75,000). */
export const updateBudgetOrder: AmazonDspWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "update_budget",
  entityKind: "order",
  args: {
    entityType: "order",
    profileId,
    accountId: advertiserId,
    entityId: "cmp-REDACTED-1",
    data: { budgets: [monetaryBudget(75000, "LIFETIME")] },
  },
  preState: campaign("cmp-REDACTED-1", "Sample Order", "ENABLED", 50000),
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "order",
    platformEntityId: "cmp-REDACTED-1",
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
  contractToolSlug: "update_entity",
  operation: "update_budget",
  entityKind: "lineItem",
  args: {
    entityType: "lineItem",
    profileId,
    accountId: advertiserId,
    entityId: "adg-REDACTED-1",
    data: { budgets: [monetaryBudget(10, "DAILY")] },
  },
  preState: adGroup("adg-REDACTED-1", "Sample Line Item", "ENABLED", 5),
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "line_item",
    platformEntityId: "adg-REDACTED-1",
    displayName: "Sample Line Item",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "ENABLED" },
    budget: {
      daily: { amountMinor: 1_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-06-30T00:00:00Z" },
  },
  description: "update_budget: line-item daily budget increase $5 → $10",
};

/** pause: order ENABLED → PAUSED (budget preserved). */
export const pauseOrder: AmazonDspWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "pause",
  entityKind: "order",
  args: {
    entityType: "order",
    profileId,
    accountId: advertiserId,
    entityId: "cmp-REDACTED-2",
    data: { state: "PAUSED" },
  },
  preState: campaign("cmp-REDACTED-2", "Sample Order 2", "ENABLED", 50000),
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "order",
    platformEntityId: "cmp-REDACTED-2",
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
  contractToolSlug: "update_entity",
  operation: "pause",
  entityKind: "lineItem",
  args: {
    entityType: "lineItem",
    profileId,
    accountId: advertiserId,
    entityId: "adg-REDACTED-2",
    data: { state: "PAUSED" },
  },
  preState: adGroup("adg-REDACTED-2", "Sample Line Item 2", "ENABLED", 500),
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "line_item",
    platformEntityId: "adg-REDACTED-2",
    displayName: "Sample Line Item 2",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: {
      daily: { amountMinor: 50_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-06-30T00:00:00Z" },
  },
  description: "pause: line-item transition ENABLED → PAUSED (budget preserved)",
};

/** resume: order PAUSED → ENABLED (budget preserved). */
export const resumeOrder: AmazonDspWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "resume",
  entityKind: "order",
  args: {
    entityType: "order",
    profileId,
    accountId: advertiserId,
    entityId: "cmp-REDACTED-3",
    data: { state: "ENABLED" },
  },
  preState: campaign("cmp-REDACTED-3", "Sample Order 3", "PAUSED", 50000),
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "order",
    platformEntityId: "cmp-REDACTED-3",
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
  contractToolSlug: "update_entity",
  operation: "resume",
  entityKind: "lineItem",
  args: {
    entityType: "lineItem",
    profileId,
    accountId: advertiserId,
    entityId: "adg-REDACTED-3",
    data: { state: "ENABLED" },
  },
  preState: adGroup("adg-REDACTED-3", "Sample Line Item 3", "PAUSED", 500),
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "line_item",
    platformEntityId: "adg-REDACTED-3",
    displayName: "Sample Line Item 3",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "ENABLED" },
    budget: {
      daily: { amountMinor: 50_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-06-30T00:00:00Z" },
  },
  description: "resume: line-item transition PAUSED → ENABLED (budget preserved)",
};

export const allEntityFixtures: readonly AmazonDspWriteFixture[] = [
  updateBudgetOrder,
  updateBudgetLineItem,
  pauseOrder,
  pauseLineItem,
  resumeOrder,
  resumeLineItem,
];
