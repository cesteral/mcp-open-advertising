import { describe, it, expect } from "vitest";
import { SA360SearchInputSchema } from "../../src/mcp-server/tools/definitions/sa360-search.tool.js";

describe("SA360SearchInputSchema", () => {
  it("accepts valid search input", () => {
    const result = SA360SearchInputSchema.safeParse({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
    });
    expect(result.success).toBe(true);
  });

  it("defaults pageSize to 1000", () => {
    const result = SA360SearchInputSchema.parse({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
    });
    expect(result.pageSize).toBe(1000);
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

  it("rejects pageSize over 10000", () => {
    const result = SA360SearchInputSchema.safeParse({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
      pageSize: 10001,
    });
    expect(result.success).toBe(false);
  });

  it("rejects pageSize less than 1", () => {
    const result = SA360SearchInputSchema.safeParse({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
      pageSize: 0,
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

  it("accepts custom pageSize within range", () => {
    const result = SA360SearchInputSchema.parse({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
      pageSize: 500,
    });
    expect(result.pageSize).toBe(500);
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
