// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, expect, it } from "vitest";
import { updateEntityTool } from "../src/mcp-server/tools/definitions/update-entity.tool.js";
import { getEntityTool } from "../src/mcp-server/tools/definitions/get-entity.tool.js";
import { listCommitmentsTool } from "../src/mcp-server/tools/definitions/list-commitments.tool.js";
import { getCommitmentsTool } from "../src/mcp-server/tools/definitions/get-commitments.tool.js";
import { getCommitmentTool } from "../src/mcp-server/tools/definitions/get-commitment.tool.js";
import { createCommitmentTool } from "../src/mcp-server/tools/definitions/create-commitment.tool.js";
import { updateCommitmentTool } from "../src/mcp-server/tools/definitions/update-commitment.tool.js";
import { getCampaignForecastTool } from "../src/mcp-server/tools/definitions/get-campaign-forecast.tool.js";
import { getCommitmentSpendTool } from "../src/mcp-server/tools/definitions/get-commitment-spend.tool.js";

describe("amazon-dsp-mcp cesteral.* annotations (round 2)", () => {
  it("annotates amazon_dsp_update_entity as a write contract with the canonical fields", () => {
    const cesteral = updateEntityTool.annotations?.cesteral;
    expect(cesteral).toBeDefined();
    expect(cesteral!.kind).toBe("write");
    expect(cesteral!.platform).toBe("amazon_dsp");
    expect(cesteral!.contractPlatformSlug).toBe("amazon_dsp");
    expect(cesteral!.contractToolSlug).toBe("update_entity");
    expect(cesteral!.contractId).toBe("amazon_dsp.update_entity.v1");
    expect(cesteral!.contractId).toBe(
      `${cesteral!.contractPlatformSlug}.${cesteral!.contractToolSlug}.v${cesteral!.schemaVersion}`
    );
    expect(cesteral!.schemaVersion).toBe(1);

    if (cesteral!.kind !== "write") throw new Error("expected write kind");
    // Multi-operation dispatcher: every value is in the contract-schema
    // writeOperationSchema enum.
    expect(cesteral.operation).toEqual(
      expect.arrayContaining(["update_budget", "pause", "resume", "update_status", "update"])
    );
    // order (campaign-equivalent) + line_item (ad-group-equivalent).
    expect(cesteral.entityKinds).toEqual(["order", "line_item"]);
    expect(cesteral.entityIdArgs).toEqual(["entityId"]);
    expect(cesteral.readPartner.toolName).toBe("amazon_dsp_get_entity");
    expect(cesteral.readPartner.argMap).toEqual({
      profileId: "profileId",
      entityId: "entityId",
    });
    // R2-U4: symbolic-apply dry-run + before/after capture.
    expect(cesteral.supportsDryRun).toBe(true);
    expect(cesteral.supportsBeforeAfterSnapshot).toBe(true);
    // Contract promises required by the governance admission layer.
    expect(cesteral.requiresValidation).toBe(true);
    expect(cesteral.requiresSimulation).toBe(true);
  });

  it("annotates amazon_dsp_get_entity as a read contract with no operation/readPartner", () => {
    const cesteral = getEntityTool.annotations?.cesteral;
    expect(cesteral).toBeDefined();
    expect(cesteral!.kind).toBe("read");
    expect(cesteral!.platform).toBe("amazon_dsp");
    expect(cesteral!.contractPlatformSlug).toBe("amazon_dsp");
    expect(cesteral!.contractToolSlug).toBe("get_entity");
    expect(cesteral!.contractId).toBe("amazon_dsp.get_entity.v1");
    expect(cesteral!.schemaVersion).toBe(1);
    expect(cesteral!.entityKinds).toEqual(["order", "line_item"]);
    expect(cesteral!.entityIdArgs).toEqual(["entityId"]);
    expect(cesteral as unknown as { operation?: unknown }).not.toHaveProperty("operation");
    expect(cesteral as unknown as { readPartner?: unknown }).not.toHaveProperty("readPartner");
  });

  it("write tool's readPartner.toolName resolves to the annotated read tool", () => {
    const writeCesteral = updateEntityTool.annotations?.cesteral;
    if (!writeCesteral || writeCesteral.kind !== "write")
      throw new Error("expected write annotations");
    expect(writeCesteral.readPartner.toolName).toBe(getEntityTool.name);
  });

  it("declares dryRun / before / after on the write tool's outputSchema", () => {
    const shape = (updateEntityTool.outputSchema as { shape: Record<string, unknown> }).shape;
    expect(shape).toHaveProperty("dryRun");
    expect(shape).toHaveProperty("before");
    expect(shape).toHaveProperty("after");
  });
});

describe("amazon-dsp-mcp cesteral.* annotations (v1 commitments)", () => {
  // Repo precedent reserves cesteral.kind=read for singular read partners
  // of governed writes. list_commitments and batch get_commitments are
  // plain readOnlyHint tools — no manifest footprint. get_campaign_forecast
  // and get_commitment_spend are domain reads, also unattested.
  it.each([
    ["amazon_dsp_list_commitments", listCommitmentsTool],
    ["amazon_dsp_get_commitments", getCommitmentsTool],
    ["amazon_dsp_get_campaign_forecast", getCampaignForecastTool],
    ["amazon_dsp_get_commitment_spend", getCommitmentSpendTool],
  ])("%s is readOnly with no cesteral annotation", (_name, tool) => {
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect((tool.annotations as { cesteral?: unknown }).cesteral).toBeUndefined();
  });

  it("amazon_dsp_create_commitment is destructive with no cesteral annotation (matches create-entity precedent)", () => {
    expect(createCommitmentTool.annotations.readOnlyHint).toBe(false);
    expect(createCommitmentTool.annotations.destructiveHint).toBe(true);
    expect((createCommitmentTool.annotations as { cesteral?: unknown }).cesteral).toBeUndefined();
  });

  it("annotates amazon_dsp_get_commitment as a singular read partner (kind=read, entityKinds=[commitment])", () => {
    const cesteral = getCommitmentTool.annotations?.cesteral;
    expect(cesteral).toBeDefined();
    expect(cesteral!.kind).toBe("read");
    expect(cesteral!.platform).toBe("amazon_dsp");
    expect(cesteral!.contractPlatformSlug).toBe("amazon_dsp");
    expect(cesteral!.contractToolSlug).toBe("get_commitment");
    expect(cesteral!.contractId).toBe("amazon_dsp.get_commitment.v1");
    expect(cesteral!.contractId).toBe(
      `${cesteral!.contractPlatformSlug}.${cesteral!.contractToolSlug}.v${cesteral!.schemaVersion}`
    );
    expect(cesteral!.schemaVersion).toBe(1);
    expect(cesteral!.entityKinds).toEqual(["commitment"]);
    expect(cesteral!.entityIdArgs).toEqual(["commitmentId"]);
    expect(cesteral as unknown as { operation?: unknown }).not.toHaveProperty("operation");
    expect(cesteral as unknown as { readPartner?: unknown }).not.toHaveProperty("readPartner");
  });

  it("annotates amazon_dsp_update_commitment as a single-op governed write with the singular read partner", () => {
    const cesteral = updateCommitmentTool.annotations?.cesteral;
    expect(cesteral).toBeDefined();
    expect(cesteral!.kind).toBe("write");
    expect(cesteral!.platform).toBe("amazon_dsp");
    expect(cesteral!.contractPlatformSlug).toBe("amazon_dsp");
    expect(cesteral!.contractToolSlug).toBe("update_commitment");
    expect(cesteral!.contractId).toBe("amazon_dsp.update_commitment.v1");
    expect(cesteral!.contractId).toBe(
      `${cesteral!.contractPlatformSlug}.${cesteral!.contractToolSlug}.v${cesteral!.schemaVersion}`
    );
    expect(cesteral!.schemaVersion).toBe(1);
    if (cesteral!.kind !== "write") throw new Error("expected write kind");
    // Single-operation tool: no status/budget/schedule sub-ops on v1 commitments.
    expect(cesteral.operation).toEqual(["update"]);
    expect(cesteral.entityKinds).toEqual(["commitment"]);
    expect(cesteral.entityIdArgs).toEqual(["commitmentId"]);
    expect(cesteral.readPartner.toolName).toBe("amazon_dsp_get_commitment");
    expect(cesteral.readPartner.argMap).toEqual({
      profileId: "profileId",
      commitmentId: "commitmentId",
    });
    expect(cesteral.supportsDryRun).toBe(true);
    expect(cesteral.supportsBeforeAfterSnapshot).toBe(true);
    expect(cesteral.requiresValidation).toBe(true);
    expect(cesteral.requiresSimulation).toBe(true);
  });

  it("update_commitment.readPartner.toolName resolves to the annotated get_commitment tool", () => {
    const writeCesteral = updateCommitmentTool.annotations?.cesteral;
    if (!writeCesteral || writeCesteral.kind !== "write")
      throw new Error("expected write annotations");
    expect(writeCesteral.readPartner.toolName).toBe(getCommitmentTool.name);
  });

  it("update_commitment outputSchema declares dryRun / before / after / dispatchedCapability", () => {
    const shape = (updateCommitmentTool.outputSchema as { shape: Record<string, unknown> }).shape;
    expect(shape).toHaveProperty("dryRun");
    expect(shape).toHaveProperty("before");
    expect(shape).toHaveProperty("after");
    expect(shape).toHaveProperty("dispatchedCapability");
  });
});
