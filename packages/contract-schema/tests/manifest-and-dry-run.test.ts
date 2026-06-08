// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";

import {
  cesteralManifestSchema,
  dryRunResultSchema,
  effectDryRunResultSchema,
  normalizedEntitySnapshotSchema,
} from "../src/index.js";

const snapshot = {
  schemaVersion: 1 as const,
  platform: "dv360",
  entityKind: "campaign" as const,
  platformEntityId: "123",
  displayName: "Q3 Brand",
  accountId: "acc-1",
  status: { canonical: "active" as const, platformRaw: "ENTITY_STATUS_ACTIVE" },
  budget: { daily: { amountMinor: 100000, currency: "USD" } },
  schedule: { startAt: null, endAt: null },
};

describe("cesteralManifestSchema", () => {
  const valid = {
    manifestVersion: 1,
    packageName: "@cesteral/dv360-mcp",
    packageVersion: "1.2.0",
    generatedAt: "2026-06-01T00:00:00.000Z",
    tools: [
      {
        toolName: "dv360_update_entity",
        contractPlatformSlug: "dv360",
        contractToolSlug: "update_entity",
        schemaVersion: "1",
        definitionHash: "a".repeat(64),
      },
    ],
  };

  it("accepts a well-formed manifest", () => {
    expect(cesteralManifestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-@cesteral/*-mcp package name", () => {
    expect(
      cesteralManifestSchema.safeParse({ ...valid, packageName: "@cesteral/shared" }).success
    ).toBe(false);
  });

  it("rejects a non-hex / wrong-length definitionHash", () => {
    const bad = {
      ...valid,
      tools: [{ ...valid.tools[0], definitionHash: "sha256:" + "a".repeat(64) }],
    };
    expect(cesteralManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty tools array", () => {
    expect(cesteralManifestSchema.safeParse({ ...valid, tools: [] }).success).toBe(false);
  });
});

describe("dryRunResultSchema", () => {
  it("accepts a result with an expected post-state", () => {
    const r = dryRunResultSchema.safeParse({
      wouldSucceed: true,
      validationErrors: [],
      validationSource: "native_validator",
      expectedStateSource: "native_simulator",
      expectedPostState: snapshot,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a result with no post-state", () => {
    const r = dryRunResultSchema.safeParse({
      wouldSucceed: false,
      validationErrors: [{ code: "E", message: "nope", field: "budget" }],
      validationSource: "symbolic",
      expectedStateSource: "none",
    });
    expect(r.success).toBe(true);
  });
});

describe("normalizedEntitySnapshotSchema", () => {
  it("accepts the canonical snapshot", () => {
    expect(normalizedEntitySnapshotSchema.safeParse(snapshot).success).toBe(true);
  });
});

describe("effectDryRunResultSchema", () => {
  it("accepts a symbolic effect dry-run", () => {
    const r = effectDryRunResultSchema.safeParse({
      wouldSucceed: true,
      validationErrors: [],
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect: { effectKind: "asset_created", summary: { assetId: "a1", count: 3 } },
    });
    expect(r.success).toBe(true);
  });
});
