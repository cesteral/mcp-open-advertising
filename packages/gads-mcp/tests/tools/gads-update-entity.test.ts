import { describe, it, expect } from "vitest";
import { UpdateEntityInputSchema } from "../../src/mcp-server/tools/definitions/update-entity.tool.js";

describe("UpdateEntityInputSchema", () => {
  it("accepts valid update input with updateMask", () => {
    const result = UpdateEntityInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      entityId: "456",
      data: { name: "Updated Campaign" },
      updateMask: "name",
    });
    expect(result.success).toBe(true);
  });

  it("requires updateMask", () => {
    const result = UpdateEntityInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      entityId: "456",
      data: { name: "Updated" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty updateMask", () => {
    const result = UpdateEntityInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      entityId: "456",
      data: { name: "Updated" },
      updateMask: "",
    });
    expect(result.success).toBe(false);
  });

  it("requires entityId", () => {
    const result = UpdateEntityInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      data: { status: "PAUSED" },
      updateMask: "status",
    });
    expect(result.success).toBe(false);
  });

  it("accepts multi-field updateMask", () => {
    const result = UpdateEntityInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      entityId: "456",
      data: { name: "Updated", status: "PAUSED" },
      updateMask: "name,status",
    });
    expect(result.success).toBe(true);
  });
});
