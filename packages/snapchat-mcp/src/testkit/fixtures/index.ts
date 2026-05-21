// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for round-4 Snapchat write operations.
 *
 * Every fixture is hand-authored against scrubbed advertiser/entity IDs. A
 * live capture + scrub script is deferred — round 4 covers one fixture per
 * governed (operation, entityKind) pair that the platform can honestly
 * express.
 *
 * `expectedPostState` is the canonical snapshot that
 * `applySnapchatPatch(entityType, entityId, preState, data)` must produce.
 * The conformance test in
 * `packages/snapchat-mcp/tests/testkit/conformance.test.ts` enforces this.
 *
 * Snapchat budget/bid amounts are in micro-currency (1/1,000,000 of a
 * currency unit); the canonical snapshot stores minor units (1/100), so
 * micro amounts are divided by 10,000. Ads carry no budget — only campaigns
 * and ad squads have `update_budget` fixtures.
 */

import type { SnapchatWriteFixture } from "../types.js";

const adAccountId = "adaccount-REDACTED-001";

/** update_budget: campaign daily budget increase ($150 → $200). */
export const updateBudgetCampaign: SnapchatWriteFixture = {
  operation: "update_budget",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    adAccountId,
    entityId: "campaign-REDACTED-1",
    data: { daily_budget_micro: 200_000_000 },
  },
  preState: {
    id: "campaign-REDACTED-1",
    name: "Sample Campaign",
    status: "ACTIVE",
    objective: "WEB_CONVERSION",
    ad_account_id: adAccountId,
    daily_budget_micro: 150_000_000,
    start_time: "2026-01-01T00:00:00.000Z",
    end_time: "2026-12-31T00:00:00.000Z",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "snapchat",
    entityKind: "campaign",
    platformEntityId: "campaign-REDACTED-1",
    displayName: "Sample Campaign",
    accountId: adAccountId,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: { amountMinor: 20_000, currency: "USD" },
      lifetime: null,
    },
    schedule: {
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-12-31T00:00:00.000Z",
    },
  },
  description: "update_budget: campaign daily budget increase $150 → $200",
};

/** update_budget: ad squad daily budget increase ($50 → $75). */
export const updateBudgetAdGroup: SnapchatWriteFixture = {
  operation: "update_budget",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    adAccountId,
    entityId: "adsquad-REDACTED-1",
    data: { daily_budget_micro: 75_000_000 },
  },
  preState: {
    id: "adsquad-REDACTED-1",
    name: "Sample Ad Squad",
    status: "ACTIVE",
    campaign_id: "campaign-REDACTED-1",
    ad_account_id: adAccountId,
    optimization_goal: "SWIPES",
    billing_event: "IMPRESSION",
    bid_micro: 1_500_000,
    daily_budget_micro: 50_000_000,
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "snapchat",
    entityKind: "ad_group",
    platformEntityId: "adsquad-REDACTED-1",
    displayName: "Sample Ad Squad",
    accountId: adAccountId,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: { amountMinor: 7_500, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "update_budget: ad squad daily budget increase $50 → $75",
};

/** pause: campaign ACTIVE → PAUSED (budget preserved). */
export const pauseCampaign: SnapchatWriteFixture = {
  operation: "pause",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    adAccountId,
    entityId: "campaign-REDACTED-2",
    data: { status: "PAUSED" },
  },
  preState: {
    id: "campaign-REDACTED-2",
    name: "Sample Campaign 2",
    status: "ACTIVE",
    objective: "WEB_CONVERSION",
    ad_account_id: adAccountId,
    daily_budget_micro: 150_000_000,
    start_time: "2026-01-01T00:00:00.000Z",
    end_time: "2026-12-31T00:00:00.000Z",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "snapchat",
    entityKind: "campaign",
    platformEntityId: "campaign-REDACTED-2",
    displayName: "Sample Campaign 2",
    accountId: adAccountId,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: {
      daily: { amountMinor: 15_000, currency: "USD" },
      lifetime: null,
    },
    schedule: {
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-12-31T00:00:00.000Z",
    },
  },
  description: "pause: campaign transition ACTIVE → PAUSED (budget preserved)",
};

/** pause: ad squad ACTIVE → PAUSED (budget preserved). */
export const pauseAdGroup: SnapchatWriteFixture = {
  operation: "pause",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    adAccountId,
    entityId: "adsquad-REDACTED-2",
    data: { status: "PAUSED" },
  },
  preState: {
    id: "adsquad-REDACTED-2",
    name: "Sample Ad Squad 2",
    status: "ACTIVE",
    campaign_id: "campaign-REDACTED-2",
    ad_account_id: adAccountId,
    optimization_goal: "SWIPES",
    billing_event: "IMPRESSION",
    daily_budget_micro: 50_000_000,
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "snapchat",
    entityKind: "ad_group",
    platformEntityId: "adsquad-REDACTED-2",
    displayName: "Sample Ad Squad 2",
    accountId: adAccountId,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: {
      daily: { amountMinor: 5_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "pause: ad squad transition ACTIVE → PAUSED (budget preserved)",
};

/** pause: ad ACTIVE → PAUSED (ads carry no budget). */
export const pauseAd: SnapchatWriteFixture = {
  operation: "pause",
  entityKind: "ad",
  args: {
    entityType: "ad",
    adAccountId,
    entityId: "ad-REDACTED-1",
    data: { status: "PAUSED" },
  },
  preState: {
    id: "ad-REDACTED-1",
    name: "Sample Ad",
    status: "ACTIVE",
    ad_squad_id: "adsquad-REDACTED-2",
    creative_id: "creative-REDACTED-1",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "snapchat",
    entityKind: "ad",
    platformEntityId: "ad-REDACTED-1",
    displayName: "Sample Ad",
    accountId: null,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "pause: ad transition ACTIVE → PAUSED",
};

/** resume: campaign PAUSED → ACTIVE (budget preserved). */
export const resumeCampaign: SnapchatWriteFixture = {
  operation: "resume",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    adAccountId,
    entityId: "campaign-REDACTED-3",
    data: { status: "ACTIVE" },
  },
  preState: {
    id: "campaign-REDACTED-3",
    name: "Sample Campaign 3",
    status: "PAUSED",
    objective: "WEB_CONVERSION",
    ad_account_id: adAccountId,
    daily_budget_micro: 150_000_000,
    start_time: "2026-01-01T00:00:00.000Z",
    end_time: "2026-12-31T00:00:00.000Z",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "snapchat",
    entityKind: "campaign",
    platformEntityId: "campaign-REDACTED-3",
    displayName: "Sample Campaign 3",
    accountId: adAccountId,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: { amountMinor: 15_000, currency: "USD" },
      lifetime: null,
    },
    schedule: {
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-12-31T00:00:00.000Z",
    },
  },
  description: "resume: campaign transition PAUSED → ACTIVE (budget preserved)",
};

/** resume: ad squad PAUSED → ACTIVE (budget preserved). */
export const resumeAdGroup: SnapchatWriteFixture = {
  operation: "resume",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    adAccountId,
    entityId: "adsquad-REDACTED-3",
    data: { status: "ACTIVE" },
  },
  preState: {
    id: "adsquad-REDACTED-3",
    name: "Sample Ad Squad 3",
    status: "PAUSED",
    campaign_id: "campaign-REDACTED-3",
    ad_account_id: adAccountId,
    optimization_goal: "SWIPES",
    billing_event: "IMPRESSION",
    daily_budget_micro: 50_000_000,
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "snapchat",
    entityKind: "ad_group",
    platformEntityId: "adsquad-REDACTED-3",
    displayName: "Sample Ad Squad 3",
    accountId: adAccountId,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: { amountMinor: 5_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "resume: ad squad transition PAUSED → ACTIVE (budget preserved)",
};

/** resume: ad PAUSED → ACTIVE (ads carry no budget). */
export const resumeAd: SnapchatWriteFixture = {
  operation: "resume",
  entityKind: "ad",
  args: {
    entityType: "ad",
    adAccountId,
    entityId: "ad-REDACTED-2",
    data: { status: "ACTIVE" },
  },
  preState: {
    id: "ad-REDACTED-2",
    name: "Sample Ad 2",
    status: "PAUSED",
    ad_squad_id: "adsquad-REDACTED-3",
    creative_id: "creative-REDACTED-2",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "snapchat",
    entityKind: "ad",
    platformEntityId: "ad-REDACTED-2",
    displayName: "Sample Ad 2",
    accountId: null,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "resume: ad transition PAUSED → ACTIVE",
};

export const allFixtures: readonly SnapchatWriteFixture[] = [
  updateBudgetCampaign,
  updateBudgetAdGroup,
  pauseCampaign,
  pauseAdGroup,
  pauseAd,
  resumeCampaign,
  resumeAdGroup,
  resumeAd,
];
