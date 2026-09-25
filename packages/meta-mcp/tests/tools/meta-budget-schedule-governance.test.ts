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
  BudgetScheduleCreateDataSchema,
  ManageBudgetScheduleInputSchema,
  manageBudgetScheduleLogic,
  manageBudgetScheduleTool,
  ManageBudgetScheduleOutputSchema,
} from "../../src/mcp-server/tools/definitions/manage-budget-schedule.tool.js";

const ctx = { requestId: "r" } as any;

// 2026-04-01T07:00:00Z → 2026-04-02T07:00:00Z, Unix seconds.
const VALID = {
  budget_value: 10000,
  budget_value_type: "ABSOLUTE",
  time_start: 1775026800,
  time_end: 1775113200,
} as const;
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
        data: VALID,
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
        data: { ...VALID, budget_value: 99999 },
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
      { operation: "create", campaignId: "c1", data: { ...VALID, budget_value: 1 } } as any,
      ctx,
      sdk
    );
    expect(metaService.createBudgetSchedule).not.toHaveBeenCalled();
    expect(res.confirmed).toBe(false);
    expect(res.effect).toBeUndefined();
    expect(res.dispatchedCapability.canonicalEntityKind).toBeNull();
  });
});

describe("meta_manage_budget_schedule request shape (Meta Business SDK v26.0)", () => {
  // facebook-python-business-sdk Campaign.create_budget_schedule: budget_value,
  // time_start, time_end are `unsigned int`; budget_value_type is
  // HighDemandPeriod.BudgetValueType = ABSOLUTE | MULTIPLIER.
  let metaService: { createBudgetSchedule: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    metaService = { createBudgetSchedule: vi.fn().mockResolvedValue({ id: "bs-1" }) };
    mockResolveSessionServices.mockReturnValue({ metaService });
    mockElicitBudget.mockResolvedValue(true);
  });

  it("accepts ABSOLUTE and MULTIPLIER, rejects RELATIVE", () => {
    expect(BudgetScheduleCreateDataSchema.safeParse(VALID).success).toBe(true);
    expect(
      BudgetScheduleCreateDataSchema.safeParse({ ...VALID, budget_value_type: "MULTIPLIER" })
        .success
    ).toBe(true);
    expect(
      BudgetScheduleCreateDataSchema.safeParse({ ...VALID, budget_value_type: "RELATIVE" }).success
    ).toBe(false);
  });

  it("rejects ISO-8601 and millisecond timestamps, and end <= start", () => {
    expect(
      BudgetScheduleCreateDataSchema.safeParse({ ...VALID, time_start: "2026-04-01T00:00:00-0700" })
        .success
    ).toBe(false);
    expect(
      BudgetScheduleCreateDataSchema.safeParse({ ...VALID, time_start: 1775026800000 }).success
    ).toBe(false);
    expect(
      BudgetScheduleCreateDataSchema.safeParse({ ...VALID, time_end: VALID.time_start }).success
    ).toBe(false);
  });

  it("tool input examples satisfy the input schema", () => {
    for (const ex of manageBudgetScheduleTool.inputExamples) {
      expect(ManageBudgetScheduleInputSchema.safeParse(ex.input).success).toBe(true);
    }
  });

  it("execute POSTs integer Unix-second times", async () => {
    await manageBudgetScheduleLogic(
      {
        operation: "create",
        campaignId: "c1",
        data: { ...VALID, budget_value: "10000", time_start: "1775026800" },
      } as any,
      ctx,
      sdk
    );
    expect(metaService.createBudgetSchedule).toHaveBeenCalledWith("c1", VALID, ctx);
  });

  it("execute rejects invalid data before confirmation or API call", async () => {
    await expect(
      manageBudgetScheduleLogic(
        {
          operation: "create",
          campaignId: "c1",
          data: { ...VALID, budget_value_type: "RELATIVE" },
        } as any,
        ctx,
        sdk
      )
    ).rejects.toThrow(/budget_value_type/);
    expect(mockElicitBudget).not.toHaveBeenCalled();
    expect(metaService.createBudgetSchedule).not.toHaveBeenCalled();
  });

  it("dry_run reports missing required fields as validation errors", async () => {
    const dry = await manageBudgetScheduleLogic(
      {
        operation: "create",
        campaignId: "c1",
        data: { budget_value: 10000, budget_value_type: "ABSOLUTE" },
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(dry.dryRun?.wouldSucceed).toBe(false);
    const fields = dry.dryRun?.validationErrors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(["data.time_start", "data.time_end"]));
  });

  it("confirmation does not describe a MULTIPLIER value as cents", async () => {
    await manageBudgetScheduleLogic(
      {
        operation: "create",
        campaignId: "c1",
        data: { ...VALID, budget_value_type: "MULTIPLIER", budget_value: 2 },
      } as any,
      ctx,
      sdk
    );
    const summary = mockElicitBudget.mock.calls[0]![0].summary as string;
    expect(summary).not.toContain("cents");
    expect(summary).toContain("2026-04-01T07:00:00.000Z");
  });
});
