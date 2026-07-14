import { describe, it, expect } from "vitest";
import { validateEntityLogic } from "../../src/mcp-server/tools/definitions/validate-entity.tool.js";

describe("ttd_validate_entity nextAction", () => {
  it("emits a list-entity hint when a parent ID is missing", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign",
        mode: "create",
        data: {
          CampaignName: "Q1 Brand",
          Budget: { Amount: 50000, CurrencyCode: "USD" },
          StartDate: "2025-01-01T00:00:00Z",
          PacingMode: "PaceEvenly",
        },
      },
      { requestId: "test" }
    );

    expect(result.valid).toBe(false);
    expect(result.nextAction).toBeDefined();
    expect(result.nextAction).toMatch(/ttd_list_entities/);
  });

  it("emits a read-resource hint when non-parent fields fail", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign",
        mode: "create",
        data: { AdvertiserId: "adv123", PartnerId: "p1" },
      },
      { requestId: "test" }
    );

    expect(result.valid).toBe(false);
    expect(result.nextAction).toBeDefined();
    expect(result.nextAction).toMatch(/ttd-field-rules:\/\/campaign/);
  });
});

describe("ttd_validate_entity update-target identification (M6)", () => {
  const updatePayload = { Budget: { Amount: 100, CurrencyCode: "USD" } };

  it("warns when an update identifies no target (no entityId, no idField in data)", async () => {
    const result = await validateEntityLogic(
      { entityType: "campaign", mode: "update", data: updatePayload },
      { requestId: "test" }
    );

    const entityIdIssue = result.issues.find((i) => i.field === "entityId");
    expect(entityIdIssue).toBeDefined();
    expect(entityIdIssue?.severity).toBe("warning");
    expect(entityIdIssue?.message).toMatch(/CampaignId/);
    // Warning only — a real field is present, so the payload itself is valid.
    expect(result.valid).toBe(true);
  });

  it("accepts the target via the entityId param", async () => {
    const result = await validateEntityLogic(
      { entityType: "campaign", mode: "update", entityId: "camp123", data: updatePayload },
      { requestId: "test" }
    );
    expect(result.issues.find((i) => i.field === "entityId")).toBeUndefined();
  });

  it("accepts the target via the entity's own idField in data", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign",
        mode: "update",
        data: { ...updatePayload, CampaignId: "camp123" },
      },
      { requestId: "test" }
    );
    expect(result.issues.find((i) => i.field === "entityId")).toBeUndefined();
  });
});
