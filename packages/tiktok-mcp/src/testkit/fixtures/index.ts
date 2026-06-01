// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for round-3 TikTok write operations.
 *
 * Every fixture is hand-authored against scrubbed advertiser/entity IDs. A
 * live capture + scrub script is deferred — round 3 covers one fixture per
 * governed (operation, entityKind) pair.
 *
 * `expectedPostState` is the canonical snapshot that
 * `applyTiktokPatch(entityType, entityId, preState, data)` must produce. The
 * conformance test in `packages/tiktok-mcp/tests/testkit/conformance.test.ts`
 * enforces this.
 *
 * TikTok budget amounts are in advertiser-currency major units; the canonical
 * snapshot stores minor units, so amounts are ×100. `campaign` / `adGroup`
 * carry a flat `budget` number with a sibling `budget_mode`; `ad` carries no
 * budget. The snapshot status comes from the READ `status` field — a
 * pause/resume `data` only sets `operation_status`, which the symbolic
 * shallow-merge leaves the read `status` field untouched, so each fixture's
 * `expectedPostState.status` reflects its `preState.status`.
 */

import type { TiktokWriteFixture } from "../types.js";

const advertiserId = "advertiser-REDACTED-001";

/** update_budget: campaign daily budget increase ($100 → $200). */
export const updateBudgetCampaign: TiktokWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "update_budget",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    advertiserId,
    entityId: "camp-REDACTED-1",
    data: { budget: 200, budget_mode: "BUDGET_MODE_DAY" },
  },
  preState: {
    campaign_id: "camp-REDACTED-1",
    campaign_name: "Sample Campaign",
    advertiser_id: advertiserId,
    status: "CAMPAIGN_STATUS_ENABLE",
    objective_type: "TRAFFIC",
    budget: 100,
    budget_mode: "BUDGET_MODE_DAY",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "tiktok",
    entityKind: "campaign",
    platformEntityId: "camp-REDACTED-1",
    displayName: "Sample Campaign",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "CAMPAIGN_STATUS_ENABLE" },
    budget: {
      daily: { amountMinor: 20_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "update_budget: campaign daily budget increase $100 → $200",
};

/** update_budget: ad-group lifetime budget increase ($500 → $1,000). */
export const updateBudgetAdGroup: TiktokWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "update_budget",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    advertiserId,
    entityId: "ag-REDACTED-1",
    data: { budget: 1000, budget_mode: "BUDGET_MODE_TOTAL" },
  },
  preState: {
    adgroup_id: "ag-REDACTED-1",
    adgroup_name: "Sample Ad Group",
    campaign_id: "camp-REDACTED-1",
    advertiser_id: advertiserId,
    status: "ADGROUP_STATUS_ENABLE",
    budget: 500,
    budget_mode: "BUDGET_MODE_TOTAL",
    schedule_start_time: "2026-01-01 00:00:00",
    schedule_end_time: "2026-12-31 00:00:00",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "tiktok",
    entityKind: "ad_group",
    platformEntityId: "ag-REDACTED-1",
    displayName: "Sample Ad Group",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "ADGROUP_STATUS_ENABLE" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 100_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01 00:00:00", endAt: "2026-12-31 00:00:00" },
  },
  description: "update_budget: ad-group lifetime budget increase $500 → $1,000",
};

/** pause: campaign DISABLE (read status unchanged by symbolic merge). */
export const pauseCampaign: TiktokWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "pause",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    advertiserId,
    entityId: "camp-REDACTED-2",
    data: { operation_status: "DISABLE" },
  },
  preState: {
    campaign_id: "camp-REDACTED-2",
    campaign_name: "Sample Campaign 2",
    advertiser_id: advertiserId,
    status: "CAMPAIGN_STATUS_ENABLE",
    objective_type: "TRAFFIC",
    budget: 100,
    budget_mode: "BUDGET_MODE_DAY",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "tiktok",
    entityKind: "campaign",
    platformEntityId: "camp-REDACTED-2",
    displayName: "Sample Campaign 2",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "CAMPAIGN_STATUS_ENABLE" },
    budget: {
      daily: { amountMinor: 10_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "pause: campaign operation_status DISABLE (read status preserved)",
};

/** pause: ad-group DISABLE (read status unchanged by symbolic merge). */
export const pauseAdGroup: TiktokWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "pause",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    advertiserId,
    entityId: "ag-REDACTED-2",
    data: { operation_status: "DISABLE" },
  },
  preState: {
    adgroup_id: "ag-REDACTED-2",
    adgroup_name: "Sample Ad Group 2",
    campaign_id: "camp-REDACTED-2",
    advertiser_id: advertiserId,
    status: "ADGROUP_STATUS_ENABLE",
    budget: 500,
    budget_mode: "BUDGET_MODE_DAY",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "tiktok",
    entityKind: "ad_group",
    platformEntityId: "ag-REDACTED-2",
    displayName: "Sample Ad Group 2",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "ADGROUP_STATUS_ENABLE" },
    budget: {
      daily: { amountMinor: 50_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "pause: ad-group operation_status DISABLE (read status preserved)",
};

/** pause: ad DISABLE (read status unchanged by symbolic merge; no budget). */
export const pauseAd: TiktokWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "pause",
  entityKind: "ad",
  args: {
    entityType: "ad",
    advertiserId,
    entityId: "ad-REDACTED-2",
    data: { operation_status: "DISABLE" },
  },
  preState: {
    ad_id: "ad-REDACTED-2",
    ad_name: "Sample Ad 2",
    adgroup_id: "ag-REDACTED-2",
    campaign_id: "camp-REDACTED-2",
    advertiser_id: advertiserId,
    status: "AD_STATUS_ENABLE",
    creative_type: "SINGLE_VIDEO",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "tiktok",
    entityKind: "ad",
    platformEntityId: "ad-REDACTED-2",
    displayName: "Sample Ad 2",
    accountId: advertiserId,
    status: { canonical: "active", platformRaw: "AD_STATUS_ENABLE" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "pause: ad operation_status DISABLE (read status preserved, no budget)",
};

/** resume: campaign ENABLE (read status unchanged by symbolic merge). */
export const resumeCampaign: TiktokWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "resume",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    advertiserId,
    entityId: "camp-REDACTED-3",
    data: { operation_status: "ENABLE" },
  },
  preState: {
    campaign_id: "camp-REDACTED-3",
    campaign_name: "Sample Campaign 3",
    advertiser_id: advertiserId,
    status: "CAMPAIGN_STATUS_DISABLE",
    objective_type: "TRAFFIC",
    budget: 100,
    budget_mode: "BUDGET_MODE_DAY",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "tiktok",
    entityKind: "campaign",
    platformEntityId: "camp-REDACTED-3",
    displayName: "Sample Campaign 3",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "CAMPAIGN_STATUS_DISABLE" },
    budget: {
      daily: { amountMinor: 10_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "resume: campaign operation_status ENABLE (read status preserved)",
};

/** resume: ad-group ENABLE (read status unchanged by symbolic merge). */
export const resumeAdGroup: TiktokWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "resume",
  entityKind: "adGroup",
  args: {
    entityType: "adGroup",
    advertiserId,
    entityId: "ag-REDACTED-3",
    data: { operation_status: "ENABLE" },
  },
  preState: {
    adgroup_id: "ag-REDACTED-3",
    adgroup_name: "Sample Ad Group 3",
    campaign_id: "camp-REDACTED-3",
    advertiser_id: advertiserId,
    status: "ADGROUP_STATUS_DISABLE",
    budget: 500,
    budget_mode: "BUDGET_MODE_DAY",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "tiktok",
    entityKind: "ad_group",
    platformEntityId: "ag-REDACTED-3",
    displayName: "Sample Ad Group 3",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "ADGROUP_STATUS_DISABLE" },
    budget: {
      daily: { amountMinor: 50_000, currency: "USD" },
      lifetime: null,
    },
    schedule: { startAt: null, endAt: null },
  },
  description: "resume: ad-group operation_status ENABLE (read status preserved)",
};

/** resume: ad ENABLE (read status unchanged by symbolic merge; no budget). */
export const resumeAd: TiktokWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "resume",
  entityKind: "ad",
  args: {
    entityType: "ad",
    advertiserId,
    entityId: "ad-REDACTED-3",
    data: { operation_status: "ENABLE" },
  },
  preState: {
    ad_id: "ad-REDACTED-3",
    ad_name: "Sample Ad 3",
    adgroup_id: "ag-REDACTED-3",
    campaign_id: "camp-REDACTED-3",
    advertiser_id: advertiserId,
    status: "AD_STATUS_DISABLE",
    creative_type: "SINGLE_VIDEO",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "tiktok",
    entityKind: "ad",
    platformEntityId: "ad-REDACTED-3",
    displayName: "Sample Ad 3",
    accountId: advertiserId,
    status: { canonical: "paused", platformRaw: "AD_STATUS_DISABLE" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "resume: ad operation_status ENABLE (read status preserved, no budget)",
};

export const allFixtures: readonly TiktokWriteFixture[] = [
  updateBudgetCampaign,
  updateBudgetAdGroup,
  pauseCampaign,
  pauseAdGroup,
  pauseAd,
  resumeCampaign,
  resumeAdGroup,
  resumeAd,
];
