// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  NormalizedEntitySnapshotSchema,
  buildSnapshotParents,
  readPartnerSnapshotShape,
} from "../../src/index.js";

describe("buildSnapshotParents", () => {
  it("returns undefined, never an empty list, when no ancestor is named", () => {
    expect(buildSnapshotParents([])).toBeUndefined();
    expect(buildSnapshotParents([{ kind: "campaign", id: undefined }])).toBeUndefined();
    expect(buildSnapshotParents([{ kind: "campaign", id: "  " }])).toBeUndefined();
    expect(buildSnapshotParents([{ kind: "campaign", id: { not: "an id" } }])).toBeUndefined();
  });

  it("stringifies a numeric id and keeps a name only when the read-back carried one", () => {
    expect(
      buildSnapshotParents([
        { kind: "campaign", id: 123, name: "Spring" },
        { kind: "insertion_order", id: "9", name: "  " },
      ])
    ).toEqual([
      { kind: "campaign", id: "123", name: "Spring" },
      { kind: "insertion_order", id: "9" },
    ]);
  });

  it("skips the ancestors it cannot name and keeps the rest", () => {
    expect(
      buildSnapshotParents([
        { kind: "campaign", id: null },
        { kind: "insertion_order", id: "9" },
      ])
    ).toEqual([{ kind: "insertion_order", id: "9" }]);
  });

  it("keeps the first of a kind named twice", () => {
    expect(
      buildSnapshotParents([
        { kind: "campaign", id: "1" },
        { kind: "campaign", id: "2" },
      ])
    ).toEqual([{ kind: "campaign", id: "1" }]);
  });
});

describe("readPartnerSnapshotShape", () => {
  const snapshot = {
    schemaVersion: 1 as const,
    platform: "dv360",
    entityKind: "line_item" as const,
    platformEntityId: "5",
    displayName: "LI",
    accountId: "1",
    status: { canonical: "active" as const, platformRaw: "ENTITY_STATUS_ACTIVE" },
    budget: {
      daily: { amountMinor: 1, currency: "USD" },
      lifetime: null,
      segments: [{ amountMinor: 2, currency: "USD", startAt: "2026-01-01", endAt: null }],
    },
    schedule: { startAt: null, endAt: null },
    parents: [{ kind: "campaign" as const, id: "9", name: "Spring" }],
  };

  it("keeps every key of the contract snapshot (the mirror cannot drift from the contract)", () => {
    const contractKeys = Object.keys(snapshot).sort();
    expect(Object.keys(readPartnerSnapshotShape).sort()).toEqual(contractKeys);
    const parsed = z.object(readPartnerSnapshotShape).safeParse({ ...snapshot, entity: {} });
    expect(parsed.success && parsed.data).toEqual(snapshot);
    expect(NormalizedEntitySnapshotSchema.safeParse(snapshot).success).toBe(true);
  });
});

describe("NormalizedEntitySnapshotSchema parents", () => {
  const base = {
    schemaVersion: 1 as const,
    platform: "ttd",
    entityKind: "ad_group" as const,
    platformEntityId: "5",
    displayName: null,
    accountId: null,
    status: { canonical: "active" as const, platformRaw: "Available" },
    budget: {},
    schedule: { startAt: null, endAt: null },
  };

  it("is optional", () => {
    expect(NormalizedEntitySnapshotSchema.safeParse(base).success).toBe(true);
  });

  it("accepts campaign / insertion_order entries and at most four", () => {
    expect(
      NormalizedEntitySnapshotSchema.safeParse({
        ...base,
        parents: [{ kind: "insertion_order", id: "1" }],
      }).success
    ).toBe(true);
    const five = Array.from({ length: 5 }, (_, i) => ({ kind: "campaign", id: String(i) }));
    expect(NormalizedEntitySnapshotSchema.safeParse({ ...base, parents: five }).success).toBe(
      false
    );
  });

  it("rejects an unknown kind and an empty id", () => {
    expect(
      NormalizedEntitySnapshotSchema.safeParse({
        ...base,
        parents: [{ kind: "advertiser", id: "1" }],
      }).success
    ).toBe(false);
    expect(
      NormalizedEntitySnapshotSchema.safeParse({ ...base, parents: [{ kind: "campaign", id: "" }] })
        .success
    ).toBe(false);
  });
});
