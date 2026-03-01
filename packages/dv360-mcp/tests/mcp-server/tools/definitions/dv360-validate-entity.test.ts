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

vi.mock(
  "../../../../src/mcp-server/tools/utils/entity-mapping-dynamic.js",
  () => ({
    getSupportedEntityTypesDynamic: vi.fn().mockReturnValue(["campaign"]),
  })
);

vi.mock(
  "../../../../src/mcp-server/tools/utils/schema-introspection.js",
  () => ({
    getEntitySchemaByType: vi.fn().mockImplementation(() => campaignSchema),
    getFieldSchemaByPath: vi.fn().mockImplementation((_schema: unknown, path: string) => {
      if (path === "displayName") {
        return z.string();
      }
      if (path === "bidStrategy.fixedBid.bidAmountMicros") {
        return z.string();
      }
      return null;
    }),
  })
);

import { validateEntityLogic } from "../../../../src/mcp-server/tools/definitions/validate-entity.tool.js";

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
    expect(result.errors).toBeUndefined();
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
    expect(result.errors).toEqual(
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
    expect(result.errors).toEqual(
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
    expect(result.errors).toEqual(
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
    expect(result.errors?.some((e) => e.includes("Expected string"))).toBe(true);
  });
});
