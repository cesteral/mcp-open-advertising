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
    amazonDspService: {
      listEntities: mockListEntities,
    },
  } as any);
});

describe("amazonDsp_list_entities tool", () => {
  const baseContext = { requestId: "test-req" } as any;
  const baseSdkContext = { sessionId: "test-session" } as any;

  describe("listEntitiesLogic()", () => {
    it("returns formatted entity list with pagination info", async () => {
      const mockEntities = [
        { orderId: "ord_001", name: "Order A", state: "ENABLED" },
        { orderId: "ord_002", name: "Order B", state: "PAUSED" },
      ];

      mockListEntities.mockResolvedValueOnce({
        entities: mockEntities,
        pageInfo: {
          startIndex: 0,
          count: 25,
          totalResults: 2,
        },
      });

      const result = await listEntitiesLogic(
        {
          entityType: "order",
          profileId: "1234567890",
          startIndex: 0,
          pageSize: 25,
        },
        baseContext,
        baseSdkContext
      );

      expect(result.entities).toHaveLength(2);
      expect(result.startIndex).toBe(0);
      expect(result.totalResults).toBe(2);
      expect(result.has_more).toBe(false);
      expect(result.timestamp).toBeDefined();
    });

    it("indicates has_more when more pages available", async () => {
      mockListEntities.mockResolvedValueOnce({
        entities: [{ orderId: "ord_001" }],
        pageInfo: {
          startIndex: 0,
          count: 1,
          totalResults: 5,
        },
      });

      const result = await listEntitiesLogic(
        {
          entityType: "order",
          profileId: "1234567890",
          startIndex: 0,
          pageSize: 1,
        },
        baseContext,
        baseSdkContext
      );

      expect(result.has_more).toBe(true);
    });

    it("passes filters to service when provided", async () => {
      mockListEntities.mockResolvedValueOnce({
        entities: [],
        pageInfo: { startIndex: 25, count: 25, totalResults: 50 },
      });

      await listEntitiesLogic(
        {
          entityType: "lineItem",
          profileId: "1234567890",
          filters: { orderId: "ord_123" },
          startIndex: 25,
          pageSize: 25,
        },
        baseContext,
        baseSdkContext
      );

      expect(mockListEntities).toHaveBeenCalledWith(
        "lineItem",
        { orderId: "ord_123" },
        25,
        25,
        baseContext
      );
    });
  });

  describe("listEntitiesResponseFormatter()", () => {
    it("formats results with entity count and pagination", () => {
      const result = {
        entities: [{ orderId: "ord_001" }],
        startIndex: 0,
        pageSize: 25,
        totalResults: 1,
        has_more: false,
        timestamp: "2026-03-04T00:00:00.000Z",
      };

      const formatted = listEntitiesResponseFormatter(result);
      expect(formatted).toHaveLength(1);
      expect((formatted[0] as any).type).toBe("text");
      expect((formatted[0] as any).text).toContain("Found 1 entities");
    });

    it("indicates no entities found", () => {
      const result = {
        entities: [],
        startIndex: 0,
        pageSize: 25,
        totalResults: 0,
        has_more: false,
        timestamp: "2026-03-04T00:00:00.000Z",
      };

      const formatted = listEntitiesResponseFormatter(result);
      expect((formatted[0] as any).text).toContain("No entities found");
    });

    it("shows pagination hint when has_more is true", () => {
      const result = {
        entities: [{ orderId: "ord_001" }],
        startIndex: 0,
        pageSize: 25,
        totalResults: 50,
        has_more: true,
        timestamp: "2026-03-04T00:00:00.000Z",
      };

      const formatted = listEntitiesResponseFormatter(result);
      expect((formatted[0] as any).text).toContain("startIndex: 25");
    });
  });

  describe("input schema validation", () => {
    it("accepts valid input", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "order",
        profileId: "1234567890",
      });
      expect(result.success).toBe(true);
    });

    it("rejects unknown entity types", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "unknownType",
        profileId: "1234567890",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty advertiser ID", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "order",
        profileId: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects page size over 100", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "order",
        profileId: "1234567890",
        pageSize: 101,
      });
      expect(result.success).toBe(false);
    });

    it("accepts all supported entity types", () => {
      const types = ["order", "lineItem", "creative"];
      for (const entityType of types) {
        const result = ListEntitiesInputSchema.safeParse({
          entityType,
          profileId: "1234567890",
        });
        expect(result.success).toBe(true);
      }
    });
  });
});
