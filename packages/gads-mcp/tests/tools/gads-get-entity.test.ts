import { describe, it, expect } from "vitest";
import { GetEntityInputSchema } from "../../src/mcp-server/tools/definitions/get-entity.tool.js";

describe("GetEntityInputSchema", () => {
  it("accepts valid get entity input", () => {
    const result = GetEntityInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      entityId: "456",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid entity type", () => {
    const result = GetEntityInputSchema.safeParse({
      entityType: "invalidType",
      customerId: "1234567890",
      entityId: "456",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing customerId", () => {
    const result = GetEntityInputSchema.safeParse({
      entityType: "campaign",
      entityId: "456",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing entityId", () => {
    const result = GetEntityInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty entityId", () => {
    const result = GetEntityInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      entityId: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all supported entity types", () => {
    const entityTypes = ["campaign", "adGroup", "ad", "keyword", "campaignBudget", "asset"];
    for (const entityType of entityTypes) {
      const result = GetEntityInputSchema.safeParse({
        entityType,
        customerId: "123",
        entityId: "456",
      });
      expect(result.success).toBe(true);
    }
  });
});
