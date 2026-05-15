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
      setBidList: vi.fn(),
      deleteBidList: vi.fn(),
      batchGetBidLists: vi.fn(),
      batchUpdateBidLists: vi.fn(),
    };

    mockResolveSessionServices.mockReturnValue({ ttdService: mockTtdService });
  });

  // ── ttd_manage_bid_list ──

  describe("bidListLogic", () => {
    it("create: forwards GraphQL input + selection to ttdService.createBidList", async () => {
      const mockResult = { data: { bidListCreate: { data: { id: "bl-001", name: "T" } } } };
      mockTtdService.createBidList.mockResolvedValueOnce(mockResult);

      const result = await bidListLogic(
        {
          operation: "create",
          data: { owner: { type: "Advertiser", id: "adv1" }, name: "T", lines: [] },
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.operation).toBe("create");
      expect(result.result).toEqual(mockResult);
      expect(mockTtdService.createBidList).toHaveBeenCalledWith(
        { owner: { type: "Advertiser", id: "adv1" }, name: "T", lines: [] },
        expect.any(Object),
        "id name"
      );
    });

    it("get: forwards bidListId + selection to ttdService.getBidList", async () => {
      const mockResult = { data: { bidList: { id: "bl-001", name: "T" } } };
      mockTtdService.getBidList.mockResolvedValueOnce(mockResult);

      const result = await bidListLogic(
        { operation: "get", bidListId: "bl-001", selection: "id name adjustmentType" },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.operation).toBe("get");
      expect(result.bidListId).toBe("bl-001");
      expect(result.result).toEqual(mockResult);
      expect(mockTtdService.getBidList).toHaveBeenCalledWith(
        "bl-001",
        expect.any(Object),
        "id name adjustmentType"
      );
    });

    it("update: forwards full GraphQL input (no BidListId merge — tests deltas not REST shape)", async () => {
      const mockResult = { data: { bidListUpdate: { data: { id: "bl-001" } } } };
      mockTtdService.updateBidList.mockResolvedValueOnce(mockResult);

      const result = await bidListLogic(
        {
          operation: "update",
          bidListId: "bl-001",
          data: { id: "bl-001", linesToAdd: [], linesToRemove: [] },
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.operation).toBe("update");
      expect(result.bidListId).toBe("bl-001");
      expect(result.result).toEqual(mockResult);
      expect(mockTtdService.updateBidList).toHaveBeenCalledWith(
        { id: "bl-001", linesToAdd: [], linesToRemove: [] },
        expect.any(Object),
        "id name"
      );
    });

    it("set: forwards full GraphQL input to ttdService.setBidList", async () => {
      mockTtdService.setBidList.mockResolvedValueOnce({
        data: { bidListSet: { data: { id: "bl-001" } } },
      });
      const result = await bidListLogic(
        { operation: "set", bidListId: "bl-001", data: { id: "bl-001", lines: [] } },
        createMockContext(),
        createMockSdkContext()
      );
      expect(result.operation).toBe("set");
      expect(mockTtdService.setBidList).toHaveBeenCalledWith(
        { id: "bl-001", lines: [] },
        expect.any(Object),
        "id name"
      );
    });

    it("delete: forwards GraphQL input to ttdService.deleteBidList", async () => {
      mockTtdService.deleteBidList.mockResolvedValueOnce({
        data: { bidListDelete: { errors: [] } },
      });
      const result = await bidListLogic(
        { operation: "delete", data: { id: "bl-001" } },
        createMockContext(),
        createMockSdkContext()
      );
      expect(result.operation).toBe("delete");
      expect(mockTtdService.deleteBidList).toHaveBeenCalledWith(
        { id: "bl-001" },
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
    it("batch_get: forwards ids + selection to ttdService.batchGetBidLists", async () => {
      const mockResults = [
        { bidListId: "bl-001", success: true, data: { id: "bl-001" } },
        { bidListId: "bl-002", success: true, data: { id: "bl-002" } },
      ];
      mockTtdService.batchGetBidLists.mockResolvedValueOnce(mockResults);

      const result = await bidListBulkLogic(
        { operation: "batch_get", bidListIds: ["bl-001", "bl-002"] },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.operation).toBe("batch_get");
      expect(result.totalItems).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockTtdService.batchGetBidLists).toHaveBeenCalledWith(
        ["bl-001", "bl-002"],
        expect.any(Object),
        "id name"
      );
    });

    it("batch_update: forwards items + selection to ttdService.batchUpdateBidLists", async () => {
      const mockResults = [
        { index: 0, success: true, data: { id: "bl-001" } },
        { index: 1, success: false, error: "validation" },
      ];
      mockTtdService.batchUpdateBidLists.mockResolvedValueOnce(mockResults);

      const items = [
        { id: "bl-001", linesToAdd: [] },
        { id: "bl-002", linesToAdd: [] },
      ];

      const result = await bidListBulkLogic(
        { operation: "batch_update", items },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.operation).toBe("batch_update");
      expect(result.totalItems).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(mockTtdService.batchUpdateBidLists).toHaveBeenCalledWith(
        items,
        expect.any(Object),
        "id name"
      );
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
