// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for round-4 Microsoft Ads write
 * operations.
 *
 * Every fixture is hand-authored against scrubbed account/entity IDs. A live
 * capture + scrub script is deferred — round 4 covers one fixture per governed
 * (operation, entityKind) pair the platform can honestly express.
 *
 * `expectedPostState` is the canonical snapshot that
 * `applyMsAdsPatch(entityType, entityId, preState, data)` must produce. The
 * conformance test in
 * `packages/msads-mcp/tests/testkit/conformance.test.ts` enforces this.
 *
 * Microsoft Ads budget amounts are in the account-currency major units; the
 * canonical snapshot stores minor units, so amounts are ×100. The shared
 * `budget` entity carries a flat `Amount` + `BudgetType`; a `campaign` carries
 * inline `DailyBudget` / `MonthlyBudget`. `adGroup` / `ad` carry no budget, so
 * only `pause` / `resume` fixtures exist for those kinds.
 */

import type { MsAdsWriteFixture } from "../types.js";

const accountId = "account-REDACTED-001";

/** update_budget: campaign daily budget increase ($50 → $75). */
export const updateBudgetCampaign: MsAdsWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "update_budget",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    entityId: "cmp-REDACTED-1",
    data: { DailyBudget: 75 },
  },
  preState: {
    Id: "cmp-REDACTED-1",
    Name: "Sample Campaign",
    Status: "Active",
    AccountId: accountId,
    BudgetType: "DailyBudgetStandard",
    DailyBudget: 50,
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "msads",
    entityKind: "campaign",
    platformEntityId: "cmp-REDACTED-1",
    displayName: "Sample Campaign",
    accountId,
    status: { canonical: "active", platformRaw: "Active" },
    budget: {
      daily: { amountMinor: 7_500, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "update_budget: campaign daily budget increase $50 → $75",
};

/** update_budget: shared budget amount increase ($200 → $250). */
export const updateBudgetBudget: MsAdsWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "update_budget",
  entityKind: "budget",
  args: {
    entityType: "budget",
    entityId: "bud-REDACTED-1",
    data: { Amount: 250 },
  },
  preState: {
    Id: "bud-REDACTED-1",
    Name: "Shared Budget A",
    Amount: 200,
    BudgetType: "DailyBudgetStandard",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "msads",
    entityKind: "campaign_budget",
    platformEntityId: "bud-REDACTED-1",
    displayName: "Shared Budget A",
    accountId: null,
    status: { canonical: "unknown", platformRaw: "" },
    budget: {
      daily: { amountMinor: 25_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "update_budget: shared budget amount increase $200 → $250",
};

/** pause: campaign Active → Paused (budget preserved). */
export const pauseCampaign: MsAdsWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "pause",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    entityId: "cmp-REDACTED-2",
    data: { Status: "Paused" },
  },
  preState: {
    Id: "cmp-REDACTED-2",
    Name: "Sample Campaign 2",
    Status: "Active",
    AccountId: accountId,
    BudgetType: "DailyBudgetStandard",
    DailyBudget: 50,
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "msads",
    entityKind: "campaign",
    platformEntityId: "cmp-REDACTED-2",
    displayName: "Sample Campaign 2",
    accountId,
    status: { canonical: "paused", platformRaw: "Paused" },
    budget: {
      daily: { amountMinor: 5_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "pause: campaign transition Active → Paused (budget preserved)",
};

/** pause: ad group Active → Paused (schedule preserved). */
export const pauseAdGroup: MsAdsWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "pause",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    entityId: "ag-REDACTED-1",
    data: { Status: "Paused" },
  },
  preState: {
    Id: "ag-REDACTED-1",
    Name: "Sample Ad Group",
    Status: "Active",
    StartDate: { Day: 1, Month: 1, Year: 2026 },
    EndDate: { Day: 31, Month: 12, Year: 2026 },
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "msads",
    entityKind: "ad_group",
    platformEntityId: "ag-REDACTED-1",
    displayName: "Sample Ad Group",
    accountId: null,
    status: { canonical: "paused", platformRaw: "Paused" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: "2026-01-01", endAt: "2026-12-31" },
  },
  description: "pause: ad group transition Active → Paused (schedule preserved)",
};

/** pause: ad Active → Paused. */
export const pauseAd: MsAdsWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "pause",
  entityKind: "ad",
  args: {
    entityType: "ad",
    entityId: "ad-REDACTED-1",
    data: { Status: "Paused" },
  },
  preState: {
    Id: "ad-REDACTED-1",
    Name: "Sample Ad",
    Status: "Active",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "msads",
    entityKind: "ad",
    platformEntityId: "ad-REDACTED-1",
    displayName: "Sample Ad",
    accountId: null,
    status: { canonical: "paused", platformRaw: "Paused" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "pause: ad transition Active → Paused",
};

/** resume: campaign Paused → Active (budget preserved). */
export const resumeCampaign: MsAdsWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "resume",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    entityId: "cmp-REDACTED-3",
    data: { Status: "Active" },
  },
  preState: {
    Id: "cmp-REDACTED-3",
    Name: "Sample Campaign 3",
    Status: "Paused",
    AccountId: accountId,
    BudgetType: "MonthlyBudgetSpendUntilDepleted",
    MonthlyBudget: 1500,
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "msads",
    entityKind: "campaign",
    platformEntityId: "cmp-REDACTED-3",
    displayName: "Sample Campaign 3",
    accountId,
    status: { canonical: "active", platformRaw: "Active" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 150_000, currency: "USD" },
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "resume: campaign transition Paused → Active (monthly budget preserved)",
};

/** resume: ad group Paused → Active (schedule preserved). */
export const resumeAdGroup: MsAdsWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "resume",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    entityId: "ag-REDACTED-2",
    data: { Status: "Active" },
  },
  preState: {
    Id: "ag-REDACTED-2",
    Name: "Sample Ad Group 2",
    Status: "Paused",
    StartDate: { Day: 1, Month: 6, Year: 2026 },
    EndDate: { Day: 30, Month: 9, Year: 2026 },
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "msads",
    entityKind: "ad_group",
    platformEntityId: "ag-REDACTED-2",
    displayName: "Sample Ad Group 2",
    accountId: null,
    status: { canonical: "active", platformRaw: "Active" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: "2026-06-01", endAt: "2026-09-30" },
  },
  description: "resume: ad group transition Paused → Active (schedule preserved)",
};

/** resume: ad Paused → Active. */
export const resumeAd: MsAdsWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "resume",
  entityKind: "ad",
  args: {
    entityType: "ad",
    entityId: "ad-REDACTED-2",
    data: { Status: "Active" },
  },
  preState: {
    Id: "ad-REDACTED-2",
    Name: "Sample Ad 2",
    Status: "Paused",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "msads",
    entityKind: "ad",
    platformEntityId: "ad-REDACTED-2",
    displayName: "Sample Ad 2",
    accountId: null,
    status: { canonical: "active", platformRaw: "Active" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "resume: ad transition Paused → Active",
};

/** create: campaign (would-be-created, $100 daily). */
export const createCampaign: MsAdsWriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    entityId: "",
    data: {
      Name: "New Campaign",
      Status: "Paused",
      AccountId: accountId,
      BudgetType: "DailyBudgetStandard",
      DailyBudget: 100,
    },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "msads",
    entityKind: "campaign",
    platformEntityId: "",
    displayName: "New Campaign",
    accountId,
    status: { canonical: "paused", platformRaw: "Paused" },
    budget: { daily: { amountMinor: 10_000, currency: "USD" }, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "create: campaign (would-be-created, $100 daily)",
};

/** create: ad group (would-be-created, no inline budget). */
export const createAdGroup: MsAdsWriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    entityId: "",
    data: { Name: "New Ad Group", Status: "Paused" },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "msads",
    entityKind: "ad_group",
    platformEntityId: "",
    displayName: "New Ad Group",
    accountId: null,
    status: { canonical: "paused", platformRaw: "Paused" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "create: adGroup (would-be-created, no inline budget)",
};

/** create: ad (would-be-created, no budget). */
export const createAd: MsAdsWriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "ad",
  args: {
    entityType: "ad",
    entityId: "",
    data: { Name: "New Ad", Status: "Paused" },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "msads",
    entityKind: "ad",
    platformEntityId: "",
    displayName: "New Ad",
    accountId: null,
    status: { canonical: "paused", platformRaw: "Paused" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "create: ad (would-be-created, no budget)",
};

/** create: shared budget (would-be-created, $300 daily, no status). */
export const createBudget: MsAdsWriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "budget",
  args: {
    entityType: "budget",
    entityId: "",
    data: { Name: "New Shared Budget", Amount: 300, BudgetType: "DailyBudgetStandard" },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "msads",
    entityKind: "campaign_budget",
    platformEntityId: "",
    displayName: "New Shared Budget",
    accountId: null,
    status: { canonical: "unknown", platformRaw: "" },
    budget: { daily: { amountMinor: 30_000, currency: "USD" }, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "create: budget (would-be-created, $300 daily)",
};

export const allFixtures: readonly MsAdsWriteFixture[] = [
  updateBudgetCampaign,
  updateBudgetBudget,
  pauseCampaign,
  pauseAdGroup,
  pauseAd,
  resumeCampaign,
  resumeAdGroup,
  resumeAd,
  createCampaign,
  createAdGroup,
  createAd,
  createBudget,
];
