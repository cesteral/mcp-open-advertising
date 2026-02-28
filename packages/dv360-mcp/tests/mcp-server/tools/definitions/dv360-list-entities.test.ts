import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────
const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock(
  "../../../../src/mcp-server/tools/utils/resolve-session.js",
  () => ({ resolveSessionServices: mockResolveSessionServices })
);

vi.mock(
  "../../../../src/mcp-server/tools/utils/entity-mapping-dynamic.js",
  () => ({
    getSupportedEntityTypesDynamic: vi.fn().mockReturnValue([
      "adGroup",
      "adGroupAd",
      "advertiser",
      "campaign",
      "creative",
      "customBiddingAlgorithm",
      "insertionOrder",
      "inventorySource",
      "inventorySourceGroup",
      "lineItem",
      "locationList",
      "partner",
    ]),
    getEntityConfigDynamic: vi.fn().mockReturnValue({
      parentIds: ["advertiserId"],
      filterParamIds: [],
      queryParamIds: [],
      supportsFilter: true,
      supportsCreate: true,
      supportsUpdate: true,
      supportsDelete: true,
      apiPath: "/advertisers/{advertiserId}/campaigns",
    }),
    generateRelationshipDescription: vi.fn().mockReturnValue(""),
    validateEntityRelationships: vi.fn().mockReturnValue([]),
    getEntityHierarchyPath: vi.fn().mockReturnValue(["advertiser", "campaign"]),
    getEntitySchemaForOperation: vi.fn(),
    getRequiredFieldsFromSchema: vi.fn().mockReturnValue(["displayName"]),
  })
);

vi.mock(
  "../../../../src/mcp-server/tools/utils/entity-id-extraction.js",
  () => ({
    extractParentIds: vi.fn().mockImplementation((input: Record<string, unknown>) => {
      const ids: Record<string, string> = {};
      for (const key of ["partnerId", "advertiserId", "campaignId", "insertionOrderId", "lineItemId", "adGroupId"]) {
        if (input[key] && typeof input[key] === "string") {
          ids[key] = input[key] as string;
        }
      }
      return ids;
    }),
    extractEntityIds: vi.fn().mockImplementation((input: Record<string, unknown>) => {
      const ids: Record<string, string> = {};
      for (const key of ["partnerId", "advertiserId", "campaignId", "insertionOrderId", "lineItemId", "adGroupId"]) {
        if (input[key] && typeof input[key] === "string") {
          ids[key] = input[key] as string;
        }
      }
      return ids;
    }),
  })
);

// ── Import AFTER mocks ─────────────────────────────────────────────────
import {
  listEntitiesLogic,
  listEntitiesResponseFormatter,
  ListEntitiesInputSchema,
} from "../../../../src/mcp-server/tools/definitions/list-entities.tool.js";

// ── Helpers ─────────────────────────────────────────────────────────────
function createMockContext() {
  return {
    requestId: "req-123",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

// ── Tests ───────────────────────────────────────────────────────────────
describe("dv360_list_entities", () => {
  let mockDv360Service: {
    listEntities: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDv360Service = {
      listEntities: vi.fn().mockResolvedValue({
        entities: [
          { displayName: "Campaign 1", campaignId: "111" },
          { displayName: "Campaign 2", campaignId: "222" },
        ],
        nextPageToken: undefined,
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      dv360Service: mockDv360Service,
    });
  });

  describe("listEntitiesLogic", () => {
    it("returns a list of entities from the service", async () => {
      const result = await listEntitiesLogic(
        { entityType: "campaign", advertiserId: "adv-1" } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.entities).toHaveLength(2);
      expect(result.entities[0]).toEqual({ displayName: "Campaign 1", campaignId: "111" });
      expect(result.totalCount).toBe(2);
      expect(result.nextPageToken).toBeUndefined();
      expect(result.timestamp).toBeDefined();
    });

    it("passes parentIds correctly to the service", async () => {
      await listEntitiesLogic(
        { entityType: "campaign", advertiserId: "adv-42" } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.listEntities).toHaveBeenCalledWith(
        "campaign",
        expect.objectContaining({ advertiserId: "adv-42" }),
        undefined, // filter
        undefined, // pageToken
        undefined, // pageSize
        expect.any(Object) // context
      );
    });

    it("passes pagination parameters to the service", async () => {
      await listEntitiesLogic(
        {
          entityType: "campaign",
          advertiserId: "adv-1",
          pageToken: "tok-abc",
          pageSize: 25,
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.listEntities).toHaveBeenCalledWith(
        "campaign",
        expect.any(Object),
        undefined,
        "tok-abc",
        25,
        expect.any(Object)
      );
    });

    it("passes user-supplied filter to the service", async () => {
      await listEntitiesLogic(
        {
          entityType: "campaign",
          advertiserId: "adv-1",
          filter: "entityStatus=ENTITY_STATUS_ACTIVE",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.listEntities).toHaveBeenCalledWith(
        "campaign",
        expect.any(Object),
        "entityStatus=ENTITY_STATUS_ACTIVE",
        undefined,
        undefined,
        expect.any(Object)
      );
    });

    it("returns nextPageToken when provided by the service", async () => {
      mockDv360Service.listEntities.mockResolvedValueOnce({
        entities: [{ displayName: "Campaign 1" }],
        nextPageToken: "page2-token",
      });

      const result = await listEntitiesLogic(
        { entityType: "campaign", advertiserId: "adv-1" } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.nextPageToken).toBe("page2-token");
    });

    it("throws when session services cannot be resolved", () => {
      mockResolveSessionServices.mockImplementation(() => {
        throw new Error("No session found for sessionId: unknown");
      });

      expect(() =>
        listEntitiesLogic(
          { entityType: "campaign", advertiserId: "adv-1" } as any,
          createMockContext(),
          createMockSdkContext("unknown")
        )
      ).rejects.toThrow("No session found");
    });
  });

  describe("listEntitiesResponseFormatter", () => {
    it("includes entity count in summary text", () => {
      const result = listEntitiesResponseFormatter({
        entities: [{ displayName: "Campaign 1" }],
        totalCount: 1,
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("text");
      expect(result[0].text).toContain("Found 1 entities");
    });

    it("includes pagination info when nextPageToken is present", () => {
      const result = listEntitiesResponseFormatter({
        entities: [{ displayName: "Campaign 1" }],
        nextPageToken: "next-tok",
        totalCount: 1,
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("nextPageToken: next-tok");
    });

    it("shows no-entities message when list is empty", () => {
      const result = listEntitiesResponseFormatter({
        entities: [],
        totalCount: 0,
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("No entities found");
    });

    it("serialises entities as JSON", () => {
      const result = listEntitiesResponseFormatter({
        entities: [{ displayName: "X" }],
        totalCount: 1,
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain('"displayName": "X"');
    });
  });

  describe("ListEntitiesInputSchema", () => {
    it("accepts valid input with entityType and advertiserId", () => {
      const parsed = ListEntitiesInputSchema.safeParse({
        entityType: "campaign",
        advertiserId: "adv-1",
      });

      expect(parsed.success).toBe(true);
    });

    it("rejects unknown entity types", () => {
      const parsed = ListEntitiesInputSchema.safeParse({
        entityType: "unknownType",
        advertiserId: "adv-1",
      });

      expect(parsed.success).toBe(false);
    });

    it("accepts optional pagination parameters", () => {
      const parsed = ListEntitiesInputSchema.safeParse({
        entityType: "campaign",
        advertiserId: "adv-1",
        pageSize: 50,
        pageToken: "tok-xyz",
      });

      expect(parsed.success).toBe(true);
    });

    it("rejects pageSize below 1", () => {
      const parsed = ListEntitiesInputSchema.safeParse({
        entityType: "campaign",
        advertiserId: "adv-1",
        pageSize: 0,
      });

      expect(parsed.success).toBe(false);
    });

    it("rejects pageSize above 100", () => {
      const parsed = ListEntitiesInputSchema.safeParse({
        entityType: "campaign",
        advertiserId: "adv-1",
        pageSize: 101,
      });

      expect(parsed.success).toBe(false);
    });
  });
});
