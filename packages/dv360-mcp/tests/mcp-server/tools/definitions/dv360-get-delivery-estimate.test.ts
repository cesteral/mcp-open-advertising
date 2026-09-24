import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  getDeliveryEstimateLogic,
  getDeliveryEstimateTool,
  GetDeliveryEstimateInputSchema,
} from "../../../../src/mcp-server/tools/definitions/get-delivery-estimate.tool.js";

describe("dv360_get_delivery_estimate", () => {
  let getDeliveryEstimate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getDeliveryEstimate = vi.fn().mockResolvedValue({ lineItem: {}, source: "lineItem" });
    mockResolveSessionServices.mockReturnValue({ dv360Service: { getDeliveryEstimate } });
  });

  // `lineItems:generateDefault` is absent from DV360 v2/v3/v4 Discovery, so
  // the advertiser-only mode that called it is gone: a line item is required.
  it("requires lineItemId", () => {
    expect(GetDeliveryEstimateInputSchema.safeParse({ advertiserId: "1" }).success).toBe(false);
    expect(
      GetDeliveryEstimateInputSchema.safeParse({ advertiserId: "1", lineItemId: "li-1" }).success
    ).toBe(true);
  });

  it("no longer advertises generateDefault or an advertiser-only example", () => {
    expect(getDeliveryEstimateTool.description).not.toMatch(/generateDefault/);
    for (const ex of getDeliveryEstimateTool.inputExamples) {
      expect(ex.input).toHaveProperty("lineItemId");
    }
  });

  it("reads the line item through the service", async () => {
    const result = await getDeliveryEstimateLogic(
      { advertiserId: "1", lineItemId: "li-1" },
      { requestId: "r" } as any,
      { sessionId: "s" } as any
    );
    expect(getDeliveryEstimate).toHaveBeenCalledWith("1", "li-1", { requestId: "r" });
    expect(result.estimate.source).toBe("lineItem");
  });
});
