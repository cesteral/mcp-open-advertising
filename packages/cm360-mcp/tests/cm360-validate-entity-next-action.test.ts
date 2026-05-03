import { describe, it, expect } from "vitest";
import { validateEntityLogic } from "../src/mcp-server/tools/definitions/validate-entity.tool.js";

describe("cm360_validate_entity nextAction", () => {
  it("emits a discovery hint when validation fails for floodlightActivity", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "floodlightActivity",
        mode: "create",
        data: {},
      },
      { requestId: "test" }
    );

    expect(result.valid).toBe(false);
    expect(result.nextAction).toBeDefined();
    expect(result.nextAction).toMatch(/cm360_list_/);
  });
});
