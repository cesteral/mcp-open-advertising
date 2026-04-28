import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────
const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

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
    listCustomBiddingAlgorithmsEntities: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDv360Service = {
      listCustomBiddingAlgorithmsEntities: vi.fn().mockResolvedValue({
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
    it("passes advertiserId as query param (not filter expression)", async () => {
      const result = await listCustomBiddingAlgorithmsLogic(
        { advertiserId: "adv-1" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.listCustomBiddingAlgorithmsEntities).toHaveBeenCalledWith(
        undefined, // partnerId
        "adv-1", // advertiserId — must be 2nd positional arg (query param)
        undefined, // filter
        undefined, // pageToken
        100, // pageSize
        expect.any(Object) // context
      );
      expect(result.algorithms).toHaveLength(2);
      expect(result.pagination.pageSize).toBe(2);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
      expect(result.pagination.nextPageInputKey).toBe("pageToken");
      expect(result.timestamp).toBeDefined();
    });

    it("passes partnerId as query param (not filter expression)", async () => {
      await listCustomBiddingAlgorithmsLogic(
        { partnerId: "partner-1" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.listCustomBiddingAlgorithmsEntities).toHaveBeenCalledWith(
        "partner-1", // partnerId — must be 1st positional arg (query param)
        undefined, // advertiserId
        undefined, // filter
        undefined, // pageToken
        100, // pageSize
        expect.any(Object) // context
      );
    });

    it("passes filter separately from partnerId/advertiserId", async () => {
      await listCustomBiddingAlgorithmsLogic(
        {
          advertiserId: "adv-1",
          filter: 'entityStatus="ENTITY_STATUS_ACTIVE"',
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.listCustomBiddingAlgorithmsEntities).toHaveBeenCalledWith(
        undefined,
        "adv-1",
        'entityStatus="ENTITY_STATUS_ACTIVE"', // filter passed as separate param, not combined
        undefined,
        100,
        expect.any(Object)
      );

      // Critically: advertiserId must NOT be embedded in the filter string
      const filterArg = mockDv360Service.listCustomBiddingAlgorithmsEntities.mock.calls[0][2];
      expect(filterArg).not.toContain("advertiserId=");
      expect(filterArg).not.toContain("partnerId=");
    });

    it("throws when neither partnerId nor advertiserId is provided", async () => {
      await expect(
        listCustomBiddingAlgorithmsLogic({} as any, createMockContext(), createMockSdkContext())
      ).rejects.toThrow("Either partnerId or advertiserId must be provided");
    });

    it("throws when both partnerId and advertiserId are provided", async () => {
      await expect(
        listCustomBiddingAlgorithmsLogic(
          { partnerId: "partner-1", advertiserId: "adv-1" } as any,
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow("Only one of partnerId or advertiserId may be specified, not both");
    });

    it("supports pagination with pageToken and pageSize", async () => {
      await listCustomBiddingAlgorithmsLogic(
        {
          advertiserId: "adv-1",
          pageToken: "token-abc",
          pageSize: 50,
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.listCustomBiddingAlgorithmsEntities).toHaveBeenCalledWith(
        undefined,
        "adv-1",
        undefined,
        "token-abc",
        50,
        expect.any(Object)
      );
    });

    it("sets hasMore to true when nextPageToken exists", async () => {
      mockDv360Service.listCustomBiddingAlgorithmsEntities.mockResolvedValueOnce({
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

      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).toBe("next-page-token");
    });

    it("handles empty results", async () => {
      mockDv360Service.listCustomBiddingAlgorithmsEntities.mockResolvedValueOnce({
        entities: [],
        nextPageToken: undefined,
      });

      const result = await listCustomBiddingAlgorithmsLogic(
        { advertiserId: "adv-1" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.algorithms).toHaveLength(0);
      expect(result.pagination.pageSize).toBe(0);
      expect(result.pagination.hasMore).toBe(false);
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

      expect(mockDv360Service.listCustomBiddingAlgorithmsEntities).toHaveBeenCalledWith(
        undefined,
        "adv-1",
        undefined,
        undefined,
        100,
        expect.any(Object)
      );
    });

    it("propagates service errors", async () => {
      mockDv360Service.listCustomBiddingAlgorithmsEntities.mockRejectedValueOnce(
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
        pagination: {
          nextCursor: null,
          hasMore: false,
          pageSize: 1,
          nextPageInputKey: "pageToken",
        },
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
        pagination: {
          nextCursor: null,
          hasMore: false,
          pageSize: 1,
          nextPageInputKey: "pageToken",
        },
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
        pagination: {
          nextCursor: null,
          hasMore: false,
          pageSize: 1,
          nextPageInputKey: "pageToken",
        },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("Model States");
      expect(result[0].text).toContain("ACTIVE");
    });

    it("formats empty results", () => {
      const result = listCustomBiddingAlgorithmsResponseFormatter({
        algorithms: [],
        pagination: {
          nextCursor: null,
          hasMore: false,
          pageSize: 0,
          nextPageInputKey: "pageToken",
        },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("No algorithms found");
    });

    it("shows pagination hint when hasMore is true", () => {
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
        pagination: {
          nextCursor: "next-token-abc",
          hasMore: true,
          pageSize: 1,
          nextPageInputKey: "pageToken",
        },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("next-token-abc");
      expect(result[0].text).toContain("More results available");
      expect(result[0].text).toContain("pageToken");
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

    it("rejects input with both partnerId and advertiserId", () => {
      const parsed = ListCustomBiddingAlgorithmsInputSchema.safeParse({
        partnerId: "partner-1",
        advertiserId: "adv-1",
      });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0].message).toContain(
        "Only one of partnerId or advertiserId may be specified"
      );
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
