// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.
//
// Governance contract (effect class) for meta_manage_budget_schedule. A budget
// schedule is not a canonical entity, so it is governed as an effect
// (operation `manage`, null-kind dispatchedCapability, no snapshot). dry_run
// skips the budget-change confirmation + API and returns a symbolic preview;
// the effect summary carries audit identity only (never the raw budget data).

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));
vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

const { mockElicitBudget } = vi.hoisted(() => ({ mockElicitBudget: vi.fn() }));
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, elicitBudgetChangeConfirmation: mockElicitBudget };
});

import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";
import {
  manageBudgetScheduleLogic,
  manageBudgetScheduleTool,
  ManageBudgetScheduleOutputSchema,
} from "../../src/mcp-server/tools/definitions/manage-budget-schedule.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("meta_manage_budget_schedule governance contract (effect class)", () => {
  let metaService: {
    createBudgetSchedule: ReturnType<typeof vi.fn>;
    listBudgetSchedules: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    metaService = {
      createBudgetSchedule: vi.fn().mockResolvedValue({ id: "bs-1" }),
      listBudgetSchedules: vi.fn().mockResolvedValue({ data: [] }),
    };
    mockResolveSessionServices.mockReturnValue({ metaService });
    mockElicitBudget.mockResolvedValue(true);
  });

  it("declares a writeClass:effect / manage contract", () => {
    const c = (manageBudgetScheduleTool.annotations as { cesteral?: any }).cesteral;
    expect(c.writeClass).toBe("effect");
    expect(c.operation).toEqual(["manage"]);
    expect(c.contractId).toBe("meta.manage_budget_schedule.v1");
    expect(c.entityKinds).toEqual([]);
    expect(c.supportsBeforeAfterSnapshot).toBe(false);
  });

  it("dry_run skips confirmation + API and returns a symbolic preview", async () => {
    const dry = await manageBudgetScheduleLogic(
      {
        operation: "create",
        campaignId: "c1",
        data: { budget_value: "10000", budget_value_type: "ABSOLUTE" },
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(mockElicitBudget).not.toHaveBeenCalled();
    expect(metaService.createBudgetSchedule).not.toHaveBeenCalled();
    expect(dry.dispatchedCapability).toEqual({ operation: "manage", canonicalEntityKind: null });
    expect(dry.dryRun?.expectedEffect?.summary).toEqual({ operation: "create", campaign_id: "c1" });
    expect(() => EffectDryRunResultSchema.parse(dry.dryRun)).not.toThrow();
    expect(() => ManageBudgetScheduleOutputSchema.parse(dry)).not.toThrow();
  });

  it("execute emits budget_schedule_managed without the raw budget data", async () => {
    const exec = await manageBudgetScheduleLogic(
      {
        operation: "create",
        campaignId: "c1",
        data: { budget_value: "99999", budget_value_type: "ABSOLUTE" },
      } as any,
      ctx,
      sdk
    );
    expect(metaService.createBudgetSchedule).toHaveBeenCalledOnce();
    expect(exec.effect).toEqual({
      effectKind: "budget_schedule_managed",
      summary: { operation: "create", campaign_id: "c1" },
    });
    expect(JSON.stringify(exec.effect?.summary)).not.toContain("99999");
    expect(() => EffectResultSchema.parse(exec.effect)).not.toThrow();
  });

  it("declined confirmation reports the capability, no effect", async () => {
    mockElicitBudget.mockResolvedValue(false);
    const res = await manageBudgetScheduleLogic(
      { operation: "create", campaignId: "c1", data: { budget_value: "1" } } as any,
      ctx,
      sdk
    );
    expect(metaService.createBudgetSchedule).not.toHaveBeenCalled();
    expect(res.confirmed).toBe(false);
    expect(res.effect).toBeUndefined();
    expect(res.dispatchedCapability.canonicalEntityKind).toBeNull();
  });
});
