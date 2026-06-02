import { describe, it, expect, vi, beforeEach } from "vitest";

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
    apiPath: "/advertisers/{advertiserId}/lineItems",
  }),
}));

vi.mock("../../../../src/mcp-server/tools/utils/entity-id-extraction.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../src/mcp-server/tools/utils/entity-id-extraction.js")
  >("../../../../src/mcp-server/tools/utils/entity-id-extraction.js");
  return {
    ...actual,
    extractEntityIds: vi
      .fn()
      .mockImplementation((input: Record<string, unknown>, _entityType: string) => {
        const ids: Record<string, string> = {};
        for (const key of [
          "partnerId",
          "advertiserId",
          "campaignId",
          "insertionOrderId",
          "lineItemId",
          "adGroupId",
          "adId",
          "creativeId",
        ]) {
          if (input[key] && typeof input[key] === "string") {
            ids[key] = input[key] as string;
          }
        }
        return ids;
      }),
    extractParentIds: vi.fn(),
  };
});

vi.mock("../../../../src/mcp-server/tools/utils/parent-id-validation.js", () => ({
  addIdValidationIssues: vi.fn(),
  mergeIdsIntoData: vi.fn(),
}));

// ── Import AFTER mocks ─────────────────────────────────────────────────
import {
  deleteEntityLogic,
  deleteEntityResponseFormatter,
  DeleteEntityInputSchema,
} from "../../../../src/mcp-server/tools/definitions/delete-entity.tool.js";

// ── Helpers ─────────────────────────────────────────────────────────────
function createMockContext() {
  return {
    requestId: "req-del-1",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

// ── Tests ───────────────────────────────────────────────────────────────
describe("dv360_delete_entity", () => {
  let mockDv360Service: {
    getEntity: ReturnType<typeof vi.fn>;
    deleteEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDv360Service = {
      getEntity: vi.fn().mockResolvedValue({
        displayName: "Line Item To Delete",
        entityStatus: "ENTITY_STATUS_PAUSED",
        lineItemId: "li-999",
        advertiserId: "adv-1",
      }),
      deleteEntity: vi.fn().mockResolvedValue(undefined),
    };

    mockResolveSessionServices.mockReturnValue({
      dv360Service: mockDv360Service,
    });
  });

  describe("deleteEntityLogic", () => {
    it("deletes an entity and returns the deleted entity data", async () => {
      const result = await deleteEntityLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          lineItemId: "li-999",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.success).toBe(true);
      expect(result.deletedEntity).toEqual({
        displayName: "Line Item To Delete",
        entityStatus: "ENTITY_STATUS_PAUSED",
        lineItemId: "li-999",
        advertiserId: "adv-1",
      });
      expect(result.timestamp).toBeDefined();
    });

    it("fetches the entity before deleting it", async () => {
      await deleteEntityLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          lineItemId: "li-999",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      // getEntity should be called before deleteEntity
      expect(mockDv360Service.getEntity).toHaveBeenCalledTimes(1);
      expect(mockDv360Service.deleteEntity).toHaveBeenCalledTimes(1);

      // Verify order: getEntity first
      const getEntityCallOrder = mockDv360Service.getEntity.mock.invocationCallOrder[0];
      const deleteEntityCallOrder = mockDv360Service.deleteEntity.mock.invocationCallOrder[0];
      expect(getEntityCallOrder).toBeLessThan(deleteEntityCallOrder);
    });

    it("passes entityIds correctly to deleteEntity", async () => {
      await deleteEntityLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          lineItemId: "li-999",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.deleteEntity).toHaveBeenCalledWith(
        "lineItem",
        expect.objectContaining({ advertiserId: "adv-1", lineItemId: "li-999" }),
        expect.any(Object)
      );
    });

    it("throws when session services cannot be resolved", async () => {
      mockResolveSessionServices.mockImplementation(() => {
        throw new Error("No session found for sessionId: expired");
      });

      await expect(
        deleteEntityLogic(
          {
            entityType: "lineItem",
            advertiserId: "adv-1",
            lineItemId: "li-999",
          } as any,
          createMockContext(),
          createMockSdkContext("expired")
        )
      ).rejects.toThrow("No session found");
    });

    it("propagates errors from getEntity (entity not found)", async () => {
      mockDv360Service.getEntity.mockRejectedValueOnce(new Error("Entity not found"));

      await expect(
        deleteEntityLogic(
          {
            entityType: "lineItem",
            advertiserId: "adv-1",
            lineItemId: "li-999",
          } as any,
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow("Entity not found");

      // deleteEntity should not be called if getEntity fails
      expect(mockDv360Service.deleteEntity).not.toHaveBeenCalled();
    });

    it("propagates errors from deleteEntity", async () => {
      mockDv360Service.deleteEntity.mockRejectedValueOnce(new Error("Permission denied"));

      await expect(
        deleteEntityLogic(
          {
            entityType: "lineItem",
            advertiserId: "adv-1",
            lineItemId: "li-999",
          } as any,
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow("Permission denied");
    });
  });

  describe("governance contract", () => {
    it("dry_run on an archived line item would succeed and does not delete", async () => {
      mockDv360Service.getEntity.mockResolvedValue({
        displayName: "LI",
        entityStatus: "ENTITY_STATUS_ARCHIVED",
        lineItemId: "li-999",
        advertiserId: "adv-1",
      });
      const result = await deleteEntityLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          lineItemId: "li-999",
          dry_run: true,
        } as any,
        createMockContext(),
        createMockSdkContext()
      );
      expect(mockDv360Service.deleteEntity).not.toHaveBeenCalled();
      expect(result.dryRun?.wouldSucceed).toBe(true);
      expect(result.dryRun?.expectedPostState?.status.canonical).toBe("deleted");
      expect(result.dispatchedCapability).toEqual({
        operation: "delete",
        canonicalEntityKind: "line_item",
      });
    });

    it("dry_run on a non-archived line item reports wouldSucceed:false", async () => {
      // default mock is ENTITY_STATUS_PAUSED
      const result = await deleteEntityLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          lineItemId: "li-999",
          dry_run: true,
        } as any,
        createMockContext(),
        createMockSdkContext()
      );
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors.map((e) => e.code)).toContain(
        "LINE_ITEM_NOT_ARCHIVED"
      );
      expect(result.dryRun?.expectedStateSource).toBe("server_symbolic_apply");
    });

    it("execute captures before (live) and after (deleted) snapshots", async () => {
      const result = await deleteEntityLogic(
        { entityType: "lineItem", advertiserId: "adv-1", lineItemId: "li-999" } as any,
        createMockContext(),
        createMockSdkContext()
      );
      expect(result.before?.status.canonical).toBe("paused");
      expect(result.after?.status.canonical).toBe("deleted");
      expect(result.dispatchedCapability.canonicalEntityKind).toBe("line_item");
    });

    it("out-of-scope kind resolves canonicalEntityKind:null and skips snapshots", async () => {
      const result = await deleteEntityLogic(
        { entityType: "creative", advertiserId: "adv-1", creativeId: "cr-1" } as any,
        createMockContext(),
        createMockSdkContext()
      );
      expect(result.dispatchedCapability).toEqual({
        operation: "delete",
        canonicalEntityKind: null,
      });
      expect(result.before).toBeUndefined();
      expect(result.after).toBeUndefined();
      expect(mockDv360Service.deleteEntity).toHaveBeenCalledOnce();
    });
  });

  describe("deleteEntityResponseFormatter", () => {
    it("includes the deleted entity data in the response", () => {
      const result = deleteEntityResponseFormatter({
        confirmed: true,
        success: true,
        deletedEntity: {
          displayName: "Deleted Campaign",
          campaignId: "camp-1",
        },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("text");
      expect(result[0].text).toContain("Entity deleted");
      expect(result[0].text).toContain('"displayName": "Deleted Campaign"');
    });

    it("serialises entity as JSON", () => {
      const result = deleteEntityResponseFormatter({
        confirmed: true,
        success: true,
        deletedEntity: {
          entityStatus: "ENTITY_STATUS_PAUSED",
          lineItemId: "li-42",
        },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain('"entityStatus": "ENTITY_STATUS_PAUSED"');
      expect(result[0].text).toContain('"lineItemId": "li-42"');
    });
  });

  describe("DeleteEntityInputSchema", () => {
    it("accepts valid input with entityType and IDs", () => {
      const parsed = DeleteEntityInputSchema.safeParse({
        entityType: "lineItem",
        advertiserId: "adv-1",
        lineItemId: "li-1",
      });

      expect(parsed.success).toBe(true);
    });

    it("rejects unknown entity types", () => {
      const parsed = DeleteEntityInputSchema.safeParse({
        entityType: "unknownEntity",
        advertiserId: "adv-1",
      });

      expect(parsed.success).toBe(false);
    });

    it("accepts optional reason field", () => {
      const parsed = DeleteEntityInputSchema.safeParse({
        entityType: "creative",
        advertiserId: "adv-1",
        creativeId: "cr-1",
        reason: "Expired creative",
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.reason).toBe("Expired creative");
      }
    });

    it("accepts campaign entity type with campaignId", () => {
      const parsed = DeleteEntityInputSchema.safeParse({
        entityType: "campaign",
        advertiserId: "adv-1",
        campaignId: "camp-1",
      });

      expect(parsed.success).toBe(true);
    });
  });
});
