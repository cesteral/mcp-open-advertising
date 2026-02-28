import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────
const { mockResolveSessionServices, mockEnsureRequiredFieldValue } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockEnsureRequiredFieldValue: vi.fn(),
}));

vi.mock(
  "../../../../src/mcp-server/tools/utils/resolve-session.js",
  () => ({ resolveSessionServices: mockResolveSessionServices })
);

vi.mock(
  "../../../../src/mcp-server/tools/utils/elicitation.js",
  () => ({
    ensureRequiredFieldValue: mockEnsureRequiredFieldValue,
  })
);

vi.mock(
  "../../../../src/mcp-server/tools/utils/entity-examples.js",
  () => ({
    getEntityExamplesByCategory: vi.fn().mockReturnValue([]),
    getEntityTypesWithExamples: vi.fn().mockReturnValue([]),
    getEntityExamples: vi.fn().mockReturnValue([]),
    findMatchingExample: vi.fn().mockReturnValue(null),
  })
);

// ── Import AFTER mocks ─────────────────────────────────────────────────
import {
  adjustLineItemBidsLogic,
  adjustLineItemBidsResponseFormatter,
  AdjustLineItemBidsInputSchema,
} from "../../../../src/mcp-server/tools/definitions/adjust-line-item-bids.tool.js";

// ── Helpers ─────────────────────────────────────────────────────────────
function createMockContext() {
  return {
    requestId: "req-bids-1",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

// ── Tests ───────────────────────────────────────────────────────────────
describe("dv360_adjust_line_item_bids", () => {
  let mockDv360Service: {
    getEntity: ReturnType<typeof vi.fn>;
    updateEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDv360Service = {
      getEntity: vi.fn().mockResolvedValue({
        displayName: "Test Line Item",
        lineItemId: "li-1",
        advertiserId: "adv-1",
        campaignId: "camp-1",
        insertionOrderId: "io-1",
        bidStrategy: {
          fixedBid: {
            bidAmountMicros: 3000000,
          },
        },
      }),
      updateEntity: vi.fn().mockResolvedValue({}),
    };

    mockResolveSessionServices.mockReturnValue({
      dv360Service: mockDv360Service,
    });

    // By default, ensureRequiredFieldValue returns the currentValue
    mockEnsureRequiredFieldValue.mockImplementation(
      ({ currentValue }: { currentValue?: string }) => Promise.resolve(currentValue)
    );
  });

  describe("adjustLineItemBidsLogic", () => {
    it("adjusts a single bid successfully", async () => {
      const result = await adjustLineItemBidsLogic(
        {
          adjustments: [
            { advertiserId: "adv-1", lineItemId: "li-1", newBidMicros: 5000000 },
          ],
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.totalRequested).toBe(1);
      expect(result.totalSuccessful).toBe(1);
      expect(result.totalFailed).toBe(0);
      expect(result.successful).toHaveLength(1);
      expect(result.successful[0]).toEqual(
        expect.objectContaining({
          advertiserId: "adv-1",
          lineItemId: "li-1",
          previousBidMicros: 3000000,
          newBidMicros: 5000000,
        })
      );
    });

    it("reports previous bid from fixedBid strategy", async () => {
      const result = await adjustLineItemBidsLogic(
        {
          adjustments: [
            { advertiserId: "adv-1", lineItemId: "li-1", newBidMicros: 4500000 },
          ],
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.successful[0].previousBidMicros).toBe(3000000);
    });

    it("reports previous bid from maximizeSpendAutoBid strategy", async () => {
      mockDv360Service.getEntity.mockResolvedValueOnce({
        displayName: "Auto Bid LI",
        lineItemId: "li-2",
        advertiserId: "adv-1",
        bidStrategy: {
          maximizeSpendAutoBid: {
            maxAverageCpmBidAmountMicros: 7000000,
          },
        },
      });

      const result = await adjustLineItemBidsLogic(
        {
          adjustments: [
            { advertiserId: "adv-1", lineItemId: "li-2", newBidMicros: 8000000 },
          ],
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.successful[0].previousBidMicros).toBe(7000000);
    });

    it("reports previousBidMicros as 0 when no bid strategy is set", async () => {
      mockDv360Service.getEntity.mockResolvedValueOnce({
        displayName: "No Bid LI",
        lineItemId: "li-3",
        advertiserId: "adv-1",
        bidStrategy: {},
      });

      const result = await adjustLineItemBidsLogic(
        {
          adjustments: [
            { advertiserId: "adv-1", lineItemId: "li-3", newBidMicros: 2000000 },
          ],
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.successful[0].previousBidMicros).toBe(0);
    });

    it("updates the bid via updateEntity with correct data", async () => {
      await adjustLineItemBidsLogic(
        {
          adjustments: [
            { advertiserId: "adv-1", lineItemId: "li-1", newBidMicros: 5000000 },
          ],
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.updateEntity).toHaveBeenCalledWith(
        "lineItem",
        { advertiserId: "adv-1", lineItemId: "li-1" },
        { bidStrategy: { fixedBid: { bidAmountMicros: 5000000 } } },
        "bidStrategy.fixedBid.bidAmountMicros",
        expect.any(Object)
      );
    });

    it("includes lineItemName, campaignId, and insertionOrderId in results", async () => {
      const result = await adjustLineItemBidsLogic(
        {
          adjustments: [
            { advertiserId: "adv-1", lineItemId: "li-1", newBidMicros: 5000000 },
          ],
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.successful[0].lineItemName).toBe("Test Line Item");
      expect(result.successful[0].campaignId).toBe("camp-1");
      expect(result.successful[0].insertionOrderId).toBe("io-1");
    });

    it("handles multiple adjustments in a batch", async () => {
      mockDv360Service.getEntity
        .mockResolvedValueOnce({
          displayName: "LI A",
          lineItemId: "li-a",
          advertiserId: "adv-1",
          bidStrategy: { fixedBid: { bidAmountMicros: 1000000 } },
        })
        .mockResolvedValueOnce({
          displayName: "LI B",
          lineItemId: "li-b",
          advertiserId: "adv-1",
          bidStrategy: { fixedBid: { bidAmountMicros: 2000000 } },
        });

      const result = await adjustLineItemBidsLogic(
        {
          adjustments: [
            { advertiserId: "adv-1", lineItemId: "li-a", newBidMicros: 1500000 },
            { advertiserId: "adv-1", lineItemId: "li-b", newBidMicros: 2500000 },
          ],
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.totalRequested).toBe(2);
      expect(result.totalSuccessful).toBe(2);
      expect(result.successful).toHaveLength(2);
    });

    it("handles partial failures gracefully", async () => {
      mockDv360Service.getEntity
        .mockResolvedValueOnce({
          displayName: "Good LI",
          lineItemId: "li-good",
          advertiserId: "adv-1",
          bidStrategy: { fixedBid: { bidAmountMicros: 1000000 } },
        })
        .mockRejectedValueOnce(new Error("Line item not found"));

      const result = await adjustLineItemBidsLogic(
        {
          adjustments: [
            { advertiserId: "adv-1", lineItemId: "li-good", newBidMicros: 1500000 },
            { advertiserId: "adv-1", lineItemId: "li-missing", newBidMicros: 2000000 },
          ],
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.totalRequested).toBe(2);
      expect(result.totalSuccessful).toBe(1);
      expect(result.totalFailed).toBe(1);
      expect(result.failed[0].error).toContain("Line item not found");
    });

    it("throws when session services cannot be resolved", async () => {
      mockResolveSessionServices.mockImplementation(() => {
        throw new Error("No session found for sessionId: gone");
      });

      await expect(
        adjustLineItemBidsLogic(
          {
            adjustments: [
              { advertiserId: "adv-1", lineItemId: "li-1", newBidMicros: 5000000 },
            ],
          },
          createMockContext(),
          createMockSdkContext("gone")
        )
      ).rejects.toThrow("No session found");
    });
  });

  describe("adjustLineItemBidsResponseFormatter", () => {
    it("shows summary with success count", () => {
      const result = adjustLineItemBidsResponseFormatter({
        successful: [
          {
            advertiserId: "adv-1",
            lineItemId: "li-1",
            previousBidMicros: 3000000,
            newBidMicros: 5000000,
          },
        ],
        failed: [],
        totalRequested: 1,
        totalSuccessful: 1,
        totalFailed: 0,
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("text");
      expect(result[0].text).toContain("1/1 successful");
    });

    it("shows failed adjustments when present", () => {
      const result = adjustLineItemBidsResponseFormatter({
        successful: [],
        failed: [
          {
            advertiserId: "adv-1",
            lineItemId: "li-bad",
            error: "Entity not found",
          },
        ],
        totalRequested: 1,
        totalSuccessful: 0,
        totalFailed: 1,
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("0/1 successful");
      expect(result[0].text).toContain("Failed adjustments");
      expect(result[0].text).toContain("Entity not found");
    });

    it("includes the bid micros reminder note", () => {
      const result = adjustLineItemBidsResponseFormatter({
        successful: [],
        failed: [],
        totalRequested: 0,
        totalSuccessful: 0,
        totalFailed: 0,
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("micros");
    });
  });

  describe("AdjustLineItemBidsInputSchema", () => {
    it("accepts valid input with adjustments array", () => {
      const parsed = AdjustLineItemBidsInputSchema.safeParse({
        adjustments: [
          { advertiserId: "adv-1", lineItemId: "li-1", newBidMicros: 5000000 },
        ],
      });

      expect(parsed.success).toBe(true);
    });

    it("rejects empty adjustments array", () => {
      const parsed = AdjustLineItemBidsInputSchema.safeParse({
        adjustments: [],
      });

      expect(parsed.success).toBe(false);
    });

    it("rejects adjustments array with more than 50 items", () => {
      const adjustments = Array.from({ length: 51 }, (_, i) => ({
        advertiserId: "adv-1",
        lineItemId: `li-${i}`,
        newBidMicros: 1000000,
      }));

      const parsed = AdjustLineItemBidsInputSchema.safeParse({ adjustments });

      expect(parsed.success).toBe(false);
    });

    it("requires positive newBidMicros", () => {
      const parsed = AdjustLineItemBidsInputSchema.safeParse({
        adjustments: [
          { advertiserId: "adv-1", lineItemId: "li-1", newBidMicros: 0 },
        ],
      });

      expect(parsed.success).toBe(false);
    });

    it("requires integer newBidMicros", () => {
      const parsed = AdjustLineItemBidsInputSchema.safeParse({
        adjustments: [
          { advertiserId: "adv-1", lineItemId: "li-1", newBidMicros: 1.5 },
        ],
      });

      expect(parsed.success).toBe(false);
    });

    it("accepts adjustments without advertiserId (for elicitation)", () => {
      const parsed = AdjustLineItemBidsInputSchema.safeParse({
        adjustments: [
          { lineItemId: "li-1", newBidMicros: 5000000 },
        ],
      });

      expect(parsed.success).toBe(true);
    });

    it("accepts optional reason field", () => {
      const parsed = AdjustLineItemBidsInputSchema.safeParse({
        adjustments: [
          {
            advertiserId: "adv-1",
            lineItemId: "li-1",
            newBidMicros: 5000000,
            reason: "Increase due to underdelivery",
          },
        ],
      });

      expect(parsed.success).toBe(true);
    });
  });
});
