import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

const campaignSchema = z.object({
  displayName: z.string(),
  bidStrategy: z.object({
    fixedBid: z.object({
      bidAmountMicros: z.string(),
    }),
  }),
  frequencyCap: z.object({ unlimited: z.boolean() }),
  campaignFlight: z.object({
    plannedDates: z.object({
      startDate: z.string(),
      endDate: z.string(),
    }),
  }),
  entityStatus: z.string(),
  campaignGoal: z.object({ performanceGoalType: z.string() }),
});

vi.mock("../../../../src/mcp-server/tools/utils/entity-mapping-dynamic.js", () => ({
  getSupportedEntityTypesDynamic: vi.fn().mockReturnValue(["campaign"]),
}));

vi.mock("../../../../src/mcp-server/tools/utils/schema-introspection.js", () => ({
  getEntitySchemaByType: vi.fn().mockImplementation(() => campaignSchema),
  getFieldSchemaByPath: vi.fn().mockImplementation((_schema: unknown, path: string) => {
    if (path === "displayName") {
      return z.string();
    }
    if (path === "bidStrategy.fixedBid.bidAmountMicros") {
      return z.string();
    }
    if (path === "entityStatus") {
      return z.enum(["ENTITY_STATUS_ACTIVE", "ENTITY_STATUS_PAUSED"]);
    }
    return null;
  }),
}));

import { validateEntityLogic } from "../../../../src/mcp-server/tools/definitions/validate-entity.tool.js";

const errorMessages = (result: { issues: { message: string; severity?: string }[] }): string[] =>
  result.issues.filter((i) => i.severity !== "warning").map((i) => i.message);

describe("dv360_validate_entity", () => {
  it("accepts minimal patch update without requiring full entity payload", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign",
        mode: "update",
        updateMask: "displayName",
        data: { displayName: "Renamed campaign" },
      },
      {} as any,
      undefined
    );

    expect(result.valid).toBe(true);
    expect(errorMessages(result)).toEqual([]);
  });

  it("fails when updateMask path does not exist in schema", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign",
        mode: "update",
        updateMask: "does.notExist",
        data: { does: { notExist: "x" } },
      },
      {} as any,
      undefined
    );

    expect(result.valid).toBe(false);
    expect(errorMessages(result)).toEqual(
      expect.arrayContaining(["Unknown updateMask field path: does.notExist"])
    );
  });

  it("fails when updateMask field is missing from data", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign",
        mode: "update",
        updateMask: "displayName",
        data: {},
      },
      {} as any,
      undefined
    );

    expect(result.valid).toBe(false);
    expect(errorMessages(result)).toEqual(
      expect.arrayContaining(["updateMask field not found in data: displayName"])
    );
  });

  it("fails when updateMask has no usable field paths", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign",
        mode: "update",
        updateMask: " , ",
        data: {},
      },
      {} as any,
      undefined
    );

    expect(result.valid).toBe(false);
    expect(errorMessages(result)).toEqual(
      expect.arrayContaining(["updateMask must include at least one field path"])
    );
  });

  it("fails when update value does not match field schema", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign",
        mode: "update",
        updateMask: "bidStrategy.fixedBid.bidAmountMicros",
        data: {
          bidStrategy: {
            fixedBid: {
              bidAmountMicros: 12345,
            },
          },
        },
      },
      {} as any,
      undefined
    );

    expect(result.valid).toBe(false);
    expect(errorMessages(result).some((e) => /expected string/i.test(e))).toBe(true);
  });

  it("maps a wrong enum member to invalidValue (Zod 4 reports it as invalid_value)", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign",
        mode: "update",
        updateMask: "entityStatus",
        data: { entityStatus: "ENTITY_STATUS_RUNNING" },
      },
      {} as any,
      undefined
    );

    expect(result.valid).toBe(false);
    expect(result.issues.filter((i) => i.field === "entityStatus").map((i) => i.code)).toEqual([
      "invalidValue",
    ]);
  });
});
