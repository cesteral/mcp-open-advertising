// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  bidListLogic,
  BidListInputSchema,
} from "../../src/mcp-server/tools/definitions/bid-list.tool.js";
import {
  bidListBulkLogic,
  BidListBulkInputSchema,
} from "../../src/mcp-server/tools/definitions/bid-list-bulk.tool.js";

function createMockContext() {
  return {
    requestId: "req-123",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

describe("ttd bid list tools", () => {
  let mockTtdService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTtdService = {
      createBidList: vi.fn(),
      getBidList: vi.fn(),
      updateBidList: vi.fn(),
      batchGetBidLists: vi.fn(),
      batchUpdateBidLists: vi.fn(),
    };

    mockResolveSessionServices.mockReturnValue({ ttdService: mockTtdService });
  });

  // ── ttd_manage_bid_list ──

  describe("bidListLogic", () => {
    it("create: calls ttdService.createBidList with data and returns result", async () => {
      const mockResult = { BidListId: "bl-001", Name: "Test Bid List", Bids: [] };
      mockTtdService.createBidList.mockResolvedValueOnce(mockResult);

      const result = await bidListLogic(
        { operation: "create", data: { Name: "Test Bid List", Bids: [] } },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.operation).toBe("create");
      expect(result.result).toEqual(mockResult);
      expect(result.timestamp).toBeDefined();
      expect(mockTtdService.createBidList).toHaveBeenCalledWith(
        { Name: "Test Bid List", Bids: [] },
        expect.any(Object)
      );
    });

    it("get: calls ttdService.getBidList with bidListId and returns result", async () => {
      const mockResult = { BidListId: "bl-001", Name: "Test Bid List", Bids: [] };
      mockTtdService.getBidList.mockResolvedValueOnce(mockResult);

      const result = await bidListLogic(
        { operation: "get", bidListId: "bl-001" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.operation).toBe("get");
      expect(result.bidListId).toBe("bl-001");
      expect(result.result).toEqual(mockResult);
      expect(result.timestamp).toBeDefined();
      expect(mockTtdService.getBidList).toHaveBeenCalledWith("bl-001", expect.any(Object));
    });

    it("update: calls ttdService.updateBidList with data + BidListId merged and returns result", async () => {
      const mockResult = { BidListId: "bl-001", Name: "Updated Bid List", Bids: [] };
      mockTtdService.updateBidList.mockResolvedValueOnce(mockResult);

      const result = await bidListLogic(
        {
          operation: "update",
          bidListId: "bl-001",
          data: { Name: "Updated Bid List", Bids: [] },
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.operation).toBe("update");
      expect(result.bidListId).toBe("bl-001");
      expect(result.result).toEqual(mockResult);
      expect(result.timestamp).toBeDefined();
      expect(mockTtdService.updateBidList).toHaveBeenCalledWith(
        { Name: "Updated Bid List", Bids: [], BidListId: "bl-001" },
        expect.any(Object)
      );
    });

    it("Zod validation: get without bidListId fails schema validation", () => {
      const result = BidListInputSchema.safeParse({ operation: "get" });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.message.includes("bidListId"));
        expect(issue).toBeDefined();
      }
    });

    it("Zod validation: update without data fails schema validation", () => {
      const result = BidListInputSchema.safeParse({
        operation: "update",
        bidListId: "bl-001",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.message.includes("data"));
        expect(issue).toBeDefined();
      }
    });

    it("throws when resolveSessionServices fails", async () => {
      mockResolveSessionServices.mockImplementation(() => {
        throw new Error("No session ID available");
      });

      await expect(
        bidListLogic({ operation: "get", bidListId: "bl-001" }, createMockContext())
      ).rejects.toThrow("No session ID available");
    });
  });

  // ── ttd_bulk_manage_bid_lists ──

  describe("bidListBulkLogic", () => {
    it("batch_get: calls ttdService.batchGetBidLists with ids array and returns results", async () => {
      const mockResults = [
        { BidListId: "bl-001", Name: "Bid List 1" },
        { BidListId: "bl-002", Name: "Bid List 2" },
      ];
      mockTtdService.batchGetBidLists.mockResolvedValueOnce(mockResults);

      const result = await bidListBulkLogic(
        { operation: "batch_get", bidListIds: ["bl-001", "bl-002"] },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.operation).toBe("batch_get");
      expect(result.count).toBe(2);
      expect(result.results).toEqual(mockResults);
      expect(result.timestamp).toBeDefined();
      expect(mockTtdService.batchGetBidLists).toHaveBeenCalledWith(
        ["bl-001", "bl-002"],
        expect.any(Object)
      );
    });

    it("batch_update: calls ttdService.batchUpdateBidLists with items array and returns results", async () => {
      const mockResults = [
        { BidListId: "bl-001", Name: "Updated 1" },
        { BidListId: "bl-002", Name: "Updated 2" },
      ];
      mockTtdService.batchUpdateBidLists.mockResolvedValueOnce(mockResults);

      const items = [
        { BidListId: "bl-001", Name: "Updated 1" },
        { BidListId: "bl-002", Name: "Updated 2" },
      ];

      const result = await bidListBulkLogic(
        { operation: "batch_update", items },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.operation).toBe("batch_update");
      expect(result.count).toBe(2);
      expect(result.results).toEqual(mockResults);
      expect(result.timestamp).toBeDefined();
      expect(mockTtdService.batchUpdateBidLists).toHaveBeenCalledWith(items, expect.any(Object));
    });

    it("Zod validation: bidListIds > 50 fails validation", () => {
      const ids = Array.from({ length: 51 }, (_, i) => `bl-${i}`);
      const result = BidListBulkInputSchema.safeParse({
        operation: "batch_get",
        bidListIds: ids,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i) => i.code === "too_big" || i.message.includes("50")
        );
        expect(issue).toBeDefined();
      }
    });

    it("Zod validation: items > 50 fails validation", () => {
      const items = Array.from({ length: 51 }, (_, i) => ({
        BidListId: `bl-${i}`,
        Name: `Bid List ${i}`,
      }));
      const result = BidListBulkInputSchema.safeParse({
        operation: "batch_update",
        items,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i) => i.code === "too_big" || i.message.includes("50")
        );
        expect(issue).toBeDefined();
      }
    });

    it("Zod validation: batch_get without bidListIds fails schema validation", () => {
      const result = BidListBulkInputSchema.safeParse({ operation: "batch_get" });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.message.includes("bidListIds"));
        expect(issue).toBeDefined();
      }
    });

    it("Zod validation: batch_update without items fails schema validation", () => {
      const result = BidListBulkInputSchema.safeParse({ operation: "batch_update" });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.message.includes("items"));
        expect(issue).toBeDefined();
      }
    });

    it("throws when resolveSessionServices fails", async () => {
      mockResolveSessionServices.mockImplementation(() => {
        throw new Error("No session ID available");
      });

      await expect(
        bidListBulkLogic({ operation: "batch_get", bidListIds: ["bl-001"] }, createMockContext())
      ).rejects.toThrow("No session ID available");
    });
  });
});
