import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

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
      apiPath: "/advertisers/{advertiserId}/lineItems",
    }),
    generateRelationshipDescription: vi.fn().mockReturnValue(""),
    validateEntityRelationships: vi.fn().mockReturnValue([]),
    getEntityHierarchyPath: vi.fn().mockReturnValue(["advertiser", "lineItem"]),
    getEntitySchemaForOperation: vi.fn().mockReturnValue(z.record(z.any())),
    getRequiredFieldsFromSchema: vi.fn().mockReturnValue(["displayName"]),
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
    mergeIdsIntoData: vi.fn().mockImplementation(
      (_entityType: string, data: Record<string, unknown>, input: Record<string, unknown>) => {
        const merged = { ...data };
        for (const key of ["partnerId", "advertiserId", "campaignId", "insertionOrderId", "lineItemId"]) {
          if (input[key]) {
            merged[key] = input[key];
          }
        }
        return merged;
      }
    ),
  })
);

vi.mock(
  "../../../../src/mcp-server/tools/utils/simplified-schemas.js",
  () => ({
    createSimplifiedUpdateEntityInputSchema: vi.fn().mockReturnValue(
      z.object({
        entityType: z.enum([
          "adGroup", "adGroupAd", "advertiser", "campaign", "creative",
          "customBiddingAlgorithm", "insertionOrder", "inventorySource",
          "inventorySourceGroup", "lineItem", "locationList", "partner",
        ]),
        partnerId: z.string().optional(),
        advertiserId: z.string().optional(),
        campaignId: z.string().optional(),
        insertionOrderId: z.string().optional(),
        lineItemId: z.string().optional(),
        adGroupId: z.string().optional(),
        adId: z.string().optional(),
        creativeId: z.string().optional(),
        data: z.record(z.any()),
        updateMask: z.string(),
        reason: z.string().optional(),
      })
    ),
  })
);

vi.mock(
  "../../../../src/mcp-server/tools/utils/entity-examples.js",
  () => ({
    getEntityTypesWithExamples: vi.fn().mockReturnValue(["lineItem", "insertionOrder"]),
    getEntityExamples: vi.fn().mockReturnValue([]),
    findMatchingExample: vi.fn().mockReturnValue(null),
    getEntityExamplesByCategory: vi.fn().mockReturnValue([]),
  })
);

// ── Import AFTER mocks ─────────────────────────────────────────────────
import {
  updateEntityLogic,
  updateEntityResponseFormatter,
  UpdateEntityInputSchema,
} from "../../../../src/mcp-server/tools/definitions/update-entity.tool.js";

// ── Helpers ─────────────────────────────────────────────────────────────
function createMockContext() {
  return {
    requestId: "req-upd-1",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

// ── Tests ───────────────────────────────────────────────────────────────
describe("dv360_update_entity", () => {
  let mockDv360Service: {
    getEntity: ReturnType<typeof vi.fn>;
    updateEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDv360Service = {
      getEntity: vi.fn().mockResolvedValue({
        displayName: "Old Name",
        entityStatus: "ENTITY_STATUS_ACTIVE",
        lineItemId: "li-1",
        advertiserId: "adv-1",
      }),
      updateEntity: vi.fn().mockResolvedValue({
        displayName: "New Name",
        entityStatus: "ENTITY_STATUS_ACTIVE",
        lineItemId: "li-1",
        advertiserId: "adv-1",
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      dv360Service: mockDv360Service,
    });
  });

  describe("updateEntityLogic", () => {
    it("updates an entity and returns the new state", async () => {
      const result = await updateEntityLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          lineItemId: "li-1",
          data: { displayName: "New Name" },
          updateMask: "displayName",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.entity).toEqual(
        expect.objectContaining({ displayName: "New Name" })
      );
      expect(result.timestamp).toBeDefined();
    });

    it("captures previousValues for fields in updateMask", async () => {
      const result = await updateEntityLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          lineItemId: "li-1",
          data: { displayName: "New Name" },
          updateMask: "displayName",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.previousValues).toBeDefined();
      expect(result.previousValues!.displayName).toBe("Old Name");
    });

    it("captures previousValues for nested fields", async () => {
      mockDv360Service.getEntity.mockResolvedValueOnce({
        entityStatus: "ENTITY_STATUS_ACTIVE",
        bidStrategy: { fixedBid: { bidAmountMicros: 3000000 } },
      });

      const result = await updateEntityLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          lineItemId: "li-1",
          data: { bidStrategy: { fixedBid: { bidAmountMicros: 5000000 } } },
          updateMask: "bidStrategy.fixedBid.bidAmountMicros",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.previousValues).toBeDefined();
      expect(result.previousValues!["bidStrategy.fixedBid.bidAmountMicros"]).toBe(3000000);
    });

    it("passes updateMask to the service", async () => {
      await updateEntityLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          lineItemId: "li-1",
          data: { entityStatus: "ENTITY_STATUS_PAUSED" },
          updateMask: "entityStatus",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.updateEntity).toHaveBeenCalledWith(
        "lineItem",
        expect.objectContaining({ advertiserId: "adv-1", lineItemId: "li-1" }),
        expect.objectContaining({ entityStatus: "ENTITY_STATUS_PAUSED" }),
        "entityStatus",
        expect.any(Object)
      );
    });

    it("throws when session services cannot be resolved", async () => {
      mockResolveSessionServices.mockImplementation(() => {
        throw new Error("No session found for sessionId: gone");
      });

      await expect(
        updateEntityLogic(
          {
            entityType: "lineItem",
            advertiserId: "adv-1",
            lineItemId: "li-1",
            data: { displayName: "X" },
            updateMask: "displayName",
          } as any,
          createMockContext(),
          createMockSdkContext("gone")
        )
      ).rejects.toThrow("No session found");
    });

    it("propagates service errors from getEntity", async () => {
      mockDv360Service.getEntity.mockRejectedValueOnce(new Error("Not found"));

      await expect(
        updateEntityLogic(
          {
            entityType: "lineItem",
            advertiserId: "adv-1",
            lineItemId: "li-1",
            data: { displayName: "X" },
            updateMask: "displayName",
          } as any,
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow("Not found");
    });

    it("propagates service errors from updateEntity", async () => {
      mockDv360Service.updateEntity.mockRejectedValueOnce(
        new Error("Permission denied")
      );

      await expect(
        updateEntityLogic(
          {
            entityType: "lineItem",
            advertiserId: "adv-1",
            lineItemId: "li-1",
            data: { displayName: "X" },
            updateMask: "displayName",
          } as any,
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow("Permission denied");
    });
  });

  describe("updateEntityResponseFormatter", () => {
    it("includes the updated entity in the response text", () => {
      const result = updateEntityResponseFormatter({
        entity: { displayName: "Updated Campaign" },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("text");
      expect(result[0].text).toContain("Entity updated successfully");
      expect(result[0].text).toContain('"displayName": "Updated Campaign"');
    });

    it("includes pattern note when example matches", async () => {
      // Import the mock to override for this test
      const { findMatchingExample } = await import(
        "../../../../src/mcp-server/tools/utils/entity-examples.js"
      );
      (findMatchingExample as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        operation: "Pause line item",
        notes: "Sets entityStatus to ENTITY_STATUS_PAUSED",
        updateMask: "entityStatus",
        data: { entityStatus: "ENTITY_STATUS_PAUSED" },
      });

      const result = updateEntityResponseFormatter(
        {
          entity: { entityStatus: "ENTITY_STATUS_PAUSED" },
          timestamp: "2025-01-01T00:00:00.000Z",
        },
        {
          entityType: "lineItem",
          data: { entityStatus: "ENTITY_STATUS_PAUSED" },
          updateMask: "entityStatus",
        } as any
      );

      expect(result[0].text).toContain("Applied pattern: Pause line item");
    });
  });

  describe("UpdateEntityInputSchema", () => {
    it("accepts valid input with entityType, IDs, data, and updateMask", () => {
      const parsed = UpdateEntityInputSchema.safeParse({
        entityType: "lineItem",
        advertiserId: "adv-1",
        lineItemId: "li-1",
        data: { displayName: "X" },
        updateMask: "displayName",
      });

      expect(parsed.success).toBe(true);
    });

    it("requires updateMask", () => {
      const parsed = UpdateEntityInputSchema.safeParse({
        entityType: "lineItem",
        advertiserId: "adv-1",
        lineItemId: "li-1",
        data: { displayName: "X" },
      });

      expect(parsed.success).toBe(false);
    });

    it("requires data", () => {
      const parsed = UpdateEntityInputSchema.safeParse({
        entityType: "lineItem",
        advertiserId: "adv-1",
        lineItemId: "li-1",
        updateMask: "displayName",
      });

      expect(parsed.success).toBe(false);
    });

    it("accepts optional reason field", () => {
      const parsed = UpdateEntityInputSchema.safeParse({
        entityType: "lineItem",
        advertiserId: "adv-1",
        lineItemId: "li-1",
        data: { entityStatus: "ENTITY_STATUS_PAUSED" },
        updateMask: "entityStatus",
        reason: "Budget review",
      });

      expect(parsed.success).toBe(true);
    });

    it("rejects unknown entity types", () => {
      const parsed = UpdateEntityInputSchema.safeParse({
        entityType: "fakeType",
        advertiserId: "adv-1",
        data: { displayName: "X" },
        updateMask: "displayName",
      });

      expect(parsed.success).toBe(false);
    });
  });
});
