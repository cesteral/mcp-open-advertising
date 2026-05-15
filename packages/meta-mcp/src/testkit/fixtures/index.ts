// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for round-1 Meta write operations.
 *
 * Every fixture is hand-authored against scrubbed entity IDs (`act_REDACTED_*`,
 * `campaign-REDACTED-*`). A real capture script that ingests live reads and
 * scrubs them is deferred to a follow-up PR — round 1 covers one fixture per
 * (operation, entityKind) pair, which is the floor the design specifies.
 *
 * `expectedPostState` is the canonical snapshot that
 * `applyMetaPatch(args.entityType, args.entityId, preState, args.data)` must
 * produce. The conformance test in
 * `packages/meta-mcp/tests/testkit/conformance.test.ts` enforces this.
 */

import type { MetaWriteFixture } from "../types.js";

/**
 * Daily-budget increase on a campaign. Cents → cents.
 */
export const updateBudgetIncreaseCampaign: MetaWriteFixture = {
  operation: "update_budget",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    entityId: "campaign-REDACTED-1",
    data: { daily_budget: 15000 },
  },
  preState: {
    id: "campaign-REDACTED-1",
    name: "Sample Campaign",
    status: "ACTIVE",
    daily_budget: 10000,
    currency: "USD",
    account_id: "act_REDACTED_001",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind: "campaign",
    platformEntityId: "campaign-REDACTED-1",
    displayName: "Sample Campaign",
    accountId: "act_REDACTED_001",
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: { amountMinor: 15000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description:
    "update_budget: campaign daily budget increase from $100 → $150 USD (cents)",
};

/**
 * Daily-budget decrease on an ad set.
 */
export const updateBudgetDecreaseAdSet: MetaWriteFixture = {
  operation: "update_budget",
  entityKind: "adSet",
  args: {
    entityType: "adSet",
    entityId: "adset-REDACTED-1",
    data: { daily_budget: 7500 },
  },
  preState: {
    id: "adset-REDACTED-1",
    name: "Sample Ad Set",
    status: "ACTIVE",
    daily_budget: 12000,
    currency: "USD",
    account_id: "act_REDACTED_001",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind: "ad_set",
    platformEntityId: "adset-REDACTED-1",
    displayName: "Sample Ad Set",
    accountId: "act_REDACTED_001",
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: { amountMinor: 7500, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description:
    "update_budget: ad set daily budget decrease from $120 → $75 USD (cents)",
};

/**
 * Pause from active on a campaign.
 */
export const pauseCampaignFromActive: MetaWriteFixture = {
  operation: "pause",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    entityId: "campaign-REDACTED-2",
    data: { status: "PAUSED" },
  },
  preState: {
    id: "campaign-REDACTED-2",
    name: "Sample Campaign 2",
    status: "ACTIVE",
    daily_budget: 5000,
    currency: "USD",
    account_id: "act_REDACTED_001",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind: "campaign",
    platformEntityId: "campaign-REDACTED-2",
    displayName: "Sample Campaign 2",
    accountId: "act_REDACTED_001",
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: {
      daily: { amountMinor: 5000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "pause: campaign transition ACTIVE → PAUSED",
};

/**
 * Pause from active on an ad set.
 */
export const pauseAdSetFromActive: MetaWriteFixture = {
  operation: "pause",
  entityKind: "adSet",
  args: {
    entityType: "adSet",
    entityId: "adset-REDACTED-2",
    data: { status: "PAUSED" },
  },
  preState: {
    id: "adset-REDACTED-2",
    name: "Sample Ad Set 2",
    status: "ACTIVE",
    daily_budget: 8000,
    currency: "USD",
    account_id: "act_REDACTED_001",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind: "ad_set",
    platformEntityId: "adset-REDACTED-2",
    displayName: "Sample Ad Set 2",
    accountId: "act_REDACTED_001",
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: {
      daily: { amountMinor: 8000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "pause: ad set transition ACTIVE → PAUSED",
};

/**
 * Resume from paused on a campaign.
 */
export const resumeCampaignFromPaused: MetaWriteFixture = {
  operation: "resume",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    entityId: "campaign-REDACTED-3",
    data: { status: "ACTIVE" },
  },
  preState: {
    id: "campaign-REDACTED-3",
    name: "Sample Campaign 3",
    status: "PAUSED",
    daily_budget: 6000,
    currency: "USD",
    account_id: "act_REDACTED_001",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind: "campaign",
    platformEntityId: "campaign-REDACTED-3",
    displayName: "Sample Campaign 3",
    accountId: "act_REDACTED_001",
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: { amountMinor: 6000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "resume: campaign transition PAUSED → ACTIVE",
};

/**
 * Resume from paused on an ad set.
 */
export const resumeAdSetFromPaused: MetaWriteFixture = {
  operation: "resume",
  entityKind: "adSet",
  args: {
    entityType: "adSet",
    entityId: "adset-REDACTED-3",
    data: { status: "ACTIVE" },
  },
  preState: {
    id: "adset-REDACTED-3",
    name: "Sample Ad Set 3",
    status: "PAUSED",
    daily_budget: 9000,
    currency: "USD",
    account_id: "act_REDACTED_001",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind: "ad_set",
    platformEntityId: "adset-REDACTED-3",
    displayName: "Sample Ad Set 3",
    accountId: "act_REDACTED_001",
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: { amountMinor: 9000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "resume: ad set transition PAUSED → ACTIVE",
};

export const allFixtures: readonly MetaWriteFixture[] = [
  updateBudgetIncreaseCampaign,
  updateBudgetDecreaseAdSet,
  pauseCampaignFromActive,
  pauseAdSetFromActive,
  resumeCampaignFromPaused,
  resumeAdSetFromPaused,
];
