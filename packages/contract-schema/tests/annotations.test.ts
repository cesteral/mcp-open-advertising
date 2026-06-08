// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";

import {
  CESTERAL_WRITE_OPERATIONS,
  canonicalEntityKindSchema,
  cesteralAnnotationSchema,
  deriveContractId,
  parseCesteralAnnotation,
  safeDeriveContractId,
  type CesteralEntityWriteToolAnnotations,
  type CesteralEffectWriteToolAnnotations,
  type CesteralReadToolAnnotations,
} from "../src/index.js";

describe("CESTERAL_WRITE_OPERATIONS drift guard", () => {
  it("pins the exact canonical operation set (entity-class then effect-class)", () => {
    // This list is the cross-repo contract. Changing it is a breaking change to
    // every annotation and the governance parse schema — update deliberately.
    expect([...CESTERAL_WRITE_OPERATIONS]).toEqual([
      "update_budget",
      "pause",
      "resume",
      "update_status",
      "update_schedule",
      "create",
      "update",
      "delete",
      "duplicate",
      "archive",
      "bulk_update_status",
      "adjust_bids",
      "upload",
      "create_schedule",
      "delete_schedule",
      "submit_report",
      "upload_conversions",
      "bulk_job",
      "manage",
    ]);
  });
});

describe("canonicalEntityKindSchema", () => {
  it("pins the canonical entity kinds", () => {
    expect(new Set(canonicalEntityKindSchema.options)).toEqual(
      new Set([
        "campaign",
        "ad_set",
        "insertion_order",
        "line_item",
        "ad_group",
        "ad",
        "campaign_budget",
        "order",
        "commitment",
      ])
    );
  });
});

describe("deriveContractId", () => {
  it("composes <platform>.<tool>.v<version>", () => {
    expect(deriveContractId("dv360", "update_entity", 1)).toBe("dv360.update_entity.v1");
  });

  it("rejects a hyphenated slug", () => {
    expect(() => deriveContractId("dv-360", "update_entity", 1)).toThrow();
  });

  it("safeDeriveContractId returns an error rather than throwing", () => {
    const r = safeDeriveContractId("dv360", "update_entity", 0);
    expect(r.success).toBe(false);
  });
});

// A canonical entity-write annotation as an MCP server author would write it.
const entityWrite: CesteralEntityWriteToolAnnotations = {
  kind: "write",
  writeClass: "entity",
  platform: "dv360",
  contractPlatformSlug: "dv360",
  contractToolSlug: "update_entity",
  operation: ["update_budget", "pause", "resume", "update_status", "update"],
  entityKinds: ["campaign", "insertion_order", "line_item"],
  entityIdArgs: ["advertiserId", "campaignId"],
  executableArgsExclude: ["dry_run"],
  schemaVersion: 1,
  contractId: "dv360.update_entity.v1",
  readPartner: {
    toolName: "dv360_get_entity",
    argMap: { entityType: "entityType", advertiserId: "advertiserId" },
  },
  supportsDryRun: true,
  supportsBeforeAfterSnapshot: true,
  requiresValidation: true,
  requiresSimulation: true,
};

const effectWrite: CesteralEffectWriteToolAnnotations = {
  kind: "write",
  writeClass: "effect",
  platform: "tiktok",
  contractPlatformSlug: "tiktok",
  contractToolSlug: "upload_video",
  operation: ["upload"],
  entityKinds: [],
  entityIdArgs: [],
  executableArgsExclude: [],
  schemaVersion: 2,
  contractId: "tiktok.upload_video.v2",
  supportsBeforeAfterSnapshot: false,
  requiresValidation: false,
  requiresSimulation: false,
};

const read: CesteralReadToolAnnotations = {
  kind: "read",
  platform: "dv360",
  contractPlatformSlug: "dv360",
  contractToolSlug: "get_entity",
  entityKinds: ["campaign", "insertion_order", "line_item"],
  entityIdArgs: ["advertiserId"],
  schemaVersion: 1,
  contractId: "dv360.get_entity.v1",
};

describe("parseCesteralAnnotation — authoring values parse under the loose schema", () => {
  it("accepts a strict entity-write annotation", () => {
    const r = parseCesteralAnnotation(entityWrite);
    expect(r.success).toBe(true);
  });

  it("accepts a strict effect-write annotation", () => {
    expect(parseCesteralAnnotation(effectWrite).success).toBe(true);
  });

  it("accepts a read annotation", () => {
    expect(parseCesteralAnnotation(read).success).toBe(true);
  });
});

describe("parseCesteralAnnotation — rejections", () => {
  it("rejects an unknown write operation", () => {
    const bad = { ...entityWrite, operation: ["frobnicate"] };
    expect(parseCesteralAnnotation(bad).success).toBe(false);
  });

  it("rejects a contractId that disagrees with the slugs/version", () => {
    const bad = { ...entityWrite, contractId: "dv360.update_entity.v2" };
    const r = parseCesteralAnnotation(bad);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("contractId"))).toBe(true);
    }
  });

  it("rejects an entity write missing its readPartner", () => {
    const { readPartner: _omit, ...noPartner } = entityWrite;
    expect(cesteralAnnotationSchema.safeParse(noPartner).success).toBe(false);
  });

  it("rejects a hyphenated contractPlatformSlug", () => {
    const bad = { ...read, contractPlatformSlug: "dv-360", contractId: "dv-360.get_entity.v1" };
    expect(parseCesteralAnnotation(bad).success).toBe(false);
  });
});
