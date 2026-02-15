import { describe, it, expect } from "vitest";
import { BulkMutateInputSchema } from "../../src/mcp-server/tools/definitions/bulk-mutate.tool.js";

describe("BulkMutateInputSchema", () => {
  it("accepts valid bulk mutate input with create operations", () => {
    const result = BulkMutateInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      operations: [{ create: { name: "Campaign 1" } }],
    });
    expect(result.success).toBe(true);
  });

  it("defaults partialFailure to false", () => {
    const result = BulkMutateInputSchema.parse({
      entityType: "campaign",
      customerId: "1234567890",
      operations: [{ create: { name: "Test" } }],
    });
    expect(result.partialFailure).toBe(false);
  });

  it("accepts partialFailure flag", () => {
    const result = BulkMutateInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      operations: [{ create: { name: "Test" } }],
      partialFailure: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.partialFailure).toBe(true);
    }
  });

  it("rejects empty operations array", () => {
    const result = BulkMutateInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      operations: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid entity type", () => {
    const result = BulkMutateInputSchema.safeParse({
      entityType: "invalidType",
      customerId: "1234567890",
      operations: [{ create: { name: "Test" } }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing customerId", () => {
    const result = BulkMutateInputSchema.safeParse({
      entityType: "campaign",
      operations: [{ create: { name: "Test" } }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts mixed operation types", () => {
    const result = BulkMutateInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      operations: [
        { create: { name: "New Campaign" } },
        { update: { resourceName: "customers/123/campaigns/456", name: "Updated" }, updateMask: "name" },
        { remove: "customers/123/campaigns/789" },
      ],
    });
    expect(result.success).toBe(true);
  });
});
