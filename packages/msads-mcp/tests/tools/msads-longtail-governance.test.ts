// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.
//
// Governance contract (effect class) for the MSAds long-tail write tools:
// import_from_google, manage_ad_extensions, manage_criterions. None map to a
// canonical entity, so each is governed as an effect (operation `manage`,
// null-kind dispatchedCapability, no snapshot). dry_run returns a symbolic
// preview without calling the API; effect summaries carry audit identity only.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));
vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";
import {
  importFromGoogleLogic,
  importFromGoogleTool,
  ImportFromGoogleOutputSchema,
} from "../../src/mcp-server/tools/definitions/import-from-google.tool.js";
import {
  manageAdExtensionsLogic,
  manageAdExtensionsTool,
  ManageAdExtensionsOutputSchema,
} from "../../src/mcp-server/tools/definitions/manage-ad-extensions.tool.js";
import {
  manageCriterionsLogic,
  manageCriterionsTool,
  ManageCriterionsOutputSchema,
} from "../../src/mcp-server/tools/definitions/manage-criterions.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("MSAds long-tail governance contracts (effect class)", () => {
  let msadsService: { executeOperation: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    msadsService = { executeOperation: vi.fn().mockResolvedValue({ ok: true }) };
    mockResolveSessionServices.mockReturnValue({ msadsService });
  });

  it("declares writeClass:effect / manage contracts", () => {
    const tools = [
      [importFromGoogleTool, "msads.import_from_google.v1"],
      [manageAdExtensionsTool, "msads.manage_ad_extensions.v1"],
      [manageCriterionsTool, "msads.manage_criterions.v1"],
    ] as const;
    for (const [tool, contractId] of tools) {
      const c = (tool.annotations as { cesteral?: any }).cesteral;
      expect(c.writeClass).toBe("effect");
      expect(c.operation).toEqual(["manage"]);
      expect(c.contractId).toBe(contractId);
      expect(c.entityKinds).toEqual([]);
      expect(c.supportsBeforeAfterSnapshot).toBe(false);
    }
  });

  it("import_from_google: dry_run previews (no API); execute emits import_job_managed", async () => {
    const dry = await importFromGoogleLogic(
      { operation: "create", data: { ImportJobs: [{ secret: 1 }] }, dry_run: true } as any,
      ctx,
      sdk
    );
    expect(msadsService.executeOperation).not.toHaveBeenCalled();
    expect(dry.dispatchedCapability).toEqual({ operation: "manage", canonicalEntityKind: null });
    expect(dry.dryRun?.expectedEffect?.effectKind).toBe("import_job_managed");
    expect(() => EffectDryRunResultSchema.parse(dry.dryRun)).not.toThrow();

    const exec = await importFromGoogleLogic(
      { operation: "create", data: { ImportJobs: [{ secret: 1 }] } } as any,
      ctx,
      sdk
    );
    expect(exec.effect).toEqual({
      effectKind: "import_job_managed",
      summary: { operation: "create" },
    });
    expect(JSON.stringify(exec.effect?.summary)).not.toContain("secret");
    expect(() => ImportFromGoogleOutputSchema.parse(exec)).not.toThrow();
    expect(() => EffectResultSchema.parse(exec.effect)).not.toThrow();
  });

  it("manage_ad_extensions: dry_run previews; execute emits ad_extensions_managed", async () => {
    const dry = await manageAdExtensionsLogic(
      { operation: "setAssociations", data: { x: 1 }, dry_run: true } as any,
      ctx,
      sdk
    );
    expect(msadsService.executeOperation).not.toHaveBeenCalled();
    expect(dry.dryRun?.expectedEffect?.effectKind).toBe("ad_extensions_managed");

    const exec = await manageAdExtensionsLogic(
      { operation: "setAssociations", data: { x: 1 } } as any,
      ctx,
      sdk
    );
    expect(exec.effect?.effectKind).toBe("ad_extensions_managed");
    expect(exec.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(() => ManageAdExtensionsOutputSchema.parse(exec)).not.toThrow();
  });

  it("manage_criterions: dry_run previews with entity level; execute emits criterions_managed", async () => {
    const dry = await manageCriterionsLogic(
      { operation: "add", entityLevel: "campaign", data: { x: 1 }, dry_run: true } as any,
      ctx,
      sdk
    );
    expect(msadsService.executeOperation).not.toHaveBeenCalled();
    expect(dry.dryRun?.expectedEffect?.summary).toEqual({
      operation: "add",
      entity_level: "campaign",
    });

    const exec = await manageCriterionsLogic(
      { operation: "add", entityLevel: "campaign", data: { x: 1 } } as any,
      ctx,
      sdk
    );
    expect(exec.effect).toEqual({
      effectKind: "criterions_managed",
      summary: { operation: "add", entity_level: "campaign" },
    });
    expect(() => ManageCriterionsOutputSchema.parse(exec)).not.toThrow();
  });
});
