import { describe, it, expect } from "vitest";
import { CreateEntityInputSchema } from "../../src/mcp-server/tools/definitions/create-entity.tool.js";

describe("CreateEntityInputSchema", () => {
  it("accepts valid campaign creation input", () => {
    const result = CreateEntityInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      data: { name: "My Campaign" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid adGroup creation input", () => {
    const result = CreateEntityInputSchema.safeParse({
      entityType: "adGroup",
      customerId: "1234567890",
      data: { name: "My Ad Group" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid entity type", () => {
    const result = CreateEntityInputSchema.safeParse({
      entityType: "invalidType",
      customerId: "1234567890",
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing customerId", () => {
    const result = CreateEntityInputSchema.safeParse({
      entityType: "campaign",
      data: { name: "Test" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts all supported entity types", () => {
    const entityTypes = ["campaign", "adGroup", "ad", "keyword", "campaignBudget", "asset"];
    for (const entityType of entityTypes) {
      const result = CreateEntityInputSchema.safeParse({
        entityType,
        customerId: "123",
        data: {},
      });
      expect(result.success).toBe(true);
    }
  });
});
