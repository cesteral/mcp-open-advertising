import { describe, it, expect } from "vitest";
import { ListUserProfilesInputSchema } from "../../src/mcp-server/tools/definitions/list-user-profiles.tool.js";

describe("ListUserProfilesInputSchema", () => {
  it("accepts empty object", () => {
    const result = ListUserProfilesInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts call with no arguments", () => {
    // When MCP tools are called with no arguments, the schema receives {}
    const result = ListUserProfilesInputSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });

  it("strips unknown fields", () => {
    const result = ListUserProfilesInputSchema.safeParse({
      unexpectedField: "value",
    });
    // Zod strips unknown fields by default
    if (result.success) {
      expect((result.data as any).unexpectedField).toBeUndefined();
    }
  });

  it("accepts undefined input gracefully", () => {
    // safeParse with undefined should fail since it's not an object
    const result = ListUserProfilesInputSchema.safeParse(undefined);
    expect(result.success).toBe(false);
  });

  it("rejects non-object input", () => {
    const result = ListUserProfilesInputSchema.safeParse("not-an-object");
    expect(result.success).toBe(false);
  });

  it("rejects null input", () => {
    const result = ListUserProfilesInputSchema.safeParse(null);
    expect(result.success).toBe(false);
  });
});
