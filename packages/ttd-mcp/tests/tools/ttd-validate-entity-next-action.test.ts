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
