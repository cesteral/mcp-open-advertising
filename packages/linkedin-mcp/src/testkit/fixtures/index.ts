// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for round-3 LinkedIn write operations.
 *
 * Every fixture is hand-authored against scrubbed account/entity URNs. A live
 * capture + scrub script is deferred — round 3 covers one fixture per governed
 * (operation, entityKind) pair.
 *
 * `expectedPostState` is the canonical snapshot that
 * `applyLinkedInPatch(entityType, entityUrn, preState, data)` must produce.
 * The conformance test in
 * `packages/linkedin-mcp/tests/testkit/conformance.test.ts` enforces this.
 *
 * Governed scope is `campaign` only — `campaignGroup` is intentionally out of
 * scope (governance taxonomy decision pending).
 *
 * LinkedIn budget amounts (`dailyBudget` / `totalBudget`) are
 * `{ amount, currencyCode }` where `amount` is a major-units decimal string;
 * the canonical snapshot stores minor units, so amounts are ×100.
 * `runSchedule` carries `start` / `end` epoch-millis, converted to ISO.
 */

import type { LinkedInWriteFixture } from "../types.js";

const accountUrn = "urn:li:sponsoredAccount:REDACTED-001";

// 2026-01-01T00:00:00.000Z / 2026-12-31T00:00:00.000Z in epoch-millis.
const RUN_START = 1767225600000;
const RUN_END = 1798675200000;

/** update_budget: campaign daily budget increase ($50.00 → $100.00). */
export const updateBudgetCampaign: LinkedInWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "update_budget",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    entityUrn: "urn:li:sponsoredCampaign:REDACTED-1",
    data: { dailyBudget: { amount: "100.00", currencyCode: "USD" } },
  },
  preState: {
    id: 1,
    name: "Sample Campaign",
    status: "ACTIVE",
    account: accountUrn,
    dailyBudget: { amount: "50.00", currencyCode: "USD" },
    totalBudget: { amount: "5000.00", currencyCode: "USD" },
    runSchedule: { start: RUN_START, end: RUN_END },
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "linkedin_ads",
    entityKind: "campaign",
    platformEntityId: "urn:li:sponsoredCampaign:REDACTED-1",
    displayName: "Sample Campaign",
    accountId: accountUrn,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: { amountMinor: 10_000, currency: "USD" },
      lifetime: { amountMinor: 500_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01T00:00:00.000Z", endAt: "2026-12-31T00:00:00.000Z" },
  },
  description: "update_budget: campaign daily budget increase $50.00 → $100.00",
};

/** pause: campaign ACTIVE → PAUSED (budget preserved). */
export const pauseCampaign: LinkedInWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "pause",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    entityUrn: "urn:li:sponsoredCampaign:REDACTED-2",
    data: { status: "PAUSED" },
  },
  preState: {
    id: 2,
    name: "Sample Campaign 2",
    status: "ACTIVE",
    account: accountUrn,
    dailyBudget: { amount: "50.00", currencyCode: "USD" },
    totalBudget: { amount: "5000.00", currencyCode: "USD" },
    runSchedule: { start: RUN_START, end: RUN_END },
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "linkedin_ads",
    entityKind: "campaign",
    platformEntityId: "urn:li:sponsoredCampaign:REDACTED-2",
    displayName: "Sample Campaign 2",
    accountId: accountUrn,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: {
      daily: { amountMinor: 5_000, currency: "USD" },
      lifetime: { amountMinor: 500_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01T00:00:00.000Z", endAt: "2026-12-31T00:00:00.000Z" },
  },
  description: "pause: campaign transition ACTIVE → PAUSED (budget preserved)",
};

/** resume: campaign PAUSED → ACTIVE (budget preserved). */
export const resumeCampaign: LinkedInWriteFixture = {
  contractToolSlug: "update_entity",
  operation: "resume",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    entityUrn: "urn:li:sponsoredCampaign:REDACTED-3",
    data: { status: "ACTIVE" },
  },
  preState: {
    id: 3,
    name: "Sample Campaign 3",
    status: "PAUSED",
    account: accountUrn,
    dailyBudget: { amount: "50.00", currencyCode: "USD" },
    totalBudget: { amount: "5000.00", currencyCode: "USD" },
    runSchedule: { start: RUN_START, end: RUN_END },
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "linkedin_ads",
    entityKind: "campaign",
    platformEntityId: "urn:li:sponsoredCampaign:REDACTED-3",
    displayName: "Sample Campaign 3",
    accountId: accountUrn,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: { amountMinor: 5_000, currency: "USD" },
      lifetime: { amountMinor: 500_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01T00:00:00.000Z", endAt: "2026-12-31T00:00:00.000Z" },
  },
  description: "resume: campaign transition PAUSED → ACTIVE (budget preserved)",
};

/**
 * delete: LinkedIn "delete" retires the campaign (status REMOVED → canonical
 * `deleted`). Modeled as a status patch so `applyLinkedInPatch` yields the
 * deleted post-state. Governed scope is `campaign`.
 */
export const deleteCampaign: LinkedInWriteFixture = {
  contractToolSlug: "delete_entity",
  operation: "delete",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    entityUrn: "urn:li:sponsoredCampaign:REDACTED-9",
    data: { status: "REMOVED" },
  },
  preState: {
    id: 9,
    name: "Retired Campaign",
    status: "PAUSED",
    account: accountUrn,
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "linkedin_ads",
    entityKind: "campaign",
    platformEntityId: "urn:li:sponsoredCampaign:REDACTED-9",
    displayName: "Retired Campaign",
    accountId: accountUrn,
    status: { canonical: "deleted", platformRaw: "REMOVED" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "delete: campaign transition PAUSED → REMOVED (canonical deleted)",
};

/**
 * create: the would-be-created campaign is the `data` payload normalized (empty
 * pre-state), `applyLinkedInPatch({}, data)`. platformEntityId is a placeholder
 * (the server assigns the real URN).
 */
export const createCampaign: LinkedInWriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    entityUrn: "urn:li:sponsoredCampaign:REDACTED-NEW",
    data: { name: "New Campaign", status: "PAUSED", account: accountUrn },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "linkedin_ads",
    entityKind: "campaign",
    platformEntityId: "urn:li:sponsoredCampaign:REDACTED-NEW",
    displayName: "New Campaign",
    accountId: accountUrn,
    status: { canonical: "paused", platformRaw: "PAUSED" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "create: campaign (would-be-created, status PAUSED)",
};

/**
 * duplicate fixture. LinkedIn has no native copy API — the tool re-creates the
 * entity in DRAFT and renames it (`Copy of {source name}` by default). The copy
 * has no URN yet, so `entityUrn` is empty and `data` is the DRAFT + renamed
 * overlay the dry-run applies to the SOURCE (`preState`).
 */
export const duplicateCampaign: LinkedInWriteFixture = {
  contractToolSlug: "duplicate_entity",
  operation: "duplicate",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    entityUrn: "",
    data: { status: "DRAFT", name: "Copy of Source Campaign" },
  },
  preState: {
    name: "Source Campaign",
    status: "ACTIVE",
    account: accountUrn,
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "linkedin_ads",
    entityKind: "campaign",
    platformEntityId: "",
    displayName: "Copy of Source Campaign",
    accountId: accountUrn,
    status: { canonical: "unknown", platformRaw: "DRAFT" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: null, endAt: null },
  },
  description: "duplicate: campaign copy lands DRAFT, renamed 'Copy of …' (projected from source)",
};

export const allFixtures: readonly LinkedInWriteFixture[] = [
  updateBudgetCampaign,
  pauseCampaign,
  resumeCampaign,
  deleteCampaign,
  createCampaign,
  duplicateCampaign,
];
