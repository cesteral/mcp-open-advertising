import { describe, it, expect } from "vitest";
import { RemoveEntityInputSchema } from "../../src/mcp-server/tools/definitions/remove-entity.tool.js";

describe("RemoveEntityInputSchema", () => {
  it("accepts valid remove input", () => {
    const result = RemoveEntityInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      entityId: "456",
    });
    expect(result.success).toBe(true);
  });

  it("requires entityId", () => {
    const result = RemoveEntityInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty entityId", () => {
    const result = RemoveEntityInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      entityId: "",
    });
    expect(result.success).toBe(false);
  });

  it("validates entity type enum", () => {
    const result = RemoveEntityInputSchema.safeParse({
      entityType: "unknown",
      customerId: "1234567890",
      entityId: "456",
    });
    expect(result.success).toBe(false);
  });

  it("rejects ad entity with simple entityId (requires composite)", () => {
    const result = RemoveEntityInputSchema.safeParse({
      entityType: "ad",
      customerId: "1234567890",
      entityId: "456",
    });
    expect(result.success).toBe(false);
  });

  it("accepts ad entity with composite entityId", () => {
    const result = RemoveEntityInputSchema.safeParse({
      entityType: "ad",
      customerId: "1234567890",
      entityId: "789~456",
    });
    expect(result.success).toBe(true);
  });

  it("rejects ad entity with malformed composite IDs", () => {
    const malformed = ["~", "123~", "~456", "1~2~3", "abc~def"];
    for (const id of malformed) {
      const result = RemoveEntityInputSchema.safeParse({
        entityType: "ad",
        customerId: "1234567890",
        entityId: id,
      });
      expect(result.success, `expected "${id}" to be rejected`).toBe(false);
    }
  });
});
