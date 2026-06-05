// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.
//
// Governance contract (effect class) for the DV360 long-tail write tools:
// assigned-targeting create/delete and custom-bidding algorithm/rules/script
// management. None map to a canonical entity, so each is governed as an effect
// (`operation: "manage"`, null-kind dispatchedCapability, no before/after
// snapshot). dry_run skips elicitation + API and returns a symbolic preview;
// effect summaries carry audit identity only (ids, types, actions) — never the
// raw targeting `data` / script / rules payloads.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));
vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

const { mockEnsureField } = vi.hoisted(() => ({ mockEnsureField: vi.fn() }));
vi.mock("../../src/mcp-server/tools/utils/elicitation.js", () => ({
  ensureRequiredFieldValue: mockEnsureField,
}));

const { mockElicitDelete } = vi.hoisted(() => ({ mockElicitDelete: vi.fn() }));
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, elicitDeleteConfirmation: mockElicitDelete };
});

import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";
import {
  createAssignedTargetingLogic,
  createAssignedTargetingTool,
  CreateAssignedTargetingOutputSchema,
} from "../../src/mcp-server/tools/definitions/create-assigned-targeting.tool.js";
import {
  deleteAssignedTargetingLogic,
  deleteAssignedTargetingTool,
  DeleteAssignedTargetingOutputSchema,
} from "../../src/mcp-server/tools/definitions/delete-assigned-targeting.tool.js";
import {
  createCustomBiddingAlgorithmLogic,
  createCustomBiddingAlgorithmTool,
  CreateCustomBiddingAlgorithmOutputSchema,
} from "../../src/mcp-server/tools/definitions/create-custom-bidding-algorithm.tool.js";
import {
  manageCustomBiddingRulesLogic,
  manageCustomBiddingRulesTool,
  ManageCustomBiddingRulesOutputSchema,
} from "../../src/mcp-server/tools/definitions/manage-custom-bidding-rules.tool.js";
import {
  manageCustomBiddingScriptLogic,
  manageCustomBiddingScriptTool,
  ManageCustomBiddingScriptOutputSchema,
} from "../../src/mcp-server/tools/definitions/manage-custom-bidding-script.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("DV360 long-tail governance contracts (effect class)", () => {
  let targetingService: Record<string, ReturnType<typeof vi.fn>>;
  let dv360Service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();
    targetingService = {
      createAssignedTargetingOption: vi.fn(),
      deleteAssignedTargetingOption: vi.fn().mockResolvedValue(undefined),
    };
    dv360Service = {
      createEntity: vi.fn(),
      uploadCustomBiddingRules: vi.fn(),
      createCustomBiddingRules: vi.fn(),
      uploadCustomBiddingScript: vi.fn(),
      createCustomBiddingScript: vi.fn(),
      listCustomBiddingRules: vi.fn(),
      listCustomBiddingScripts: vi.fn(),
    };
    mockResolveSessionServices.mockReturnValue({ targetingService, dv360Service });
    mockElicitDelete.mockResolvedValue(true);
    // ensureRequiredFieldValue echoes the provided value (or a stub when absent)
    mockEnsureField.mockImplementation(async (o: any) => o.currentValue ?? "elicited");
  });

  it("every long-tail tool declares a writeClass:effect / manage contract", () => {
    const tools = [
      [createAssignedTargetingTool, "dv360.create_assigned_targeting.v1"],
      [deleteAssignedTargetingTool, "dv360.delete_assigned_targeting.v1"],
      [createCustomBiddingAlgorithmTool, "dv360.create_custom_bidding_algorithm.v1"],
      [manageCustomBiddingRulesTool, "dv360.manage_custom_bidding_rules.v1"],
      [manageCustomBiddingScriptTool, "dv360.manage_custom_bidding_script.v1"],
    ] as const;
    for (const [tool, contractId] of tools) {
      const c = (tool.annotations as { cesteral?: any }).cesteral;
      expect(c.kind).toBe("write");
      expect(c.writeClass).toBe("effect");
      expect(c.operation).toEqual(["manage"]);
      expect(c.contractId).toBe(contractId);
      expect(c.entityKinds).toEqual([]);
      expect(c.supportsBeforeAfterSnapshot).toBe(false);
      expect(c.readPartner).toBeUndefined();
    }
  });

  it("create_assigned_targeting: dry_run previews (no API); execute emits the effect, no raw data", async () => {
    const dry = await createAssignedTargetingLogic(
      {
        parentType: "lineItem",
        advertiserId: "1",
        lineItemId: "2",
        targetingType: "TARGETING_TYPE_CHANNEL",
        data: { channelDetails: { channelId: "9" } },
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(targetingService.createAssignedTargetingOption).not.toHaveBeenCalled();
    expect(dry.dispatchedCapability).toEqual({ operation: "manage", canonicalEntityKind: null });
    expect(dry.dryRun?.expectedEffect?.effectKind).toBe("assigned_targeting_created");
    expect(() => EffectDryRunResultSchema.parse(dry.dryRun)).not.toThrow();
    expect(() => CreateAssignedTargetingOutputSchema.parse(dry)).not.toThrow();

    targetingService.createAssignedTargetingOption.mockResolvedValue({
      assignedTargetingOptionId: "ato-1",
    });
    const exec = await createAssignedTargetingLogic(
      {
        parentType: "lineItem",
        advertiserId: "1",
        lineItemId: "2",
        targetingType: "TARGETING_TYPE_CHANNEL",
        data: { channelDetails: { channelId: "9" } },
      } as any,
      ctx,
      sdk
    );
    expect(exec.effect).toEqual({
      effectKind: "assigned_targeting_created",
      summary: {
        parent_type: "lineItem",
        targeting_type: "TARGETING_TYPE_CHANNEL",
        assigned_targeting_option_id: "ato-1",
      },
    });
    expect(JSON.stringify(exec.effect?.summary)).not.toContain("channelId");
    expect(() => EffectResultSchema.parse(exec.effect)).not.toThrow();
  });

  it("delete_assigned_targeting: dry_run skips confirmation + API; execute emits the effect", async () => {
    const dry = await deleteAssignedTargetingLogic(
      {
        parentType: "lineItem",
        advertiserId: "1",
        lineItemId: "2",
        targetingType: "TARGETING_TYPE_CHANNEL",
        assignedTargetingOptionId: "ato-1",
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(mockElicitDelete).not.toHaveBeenCalled();
    expect(targetingService.deleteAssignedTargetingOption).not.toHaveBeenCalled();
    expect(dry.dryRun?.expectedEffect?.effectKind).toBe("assigned_targeting_deleted");
    expect(() => DeleteAssignedTargetingOutputSchema.parse(dry)).not.toThrow();

    const exec = await deleteAssignedTargetingLogic(
      {
        parentType: "lineItem",
        advertiserId: "1",
        lineItemId: "2",
        targetingType: "TARGETING_TYPE_CHANNEL",
        assignedTargetingOptionId: "ato-1",
      } as any,
      ctx,
      sdk
    );
    expect(exec.effect?.effectKind).toBe("assigned_targeting_deleted");
    expect(exec.dispatchedCapability.canonicalEntityKind).toBeNull();
  });

  it("create_custom_bidding_algorithm: dry_run flags missing fields; execute emits the effect", async () => {
    const missing = await createCustomBiddingAlgorithmLogic(
      { algorithmType: "SCRIPT_BASED", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(dv360Service.createEntity).not.toHaveBeenCalled();
    expect(missing.dryRun?.wouldSucceed).toBe(false);
    expect(missing.dryRun?.validationErrors.map((e) => e.field)).toEqual(
      expect.arrayContaining(["displayName", "ownerType", "ownerId"])
    );

    const ok = await createCustomBiddingAlgorithmLogic(
      {
        displayName: "Algo",
        algorithmType: "SCRIPT_BASED",
        ownerType: "advertiser",
        ownerId: "1",
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(ok.dryRun?.wouldSucceed).toBe(true);
    expect(() => CreateCustomBiddingAlgorithmOutputSchema.parse(ok)).not.toThrow();

    dv360Service.createEntity.mockResolvedValue({
      customBiddingAlgorithmId: "algo-1",
      displayName: "Algo",
      customBiddingAlgorithmType: "SCRIPT_BASED",
      entityStatus: "ENTITY_STATUS_ACTIVE",
      advertiserId: "1",
    });
    const exec = await createCustomBiddingAlgorithmLogic(
      { displayName: "Algo", algorithmType: "SCRIPT_BASED", ownerType: "advertiser", ownerId: "1" } as any,
      ctx,
      sdk
    );
    expect(exec.effect).toEqual({
      effectKind: "custom_bidding_algorithm_created",
      summary: { algorithm_id: "algo-1", algorithm_type: "SCRIPT_BASED", owner_type: "advertiser" },
    });
    expect(exec.dispatchedCapability.canonicalEntityKind).toBeNull();
  });

  it("manage_custom_bidding_rules: dry_run flags upload prerequisites; execute emits the effect", async () => {
    const dry = await manageCustomBiddingRulesLogic(
      { action: "upload", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(dv360Service.uploadCustomBiddingRules).not.toHaveBeenCalled();
    expect(dry.dryRun?.wouldSucceed).toBe(false);
    expect(dry.dryRun?.validationErrors.map((e) => e.field)).toEqual(
      expect.arrayContaining(["customBiddingAlgorithmId", "advertiserId", "rulesContent"])
    );
    expect(() => ManageCustomBiddingRulesOutputSchema.parse(dry)).not.toThrow();

    dv360Service.listCustomBiddingRules.mockResolvedValue({ rules: [] });
    const exec = await manageCustomBiddingRulesLogic(
      { action: "list", customBiddingAlgorithmId: "algo-1", advertiserId: "1" } as any,
      ctx,
      sdk
    );
    expect(exec.effect).toEqual({
      effectKind: "custom_bidding_rules_managed",
      summary: { action: "list", algorithm_id: "algo-1" },
    });
    expect(exec.dispatchedCapability).toEqual({ operation: "manage", canonicalEntityKind: null });
  });

  it("manage_custom_bidding_script: dry_run flags upload prerequisites; execute emits the effect", async () => {
    const dry = await manageCustomBiddingScriptLogic(
      { action: "upload", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(dv360Service.uploadCustomBiddingScript).not.toHaveBeenCalled();
    expect(dry.dryRun?.wouldSucceed).toBe(false);
    expect(dry.dryRun?.validationErrors.map((e) => e.field)).toEqual(
      expect.arrayContaining(["customBiddingAlgorithmId", "advertiserId", "scriptContent"])
    );

    dv360Service.listCustomBiddingScripts.mockResolvedValue({ scripts: [] });
    const exec = await manageCustomBiddingScriptLogic(
      { action: "getActive", customBiddingAlgorithmId: "algo-1", partnerId: "p1" } as any,
      ctx,
      sdk
    );
    expect(exec.effect?.effectKind).toBe("custom_bidding_script_managed");
    expect(() => ManageCustomBiddingScriptOutputSchema.parse(exec)).not.toThrow();
    expect(() => EffectResultSchema.parse(exec.effect)).not.toThrow();
  });
});
