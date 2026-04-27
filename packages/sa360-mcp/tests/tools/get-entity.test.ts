import { describe, it, expect } from "vitest";
import { GetEntityInputSchema } from "../../src/mcp-server/tools/definitions/get-entity.tool.js";

describe("GetEntityInputSchema", () => {
  const validInput = {
    entityType: "campaign",
    customerId: "1234567890",
    entityId: "9876543210",
  };

  it("accepts valid input", () => {
    const result = GetEntityInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("requires entityType", () => {
    const { entityType: _, ...rest } = validInput;
    const result = GetEntityInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires customerId", () => {
    const { customerId: _, ...rest } = validInput;
    const result = GetEntityInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires entityId", () => {
    const { entityId: _, ...rest } = validInput;
    const result = GetEntityInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires numeric customerId", () => {
    const result = GetEntityInputSchema.safeParse({ ...validInput, customerId: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects empty entityId", () => {
    const result = GetEntityInputSchema.safeParse({ ...validInput, entityId: "" });
    expect(result.success).toBe(false);
  });

  it("accepts all 8 entity types", () => {
    const types = [
      "customer",
      "campaign",
      "adGroup",
      "adGroupAd",
      "adGroupCriterion",
      "campaignCriterion",
      "biddingStrategy",
      "conversionAction",
    ];
    for (const entityType of types) {
      const result = GetEntityInputSchema.safeParse({ ...validInput, entityType });
      expect(result.success, `Failed for entityType: ${entityType}`).toBe(true);
    }
  });

  it("rejects invalid entity type", () => {
    const result = GetEntityInputSchema.safeParse({ ...validInput, entityType: "invalid" });
    expect(result.success).toBe(false);
  });
});
