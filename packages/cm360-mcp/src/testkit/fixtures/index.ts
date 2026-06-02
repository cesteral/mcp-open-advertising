// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Canonical state-transition fixtures for round-4 CM360 write operations.
 *
 * Every fixture is hand-authored against scrubbed profile/entity IDs. A live
 * capture + scrub script is deferred — round 4 covers one fixture per
 * coverable (operation, entityKind) pair.
 *
 * `expectedPostState` is the canonical snapshot that
 * `applyCm360Patch(entityType, entityId, preState, data)` must produce. The
 * conformance test in `packages/cm360-mcp/tests/testkit/conformance.test.ts`
 * enforces this.
 *
 * CM360 campaigns and ads carry NO budget on the resource, so every
 * `expectedPostState` reports `budget: { daily: null, lifetime: null }`.
 * Campaigns expose only an `archived` flag (no platform-native paused state),
 * so `pause` / `resume` are ad-only; campaign status changes are
 * `update_status` (archive/unarchive).
 */

import type { Cm360WriteFixture } from "../types.js";

const profileId = "profile-REDACTED-001";

/** update_status: campaign archive (archived false → true). */
export const archiveCampaign: Cm360WriteFixture = {
  contractToolSlug: "update_entity",
  operation: "update_status",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    profileId,
    entityId: "camp-REDACTED-1",
    data: { archived: true },
  },
  preState: {
    id: "camp-REDACTED-1",
    kind: "dfareporting#campaign",
    name: "Sample Campaign",
    accountId: "acct-REDACTED-1",
    advertiserId: "adv-REDACTED-1",
    archived: false,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "cm360",
    entityKind: "campaign",
    platformEntityId: "camp-REDACTED-1",
    displayName: "Sample Campaign",
    accountId: "acct-REDACTED-1",
    status: { canonical: "archived", platformRaw: "archived=true" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: "2026-01-01", endAt: "2026-12-31" },
  },
  description: "update_status: campaign archive (archived false → true)",
};

/** pause: ad active → paused (active true → false). */
export const pauseAd: Cm360WriteFixture = {
  contractToolSlug: "update_entity",
  operation: "pause",
  entityKind: "ad",
  args: {
    entityType: "ad",
    profileId,
    entityId: "ad-REDACTED-1",
    data: { active: false },
  },
  preState: {
    id: "ad-REDACTED-1",
    kind: "dfareporting#ad",
    name: "Sample Ad",
    accountId: "acct-REDACTED-1",
    advertiserId: "adv-REDACTED-1",
    campaignId: "camp-REDACTED-1",
    active: true,
    archived: false,
    startTime: "2026-01-01T00:00:00Z",
    endTime: "2026-12-31T00:00:00Z",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "cm360",
    entityKind: "ad",
    platformEntityId: "ad-REDACTED-1",
    displayName: "Sample Ad",
    accountId: "acct-REDACTED-1",
    status: { canonical: "paused", platformRaw: "active=false,archived=false" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-12-31T00:00:00Z" },
  },
  description: "pause: ad transition active → paused (active true → false)",
};

/** resume: ad paused → active (active false → true). */
export const resumeAd: Cm360WriteFixture = {
  contractToolSlug: "update_entity",
  operation: "resume",
  entityKind: "ad",
  args: {
    entityType: "ad",
    profileId,
    entityId: "ad-REDACTED-2",
    data: { active: true },
  },
  preState: {
    id: "ad-REDACTED-2",
    kind: "dfareporting#ad",
    name: "Sample Ad 2",
    accountId: "acct-REDACTED-1",
    advertiserId: "adv-REDACTED-1",
    campaignId: "camp-REDACTED-1",
    active: false,
    archived: false,
    startTime: "2026-01-01T00:00:00Z",
    endTime: "2026-12-31T00:00:00Z",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "cm360",
    entityKind: "ad",
    platformEntityId: "ad-REDACTED-2",
    displayName: "Sample Ad 2",
    accountId: "acct-REDACTED-1",
    status: { canonical: "active", platformRaw: "active=true,archived=false" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-12-31T00:00:00Z" },
  },
  description: "resume: ad transition paused → active (active false → true)",
};

/** update_status: ad archive (archived false → true; active forced false). */
export const archiveAd: Cm360WriteFixture = {
  contractToolSlug: "update_entity",
  operation: "update_status",
  entityKind: "ad",
  args: {
    entityType: "ad",
    profileId,
    entityId: "ad-REDACTED-3",
    data: { active: false, archived: true },
  },
  preState: {
    id: "ad-REDACTED-3",
    kind: "dfareporting#ad",
    name: "Sample Ad 3",
    accountId: "acct-REDACTED-1",
    advertiserId: "adv-REDACTED-1",
    campaignId: "camp-REDACTED-1",
    active: true,
    archived: false,
    startTime: "2026-01-01T00:00:00Z",
    endTime: "2026-12-31T00:00:00Z",
  },
  expectedPostState: {
    schemaVersion: 1,
    platform: "cm360",
    entityKind: "ad",
    platformEntityId: "ad-REDACTED-3",
    displayName: "Sample Ad 3",
    accountId: "acct-REDACTED-1",
    status: { canonical: "archived", platformRaw: "active=false,archived=true" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-12-31T00:00:00Z" },
  },
  description: "update_status: ad archive (archived false → true)",
};

/** create: campaign (would-be-created, active/unarchived). */
export const createCampaign: Cm360WriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "campaign",
  args: {
    entityType: "campaign",
    profileId,
    entityId: "",
    data: {
      name: "New Campaign",
      accountId: "acct-REDACTED-1",
      advertiserId: "adv-REDACTED-1",
      archived: false,
      startDate: "2026-07-01",
      endDate: "2026-12-31",
    },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "cm360",
    entityKind: "campaign",
    platformEntityId: "",
    displayName: "New Campaign",
    accountId: "acct-REDACTED-1",
    status: { canonical: "active", platformRaw: "archived=false" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: "2026-07-01", endAt: "2026-12-31" },
  },
  description: "create: campaign (would-be-created, active/unarchived)",
};

/** create: ad (would-be-created, paused — active false). */
export const createAd: Cm360WriteFixture = {
  contractToolSlug: "create_entity",
  operation: "create",
  entityKind: "ad",
  args: {
    entityType: "ad",
    profileId,
    entityId: "",
    data: {
      name: "New Ad",
      accountId: "acct-REDACTED-1",
      advertiserId: "adv-REDACTED-1",
      campaignId: "camp-REDACTED-1",
      active: false,
      archived: false,
      startTime: "2026-07-01T00:00:00Z",
      endTime: "2026-12-31T00:00:00Z",
    },
  },
  preState: {},
  expectedPostState: {
    schemaVersion: 1,
    platform: "cm360",
    entityKind: "ad",
    platformEntityId: "",
    displayName: "New Ad",
    accountId: "acct-REDACTED-1",
    status: { canonical: "paused", platformRaw: "active=false,archived=false" },
    budget: { daily: null, lifetime: null },
    schedule: { startAt: "2026-07-01T00:00:00Z", endAt: "2026-12-31T00:00:00Z" },
  },
  description: "create: ad (would-be-created, paused)",
};

export const allFixtures: readonly Cm360WriteFixture[] = [
  archiveCampaign,
  pauseAd,
  resumeAd,
  archiveAd,
  createCampaign,
  createAd,
];
