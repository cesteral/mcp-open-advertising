// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for round-3 TTD write operations.
 *
 * Every fixture is hand-authored against scrubbed advertiser/entity IDs. A
 * live capture + scrub script is deferred — round 3 covers one fixture per
 * governed (operation, entityKind) pair the platform can honestly cover.
 *
 * `expectedPostState` is the canonical snapshot that
 * `applyTtdPatch(entityType, entityId, preState, data)` must produce. The
 * conformance test in `packages/ttd-mcp/tests/testkit/conformance.test.ts`
 * enforces this.
 *
 * TTD budget amounts are `{ Amount, CurrencyCode }` objects in the
 * advertiser-currency major units; the canonical snapshot stores minor units,
 * so amounts are ×100. `campaign` carries `DailyBudget` and `Budget`; `adGroup`
 * budget lives in `RTBAttributes.BudgetSettings` which is out of round-3 scope,
 * so an `adGroup` snapshot carries no budget.
 */

import type { TtdWriteFixture } from "../types.js";

const advertiserId = "advertiser-REDACTED-001";

/** update_budget: campaign lifetime budget increase ($50,000 → $75,000). */
export const updateBudgetCampaign: TtdWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "update_budget",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    advertiserId,
    entityId: "camp-REDACTED-1",
    data: { Budget: { Amount: 75000, CurrencyCode: "USD" } },
  },
  preState: {
    CampaignId: "camp-REDACTED-1",
    CampaignName: "Sample Campaign",
    AdvertiserId: advertiserId,
    Availability: "Available",
    Budget: { Amount: 50000, CurrencyCode: "USD" },
    DailyBudget: { Amount: 500, CurrencyCode: "USD" },
    StartDateInclusiveUTC: "2026-01-01T00:00:00Z",
    EndDateExclusiveUTC: "2026-12-31T00:00:00Z",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "ttd",
    entityKind: "campaign",
    platformEntityId: "camp-REDACTED-1",
    displayName: "Sample Campaign",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "Available" },
    budget: {
      daily: { amountMinor: 50_000, currency: "USD" },
      lifetime: { amountMinor: 7_500_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-12-31T00:00:00Z" },
  },
  description: "update_budget: campaign lifetime budget increase $50,000 → $75,000",
};

/** pause: campaign Available → Paused (budget preserved). */
export const pauseCampaign: TtdWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "pause",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    advertiserId,
    entityId: "camp-REDACTED-2",
    data: { Availability: "Paused" },
  },
  preState: {
    CampaignId: "camp-REDACTED-2",
    CampaignName: "Sample Campaign 2",
    AdvertiserId: advertiserId,
    Availability: "Available",
    Budget: { Amount: 50000, CurrencyCode: "USD" },
    DailyBudget: { Amount: 500, CurrencyCode: "USD" },
    StartDateInclusiveUTC: "2026-01-01T00:00:00Z",
    EndDateExclusiveUTC: "2026-12-31T00:00:00Z",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "ttd",
    entityKind: "campaign",
    platformEntityId: "camp-REDACTED-2",
    displayName: "Sample Campaign 2",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "Paused" },
    budget: {
      daily: { amountMinor: 50_000, currency: "USD" },
      lifetime: { amountMinor: 5_000_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-12-31T00:00:00Z" },
  },
  description: "pause: campaign transition Available → Paused (budget preserved)",
};

/** resume: campaign Paused → Available (budget preserved). */
export const resumeCampaign: TtdWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "resume",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    advertiserId,
    entityId: "camp-REDACTED-3",
    data: { Availability: "Available" },
  },
  preState: {
    CampaignId: "camp-REDACTED-3",
    CampaignName: "Sample Campaign 3",
    AdvertiserId: advertiserId,
    Availability: "Paused",
    Budget: { Amount: 50000, CurrencyCode: "USD" },
    DailyBudget: { Amount: 500, CurrencyCode: "USD" },
    StartDateInclusiveUTC: "2026-01-01T00:00:00Z",
    EndDateExclusiveUTC: "2026-12-31T00:00:00Z",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "ttd",
    entityKind: "campaign",
    platformEntityId: "camp-REDACTED-3",
    displayName: "Sample Campaign 3",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "Available" },
    budget: {
      daily: { amountMinor: 50_000, currency: "USD" },
      lifetime: { amountMinor: 5_000_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-12-31T00:00:00Z" },
  },
  description: "resume: campaign transition Paused → Available (budget preserved)",
};

/**
 * pause: ad-group Available → Paused. Ad-group budget lives in
 * `RTBAttributes.BudgetSettings` which is out of round-3 scope, so the
 * canonical snapshot carries no budget (both daily and lifetime null).
 */
export const pauseAdGroup: TtdWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "pause",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    advertiserId,
    entityId: "ag-REDACTED-2",
    data: { Availability: "Paused" },
  },
  preState: {
    AdGroupId: "ag-REDACTED-2",
    AdGroupName: "Sample Ad Group 2",
    CampaignId: "camp-REDACTED-2",
    AdvertiserId: advertiserId,
    Availability: "Available",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "ttd",
    entityKind: "ad_group",
    platformEntityId: "ag-REDACTED-2",
    displayName: "Sample Ad Group 2",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "Paused" },
    budget: {
      daily: null,
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "pause: ad-group transition Available → Paused (budget out of scope)",
};

/**
 * resume: ad-group Paused → Available. As with `pauseAdGroup`, ad-group budget
 * is out of round-3 scope, so the canonical snapshot carries no budget.
 */
export const resumeAdGroup: TtdWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "resume",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    advertiserId,
    entityId: "ag-REDACTED-3",
    data: { Availability: "Available" },
  },
  preState: {
    AdGroupId: "ag-REDACTED-3",
    AdGroupName: "Sample Ad Group 3",
    CampaignId: "camp-REDACTED-3",
    AdvertiserId: advertiserId,
    Availability: "Paused",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "ttd",
    entityKind: "ad_group",
    platformEntityId: "ag-REDACTED-3",
    displayName: "Sample Ad Group 3",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "Available" },
    budget: {
      daily: null,
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "resume: ad-group transition Paused → Available (budget out of scope)",
};

/** create: campaign (would-be-created, $30,000 lifetime + $300 daily). */
export const createCampaign: TtdWriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    advertiserId,
    entityId: "",
    data: {
      CampaignName: "New Campaign",
      AdvertiserId: advertiserId,
      Availability: "Paused",
      Budget: { Amount: 30000, CurrencyCode: "USD" },
      DailyBudget: { Amount: 300, CurrencyCode: "USD" },
      StartDateInclusiveUTC: "2026-07-01T00:00:00Z",
      EndDateExclusiveUTC: "2026-12-31T00:00:00Z",
    },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "ttd",
    entityKind: "campaign",
    platformEntityId: "",
    displayName: "New Campaign",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "Paused" },
    budget: {
      daily: { amountMinor: 30_000, currency: "USD" },
      lifetime: { amountMinor: 3_000_000, currency: "USD" },
    },
    schedule: { startAt: "2026-07-01T00:00:00Z", endAt: "2026-12-31T00:00:00Z" },
  },
  description: "create: campaign (would-be-created, $30,000 lifetime + $300 daily)",
};

/** create: ad group (would-be-created, no round-3-scoped budget). */
export const createAdGroup: TtdWriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    advertiserId,
    entityId: "",
    data: {
      AdGroupName: "New Ad Group",
      AdvertiserId: advertiserId,
      Availability: "Paused",
    },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "ttd",
    entityKind: "ad_group",
    platformEntityId: "",
    displayName: "New Ad Group",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "Paused" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "create: adGroup (would-be-created, no round-3-scoped budget)",
};

export const allFixtures: readonly TtdWriteFixture[] = [
  updateBudgetCampaign,
  pauseCampaign,
  resumeCampaign,
  pauseAdGroup,
  resumeAdGroup,
  createCampaign,
  createAdGroup,
];
