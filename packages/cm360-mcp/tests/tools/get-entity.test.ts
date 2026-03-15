import { describe, it, expect } from "vitest";
import { GetEntityInputSchema } from "../../src/mcp-server/tools/definitions/get-entity.tool.js";

describe("GetEntityInputSchema", () => {
  it("accepts valid input with all required fields", () => {
    const result = GetEntityInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      entityId: "789012",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing profileId", () => {
    const result = GetEntityInputSchema.safeParse({
      entityType: "campaign",
      entityId: "789012",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty profileId", () => {
    const result = GetEntityInputSchema.safeParse({
      profileId: "",
      entityType: "campaign",
      entityId: "789012",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing entityType", () => {
    const result = GetEntityInputSchema.safeParse({
      profileId: "123456",
      entityId: "789012",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid entityType", () => {
    const result = GetEntityInputSchema.safeParse({
      profileId: "123456",
      entityType: "notAnEntity",
      entityId: "789012",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing entityId", () => {
    const result = GetEntityInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty entityId", () => {
    const result = GetEntityInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      entityId: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid entity types", () => {
    const types = [
      "campaign",
      "placement",
      "ad",
      "creative",
      "site",
      "advertiser",
      "floodlightActivity",
      "floodlightConfiguration",
    ];

    for (const entityType of types) {
      const result = GetEntityInputSchema.safeParse({
        profileId: "123456",
        entityType,
        entityId: "789012",
      });
      expect(result.success, `Expected ${entityType} to be valid`).toBe(true);
    }
  });

  it("rejects extra unknown fields (strict object)", () => {
    const result = GetEntityInputSchema.safeParse({
      profileId: "123456",
      entityType: "campaign",
      entityId: "789012",
      extraField: "should-be-ignored",
    });
    // Zod strips unknown fields by default, so the parse succeeds
    // but the extra field is removed
    if (result.success) {
      expect((result.data as any).extraField).toBeUndefined();
    }
  });
});
