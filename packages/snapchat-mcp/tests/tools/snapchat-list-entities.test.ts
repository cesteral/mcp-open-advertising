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
    snapchatService: {
      listEntities: mockListEntities,
    },
  } as any);
});

describe("snapchat_list_entities tool", () => {
  const baseContext = { requestId: "test-req" } as any;
  const baseSdkContext = { sessionId: "test-session" } as any;

  describe("listEntitiesLogic()", () => {
    it("returns formatted entity list with next-link pagination", async () => {
      const mockEntities = [
        { id: "c1", name: "Campaign A", status: "ACTIVE" },
        { id: "c2", name: "Campaign B", status: "PAUSED" },
      ];

      mockListEntities.mockResolvedValueOnce({
        entities: mockEntities,
        nextCursor: undefined,
      });

      const result = await listEntitiesLogic(
        {
          entityType: "campaign",
          adAccountId: "acct_123456",
        },
        baseContext,
        baseSdkContext
      );

      expect(result.entities).toHaveLength(2);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
      expect(result.pagination.nextPageInputKey).toBe("cursor");
      expect(result.timestamp).toBeDefined();
    });

    it("indicates hasMore when nextCursor is present", async () => {
      mockListEntities.mockResolvedValueOnce({
        entities: [{ id: "c1" }],
        nextCursor: "cursor_abc123",
      });

      const result = await listEntitiesLogic(
        {
          entityType: "campaign",
          adAccountId: "acct_123456",
        },
        baseContext,
        baseSdkContext
      );

      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).toBe("cursor_abc123");
    });

    it("passes campaignId filter when provided for adGroup listing", async () => {
      mockListEntities.mockResolvedValueOnce({
        entities: [],
        nextCursor: undefined,
      });

      await listEntitiesLogic(
        {
          entityType: "adGroup",
          adAccountId: "acct_123456",
          campaignId: "c1",
        },
        baseContext,
        baseSdkContext
      );

      expect(mockListEntities).toHaveBeenCalledWith(
        "adGroup",
        { adAccountId: "acct_123456", campaignId: "c1" },
        undefined,
        baseContext
      );
    });
  });

  describe("listEntitiesResponseFormatter()", () => {
    function pagination(nextCursor: string | null, pageSize: number) {
      return {
        nextCursor,
        hasMore: nextCursor !== null,
        pageSize,
        nextPageInputKey: "cursor",
      };
    }

    it("formats results with entity count", () => {
      const result = {
        entities: [{ id: "c1" }],
        pagination: pagination(null, 1),
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
        pagination: pagination(null, 0),
        timestamp: "2026-03-04T00:00:00.000Z",
      };

      const formatted = listEntitiesResponseFormatter(result);
      expect((formatted[0] as any).text).toContain("No entities found");
    });

    it("shows next page hint when hasMore is true", () => {
      const result = {
        entities: [{ id: "c1" }],
        pagination: pagination("next_cursor_xyz", 1),
        timestamp: "2026-03-04T00:00:00.000Z",
      };

      const formatted = listEntitiesResponseFormatter(result);
      expect((formatted[0] as any).text).toContain("More results available");
      expect((formatted[0] as any).text).toContain("next_cursor_xyz");
      expect((formatted[0] as any).text).toContain("cursor");
    });
  });

  describe("input schema validation", () => {
    it("accepts valid input", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "campaign",
        adAccountId: "acct_123456",
      });
      expect(result.success).toBe(true);
    });

    it("rejects unknown entity types", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "unknownType",
        adAccountId: "acct_123456",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty advertiser ID", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "campaign",
        adAccountId: "",
      });
      expect(result.success).toBe(false);
    });

    it("accepts next page link parameter for pagination", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "campaign",
        adAccountId: "acct_123456",
        cursor: "some_cursor_value",
      });
      expect(result.success).toBe(true);
    });

    it("accepts all supported entity types", () => {
      const types = ["campaign", "adGroup", "ad", "creative"];
      for (const entityType of types) {
        const result = ListEntitiesInputSchema.safeParse({
          entityType,
          adAccountId: "acct_123456",
        });
        expect(result.success).toBe(true);
      }
    });
  });
});
