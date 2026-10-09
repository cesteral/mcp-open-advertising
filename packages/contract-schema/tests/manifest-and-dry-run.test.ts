// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";

import {
  HASH_ALGS,
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

  // `hashAlg` names how an entry's precomputed `definitionHash` was computed. A
  // decision token carries the same name, and the verifier requires the two to
  // match, so the manifest — not the minter — decides which algorithm a release
  // is on. Absent means `cesteral-c14n-v1`: every manifest published before this
  // field existed.
  describe("hashAlg", () => {
    const withAlg = (hashAlg: unknown) => ({
      ...valid,
      tools: [{ ...valid.tools[0], hashAlg }],
    });

    it("names the supported algorithms, legacy first", () => {
      expect([...HASH_ALGS]).toEqual(["cesteral-c14n-v1", "rfc8785"]);
    });

    it.each(["cesteral-c14n-v1", "rfc8785"])("accepts %s and keeps it in the output", (alg) => {
      const parsed = cesteralManifestSchema.safeParse(withAlg(alg));
      expect(parsed.success).toBe(true);
      // zod strips unknown keys, so this fails if the schema does not declare it.
      expect(parsed.success && parsed.data.tools[0]?.hashAlg).toBe(alg);
    });

    it("still accepts an entry with no hashAlg, and does not invent one", () => {
      const parsed = cesteralManifestSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
      expect(parsed.success && "hashAlg" in parsed.data.tools[0]!).toBe(false);
    });

    it.each(["md5", "RFC8785", "legacy", "", null, 1, ["rfc8785"]])("rejects hashAlg %j", (bad) => {
      expect(cesteralManifestSchema.safeParse(withAlg(bad)).success).toBe(false);
    });

    it("leaves manifestVersion at 1: the field is optional, so older consumers ignore it", () => {
      expect(
        cesteralManifestSchema.safeParse({ ...withAlg("rfc8785"), manifestVersion: 2 }).success
      ).toBe(false);
      expect(cesteralManifestSchema.safeParse(withAlg("rfc8785")).success).toBe(true);
    });
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
