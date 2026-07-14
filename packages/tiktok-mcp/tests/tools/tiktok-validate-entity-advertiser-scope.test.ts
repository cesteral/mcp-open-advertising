import { describe, it, expect } from "vitest";
import { validateEntityLogic } from "../../src/mcp-server/tools/definitions/validate-entity.tool.js";

// Finding M6: `advertiserId` was accepted by the schema but never read. TikTok
// create endpoints are advertiser-scoped, so the param now contributes a
// warning when the advertiser scope is absent.
describe("tiktok_validate_entity advertiser scope (M6)", () => {
  const createPayload = { campaign_name: "Q1 Brand", objective_type: "TRAFFIC" };

  it("warns on create when neither advertiserId nor data.advertiser_id is present", async () => {
    const result = await validateEntityLogic(
      { entityType: "campaign", mode: "create", data: createPayload },
      { requestId: "test" }
    );

    const issue = result.issues.find((i) => i.field === "advertiserId");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warning");
    // Warning only — the required create fields are present, so `valid` holds.
    expect(result.valid).toBe(true);
  });

  it("accepts the advertiser scope via the advertiserId param", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign",
        mode: "create",
        advertiserId: "1234567890",
        data: createPayload,
      },
      { requestId: "test" }
    );
    expect(result.issues.find((i) => i.field === "advertiserId")).toBeUndefined();
  });

  it("accepts the advertiser scope via data.advertiser_id", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign",
        mode: "create",
        data: { ...createPayload, advertiser_id: "1234567890" },
      },
      { requestId: "test" }
    );
    expect(result.issues.find((i) => i.field === "advertiserId")).toBeUndefined();
  });

  it("does not add the advertiser-scope warning on update mode", async () => {
    const result = await validateEntityLogic(
      { entityType: "campaign", mode: "update", data: { campaign_name: "Renamed" } },
      { requestId: "test" }
    );
    expect(result.issues.find((i) => i.field === "advertiserId")).toBeUndefined();
  });
});
