import { describe, it, expect } from "vitest";
import { validateEntityLogic } from "../src/mcp-server/tools/definitions/validate-entity.tool.js";

describe("pinterest_validate_entity nextAction", () => {
  it("emits a discovery hint when validation fails", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign",
        mode: "create",
        data: {},
      },
      { requestId: "test" }
    );

    expect(result.valid).toBe(false);
    expect(result.nextAction).toBeDefined();
    expect(result.nextAction).toMatch(/pinterest_list_/);
  });
});
