import { describe, it, expect } from "vitest";
import { validateConversionLogic } from "../src/mcp-server/tools/definitions/validate-conversion.tool.js";
import { extractQueryFields, isV0Field } from "./helpers/v0-field-catalog.js";

describe("sa360_validate_conversion nextAction", () => {
  it("emits a discovery hint when floodlight identification is missing", async () => {
    const result = await validateConversionLogic(
      {
        mode: "insert",
        conversion: {
          clickId: "abc",
          conversionId: "order-1",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
        },
      },
      { requestId: "test" }
    );

    expect(result.valid).toBe(false);
    expect(result.nextAction).toBeDefined();
    // Must not point at `floodlightActivity`, which is not an
    // sa360_list_entities entity type; the lookup query must be v0-valid.
    expect(result.nextAction).not.toMatch(/floodlightActivity\b/);
    expect(result.nextAction).toMatch(/segmentationId/);
    expect(result.nextAction).toMatch(/sa360_gaql_search/);
    const fields = extractQueryFields(result.nextAction!.split("with: ")[1]!);
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.filter((f) => !isV0Field(f))).toEqual([]);
  });

  it("tells insert callers to choose their own conversionId (it is not returned by SA360)", async () => {
    const result = await validateConversionLogic(
      {
        mode: "insert",
        conversion: {
          clickId: "abc",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
          segmentationId: "12345",
        },
      },
      { requestId: "test" }
    );

    expect(result.valid).toBe(false);
    expect(result.nextAction).toMatch(/conversionId/);
    expect(result.nextAction).not.toMatch(/returned by/);
  });

  it("emits a hint pointing at conversionId when missing in update mode", async () => {
    const result = await validateConversionLogic(
      {
        mode: "update",
        conversion: {
          clickId: "abc",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
          segmentationId: "12345",
        },
      },
      { requestId: "test" }
    );

    expect(result.valid).toBe(false);
    expect(result.nextAction).toBeDefined();
    expect(result.nextAction).toMatch(/conversionId/);
    expect(result.nextAction).not.toMatch(/returned by the original insert/);
  });
});
