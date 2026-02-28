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
  })
);

vi.mock(
  "../../../../src/mcp-server/tools/utils/entity-id-extraction.js",
  () => ({
    extractEntityIds: vi.fn().mockImplementation(
      (input: Record<string, unknown>, _entityType: string) => {
        const ids: Record<string, string> = {};
        for (const key of [
          "partnerId", "advertiserId", "campaignId",
          "insertionOrderId", "lineItemId", "adGroupId",
          "adId", "creativeId",
        ]) {
          if (input[key] && typeof input[key] === "string") {
            ids[key] = input[key] as string;
          }
        }
        return ids;
      }
    ),
    extractParentIds: vi.fn(),
  })
);

vi.mock(
  "../../../../src/mcp-server/tools/utils/parent-id-validation.js",
  () => ({
    addIdValidationIssues: vi.fn(),
    mergeIdsIntoData: vi.fn(),
  })
);

// ── Import AFTER mocks ─────────────────────────────────────────────────
import {
  getEntityLogic,
  getEntityResponseFormatter,
  GetEntityInputSchema,
} from "../../../../src/mcp-server/tools/definitions/get-entity.tool.js";

// ── Helpers ─────────────────────────────────────────────────────────────
function createMockContext() {
  return {
    requestId: "req-456",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

// ── Tests ───────────────────────────────────────────────────────────────
describe("dv360_get_entity", () => {
  let mockDv360Service: {
    getEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDv360Service = {
      getEntity: vi.fn().mockResolvedValue({
        displayName: "Test Campaign",
        entityStatus: "ENTITY_STATUS_ACTIVE",
        campaignId: "camp-123",
        advertiserId: "adv-1",
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      dv360Service: mockDv360Service,
    });
  });

  describe("getEntityLogic", () => {
    it("returns the entity from the service", async () => {
      const result = await getEntityLogic(
        { entityType: "campaign", advertiserId: "adv-1", campaignId: "camp-123" } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.entity).toEqual({
        displayName: "Test Campaign",
        entityStatus: "ENTITY_STATUS_ACTIVE",
        campaignId: "camp-123",
        advertiserId: "adv-1",
      });
      expect(result.timestamp).toBeDefined();
    });

    it("passes entityIds correctly to the service", async () => {
      await getEntityLogic(
        { entityType: "lineItem", advertiserId: "adv-1", lineItemId: "li-99" } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.getEntity).toHaveBeenCalledWith(
        "lineItem",
        expect.objectContaining({ advertiserId: "adv-1", lineItemId: "li-99" }),
        expect.any(Object)
      );
    });

    it("throws when session services cannot be resolved", async () => {
      mockResolveSessionServices.mockImplementation(() => {
        throw new Error("No session found for sessionId: missing");
      });

      await expect(
        getEntityLogic(
          { entityType: "campaign", advertiserId: "adv-1", campaignId: "camp-123" } as any,
          createMockContext(),
          createMockSdkContext("missing")
        )
      ).rejects.toThrow("No session found");
    });

    it("propagates service errors", async () => {
      mockDv360Service.getEntity.mockRejectedValueOnce(new Error("Entity not found"));

      await expect(
        getEntityLogic(
          { entityType: "campaign", advertiserId: "adv-1", campaignId: "camp-123" } as any,
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow("Entity not found");
    });
  });

  describe("getEntityResponseFormatter", () => {
    it("includes entity data in the response text", () => {
      const result = getEntityResponseFormatter({
        entity: { displayName: "Test Campaign", entityStatus: "ENTITY_STATUS_ACTIVE" },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("text");
      expect(result[0].text).toContain("Entity retrieved");
      expect(result[0].text).toContain('"displayName": "Test Campaign"');
      expect(result[0].text).toContain("ENTITY_STATUS_ACTIVE");
    });

    it("includes the timestamp", () => {
      const result = getEntityResponseFormatter({
        entity: { displayName: "X" },
        timestamp: "2025-06-15T12:00:00.000Z",
      });

      expect(result[0].text).toContain("2025-06-15T12:00:00.000Z");
    });
  });

  describe("GetEntityInputSchema", () => {
    it("accepts valid input with entityType and parent IDs", () => {
      const parsed = GetEntityInputSchema.safeParse({
        entityType: "campaign",
        advertiserId: "adv-1",
        campaignId: "camp-123",
      });

      expect(parsed.success).toBe(true);
    });

    it("accepts lineItem with advertiserId and lineItemId", () => {
      const parsed = GetEntityInputSchema.safeParse({
        entityType: "lineItem",
        advertiserId: "adv-1",
        lineItemId: "li-123",
      });

      expect(parsed.success).toBe(true);
    });

    it("rejects unknown entity types", () => {
      const parsed = GetEntityInputSchema.safeParse({
        entityType: "nonExistent",
        advertiserId: "adv-1",
      });

      expect(parsed.success).toBe(false);
    });

    it("accepts optional ID fields as strings", () => {
      const parsed = GetEntityInputSchema.safeParse({
        entityType: "insertionOrder",
        advertiserId: "adv-1",
        insertionOrderId: "io-555",
      });

      expect(parsed.success).toBe(true);
    });
  });
});
