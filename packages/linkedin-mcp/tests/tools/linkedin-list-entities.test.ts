import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the session resolution
vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
const mockResolveSessionServices = vi.mocked(resolveSessionServices);

import {
  listEntitiesLogic,
  listEntitiesResponseFormatter,
} from "../../src/mcp-server/tools/definitions/list-entities.tool.js";

const mockLinkedInService = {
  listEntities: vi.fn(),
};

const mockSessionServices = {
  httpClient: {} as any,
  linkedInService: mockLinkedInService as any,
  linkedInReportingService: {} as any,
};

const mockContext = {
  requestId: "test-req-id",
  operationId: "test-op-id",
};

describe("linkedin_list_entities tool", () => {
  beforeEach(() => {
    mockLinkedInService.listEntities.mockReset();
    mockResolveSessionServices.mockReturnValue(mockSessionServices as any);
  });

  describe("listEntitiesLogic()", () => {
    it("lists campaigns for an ad account", async () => {
      mockLinkedInService.listEntities.mockResolvedValueOnce({
        entities: [{ id: 111222333, name: "Test Campaign", status: "ACTIVE" }],
        total: 1,
        start: 0,
      });

      const result = await listEntitiesLogic(
        {
          entityType: "campaign",
          adAccountUrn: "urn:li:sponsoredAccount:123456789",
        },
        mockContext as any,
        { sessionId: "test-session" }
      );

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]).toMatchObject({ name: "Test Campaign" });
      expect(result.pagination.pageSize).toBe(1);
      expect(result.pagination.totalCount).toBe(1);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
      expect(result.pagination.nextPageInputKey).toBe("start");
      expect(result.timestamp).toBeDefined();
    });

    it("correctly calculates hasMore when total exceeds current page", async () => {
      const entities = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      mockLinkedInService.listEntities.mockResolvedValueOnce({
        entities,
        total: 100,
        start: 0,
      });

      const result = await listEntitiesLogic(
        {
          entityType: "campaign",
          adAccountUrn: "urn:li:sponsoredAccount:123456789",
          count: 25,
        },
        mockContext as any
      );

      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.pageSize).toBe(25);
      expect(result.pagination.nextCursor).toBe("25");
    });

    it("throws when adAccountUrn is missing for account-scoped entity types", async () => {
      await expect(
        listEntitiesLogic(
          {
            entityType: "campaign",
            // adAccountUrn is missing
          },
          mockContext as any
        )
      ).rejects.toThrow("adAccountUrn is required");
    });

    it("does not require adAccountUrn for adAccount entity type", async () => {
      mockLinkedInService.listEntities.mockResolvedValueOnce({
        entities: [{ id: 123456789, name: "My Account" }],
        total: 1,
        start: 0,
      });

      const result = await listEntitiesLogic(
        {
          entityType: "adAccount",
          // No adAccountUrn — valid for adAccount type
        },
        mockContext as any
      );

      expect(result.entities).toHaveLength(1);
    });

    it("passes pagination params to service", async () => {
      mockLinkedInService.listEntities.mockResolvedValueOnce({
        entities: [],
        total: 0,
        start: 50,
      });

      await listEntitiesLogic(
        {
          entityType: "campaign",
          adAccountUrn: "urn:li:sponsoredAccount:123456789",
          start: 50,
          count: 10,
        },
        mockContext as any
      );

      expect(mockLinkedInService.listEntities).toHaveBeenCalledWith(
        "campaign",
        "urn:li:sponsoredAccount:123456789",
        50,
        10,
        mockContext
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
        nextPageInputKey: "start",
      };
    }

    it("formats results with entity count", () => {
      const result = {
        entities: [{ id: 1, name: "Campaign A" }],
        pagination: pagination("1", 1, 5),
        timestamp: "2026-03-04T00:00:00.000Z",
      };

      const formatted = listEntitiesResponseFormatter(result);
      expect(formatted).toHaveLength(1);
      const text = (formatted[0] as { type: string; text: string }).text;
      expect(text).toContain("1 entities");
      expect(text).toContain("Campaign A");
      expect(text).toContain("More results available");
    });

    it("shows 'No entities found' when empty", () => {
      const result = {
        entities: [],
        pagination: pagination(null, 0, 0),
        timestamp: "2026-03-04T00:00:00.000Z",
      };

      const formatted = listEntitiesResponseFormatter(result);
      const text = (formatted[0] as { type: string; text: string }).text;
      expect(text).toContain("No entities found");
    });
  });
});
