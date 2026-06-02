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
  contractToolSlug: "update_entity",
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
  description: "update_budget: campaign daily budget increase from $100 → $150 USD (cents)",
};

/**
 * Daily-budget decrease on an ad set.
 */
export const updateBudgetDecreaseAdSet: MetaWriteFixture = {
  contractToolSlug: "update_entity",
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
  description: "update_budget: ad set daily budget decrease from $120 → $75 USD (cents)",
};

/**
 * Pause from active on a campaign.
 */
export const pauseCampaignFromActive: MetaWriteFixture = {
  contractToolSlug: "update_entity",
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
  contractToolSlug: "update_entity",
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
  contractToolSlug: "update_entity",
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
  contractToolSlug: "update_entity",
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

/**
 * delete: Meta "delete" sets status DELETED (canonical `deleted`), so the
 * symbolic apply is a status patch — `applyMetaPatch` yields the deleted
 * post-state. One fixture per governed kind (campaign / ad_set / ad).
 */
export const deleteCampaign: MetaWriteFixture = {
  contractToolSlug: "delete_entity",
  operation: "delete",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    entityId: "campaign-REDACTED-9",
    data: { status: "DELETED" },
  },
  preState: {
    id: "campaign-REDACTED-9",
    name: "Retired Campaign",
    status: "PAUSED",
    account_id: "act_REDACTED_001",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind: "campaign",
    platformEntityId: "campaign-REDACTED-9",
    displayName: "Retired Campaign",
    accountId: "act_REDACTED_001",
    status: { canonical: "deleted", platformRaw: "DELETED" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "delete: campaign transition PAUSED → DELETED (canonical deleted)",
};

export const deleteAdSet: MetaWriteFixture = {
  contractToolSlug: "delete_entity",
  operation: "delete",
  entityKind: "adSet",
  args: {
    entityType: "adSet",
    entityId: "adset-REDACTED-9",
    data: { status: "DELETED" },
  },
  preState: {
    id: "adset-REDACTED-9",
    name: "Retired Ad Set",
    status: "PAUSED",
    account_id: "act_REDACTED_001",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind: "ad_set",
    platformEntityId: "adset-REDACTED-9",
    displayName: "Retired Ad Set",
    accountId: "act_REDACTED_001",
    status: { canonical: "deleted", platformRaw: "DELETED" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "delete: adSet transition PAUSED → DELETED (canonical deleted)",
};

export const deleteAd: MetaWriteFixture = {
  contractToolSlug: "delete_entity",
  operation: "delete",
  entityKind: "ad",
  args: {
    entityType: "ad",
    entityId: "ad-REDACTED-9",
    data: { status: "DELETED" },
  },
  preState: {
    id: "ad-REDACTED-9",
    name: "Retired Ad",
    status: "PAUSED",
    account_id: "act_REDACTED_001",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind: "ad",
    platformEntityId: "ad-REDACTED-9",
    displayName: "Retired Ad",
    accountId: "act_REDACTED_001",
    status: { canonical: "deleted", platformRaw: "DELETED" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "delete: ad transition PAUSED → DELETED (canonical deleted)",
};

/**
 * create: the would-be-created entity is the `data` payload normalized (empty
 * pre-state), so the symbolic apply is `applyMetaPatch({}, createData)`. The
 * platformEntityId is a placeholder (the server assigns the real ID on execute).
 * One fixture per governed kind (campaign / ad_set / ad).
 */
export const createCampaign: MetaWriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    entityId: "campaign-REDACTED-NEW",
    data: { name: "New Campaign", objective: "OUTCOME_TRAFFIC", status: "PAUSED" },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind: "campaign",
    platformEntityId: "campaign-REDACTED-NEW",
    displayName: "New Campaign",
    accountId: null,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "create: campaign (would-be-created, status PAUSED)",
};

export const createAdSet: MetaWriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "adSet",
  args: {
    entityType: "adSet",
    entityId: "adset-REDACTED-NEW",
    data: {
      name: "New Ad Set",
      campaign_id: "campaign-REDACTED-1",
      daily_budget: 5000,
      status: "PAUSED",
    },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind: "ad_set",
    platformEntityId: "adset-REDACTED-NEW",
    displayName: "New Ad Set",
    accountId: null,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: { daily: { amountMinor: 5000, currency: "USD" }, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "create: adSet (would-be-created, daily budget $50, status PAUSED)",
};

export const createAd: MetaWriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "ad",
  args: {
    entityType: "ad",
    entityId: "ad-REDACTED-NEW",
    data: { name: "New Ad", adset_id: "adset-REDACTED-1", status: "PAUSED" },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind: "ad",
    platformEntityId: "ad-REDACTED-NEW",
    displayName: "New Ad",
    accountId: null,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "create: ad (would-be-created, status PAUSED)",
};

/**
 * duplicate fixtures. The copy does not exist yet, so `entityId` is the empty
 * placeholder and `data` is the landing-status overlay the dry-run applies to
 * the SOURCE (`preState`). `applyMetaPatch(entityType, "", source, overlay)`
 * must yield the copy's canonical projection — exactly what the tool's dry-run
 * `expectedPostState` produces.
 */
export const duplicateCampaign: MetaWriteFixture = {
  contractToolSlug: "duplicate_entity",
  operation: "duplicate",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    entityId: "",
    data: { status: "PAUSED" },
  },
  preState: {
    name: "Source Campaign",
    status: "ACTIVE",
    account_id: "act-REDACTED-1",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind: "campaign",
    platformEntityId: "",
    displayName: "Source Campaign",
    accountId: "act-REDACTED-1",
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "duplicate: campaign copy lands PAUSED (projected from source)",
};

export const duplicateAdSet: MetaWriteFixture = {
  contractToolSlug: "duplicate_entity",
  operation: "duplicate",
  entityKind: "adSet",
  args: {
    entityType: "adSet",
    entityId: "",
    data: { status: "PAUSED" },
  },
  preState: {
    name: "Source Ad Set",
    status: "ACTIVE",
    account_id: "act-REDACTED-1",
    daily_budget: 5000,
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind: "ad_set",
    platformEntityId: "",
    displayName: "Source Ad Set",
    accountId: "act-REDACTED-1",
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: { daily: { amountMinor: 5000, currency: "USD" }, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "duplicate: adSet copy lands PAUSED, budget preserved (projected from source)",
};

export const duplicateAd: MetaWriteFixture = {
  contractToolSlug: "duplicate_entity",
  operation: "duplicate",
  entityKind: "ad",
  args: {
    entityType: "ad",
    entityId: "",
    data: { status: "PAUSED" },
  },
  preState: {
    name: "Source Ad",
    status: "ACTIVE",
    account_id: "act-REDACTED-1",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "meta_ads",
    entityKind: "ad",
    platformEntityId: "",
    displayName: "Source Ad",
    accountId: "act-REDACTED-1",
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "duplicate: ad copy lands PAUSED (projected from source)",
};

export const allFixtures: readonly MetaWriteFixture[] = [
  updateBudgetIncreaseCampaign,
  updateBudgetDecreaseAdSet,
  pauseCampaignFromActive,
  pauseAdSetFromActive,
  resumeCampaignFromPaused,
  resumeAdSetFromPaused,
  deleteCampaign,
  deleteAdSet,
  deleteAd,
  createCampaign,
  createAdSet,
  createAd,
  duplicateCampaign,
  duplicateAdSet,
  duplicateAd,
];
