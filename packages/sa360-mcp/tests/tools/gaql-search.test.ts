import { describe, it, expect } from "vitest";
import { SA360SearchInputSchema } from "../../src/mcp-server/tools/definitions/gaql-search.tool.js";

describe("SA360SearchInputSchema", () => {
  it("accepts valid search input", () => {
    const result = SA360SearchInputSchema.safeParse({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
    });
    expect(result.success).toBe(true);
  });

  it("defaults to summary mode", () => {
    const result = SA360SearchInputSchema.parse({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
    });
    expect(result.mode).toBe("summary");
  });

  it("rejects empty customerId", () => {
    const result = SA360SearchInputSchema.safeParse({
      customerId: "",
      query: "SELECT campaign.id FROM campaign",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty query", () => {
    const result = SA360SearchInputSchema.safeParse({
      customerId: "1234567890",
      query: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts pageToken for pagination", () => {
    const result = SA360SearchInputSchema.safeParse({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
      pageToken: "abc123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing customerId", () => {
    const result = SA360SearchInputSchema.safeParse({
      query: "SELECT campaign.id FROM campaign",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing query", () => {
    const result = SA360SearchInputSchema.safeParse({
      customerId: "1234567890",
    });
    expect(result.success).toBe(false);
  });
});
