import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// ── Hoisted mocks ──────────────────────────────────────────────────────
const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("../../../../src/mcp-server/tools/utils/entity-mapping-dynamic.js", () => ({
  getSupportedEntityTypesDynamic: vi
    .fn()
    .mockReturnValue([
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
    relationships: [
      {
        parentEntityType: "advertiser",
        parentFieldName: "advertiserId",
        required: true,
        description: "Campaign must belong to an advertiser",
      },
    ],
  }),
  generateRelationshipDescription: vi.fn().mockReturnValue("campaign requires advertiserId"),
  validateEntityRelationships: vi.fn().mockReturnValue([]),
  getEntityHierarchyPath: vi.fn().mockReturnValue(["advertiser", "campaign"]),
  getEntitySchemaForOperation: vi.fn().mockReturnValue(z.record(z.any())),
  getRequiredFieldsFromSchema: vi.fn().mockReturnValue(["displayName", "entityStatus"]),
}));

vi.mock("../../../../src/mcp-server/tools/utils/entity-id-extraction.js", () => ({
  extractParentIds: vi.fn().mockImplementation((input: Record<string, unknown>) => {
    const ids: Record<string, string> = {};
    for (const key of [
      "partnerId",
      "advertiserId",
      "campaignId",
      "insertionOrderId",
      "lineItemId",
      "adGroupId",
    ]) {
      if (input[key] && typeof input[key] === "string") {
        ids[key] = input[key] as string;
      }
    }
    return ids;
  }),
  extractEntityIds: vi.fn(),
}));

vi.mock("../../../../src/mcp-server/tools/utils/parent-id-validation.js", () => ({
  addIdValidationIssues: vi.fn(),
  mergeIdsIntoData: vi
    .fn()
    .mockImplementation(
      (_entityType: string, data: Record<string, unknown>, input: Record<string, unknown>) => {
        const merged = { ...data };
        for (const key of ["partnerId", "advertiserId", "campaignId", "insertionOrderId"]) {
          if (input[key]) {
            merged[key] = input[key];
          }
        }
        return merged;
      }
    ),
}));

vi.mock("../../../../src/mcp-server/tools/utils/simplified-schemas.js", () => ({
  createSimplifiedCreateEntityInputSchema: vi.fn().mockReturnValue(
    z.object({
      entityType: z.enum([
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
      partnerId: z.string().optional(),
      advertiserId: z.string().optional(),
      campaignId: z.string().optional(),
      insertionOrderId: z.string().optional(),
      lineItemId: z.string().optional(),
      data: z.record(z.any()),
    })
  ),
}));


// ── Import AFTER mocks ─────────────────────────────────────────────────
import {
  createEntityLogic,
  createEntityResponseFormatter,
  CreateEntityInputSchema,
} from "../../../../src/mcp-server/tools/definitions/create-entity.tool.js";

// ── Helpers ─────────────────────────────────────────────────────────────
function createMockContext() {
  return {
    requestId: "req-789",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

// ── Tests ───────────────────────────────────────────────────────────────
describe("dv360_create_entity", () => {
  let mockDv360Service: {
    createEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDv360Service = {
      createEntity: vi.fn().mockResolvedValue({
        displayName: "New Campaign",
        entityStatus: "ENTITY_STATUS_ACTIVE",
        campaignId: "camp-new-1",
        advertiserId: "adv-1",
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      dv360Service: mockDv360Service,
    });
  });

  describe("createEntityLogic", () => {
    it("creates an entity and returns it", async () => {
      const result = await createEntityLogic(
        {
          entityType: "campaign",
          advertiserId: "adv-1",
          data: {
            displayName: "New Campaign",
            entityStatus: "ENTITY_STATUS_ACTIVE",
            advertiserId: "adv-1",
          },
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.entity).toEqual({
        displayName: "New Campaign",
        entityStatus: "ENTITY_STATUS_ACTIVE",
        campaignId: "camp-new-1",
        advertiserId: "adv-1",
      });
      expect(result.timestamp).toBeDefined();
    });

    it("passes data payload to the service", async () => {
      const inputData = {
        displayName: "Test Campaign",
        entityStatus: "ENTITY_STATUS_DRAFT",
        advertiserId: "adv-1",
      };

      await createEntityLogic(
        {
          entityType: "campaign",
          advertiserId: "adv-1",
          data: inputData,
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.createEntity).toHaveBeenCalledWith(
        "campaign",
        expect.objectContaining({ advertiserId: "adv-1" }),
        expect.objectContaining({ displayName: "Test Campaign" }),
        expect.any(Object)
      );
    });

    it("throws when session services cannot be resolved", async () => {
      mockResolveSessionServices.mockImplementation(() => {
        throw new Error("No session found for sessionId: gone");
      });

      await expect(
        createEntityLogic(
          {
            entityType: "campaign",
            advertiserId: "adv-1",
            data: { displayName: "X", advertiserId: "adv-1" },
          } as any,
          createMockContext(),
          createMockSdkContext("gone")
        )
      ).rejects.toThrow("No session found");
    });

    it("propagates service errors", async () => {
      mockDv360Service.createEntity.mockRejectedValueOnce(new Error("API quota exceeded"));

      await expect(
        createEntityLogic(
          {
            entityType: "campaign",
            advertiserId: "adv-1",
            data: { displayName: "X", advertiserId: "adv-1" },
          } as any,
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow("API quota exceeded");
    });
  });

  describe("createEntityResponseFormatter", () => {
    it("includes the created entity in the response", () => {
      const result = createEntityResponseFormatter({
        entity: {
          displayName: "New Campaign",
          campaignId: "camp-1",
        },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("text");
      expect(result[0].text).toContain("Entity created successfully");
      expect(result[0].text).toContain('"displayName": "New Campaign"');
    });

    it("includes the timestamp", () => {
      const result = createEntityResponseFormatter({
        entity: { displayName: "X" },
        timestamp: "2025-03-15T08:30:00.000Z",
      });

      expect(result[0].text).toContain("2025-03-15T08:30:00.000Z");
    });
  });

  describe("CreateEntityInputSchema", () => {
    it("accepts valid input with entityType, advertiserId, and data", () => {
      const parsed = CreateEntityInputSchema.safeParse({
        entityType: "campaign",
        advertiserId: "adv-1",
        data: { displayName: "Test" },
      });

      expect(parsed.success).toBe(true);
    });

    it("rejects unknown entity types", () => {
      const parsed = CreateEntityInputSchema.safeParse({
        entityType: "badType",
        advertiserId: "adv-1",
        data: { displayName: "Test" },
      });

      expect(parsed.success).toBe(false);
    });

    it("requires the data field", () => {
      const parsed = CreateEntityInputSchema.safeParse({
        entityType: "campaign",
        advertiserId: "adv-1",
      });

      expect(parsed.success).toBe(false);
    });

    it("accepts optional parent IDs", () => {
      const parsed = CreateEntityInputSchema.safeParse({
        entityType: "insertionOrder",
        advertiserId: "adv-1",
        campaignId: "camp-1",
        data: { displayName: "IO" },
      });

      expect(parsed.success).toBe(true);
    });
  });
});
