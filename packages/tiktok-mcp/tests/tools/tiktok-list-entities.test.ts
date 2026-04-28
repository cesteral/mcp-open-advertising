import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock session services
vi.mock("../../src/services/session-services.js", () => ({
  sessionServiceStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAuthContext: vi.fn(),
  },
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    resolveSessionServicesFromStore: vi.fn(),
  };
});

import { resolveSessionServicesFromStore } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import {
  listEntitiesLogic,
  listEntitiesResponseFormatter,
  ListEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/list-entities.tool.js";

const mockListEntities = vi.fn();

beforeEach(() => {
  mockListEntities.mockReset();
  mockResolveSession.mockReturnValue({
    tiktokService: {
      listEntities: mockListEntities,
    },
  } as any);
});

describe("tiktok_list_entities tool", () => {
  const baseContext = { requestId: "test-req" } as any;
  const baseSdkContext = { sessionId: "test-session" } as any;

  describe("listEntitiesLogic()", () => {
    it("returns formatted entity list with pagination info", async () => {
      const mockEntities = [
        {
          campaign_id: "1800000001",
          campaign_name: "Campaign A",
          status: "CAMPAIGN_STATUS_ENABLE",
        },
        {
          campaign_id: "1800000002",
          campaign_name: "Campaign B",
          status: "CAMPAIGN_STATUS_DISABLE",
        },
      ];

      mockListEntities.mockResolvedValueOnce({
        entities: mockEntities,
        pageInfo: {
          page: 1,
          page_size: 10,
          total_number: 2,
          total_page: 1,
        },
      });

      const result = await listEntitiesLogic(
        {
          entityType: "campaign",
          advertiserId: "1234567890",
          page: 1,
          pageSize: 10,
        },
        baseContext,
        baseSdkContext
      );

      expect(result.entities).toHaveLength(2);
      expect(result.pagination.totalCount).toBe(2);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
      expect(result.pagination.nextPageInputKey).toBe("page");
      expect(result.timestamp).toBeDefined();
    });

    it("indicates hasMore when more pages available", async () => {
      mockListEntities.mockResolvedValueOnce({
        entities: [{ campaign_id: "1800000001" }],
        pageInfo: {
          page: 1,
          page_size: 1,
          total_number: 5,
          total_page: 5,
        },
      });

      const result = await listEntitiesLogic(
        {
          entityType: "campaign",
          advertiserId: "1234567890",
          page: 1,
          pageSize: 1,
        },
        baseContext,
        baseSdkContext
      );

      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).toBe("2");
    });

    it("passes filters to service when provided", async () => {
      mockListEntities.mockResolvedValueOnce({
        entities: [],
        pageInfo: { page: 1, page_size: 10, total_number: 0, total_page: 0 },
      });

      await listEntitiesLogic(
        {
          entityType: "adGroup",
          advertiserId: "1234567890",
          filters: { status: "ADGROUP_STATUS_ENABLE" },
          page: 2,
          pageSize: 5,
        },
        baseContext,
        baseSdkContext
      );

      expect(mockListEntities).toHaveBeenCalledWith(
        "adGroup",
        { status: "ADGROUP_STATUS_ENABLE" },
        2,
        5,
        baseContext
      );
    });
  });

  describe("listEntitiesResponseFormatter()", () => {
    function pagination(nextCursor: string | null, pageSize: number, totalCount?: number) {
      return {
        nextCursor,
        hasMore: nextCursor !== null,
        pageSize,
        ...(totalCount !== undefined ? { totalCount } : {}),
        nextPageInputKey: "page",
      };
    }

    it("formats results with entity count", () => {
      const result = {
        entities: [{ campaign_id: "abc" }],
        pagination: pagination(null, 1, 1),
        timestamp: "2026-03-04T00:00:00.000Z",
      };

      const formatted = listEntitiesResponseFormatter(result);
      expect(formatted).toHaveLength(1);
      expect((formatted[0] as any).type).toBe("text");
      expect((formatted[0] as any).text).toContain("Found 1 entities");
      expect((formatted[0] as any).text).toContain("total 1");
    });

    it("indicates no entities found", () => {
      const result = {
        entities: [],
        pagination: pagination(null, 0, 0),
        timestamp: "2026-03-04T00:00:00.000Z",
      };

      const formatted = listEntitiesResponseFormatter(result);
      expect((formatted[0] as any).text).toContain("No entities found");
    });

    it("shows pagination hint when hasMore is true", () => {
      const result = {
        entities: [{ campaign_id: "abc" }],
        pagination: pagination("2", 1, 3),
        timestamp: "2026-03-04T00:00:00.000Z",
      };

      const formatted = listEntitiesResponseFormatter(result);
      expect((formatted[0] as any).text).toContain("page");
      expect((formatted[0] as any).text).toContain('"2"');
    });
  });

  describe("input schema validation", () => {
    it("accepts valid input", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "campaign",
        advertiserId: "1234567890",
      });
      expect(result.success).toBe(true);
    });

    it("rejects unknown entity types", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "unknownType",
        advertiserId: "1234567890",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty advertiser ID", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "campaign",
        advertiserId: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects page size over 1000", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "campaign",
        advertiserId: "1234567890",
        pageSize: 1001,
      });
      expect(result.success).toBe(false);
    });

    it("accepts all supported entity types", () => {
      const types = ["campaign", "adGroup", "ad", "creative"];
      for (const entityType of types) {
        const result = ListEntitiesInputSchema.safeParse({
          entityType,
          advertiserId: "1234567890",
        });
        expect(result.success).toBe(true);
      }
    });
  });
});
