import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the session resolution
vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
const mockResolveSessionServices = vi.mocked(resolveSessionServices);

import {
  searchTargetingLogic,
  searchTargetingResponseFormatter,
} from "../../src/mcp-server/tools/definitions/search-targeting.tool.js";

const mockLinkedInService = {
  searchTargeting: vi.fn(),
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

describe("linkedin_search_targeting tool", () => {
  beforeEach(() => {
    mockLinkedInService.searchTargeting.mockReset();
    mockResolveSessionServices.mockReturnValue(mockSessionServices as any);
  });

  describe("searchTargetingLogic()", () => {
    it("returns facet options with a non-paging cursor when the page is not full", async () => {
      mockLinkedInService.searchTargeting.mockResolvedValueOnce({
        elements: [{ urn: "urn:li:title:1", name: "Software Engineer" }],
        paging: { start: 0, count: 20 },
      });

      const result = await searchTargetingLogic(
        { facetType: "MEMBER_JOB_TITLE", query: "software engineer" },
        mockContext as any,
        { sessionId: "test-session" }
      );

      expect(result.facetType).toBe("MEMBER_JOB_TITLE");
      expect(result.results).toHaveLength(1);
      expect(result.pagination.pageSize).toBe(1);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
      expect(result.pagination.nextPageInputKey).toBe("start");
      expect(result.timestamp).toBeDefined();
    });

    it("passes the start offset through to the service", async () => {
      mockLinkedInService.searchTargeting.mockResolvedValueOnce({
        elements: [],
        paging: { start: 50, count: 50, total: 50 },
      });

      await searchTargetingLogic({ facetType: "GEO", limit: 50, start: 50 }, mockContext as any);

      expect(mockLinkedInService.searchTargeting).toHaveBeenCalledWith(
        "GEO",
        undefined,
        50,
        50,
        mockContext
      );
    });

    it("computes hasMore + nextCursor from the upstream total", async () => {
      const elements = Array.from({ length: 50 }, (_, i) => ({ urn: `urn:li:geo:${i}` }));
      mockLinkedInService.searchTargeting.mockResolvedValueOnce({
        elements,
        paging: { start: 0, count: 50, total: 240 },
      });

      const result = await searchTargetingLogic(
        { facetType: "GEO", limit: 50 },
        mockContext as any
      );

      expect(result.pagination.pageSize).toBe(50);
      expect(result.pagination.totalCount).toBe(240);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).toBe("50");
    });

    it("infers hasMore from a full page when the API omits total", async () => {
      const elements = Array.from({ length: 20 }, (_, i) => ({ urn: `urn:li:interest:${i}` }));
      mockLinkedInService.searchTargeting.mockResolvedValueOnce({
        elements,
        paging: { start: 0, count: 20 },
      });

      const result = await searchTargetingLogic(
        { facetType: "MEMBER_INTERESTS" },
        mockContext as any
      );

      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).toBe("20");
      expect(result.pagination.totalCount).toBeUndefined();
    });

    it("tolerates a response with no paging block", async () => {
      mockLinkedInService.searchTargeting.mockResolvedValueOnce({
        elements: [{ urn: "urn:li:seniority:1" }],
      });

      const result = await searchTargetingLogic(
        { facetType: "MEMBER_SENIORITY" },
        mockContext as any
      );

      expect(result.results).toHaveLength(1);
      expect(result.pagination.pageSize).toBe(1);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
    });
  });

  describe("searchTargetingResponseFormatter()", () => {
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
        facetType: "GEO",
        results: [{ urn: "urn:li:geo:1", name: "London" }],
        pagination: pagination("50", 50, 240),
        timestamp: "2026-07-20T00:00:00.000Z",
      };

      const formatted = searchTargetingResponseFormatter(result);
      const text = (formatted[0] as { type: string; text: string }).text;
      expect(text).toContain("GEO");
      expect(text).toContain("50 of 240 options");
      expect(text).toContain("More results available");
      expect(text).toContain("start");
    });

    it("omits the next-page hint when exhausted", () => {
      const result = {
        facetType: "MEMBER_SENIORITY",
        results: [],
        pagination: pagination(null, 0),
        timestamp: "2026-07-20T00:00:00.000Z",
      };

      const formatted = searchTargetingResponseFormatter(result);
      const text = (formatted[0] as { type: string; text: string }).text;
      expect(text).not.toContain("More results available");
    });
  });
});
