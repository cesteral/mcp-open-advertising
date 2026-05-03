// Asserts that the gads_validate_entity tool surfaces `nextAction` on
// validation failures so an LLM client can self-recover via discovery tools.

import { describe, it, expect, vi } from "vitest";
import { validateEntityLogic } from "../../src/mcp-server/tools/definitions/validate-entity.tool.js";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: () => ({
    gadsService: {
      validateEntity: async () => ({
        valid: false,
        errors: ['Field "name" is required'],
      }),
    },
  }),
}));

describe("gads_validate_entity nextAction", () => {
  it("emits a discovery hint when validation fails", async () => {
    const result = await validateEntityLogic(
      {
        entityType: "campaign",
        customerId: "1234567890",
        mode: "create",
        data: {},
      },
      { requestId: "test" }
    );

    expect(result.valid).toBe(false);
    expect(result.nextAction).toBeDefined();
    expect(result.nextAction).toMatch(/gads_list_/);
  });
});
