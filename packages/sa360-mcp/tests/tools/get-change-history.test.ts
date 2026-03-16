import { describe, it, expect } from "vitest";
import { GetChangeHistoryInputSchema } from "../../src/mcp-server/tools/definitions/get-change-history.tool.js";

describe("GetChangeHistoryInputSchema", () => {
  const validInput = {
    customerId: "1234567890",
    startDate: "2026-03-01",
    endDate: "2026-03-16",
  };

  it("accepts valid input", () => {
    const result = GetChangeHistoryInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("defaults limit to 100", () => {
    const result = GetChangeHistoryInputSchema.parse(validInput);
    expect(result.limit).toBe(100);
  });

  it("requires numeric customerId", () => {
    const result = GetChangeHistoryInputSchema.safeParse({
      ...validInput,
      customerId: "abc",
    });
    expect(result.success).toBe(false);
  });

  it("requires startDate in YYYY-MM-DD format", () => {
    const result = GetChangeHistoryInputSchema.safeParse({
      ...validInput,
      startDate: "03-01-2026",
    });
    expect(result.success).toBe(false);
  });

  it("requires endDate in YYYY-MM-DD format", () => {
    const result = GetChangeHistoryInputSchema.safeParse({
      ...validInput,
      endDate: "March 16",
    });
    expect(result.success).toBe(false);
  });

  it("requires startDate", () => {
    const { startDate: _, ...rest } = validInput;
    const result = GetChangeHistoryInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires endDate", () => {
    const { endDate: _, ...rest } = validInput;
    const result = GetChangeHistoryInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("accepts optional resourceType", () => {
    const result = GetChangeHistoryInputSchema.safeParse({
      ...validInput,
      resourceType: "CAMPAIGN",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all supported resource types", () => {
    const types = ["CAMPAIGN", "AD_GROUP", "AD", "KEYWORD", "CRITERION"];
    for (const resourceType of types) {
      const result = GetChangeHistoryInputSchema.safeParse({ ...validInput, resourceType });
      expect(result.success, `Failed for resourceType: ${resourceType}`).toBe(true);
    }
  });

  it("rejects invalid resourceType", () => {
    const result = GetChangeHistoryInputSchema.safeParse({
      ...validInput,
      resourceType: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("accepts custom limit", () => {
    const result = GetChangeHistoryInputSchema.safeParse({
      ...validInput,
      limit: 50,
    });
    expect(result.success).toBe(true);
  });

  it("rejects limit over 10000", () => {
    const result = GetChangeHistoryInputSchema.safeParse({
      ...validInput,
      limit: 10001,
    });
    expect(result.success).toBe(false);
  });

  it("rejects limit less than 1", () => {
    const result = GetChangeHistoryInputSchema.safeParse({
      ...validInput,
      limit: 0,
    });
    expect(result.success).toBe(false);
  });
});
