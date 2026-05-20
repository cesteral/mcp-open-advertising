// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for round-2 Google Ads write operations.
 *
 * Every fixture is hand-authored against scrubbed customer/entity IDs. A live
 * capture + scrub script is deferred — round 2 covers one fixture per governed
 * (operation, entityKind) pair.
 *
 * `expectedPostState` is the canonical snapshot that
 * `applyGAdsPatch(entityType, customerId, entityId, preState, data, updateMask)`
 * must produce. The conformance test in
 * `packages/gads-mcp/tests/testkit/conformance.test.ts` enforces this.
 *
 * Governed scope is campaign / adGroup / campaignBudget. Budget lives on the
 * campaignBudget entity (`amountMicros`); campaign / adGroup carry no budget
 * field, so their snapshots leave `budget` null.
 */

import type { GAdsWriteFixture } from "../types.js";

const customerId = "customer-REDACTED-001";

/** pause: campaign ENABLED → PAUSED. */
export const pauseCampaign: GAdsWriteFixture = {
  operation: "pause",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    customerId,
    entityId: "campaign-REDACTED-1",
    data: { status: "PAUSED" },
    updateMask: "status",
  },
  preState: {
    id: "campaign-REDACTED-1",
    name: "Sample Search Campaign",
    status: "ENABLED",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "google_ads",
    entityKind: "campaign",
    platformEntityId: "campaign-REDACTED-1",
    displayName: "Sample Search Campaign",
    accountId: customerId,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: "2026-01-01", endAt: "2026-12-31" },
  },
  description: "pause: campaign transition ENABLED → PAUSED",
};

/** resume: campaign PAUSED → ENABLED. */
export const resumeCampaign: GAdsWriteFixture = {
  operation: "resume",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    customerId,
    entityId: "campaign-REDACTED-2",
    data: { status: "ENABLED" },
    updateMask: "status",
  },
  preState: {
    id: "campaign-REDACTED-2",
    name: "Sample Display Campaign",
    status: "PAUSED",
    startDate: "2026-02-01",
    endDate: "2026-11-30",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "google_ads",
    entityKind: "campaign",
    platformEntityId: "campaign-REDACTED-2",
    displayName: "Sample Display Campaign",
    accountId: customerId,
    status: { canonical: "active", platformRaw: "ENABLED" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: "2026-02-01", endAt: "2026-11-30" },
  },
  description: "resume: campaign transition PAUSED → ENABLED",
};

/** pause: ad group ENABLED → PAUSED. */
export const pauseAdGroup: GAdsWriteFixture = {
  operation: "pause",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    customerId,
    entityId: "adgroup-REDACTED-1",
    data: { status: "PAUSED" },
    updateMask: "status",
  },
  preState: {
    id: "adgroup-REDACTED-1",
    name: "Sample Ad Group",
    status: "ENABLED",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "google_ads",
    entityKind: "ad_group",
    platformEntityId: "adgroup-REDACTED-1",
    displayName: "Sample Ad Group",
    accountId: customerId,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "pause: ad group transition ENABLED → PAUSED",
};

/** resume: ad group PAUSED → ENABLED. */
export const resumeAdGroup: GAdsWriteFixture = {
  operation: "resume",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    customerId,
    entityId: "adgroup-REDACTED-2",
    data: { status: "ENABLED" },
    updateMask: "status",
  },
  preState: {
    id: "adgroup-REDACTED-2",
    name: "Sample Ad Group 2",
    status: "PAUSED",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "google_ads",
    entityKind: "ad_group",
    platformEntityId: "adgroup-REDACTED-2",
    displayName: "Sample Ad Group 2",
    accountId: customerId,
    status: { canonical: "active", platformRaw: "ENABLED" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "resume: ad group transition PAUSED → ENABLED",
};

/**
 * update_budget: campaign-budget daily amount increase ($50 → $75).
 * Google Ads budget amounts are micros; 1,000,000 micros = $1.00.
 */
export const updateBudgetCampaignBudget: GAdsWriteFixture = {
  operation: "update_budget",
  entityKind: "campaignBudget",
  args: {
    entityType: "campaignBudget",
    customerId,
    entityId: "budget-REDACTED-1",
    data: { amountMicros: "75000000" },
    updateMask: "amountMicros",
  },
  preState: {
    id: "budget-REDACTED-1",
    name: "Sample Shared Budget",
    amountMicros: "50000000",
    status: "ENABLED",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "google_ads",
    entityKind: "campaign_budget",
    platformEntityId: "budget-REDACTED-1",
    displayName: "Sample Shared Budget",
    accountId: customerId,
    status: { canonical: "active", platformRaw: "ENABLED" },
    budget: {
      daily: { amountMinor: 7500, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "update_budget: campaign-budget daily amount increase $50 → $75 (micros)",
};

export const allFixtures: readonly GAdsWriteFixture[] = [
  pauseCampaign,
  resumeCampaign,
  pauseAdGroup,
  resumeAdGroup,
  updateBudgetCampaignBudget,
];
