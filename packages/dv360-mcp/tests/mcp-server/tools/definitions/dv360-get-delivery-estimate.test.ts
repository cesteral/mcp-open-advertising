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

  const run = () =>
    getDeliveryEstimateLogic(
      { advertiserId: "1", lineItemId: "li-1" },
      { requestId: "r" } as any,
      { sessionId: "s" } as any
    );

  it("returns the campaign and insertion order the line item names as parents", async () => {
    getDeliveryEstimate.mockResolvedValue({
      lineItem: { name: "x", campaignId: "111", insertionOrderId: "222" },
      source: "lineItem",
    });
    const result = await run();
    expect(result.parents).toEqual([
      { kind: "campaign", id: "111" },
      { kind: "insertion_order", id: "222" },
    ]);
  });

  it("keeps only the ancestor the line item names", async () => {
    getDeliveryEstimate.mockResolvedValue({ lineItem: { insertionOrderId: "222" } });
    expect((await run()).parents).toEqual([{ kind: "insertion_order", id: "222" }]);
  });

  it("has no parents key when the line item names neither ancestor", async () => {
    getDeliveryEstimate.mockResolvedValue({ lineItem: { name: "x", campaignId: "" } });
    expect("parents" in (await run())).toBe(false);
  });
});
