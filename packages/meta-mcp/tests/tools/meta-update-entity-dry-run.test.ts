// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("../../src/mcp-server/tools/utils/entity-mapping.js", () => ({
  getEntityTypeEnum: vi
    .fn()
    .mockReturnValue(["campaign", "adSet", "ad", "adCreative", "customAudience"]),
}));

import {
  updateEntityLogic,
  UpdateEntityInputSchema,
  UpdateEntityOutputSchema,
  updateEntityTool,
} from "../../src/mcp-server/tools/definitions/update-entity.tool.js";

function ctx() {
  return { requestId: "r-dry", timestamp: new Date().toISOString(), operation: "test" } as any;
}

describe("meta_update_entity dry_run", () => {
  let metaService: {
    updateEntity: ReturnType<typeof vi.fn>;
    getEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    metaService = {
      updateEntity: vi.fn().mockResolvedValue({ success: true }),
      getEntity: vi.fn().mockResolvedValue({
        id: "999",
        name: "Old Name",
        status: "ACTIVE",
        daily_budget: 5000,
        currency: "USD",
        account_id: "act_42",
      }),
    };
    mockResolveSessionServices.mockReturnValue({ metaService });
  });

  it("declares dry_run as an optional input flag with default false", () => {
    const parsed = UpdateEntityInputSchema.parse({
      entityType: "campaign",
      entityId: "999",
      data: { status: "PAUSED" },
    });
    expect(parsed.dry_run).toBe(false);
  });

  it("declares dryRun as an optional output field", () => {
    const ok = UpdateEntityOutputSchema.safeParse({
      success: true,
      entityId: "999",
      timestamp: new Date().toISOString(),
      // dispatchedCapability is required on every response; dryRun is optional.
      dispatchedCapability: { operation: "update", canonicalEntityKind: "campaign" },
    });
    expect(ok.success).toBe(true);
  });

  it("does NOT call updateEntity when dry_run=true", async () => {
    const result = await updateEntityLogic(
      {
        entityType: "campaign" as any,
        entityId: "999",
        data: { status: "PAUSED" },
        dry_run: true,
      },
      ctx(),
      { sessionId: "s" } as any
    );

    expect(metaService.updateEntity).not.toHaveBeenCalled();
    expect(result.dryRun).toBeDefined();
    expect(result.dryRun!.wouldSucceed).toBe(true);
    expect(result.dryRun!.validationErrors).toEqual([]);
    expect(result.dryRun!.validationSource).toBe("symbolic");
  });

  it("symbolic apply produces expectedPostState mirroring the requested patch", async () => {
    const result = await updateEntityLogic(
      {
        entityType: "adSet" as any,
        entityId: "999",
        data: { daily_budget: 12000 },
        dry_run: true,
      },
      ctx(),
      { sessionId: "s" } as any
    );

    expect(result.dryRun!.expectedStateSource).toBe("server_symbolic_apply");
    const state = result.dryRun!.expectedPostState!;
    expect(state.platform).toBe("meta_ads");
    expect(state.entityKind).toBe("ad_set");
    expect(state.platformEntityId).toBe("999");
    expect(state.budget.daily).toEqual({ amountMinor: 12000, currency: "USD" });
    expect(state.status.canonical).toBe("active");
  });

  it("flags invalid status without invoking the write", async () => {
    const result = await updateEntityLogic(
      {
        entityType: "campaign" as any,
        entityId: "999",
        data: { status: "BOGUS" },
        dry_run: true,
      },
      ctx(),
      { sessionId: "s" } as any
    );

    expect(metaService.updateEntity).not.toHaveBeenCalled();
    expect(result.dryRun!.wouldSucceed).toBe(false);
    expect(result.dryRun!.validationErrors[0].code).toBe("INVALID_STATUS");
    expect(result.success).toBe(false);
  });

  it("fails the call when the read partner cannot resolve the entity", async () => {
    // The tool declares requiresSimulation:true — a dry-run that cannot
    // produce an expected post-state must fail the call, not return an
    // expectedStateSource:"none" payload the governance layer would reject.
    metaService.getEntity.mockRejectedValueOnce(new Error("not found"));
    await expect(
      updateEntityLogic(
        {
          entityType: "campaign" as any,
          entityId: "999",
          data: { status: "PAUSED" },
          dry_run: true,
        },
        ctx(),
        { sessionId: "s" } as any
      )
    ).rejects.toThrow(/not found/);
    expect(metaService.updateEntity).not.toHaveBeenCalled();
  });

  it("default (dry_run unset) preserves existing write behavior", async () => {
    const result = await updateEntityLogic(
      {
        entityType: "campaign" as any,
        entityId: "999",
        data: { status: "PAUSED" },
      },
      ctx(),
      { sessionId: "s" } as any
    );
    expect(metaService.updateEntity).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    expect(result.dryRun).toBeUndefined();
  });

  it("annotation reflects supportsDryRun: true", () => {
    const cesteral = (updateEntityTool.annotations as any).cesteral;
    expect(cesteral.supportsDryRun).toBe(true);
  });
});
