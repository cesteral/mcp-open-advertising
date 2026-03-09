import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────
const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock(
  "../../../../src/mcp-server/tools/utils/resolve-session.js",
  () => ({ resolveSessionServices: mockResolveSessionServices })
);

// ── Import AFTER mocks ─────────────────────────────────────────────────
import {
  listCustomBiddingAlgorithmsLogic,
  listCustomBiddingAlgorithmsResponseFormatter,
  ListCustomBiddingAlgorithmsInputSchema,
} from "../../../../src/mcp-server/tools/definitions/list-custom-bidding-algorithms.tool.js";

// ── Helpers ─────────────────────────────────────────────────────────────
function createMockContext() {
  return {
    requestId: "req-list-1",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

// ── Tests ───────────────────────────────────────────────────────────────
describe("dv360_list_custom_bidding_algorithms", () => {
  let mockDv360Service: {
    listEntities: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDv360Service = {
      listEntities: vi.fn().mockResolvedValue({
        entities: [
          {
            customBiddingAlgorithmId: "algo-1",
            displayName: "Algorithm One",
            customBiddingAlgorithmType: "SCRIPT_BASED",
            entityStatus: "ENTITY_STATUS_ACTIVE",
            advertiserId: "adv-1",
            modelDetails: [
              {
                advertiserId: "adv-1",
                readinessState: "ACTIVE",
              },
            ],
          },
          {
            customBiddingAlgorithmId: "algo-2",
            displayName: "Algorithm Two",
            customBiddingAlgorithmType: "RULE_BASED",
            entityStatus: "ENTITY_STATUS_ACTIVE",
            partnerId: "partner-1",
            sharedAdvertiserIds: ["adv-1", "adv-2"],
          },
        ],
        nextPageToken: undefined,
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      dv360Service: mockDv360Service,
    });
  });

  describe("listCustomBiddingAlgorithmsLogic", () => {
    it("lists algorithms with advertiserId filter", async () => {
      const result = await listCustomBiddingAlgorithmsLogic(
        { advertiserId: "adv-1" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.listEntities).toHaveBeenCalledWith(
        "customBiddingAlgorithm",
        {},
        expect.stringContaining('advertiserId="adv-1"'),
        undefined,
        100,
        expect.any(Object)
      );
      expect(result.algorithms).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.has_more).toBe(false);
      expect(result.timestamp).toBeDefined();
    });

    it("lists algorithms with partnerId filter", async () => {
      await listCustomBiddingAlgorithmsLogic(
        { partnerId: "partner-1" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.listEntities).toHaveBeenCalledWith(
        "customBiddingAlgorithm",
        {},
        expect.stringContaining('partnerId="partner-1"'),
        undefined,
        100,
        expect.any(Object)
      );
    });

    it("combines additional filter with ID filter", async () => {
      await listCustomBiddingAlgorithmsLogic(
        {
          advertiserId: "adv-1",
          filter: 'entityStatus="ENTITY_STATUS_ACTIVE"',
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.listEntities).toHaveBeenCalledWith(
        "customBiddingAlgorithm",
        {},
        expect.stringContaining("AND"),
        undefined,
        100,
        expect.any(Object)
      );

      const filterArg = mockDv360Service.listEntities.mock.calls[0][2];
      expect(filterArg).toContain('entityStatus="ENTITY_STATUS_ACTIVE"');
      expect(filterArg).toContain('advertiserId="adv-1"');
    });

    it("throws when neither partnerId nor advertiserId is provided", async () => {
      await expect(
        listCustomBiddingAlgorithmsLogic(
          {} as any,
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow("Either partnerId or advertiserId must be provided");
    });

    it("supports pagination with pageToken", async () => {
      await listCustomBiddingAlgorithmsLogic(
        {
          advertiserId: "adv-1",
          pageToken: "token-abc",
          pageSize: 50,
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.listEntities).toHaveBeenCalledWith(
        "customBiddingAlgorithm",
        {},
        expect.any(String),
        "token-abc",
        50,
        expect.any(Object)
      );
    });

    it("sets has_more to true when nextPageToken exists", async () => {
      mockDv360Service.listEntities.mockResolvedValueOnce({
        entities: [
          {
            customBiddingAlgorithmId: "algo-1",
            displayName: "Algo",
            customBiddingAlgorithmType: "SCRIPT_BASED",
            entityStatus: "ENTITY_STATUS_ACTIVE",
            advertiserId: "adv-1",
          },
        ],
        nextPageToken: "next-page-token",
      });

      const result = await listCustomBiddingAlgorithmsLogic(
        { advertiserId: "adv-1" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.has_more).toBe(true);
      expect(result.nextPageToken).toBe("next-page-token");
    });

    it("handles empty results", async () => {
      mockDv360Service.listEntities.mockResolvedValueOnce({
        entities: [],
        nextPageToken: undefined,
      });

      const result = await listCustomBiddingAlgorithmsLogic(
        { advertiserId: "adv-1" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.algorithms).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      expect(result.has_more).toBe(false);
    });

    it("maps algorithm fields correctly including modelDetails", async () => {
      const result = await listCustomBiddingAlgorithmsLogic(
        { advertiserId: "adv-1" },
        createMockContext(),
        createMockSdkContext()
      );

      const algo1 = result.algorithms[0];
      expect(algo1.customBiddingAlgorithmId).toBe("algo-1");
      expect(algo1.displayName).toBe("Algorithm One");
      expect(algo1.customBiddingAlgorithmType).toBe("SCRIPT_BASED");
      expect(algo1.advertiserId).toBe("adv-1");
      expect(algo1.modelDetails).toHaveLength(1);
      expect(algo1.modelDetails![0].readinessState).toBe("ACTIVE");

      const algo2 = result.algorithms[1];
      expect(algo2.partnerId).toBe("partner-1");
      expect(algo2.sharedAdvertiserIds).toEqual(["adv-1", "adv-2"]);
    });

    it("uses default pageSize of 100 when not specified", async () => {
      await listCustomBiddingAlgorithmsLogic(
        { advertiserId: "adv-1" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.listEntities).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(String),
        undefined,
        100,
        expect.any(Object)
      );
    });

    it("propagates service errors", async () => {
      mockDv360Service.listEntities.mockRejectedValueOnce(
        new Error("API rate limit exceeded")
      );

      await expect(
        listCustomBiddingAlgorithmsLogic(
          { advertiserId: "adv-1" },
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow("API rate limit exceeded");
    });

    it("throws when session services cannot be resolved", async () => {
      mockResolveSessionServices.mockImplementation(() => {
        throw new Error("No session found for sessionId: gone");
      });

      await expect(
        listCustomBiddingAlgorithmsLogic(
          { advertiserId: "adv-1" },
          createMockContext(),
          createMockSdkContext("gone")
        )
      ).rejects.toThrow("No session found");
    });
  });

  describe("listCustomBiddingAlgorithmsResponseFormatter", () => {
    it("formats algorithm list with details", () => {
      const result = listCustomBiddingAlgorithmsResponseFormatter({
        algorithms: [
          {
            customBiddingAlgorithmId: "algo-1",
            displayName: "My Algorithm",
            customBiddingAlgorithmType: "SCRIPT_BASED",
            entityStatus: "ENTITY_STATUS_ACTIVE",
            advertiserId: "adv-1",
          },
        ],
        totalCount: 1,
        has_more: false,
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("text");
      expect(result[0].text).toContain("My Algorithm");
      expect(result[0].text).toContain("algo-1");
      expect(result[0].text).toContain("SCRIPT_BASED");
      expect(result[0].text).toContain("Advertiser: adv-1");
    });

    it("formats partner-owned algorithm with shared advertisers", () => {
      const result = listCustomBiddingAlgorithmsResponseFormatter({
        algorithms: [
          {
            customBiddingAlgorithmId: "algo-2",
            displayName: "Partner Algo",
            customBiddingAlgorithmType: "RULE_BASED",
            entityStatus: "ENTITY_STATUS_ACTIVE",
            partnerId: "partner-1",
            sharedAdvertiserIds: ["adv-1", "adv-2"],
          },
        ],
        totalCount: 1,
        has_more: false,
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("Partner: partner-1");
      expect(result[0].text).toContain("adv-1, adv-2");
    });

    it("formats model details when present", () => {
      const result = listCustomBiddingAlgorithmsResponseFormatter({
        algorithms: [
          {
            customBiddingAlgorithmId: "algo-1",
            displayName: "Algo",
            customBiddingAlgorithmType: "SCRIPT_BASED",
            entityStatus: "ENTITY_STATUS_ACTIVE",
            advertiserId: "adv-1",
            modelDetails: [
              {
                advertiserId: "adv-1",
                readinessState: "ACTIVE",
                suspensionState: "SUSPENSION_STATE_ACTIVE",
              },
            ],
          },
        ],
        totalCount: 1,
        has_more: false,
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("Model States");
      expect(result[0].text).toContain("ACTIVE");
    });

    it("formats empty results", () => {
      const result = listCustomBiddingAlgorithmsResponseFormatter({
        algorithms: [],
        totalCount: 0,
        has_more: false,
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("No algorithms found");
    });

    it("shows pagination hint when has_more is true", () => {
      const result = listCustomBiddingAlgorithmsResponseFormatter({
        algorithms: [
          {
            customBiddingAlgorithmId: "algo-1",
            displayName: "Algo",
            customBiddingAlgorithmType: "SCRIPT_BASED",
            entityStatus: "ENTITY_STATUS_ACTIVE",
            advertiserId: "adv-1",
          },
        ],
        totalCount: 1,
        nextPageToken: "next-token-abc",
        has_more: true,
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("next-token-abc");
      expect(result[0].text).toContain("More results available");
    });
  });

  describe("ListCustomBiddingAlgorithmsInputSchema", () => {
    it("accepts valid input with advertiserId", () => {
      const parsed = ListCustomBiddingAlgorithmsInputSchema.safeParse({
        advertiserId: "adv-1",
      });
      expect(parsed.success).toBe(true);
    });

    it("accepts valid input with partnerId", () => {
      const parsed = ListCustomBiddingAlgorithmsInputSchema.safeParse({
        partnerId: "partner-1",
      });
      expect(parsed.success).toBe(true);
    });

    it("accepts input with both partnerId and advertiserId", () => {
      const parsed = ListCustomBiddingAlgorithmsInputSchema.safeParse({
        partnerId: "partner-1",
        advertiserId: "adv-1",
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects input with neither partnerId nor advertiserId", () => {
      const parsed = ListCustomBiddingAlgorithmsInputSchema.safeParse({});
      expect(parsed.success).toBe(false);
    });

    it("accepts optional filter parameter", () => {
      const parsed = ListCustomBiddingAlgorithmsInputSchema.safeParse({
        advertiserId: "adv-1",
        filter: 'entityStatus="ENTITY_STATUS_ACTIVE"',
      });
      expect(parsed.success).toBe(true);
    });

    it("accepts optional pagination parameters", () => {
      const parsed = ListCustomBiddingAlgorithmsInputSchema.safeParse({
        advertiserId: "adv-1",
        pageSize: 50,
        pageToken: "token-abc",
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects pageSize below 1", () => {
      const parsed = ListCustomBiddingAlgorithmsInputSchema.safeParse({
        advertiserId: "adv-1",
        pageSize: 0,
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects pageSize above 200", () => {
      const parsed = ListCustomBiddingAlgorithmsInputSchema.safeParse({
        advertiserId: "adv-1",
        pageSize: 201,
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects non-integer pageSize", () => {
      const parsed = ListCustomBiddingAlgorithmsInputSchema.safeParse({
        advertiserId: "adv-1",
        pageSize: 50.5,
      });
      expect(parsed.success).toBe(false);
    });
  });
});
