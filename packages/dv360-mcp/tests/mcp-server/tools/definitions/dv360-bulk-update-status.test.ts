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
  "../../../../src/mcp-server/tools/utils/entity-examples.js",
  () => ({
    getEntityExamplesByCategory: vi.fn().mockReturnValue([]),
    getEntityTypesWithExamples: vi.fn().mockReturnValue([]),
    getEntityExamples: vi.fn().mockReturnValue([]),
    findMatchingExample: vi.fn().mockReturnValue(null),
  })
);

vi.mock(
  "../../../../src/mcp-server/tools/utils/entity-mapping-dynamic.js",
  () => ({
    getSupportedEntityTypesDynamic: vi.fn().mockReturnValue([
      "adGroup", "campaign", "insertionOrder", "lineItem",
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
  "../../../../src/mcp-server/tools/utils/parent-id-validation.js",
  () => ({
    addIdValidationIssues: vi.fn(),
    mergeIdsIntoData: vi.fn(),
  })
);

// ── Import AFTER mocks ─────────────────────────────────────────────────
import {
  bulkUpdateStatusLogic,
  bulkUpdateStatusResponseFormatter,
  BulkUpdateStatusInputSchema,
} from "../../../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";

// ── Helpers ─────────────────────────────────────────────────────────────
function createMockContext() {
  return {
    requestId: "req-bulk-1",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

// ── Tests ───────────────────────────────────────────────────────────────
describe("dv360_bulk_update_status", () => {
  let mockDv360Service: {
    getEntity: ReturnType<typeof vi.fn>;
    updateEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDv360Service = {
      getEntity: vi.fn().mockResolvedValue({
        displayName: "Test Line Item",
        entityStatus: "ENTITY_STATUS_ACTIVE",
        lineItemId: "li-1",
        advertiserId: "adv-1",
      }),
      updateEntity: vi.fn().mockResolvedValue({}),
    };

    mockResolveSessionServices.mockReturnValue({
      dv360Service: mockDv360Service,
    });
  });

  describe("bulkUpdateStatusLogic", () => {
    it("updates status for a single entity", async () => {
      const result = await bulkUpdateStatusLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          entityIds: ["li-1"],
          status: "ENTITY_STATUS_PAUSED",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.totalRequested).toBe(1);
      expect(result.totalSuccessful).toBe(1);
      expect(result.totalFailed).toBe(0);
      expect(result.successful[0]).toEqual(
        expect.objectContaining({
          advertiserId: "adv-1",
          entityType: "lineItem",
          entityId: "li-1",
          previousStatus: "ENTITY_STATUS_ACTIVE",
          newStatus: "ENTITY_STATUS_PAUSED",
          statusChanged: true,
        })
      );
    });

    it("updates status for multiple entities", async () => {
      mockDv360Service.getEntity
        .mockResolvedValueOnce({
          displayName: "LI A",
          entityStatus: "ENTITY_STATUS_ACTIVE",
          lineItemId: "li-a",
        })
        .mockResolvedValueOnce({
          displayName: "LI B",
          entityStatus: "ENTITY_STATUS_ACTIVE",
          lineItemId: "li-b",
        })
        .mockResolvedValueOnce({
          displayName: "LI C",
          entityStatus: "ENTITY_STATUS_DRAFT",
          lineItemId: "li-c",
        });

      const result = await bulkUpdateStatusLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          entityIds: ["li-a", "li-b", "li-c"],
          status: "ENTITY_STATUS_PAUSED",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.totalRequested).toBe(3);
      expect(result.totalSuccessful).toBe(3);
      expect(result.successful).toHaveLength(3);
    });

    it("tracks previous status for each entity", async () => {
      mockDv360Service.getEntity
        .mockResolvedValueOnce({
          displayName: "Active LI",
          entityStatus: "ENTITY_STATUS_ACTIVE",
        })
        .mockResolvedValueOnce({
          displayName: "Draft LI",
          entityStatus: "ENTITY_STATUS_DRAFT",
        });

      const result = await bulkUpdateStatusLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          entityIds: ["li-1", "li-2"],
          status: "ENTITY_STATUS_PAUSED",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.successful[0].previousStatus).toBe("ENTITY_STATUS_ACTIVE");
      expect(result.successful[1].previousStatus).toBe("ENTITY_STATUS_DRAFT");
    });

    it("skips update when entity already has target status", async () => {
      mockDv360Service.getEntity.mockResolvedValueOnce({
        displayName: "Already Paused",
        entityStatus: "ENTITY_STATUS_PAUSED",
      });

      const result = await bulkUpdateStatusLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          entityIds: ["li-1"],
          status: "ENTITY_STATUS_PAUSED",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.totalSuccessful).toBe(1);
      expect(result.successful[0].statusChanged).toBe(false);
      expect(mockDv360Service.updateEntity).not.toHaveBeenCalled();
    });

    it("calls updateEntity with correct entityStatus data and updateMask", async () => {
      await bulkUpdateStatusLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          entityIds: ["li-1"],
          status: "ENTITY_STATUS_PAUSED",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.updateEntity).toHaveBeenCalledWith(
        "lineItem",
        expect.objectContaining({ advertiserId: "adv-1", lineItemId: "li-1" }),
        { entityStatus: "ENTITY_STATUS_PAUSED" },
        "entityStatus",
        expect.any(Object),
        expect.any(Object) // currentEntity passed to avoid redundant GET
      );
    });

    it("handles partial failures gracefully", async () => {
      mockDv360Service.getEntity
        .mockResolvedValueOnce({
          displayName: "Good LI",
          entityStatus: "ENTITY_STATUS_ACTIVE",
        })
        .mockRejectedValueOnce(new Error("Entity not found"));

      const result = await bulkUpdateStatusLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          entityIds: ["li-good", "li-missing"],
          status: "ENTITY_STATUS_PAUSED",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.totalRequested).toBe(2);
      expect(result.totalSuccessful).toBe(1);
      expect(result.totalFailed).toBe(1);
      expect(result.failed[0].error).toContain("Entity not found");
      expect(result.failed[0].entityId).toBe("li-missing");
    });

    it("handles updateEntity failures in partial batch", async () => {
      mockDv360Service.getEntity
        .mockResolvedValueOnce({
          displayName: "LI 1",
          entityStatus: "ENTITY_STATUS_ACTIVE",
        })
        .mockResolvedValueOnce({
          displayName: "LI 2",
          entityStatus: "ENTITY_STATUS_ACTIVE",
        });

      mockDv360Service.updateEntity
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("Permission denied"));

      const result = await bulkUpdateStatusLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          entityIds: ["li-1", "li-2"],
          status: "ENTITY_STATUS_PAUSED",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.totalSuccessful).toBe(1);
      expect(result.totalFailed).toBe(1);
      expect(result.failed[0].error).toContain("Permission denied");
    });

    it("includes entityName in results", async () => {
      mockDv360Service.getEntity.mockResolvedValueOnce({
        displayName: "Named Line Item",
        entityStatus: "ENTITY_STATUS_ACTIVE",
      });

      const result = await bulkUpdateStatusLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          entityIds: ["li-1"],
          status: "ENTITY_STATUS_PAUSED",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.successful[0].entityName).toBe("Named Line Item");
    });

    it("falls back to name property for entityName", async () => {
      mockDv360Service.getEntity.mockResolvedValueOnce({
        name: "advertisers/123/lineItems/456",
        entityStatus: "ENTITY_STATUS_ACTIVE",
      });

      const result = await bulkUpdateStatusLogic(
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          entityIds: ["li-1"],
          status: "ENTITY_STATUS_PAUSED",
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.successful[0].entityName).toBe("advertisers/123/lineItems/456");
    });

    it("throws when session services cannot be resolved", async () => {
      mockResolveSessionServices.mockImplementation(() => {
        throw new Error("No session found for sessionId: missing");
      });

      await expect(
        bulkUpdateStatusLogic(
          {
            entityType: "lineItem",
            advertiserId: "adv-1",
            entityIds: ["li-1"],
            status: "ENTITY_STATUS_PAUSED",
          } as any,
          createMockContext(),
          createMockSdkContext("missing")
        )
      ).rejects.toThrow("No session found");
    });
  });

  describe("bulkUpdateStatusResponseFormatter", () => {
    it("shows summary with success count", () => {
      const result = bulkUpdateStatusResponseFormatter({
        successful: [
          {
            advertiserId: "adv-1",
            entityType: "lineItem",
            entityId: "li-1",
            previousStatus: "ENTITY_STATUS_ACTIVE",
            newStatus: "ENTITY_STATUS_PAUSED",
            statusChanged: true,
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

    it("shows failed updates when present", () => {
      const result = bulkUpdateStatusResponseFormatter({
        successful: [],
        failed: [
          {
            advertiserId: "adv-1",
            entityType: "lineItem",
            entityId: "li-bad",
            error: "Not found",
          },
        ],
        totalRequested: 1,
        totalSuccessful: 0,
        totalFailed: 1,
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("Failed updates");
      expect(result[0].text).toContain("Not found");
    });

    it("shows archive warning for ENTITY_STATUS_ARCHIVED", () => {
      const result = bulkUpdateStatusResponseFormatter(
        {
          successful: [],
          failed: [],
          totalRequested: 0,
          totalSuccessful: 0,
          totalFailed: 0,
          timestamp: "2025-01-01T00:00:00.000Z",
        },
        {
          entityType: "campaign",
          advertiserId: "adv-1",
          entityIds: ["camp-1"],
          status: "ENTITY_STATUS_ARCHIVED",
        } as any
      );

      expect(result[0].text).toContain("irreversible");
    });

    it("shows pause note for ENTITY_STATUS_PAUSED", () => {
      const result = bulkUpdateStatusResponseFormatter(
        {
          successful: [],
          failed: [],
          totalRequested: 0,
          totalSuccessful: 0,
          totalFailed: 0,
          timestamp: "2025-01-01T00:00:00.000Z",
        },
        {
          entityType: "lineItem",
          advertiserId: "adv-1",
          entityIds: ["li-1"],
          status: "ENTITY_STATUS_PAUSED",
        } as any
      );

      expect(result[0].text).toContain("reactivated");
    });
  });

  describe("BulkUpdateStatusInputSchema", () => {
    it("accepts valid input", () => {
      const parsed = BulkUpdateStatusInputSchema.safeParse({
        entityType: "lineItem",
        advertiserId: "adv-1",
        entityIds: ["li-1", "li-2"],
        status: "ENTITY_STATUS_PAUSED",
      });

      expect(parsed.success).toBe(true);
    });

    it("rejects empty entityIds array", () => {
      const parsed = BulkUpdateStatusInputSchema.safeParse({
        entityType: "lineItem",
        advertiserId: "adv-1",
        entityIds: [],
        status: "ENTITY_STATUS_PAUSED",
      });

      expect(parsed.success).toBe(false);
    });

    it("rejects more than 50 entityIds", () => {
      const entityIds = Array.from({ length: 51 }, (_, i) => `li-${i}`);
      const parsed = BulkUpdateStatusInputSchema.safeParse({
        entityType: "lineItem",
        advertiserId: "adv-1",
        entityIds,
        status: "ENTITY_STATUS_PAUSED",
      });

      expect(parsed.success).toBe(false);
    });

    it("validates status enum values", () => {
      const validStatuses = [
        "ENTITY_STATUS_ACTIVE",
        "ENTITY_STATUS_PAUSED",
        "ENTITY_STATUS_ARCHIVED",
        "ENTITY_STATUS_DRAFT",
      ];

      for (const status of validStatuses) {
        const parsed = BulkUpdateStatusInputSchema.safeParse({
          entityType: "lineItem",
          advertiserId: "adv-1",
          entityIds: ["li-1"],
          status,
        });
        expect(parsed.success).toBe(true);
      }
    });

    it("rejects invalid status values", () => {
      const parsed = BulkUpdateStatusInputSchema.safeParse({
        entityType: "lineItem",
        advertiserId: "adv-1",
        entityIds: ["li-1"],
        status: "INVALID_STATUS",
      });

      expect(parsed.success).toBe(false);
    });

    it("validates entityType enum", () => {
      const parsed = BulkUpdateStatusInputSchema.safeParse({
        entityType: "campaign",
        advertiserId: "adv-1",
        entityIds: ["camp-1"],
        status: "ENTITY_STATUS_ACTIVE",
      });

      expect(parsed.success).toBe(true);
    });

    it("rejects unsupported entity types for bulk status update", () => {
      const parsed = BulkUpdateStatusInputSchema.safeParse({
        entityType: "creative",
        advertiserId: "adv-1",
        entityIds: ["cr-1"],
        status: "ENTITY_STATUS_ACTIVE",
      });

      expect(parsed.success).toBe(false);
    });

    it("accepts optional reason field", () => {
      const parsed = BulkUpdateStatusInputSchema.safeParse({
        entityType: "lineItem",
        advertiserId: "adv-1",
        entityIds: ["li-1"],
        status: "ENTITY_STATUS_PAUSED",
        reason: "Budget review",
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.reason).toBe("Budget review");
      }
    });

    it("requires advertiserId to be non-empty", () => {
      const parsed = BulkUpdateStatusInputSchema.safeParse({
        entityType: "lineItem",
        advertiserId: "",
        entityIds: ["li-1"],
        status: "ENTITY_STATUS_PAUSED",
      });

      expect(parsed.success).toBe(false);
    });
  });
});
