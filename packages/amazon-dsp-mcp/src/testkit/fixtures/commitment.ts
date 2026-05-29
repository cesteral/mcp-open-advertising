// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for the `amazon_dsp_update_commitment`
 * write surface. Mirrors `entity.ts` in shape; the symbolic apply runs through
 * `applyCommitmentPatch` (re-exported from the testkit index).
 *
 * Amazon's v1 commitment endpoint replaces provided fields, so each fixture's
 * `expectedPostState` is the shallow merge of `preState` + `args.data`, then
 * normalised by `buildCommitmentSnapshot`. `committedSpend` is in advertiser
 * currency major units; the canonical snapshot's `budget.lifetime.amountMinor`
 * is ×100.
 *
 * `AmazonDspFixtureArgs.profileId` carries the advertiser/DSP profile ID for
 * order/lineItem fixtures; commitment fixtures repurpose it as a scrubbed
 * placeholder — `update_commitment` is keyed only by `commitmentId` (stored in
 * `args.entityId`), so `profileId` is round-tripped into the snapshot's
 * `accountId` field by `buildCommitmentSnapshot`.
 *
 * Coverage axes (one fixture each across this surface):
 * (1) committedSpend, (2) fulfillmentLevel, (3) spendCalculationMode,
 * (4) endDateTime extend.
 */

import type { AmazonDspWriteFixture } from "../types.js";

const profileId = "advertiser-REDACTED-001";

/** update: commitment committedSpend increase ($1,000,000 → $1,500,000). */
export const updateCommittedSpend: AmazonDspWriteFixture = {
  operation: "update",
  entityKind: "commitment",
  args: {
    entityType: "commitment",
    profileId,
    entityId: "cmt-REDACTED-1",
    data: { committedSpend: 1_500_000 },
  },
  preState: {
    commitmentId: "cmt-REDACTED-1",
    commitmentName: "Sample Commitment 1",
    committedSpend: 1_000_000,
    currencyCode: "USD",
    startDateTime: "2026-01-01T00:00:00Z",
    endDateTime: "2026-12-31T23:59:59Z",
    fulfillmentLevel: "LEVEL_0",
    spendCalculationMode: "ADVERTISER_ACCOUNT",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "commitment",
    platformEntityId: "cmt-REDACTED-1",
    displayName: "Sample Commitment 1",
    accountId: profileId,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 150_000_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-12-31T23:59:59Z" },
  },
  description: "update: commitment committedSpend increase $1,000,000 → $1,500,000",
};

/** update: commitment fulfillmentLevel LEVEL_0 → LEVEL_5 (snapshot-invariant). */
export const updateFulfillmentLevel: AmazonDspWriteFixture = {
  operation: "update",
  entityKind: "commitment",
  args: {
    entityType: "commitment",
    profileId,
    entityId: "cmt-REDACTED-2",
    data: { fulfillmentLevel: "LEVEL_5" },
  },
  preState: {
    commitmentId: "cmt-REDACTED-2",
    commitmentName: "Sample Commitment 2",
    committedSpend: 500_000,
    currencyCode: "USD",
    startDateTime: "2026-01-01T00:00:00Z",
    endDateTime: "2026-06-30T23:59:59Z",
    fulfillmentLevel: "LEVEL_0",
    spendCalculationMode: "ADVERTISER_ACCOUNT",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "commitment",
    platformEntityId: "cmt-REDACTED-2",
    displayName: "Sample Commitment 2",
    accountId: profileId,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 50_000_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-06-30T23:59:59Z" },
  },
  description: "update: commitment fulfillmentLevel LEVEL_0 → LEVEL_5 (snapshot-invariant)",
};

/** update: commitment spendCalculationMode ADVERTISER_ACCOUNT → CAMPAIGN (snapshot-invariant). */
export const updateSpendCalculationMode: AmazonDspWriteFixture = {
  operation: "update",
  entityKind: "commitment",
  args: {
    entityType: "commitment",
    profileId,
    entityId: "cmt-REDACTED-3",
    data: { spendCalculationMode: "CAMPAIGN" },
  },
  preState: {
    commitmentId: "cmt-REDACTED-3",
    commitmentName: "Sample Commitment 3",
    committedSpend: 250_000,
    currencyCode: "USD",
    startDateTime: "2026-02-01T00:00:00Z",
    endDateTime: "2026-08-31T23:59:59Z",
    fulfillmentLevel: "LEVEL_5",
    spendCalculationMode: "ADVERTISER_ACCOUNT",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "commitment",
    platformEntityId: "cmt-REDACTED-3",
    displayName: "Sample Commitment 3",
    accountId: profileId,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 25_000_000, currency: "USD" },
    },
    schedule: { startAt: "2026-02-01T00:00:00Z", endAt: "2026-08-31T23:59:59Z" },
  },
  description: "update: commitment spendCalculationMode ADVERTISER_ACCOUNT → CAMPAIGN (snapshot-invariant)",
};

/** update: commitment endDateTime extend 2026-06-30 → 2026-12-31. */
export const updateEndDateTime: AmazonDspWriteFixture = {
  operation: "update",
  entityKind: "commitment",
  args: {
    entityType: "commitment",
    profileId,
    entityId: "cmt-REDACTED-4",
    data: { endDateTime: "2026-12-31T23:59:59Z" },
  },
  preState: {
    commitmentId: "cmt-REDACTED-4",
    commitmentName: "Sample Commitment 4",
    committedSpend: 750_000,
    currencyCode: "USD",
    startDateTime: "2026-01-01T00:00:00Z",
    endDateTime: "2026-06-30T23:59:59Z",
    fulfillmentLevel: "LEVEL_0",
    spendCalculationMode: "ADVERTISER_ACCOUNT",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "amazon_dsp",
    entityKind: "commitment",
    platformEntityId: "cmt-REDACTED-4",
    displayName: "Sample Commitment 4",
    accountId: profileId,
    status: { canonical: "active", platformRaw: "ACTIVE" },
    budget: {
      daily: null,
      lifetime: { amountMinor: 75_000_000, currency: "USD" },
    },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-12-31T23:59:59Z" },
  },
  description: "update: commitment endDateTime extend 2026-06-30 → 2026-12-31",
};

export const allCommitmentFixtures: readonly AmazonDspWriteFixture[] = [
  updateCommittedSpend,
  updateFulfillmentLevel,
  updateSpendCalculationMode,
  updateEndDateTime,
];
