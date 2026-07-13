import { describe, it, expect } from "vitest";

import {
  getTargetingOptionsLogic,
  getTargetingOptionsResponseFormatter,
  GetTargetingOptionsInputSchema,
} from "../../src/mcp-server/tools/definitions/get-targeting-options.tool.js";

const ctx = { requestId: "r" } as any;

describe("msads_get_targeting_options", () => {
  it("returns all criterion targeting types when none is specified", async () => {
    const result = await getTargetingOptionsLogic({}, ctx);
    expect(Object.keys(result.options).sort()).toEqual(["age", "day", "device", "gender"]);
    expect(result.options.day).toHaveLength(7);
  });

  it("returns only the requested targeting type", async () => {
    const result = await getTargetingOptionsLogic({ targetingType: "gender" }, ctx);
    expect(Object.keys(result.options)).toEqual(["gender"]);
    expect(result.options.gender.map((v) => v.Id)).toEqual(["Male", "Female"]);
  });

  it("rejects unsupported targeting types (location is not enumerable)", () => {
    expect(GetTargetingOptionsInputSchema.safeParse({ targetingType: "location" }).success).toBe(
      false
    );
  });

  it("formats a readable static-reference summary", async () => {
    const result = await getTargetingOptionsLogic({ targetingType: "device" }, ctx);
    const text = getTargetingOptionsResponseFormatter(result)[0]!.text;
    expect(text).toContain("static reference");
    expect(text).toContain("Computers");
  });
});
