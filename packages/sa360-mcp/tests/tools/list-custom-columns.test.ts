import { describe, it, expect } from "vitest";
import { ListCustomColumnsInputSchema } from "../../src/mcp-server/tools/definitions/list-custom-columns.tool.js";

describe("ListCustomColumnsInputSchema", () => {
  it("accepts valid customerId", () => {
    const result = ListCustomColumnsInputSchema.safeParse({ customerId: "1234567890" });
    expect(result.success).toBe(true);
  });

  it("requires customerId", () => {
    const result = ListCustomColumnsInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("requires numeric customerId", () => {
    const result = ListCustomColumnsInputSchema.safeParse({ customerId: "abc-def" });
    expect(result.success).toBe(false);
  });

  it("rejects empty customerId", () => {
    const result = ListCustomColumnsInputSchema.safeParse({ customerId: "" });
    expect(result.success).toBe(false);
  });
});
