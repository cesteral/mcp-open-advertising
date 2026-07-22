import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the session resolution
vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
const mockResolveSessionServices = vi.mocked(resolveSessionServices);

import {
  getTargetingOptionsLogic,
  getTargetingOptionsResponseFormatter,
} from "../../src/mcp-server/tools/definitions/get-targeting-options.tool.js";

const mockLinkedInService = {
  getTargetingOptions: vi.fn(),
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

describe("linkedin_get_targeting_options tool", () => {
  beforeEach(() => {
    mockLinkedInService.getTargetingOptions.mockReset();
    mockResolveSessionServices.mockReturnValue(mockSessionServices as any);
  });

  describe("getTargetingOptionsLogic()", () => {
    it("returns facet options with a non-paging cursor when the page is not full", async () => {
      mockLinkedInService.getTargetingOptions.mockResolvedValueOnce({
        elements: [{ facetType: "MEMBER_INTERESTS", name: "Technology" }],
        paging: { start: 0, count: 20 },
      });

      const result = await getTargetingOptionsLogic(
        { adAccountUrn: "urn:li:sponsoredAccount:123" },
        mockContext as any,
        { sessionId: "test-session" }
      );

      expect(result.options).toHaveLength(1);
      expect(result.count).toBe(1);
      expect(result.pagination.pageSize).toBe(1);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
      expect(result.pagination.nextPageInputKey).toBe("start");
      expect(result.timestamp).toBeDefined();
    });

    it("threads the start offset and limit through to the service", async () => {
      mockLinkedInService.getTargetingOptions.mockResolvedValueOnce({
        elements: [],
        paging: { start: 50, count: 50, total: 50 },
      });

      await getTargetingOptionsLogic(
        { adAccountUrn: "urn:li:sponsoredAccount:123", facetType: "GEO", limit: 50, start: 50 },
        mockContext as any
      );

      expect(mockLinkedInService.getTargetingOptions).toHaveBeenCalledWith(
        "urn:li:sponsoredAccount:123",
        "GEO",
        50,
        50,
        mockContext
      );
    });

    it("computes hasMore + nextCursor from the upstream total", async () => {
      const elements = Array.from({ length: 50 }, (_, i) => ({ facetType: `F_${i}` }));
      mockLinkedInService.getTargetingOptions.mockResolvedValueOnce({
        elements,
        paging: { start: 0, count: 50, total: 240 },
      });

      const result = await getTargetingOptionsLogic(
        { adAccountUrn: "urn:li:sponsoredAccount:123", limit: 50 },
        mockContext as any
      );

      expect(result.pagination.pageSize).toBe(50);
      expect(result.pagination.totalCount).toBe(240);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).toBe("50");
    });

    it("infers hasMore from a full page when the API omits total", async () => {
      const elements = Array.from({ length: 20 }, (_, i) => ({ facetType: `F_${i}` }));
      mockLinkedInService.getTargetingOptions.mockResolvedValueOnce({
        elements,
        paging: { start: 0, count: 20 },
      });

      const result = await getTargetingOptionsLogic(
        { adAccountUrn: "urn:li:sponsoredAccount:123" },
        mockContext as any
      );

      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).toBe("20");
      expect(result.pagination.totalCount).toBeUndefined();
    });

    it("tolerates a response with no paging block", async () => {
      mockLinkedInService.getTargetingOptions.mockResolvedValueOnce({
        elements: [{ facetType: "MEMBER_SENIORITY" }],
      });

      const result = await getTargetingOptionsLogic(
        { adAccountUrn: "urn:li:sponsoredAccount:123" },
        mockContext as any
      );

      expect(result.options).toHaveLength(1);
      expect(result.pagination.pageSize).toBe(1);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
    });
  });

  describe("getTargetingOptionsResponseFormatter()", () => {
    function pagination(nextCursor: string | null, pageSize: number, totalCount?: number) {
      return {
        nextCursor,
        hasMore: nextCursor !== null,
        pageSize,
        ...(totalCount !== undefined ? { totalCount } : {}),
        nextPageInputKey: "start",
      };
    }

    it("renders the count, total, and next-page hint", () => {
      const result = {
        options: [{ facetType: "GEO", name: "London" }],
        count: 50,
        pagination: pagination("50", 50, 240),
        timestamp: "2026-07-20T00:00:00.000Z",
      };

      const formatted = getTargetingOptionsResponseFormatter(result);
      const text = (formatted[0] as { type: string; text: string }).text;
      expect(text).toContain("50 of 240 targeting options");
      expect(text).toContain("More results available");
      expect(text).toContain("start");
    });

    it("omits the next-page hint when exhausted", () => {
      const result = {
        options: [],
        count: 0,
        pagination: pagination(null, 0),
        timestamp: "2026-07-20T00:00:00.000Z",
      };

      const formatted = getTargetingOptionsResponseFormatter(result);
      const text = (formatted[0] as { type: string; text: string }).text;
      expect(text).not.toContain("More results available");
    });
  });
});
