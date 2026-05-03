import { describe, it, expect } from "vitest";
import { validateConversionLogic } from "../src/mcp-server/tools/definitions/validate-conversion.tool.js";

describe("sa360_validate_conversion nextAction", () => {
  it("emits a discovery hint when floodlight identification is missing", async () => {
    const result = await validateConversionLogic(
      {
        mode: "insert",
        conversion: {
          clickId: "abc",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
        },
      },
      { requestId: "test" }
    );

    expect(result.valid).toBe(false);
    expect(result.nextAction).toBeDefined();
    expect(result.nextAction).toMatch(/sa360_list_entities|conversionId/);
  });

  it("emits a hint pointing at conversionId when missing in update mode", async () => {
    const result = await validateConversionLogic(
      {
        mode: "update",
        conversion: {
          clickId: "abc",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
          floodlightActivityId: "12345",
        },
      },
      { requestId: "test" }
    );

    expect(result.valid).toBe(false);
    expect(result.nextAction).toBeDefined();
    expect(result.nextAction).toMatch(/conversionId/);
  });
});
