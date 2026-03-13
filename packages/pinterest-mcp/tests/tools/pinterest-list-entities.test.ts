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
    pinterestService: {
      listEntities: mockListEntities,
    },
  } as any);
});

describe("pinterest_list_entities tool", () => {
  const baseContext = { requestId: "test-req" } as any;
  const baseSdkContext = { sessionId: "test-session" } as any;

  describe("listEntitiesLogic()", () => {
    it("returns formatted entity list with bookmark pagination info", async () => {
      const mockEntities = [
        { id: "687201361754", name: "Campaign A", status: "ACTIVE" },
        { id: "687201361755", name: "Campaign B", status: "PAUSED" },
      ];

      mockListEntities.mockResolvedValueOnce({
        entities: mockEntities,
        pageInfo: {
          bookmark: null,
        },
      });

      const result = await listEntitiesLogic(
        {
          entityType: "campaign",
          adAccountId: "1234567890",
          pageSize: 25,
        },
        baseContext,
        baseSdkContext
      );

      expect(result.entities).toHaveLength(2);
      expect(result.bookmark).toBeNull();
      expect(result.has_more).toBe(false);
      expect(result.timestamp).toBeDefined();
    });

    it("indicates has_more when bookmark is present", async () => {
      mockListEntities.mockResolvedValueOnce({
        entities: [{ id: "687201361754" }],
        pageInfo: {
          bookmark: "ZmVlZDE%3D",
        },
      });

      const result = await listEntitiesLogic(
        {
          entityType: "campaign",
          adAccountId: "1234567890",
          pageSize: 1,
        },
        baseContext,
        baseSdkContext
      );

      expect(result.has_more).toBe(true);
      expect(result.bookmark).toBe("ZmVlZDE%3D");
    });

    it("passes filters object to service", async () => {
      mockListEntities.mockResolvedValueOnce({
        entities: [],
        pageInfo: { bookmark: null },
      });

      await listEntitiesLogic(
        {
          entityType: "adGroup",
          adAccountId: "1234567890",
          campaignId: "1800000001",
          pageSize: 5,
        },
        baseContext,
        baseSdkContext
      );

      expect(mockListEntities).toHaveBeenCalledWith(
        "adGroup",
        {
          adAccountId: "1234567890",
          campaignId: "1800000001",
          adGroupId: undefined,
        },
        undefined,
        5,
        baseContext
      );
    });

    it("passes bookmark cursor to service when provided", async () => {
      mockListEntities.mockResolvedValueOnce({
        entities: [],
        pageInfo: { bookmark: null },
      });

      await listEntitiesLogic(
        {
          entityType: "campaign",
          adAccountId: "1234567890",
          bookmark: "ZmVlZDE%3D",
          pageSize: 25,
        },
        baseContext,
        baseSdkContext
      );

      expect(mockListEntities).toHaveBeenCalledWith(
        "campaign",
        expect.objectContaining({ adAccountId: "1234567890" }),
        "ZmVlZDE%3D",
        25,
        baseContext
      );
    });
  });

  describe("listEntitiesResponseFormatter()", () => {
    it("formats results with entity count", () => {
      const result = {
        entities: [{ id: "687201361754" }],
        bookmark: null,
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
        bookmark: null,
        has_more: false,
        timestamp: "2026-03-04T00:00:00.000Z",
      };

      const formatted = listEntitiesResponseFormatter(result);
      expect((formatted[0] as any).text).toContain("No entities found");
    });

    it("shows bookmark hint when has_more is true", () => {
      const result = {
        entities: [{ id: "687201361754" }],
        bookmark: "ZmVlZDE%3D",
        has_more: true,
        timestamp: "2026-03-04T00:00:00.000Z",
      };

      const formatted = listEntitiesResponseFormatter(result);
      expect((formatted[0] as any).text).toContain("bookmark: ZmVlZDE%3D");
    });
  });

  describe("input schema validation", () => {
    it("accepts valid input", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "campaign",
        adAccountId: "1234567890",
      });
      expect(result.success).toBe(true);
    });

    it("rejects unknown entity types", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "unknownType",
        adAccountId: "1234567890",
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

    it("rejects page size over 250", () => {
      const result = ListEntitiesInputSchema.safeParse({
        entityType: "campaign",
        adAccountId: "1234567890",
        pageSize: 251,
      });
      expect(result.success).toBe(false);
    });

    it("accepts all supported entity types", () => {
      const types = ["campaign", "adGroup", "ad", "creative"];
      for (const entityType of types) {
        const result = ListEntitiesInputSchema.safeParse({
          entityType,
          adAccountId: "1234567890",
        });
        expect(result.success).toBe(true);
      }
    });
  });
});
