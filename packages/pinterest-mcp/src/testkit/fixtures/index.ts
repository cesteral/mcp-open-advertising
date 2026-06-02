// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for round-4 Pinterest write operations.
 *
 * Every fixture is hand-authored against scrubbed advertiser/entity IDs. A
 * live capture + scrub script is deferred — round 4 covers one fixture per
 * governed (operation, entityKind) pair the platform can honestly cover.
 *
 * `expectedPostState` is the canonical snapshot that
 * `applyPinterestPatch(entityType, entityId, preState, data)` must produce.
 * The conformance test in
 * `packages/pinterest-mcp/tests/testkit/conformance.test.ts` enforces this.
 *
 * Pinterest budget amounts are in micro-currency (1,000,000 micro = 1 major
 * unit); the canonical snapshot stores minor units (major × 100), so micro
 * amounts are ÷10,000. `campaign` carries flat `daily_spend_cap` /
 * `lifetime_spend_cap`; `ad_group` carries `budget_in_micro_currency` with a
 * sibling `budget_type`. `ad` has no budget. Pinterest schedule fields are Unix
 * timestamps in seconds, normalized to ISO-8601.
 *
 * Coverage note: `update_budget` is covered for campaign + adGroup only — `ad`
 * has no budget field, so an `update_budget::ad` fixture cannot be authored
 * honestly. `pause` / `resume` are covered for all three entity kinds.
 */

import type { PinterestWriteFixture } from "../types.js";

const adAccountId = "adaccount-REDACTED-001";

/** update_budget: campaign daily spend cap increase ($100 → $200). */
export const updateBudgetCampaign: PinterestWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "update_budget",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    adAccountId,
    entityId: "campaign-REDACTED-1",
    data: { daily_spend_cap: 200_000_000 },
  },
  preState: {
    id: "campaign-REDACTED-1",
    name: "Sample Campaign",
    status: "ACTIVE",
    ad_account_id: adAccountId,
    daily_spend_cap: 100_000_000,
    start_time: 1767225600,
    end_time: 1798675200,
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "pinterest",
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
  description: "update_budget: campaign daily spend cap increase $100 → $200",
};

/** update_budget: ad-group budget increase ($50 → $80). */
export const updateBudgetAdGroup: PinterestWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "update_budget",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    adAccountId,
    entityId: "adgroup-REDACTED-1",
    data: { budget_in_micro_currency: 80_000_000 },
  },
  preState: {
    id: "adgroup-REDACTED-1",
    name: "Sample Ad Group",
    status: "ACTIVE",
    ad_account_id: adAccountId,
    campaign_id: "campaign-REDACTED-1",
    budget_in_micro_currency: 50_000_000,
    budget_type: "DAILY",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "pinterest",
    entityKind: "ad_group",
    platformEntityId: "adgroup-REDACTED-1",
    displayName: "Sample Ad Group",
    accountId: adAccountId,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: { amountMinor: 8_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "update_budget: ad-group daily budget increase $50 → $80",
};

/** pause: campaign ACTIVE → PAUSED (budget preserved). */
export const pauseCampaign: PinterestWriteFixture = {
  contractToolSlug: "update_entity",
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
    ad_account_id: adAccountId,
    lifetime_spend_cap: 500_000_000,
    start_time: 1767225600,
    end_time: 1798675200,
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "pinterest",
    entityKind: "campaign",
    platformEntityId: "campaign-REDACTED-2",
    displayName: "Sample Campaign 2",
    accountId: adAccountId,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 50_000, currency: "USD" },
    },
    schedule: {
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-12-31T00:00:00.000Z",
    },
  },
  description: "pause: campaign transition ACTIVE → PAUSED (budget preserved)",
};

/** pause: ad-group ACTIVE → PAUSED (budget preserved). */
export const pauseAdGroup: PinterestWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "pause",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    adAccountId,
    entityId: "adgroup-REDACTED-2",
    data: { status: "PAUSED" },
  },
  preState: {
    id: "adgroup-REDACTED-2",
    name: "Sample Ad Group 2",
    status: "ACTIVE",
    ad_account_id: adAccountId,
    campaign_id: "campaign-REDACTED-2",
    budget_in_micro_currency: 50_000_000,
    budget_type: "DAILY",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "pinterest",
    entityKind: "ad_group",
    platformEntityId: "adgroup-REDACTED-2",
    displayName: "Sample Ad Group 2",
    accountId: adAccountId,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: {
      daily: { amountMinor: 5_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "pause: ad-group transition ACTIVE → PAUSED (budget preserved)",
};

/** pause: ad ACTIVE → PAUSED (ads carry no budget). */
export const pauseAd: PinterestWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "pause",
  entityKind: "ad",
  args: {
    entityType: "ad",
    adAccountId,
    entityId: "ad-REDACTED-2",
    data: { status: "PAUSED" },
  },
  preState: {
    id: "ad-REDACTED-2",
    name: "Sample Ad 2",
    status: "ACTIVE",
    ad_account_id: adAccountId,
    ad_group_id: "adgroup-REDACTED-2",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "pinterest",
    entityKind: "ad",
    platformEntityId: "ad-REDACTED-2",
    displayName: "Sample Ad 2",
    accountId: adAccountId,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "pause: ad transition ACTIVE → PAUSED",
};

/** resume: campaign PAUSED → ACTIVE (budget preserved). */
export const resumeCampaign: PinterestWriteFixture = {
  contractToolSlug: "update_entity",
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
    ad_account_id: adAccountId,
    lifetime_spend_cap: 500_000_000,
    start_time: 1767225600,
    end_time: 1798675200,
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "pinterest",
    entityKind: "campaign",
    platformEntityId: "campaign-REDACTED-3",
    displayName: "Sample Campaign 3",
    accountId: adAccountId,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 50_000, currency: "USD" },
    },
    schedule: {
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-12-31T00:00:00.000Z",
    },
  },
  description: "resume: campaign transition PAUSED → ACTIVE (budget preserved)",
};

/** resume: ad-group PAUSED → ACTIVE (budget preserved). */
export const resumeAdGroup: PinterestWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "resume",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    adAccountId,
    entityId: "adgroup-REDACTED-3",
    data: { status: "ACTIVE" },
  },
  preState: {
    id: "adgroup-REDACTED-3",
    name: "Sample Ad Group 3",
    status: "PAUSED",
    ad_account_id: adAccountId,
    campaign_id: "campaign-REDACTED-3",
    budget_in_micro_currency: 50_000_000,
    budget_type: "DAILY",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "pinterest",
    entityKind: "ad_group",
    platformEntityId: "adgroup-REDACTED-3",
    displayName: "Sample Ad Group 3",
    accountId: adAccountId,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: { amountMinor: 5_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "resume: ad-group transition PAUSED → ACTIVE (budget preserved)",
};

/** resume: ad PAUSED → ACTIVE (ads carry no budget). */
export const resumeAd: PinterestWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "resume",
  entityKind: "ad",
  args: {
    entityType: "ad",
    adAccountId,
    entityId: "ad-REDACTED-3",
    data: { status: "ACTIVE" },
  },
  preState: {
    id: "ad-REDACTED-3",
    name: "Sample Ad 3",
    status: "PAUSED",
    ad_account_id: adAccountId,
    ad_group_id: "adgroup-REDACTED-3",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "pinterest",
    entityKind: "ad",
    platformEntityId: "ad-REDACTED-3",
    displayName: "Sample Ad 3",
    accountId: adAccountId,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "resume: ad transition PAUSED → ACTIVE",
};

export const createCampaign: PinterestWriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    adAccountId,
    entityId: "campaign-REDACTED-NEW",
    data: { name: "New Campaign", status: "PAUSED", daily_spend_cap: 100_000_000 },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "pinterest",
    entityKind: "campaign",
    platformEntityId: "campaign-REDACTED-NEW",
    displayName: "New Campaign",
    accountId: null,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: { daily: { amountMinor: 10_000, currency: "USD" }, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "create: campaign (would-be-created, $100 daily)",
};

export const createAdGroup: PinterestWriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    adAccountId,
    entityId: "adgroup-REDACTED-NEW",
    data: {
      name: "New Ad Group",
      status: "PAUSED",
      budget_in_micro_currency: 50_000_000,
      budget_type: "DAILY",
    },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "pinterest",
    entityKind: "ad_group",
    platformEntityId: "adgroup-REDACTED-NEW",
    displayName: "New Ad Group",
    accountId: null,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: { daily: { amountMinor: 5_000, currency: "USD" }, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "create: adGroup (would-be-created, $50 daily)",
};

export const createAd: PinterestWriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "ad",
  args: {
    entityType: "ad",
    adAccountId,
    entityId: "ad-REDACTED-NEW",
    data: { name: "New Ad", status: "PAUSED", creative_id: "creative-REDACTED-1" },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "pinterest",
    entityKind: "ad",
    platformEntityId: "ad-REDACTED-NEW",
    displayName: "New Ad",
    accountId: null,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "create: ad (would-be-created, no budget)",
};

export const allFixtures: readonly PinterestWriteFixture[] = [
  updateBudgetCampaign,
  updateBudgetAdGroup,
  pauseCampaign,
  pauseAdGroup,
  pauseAd,
  resumeCampaign,
  resumeAdGroup,
  resumeAd,
  createCampaign,
  createAdGroup,
  createAd,
];
