// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { RateLimiter } from "@cesteral/shared";
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
} from "../../src/mcp-server/tools/definitions/manage-bid-list.tool.js";
import {
  bidListBulkLogic,
  BidListBulkInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-manage-bid-lists.tool.js";
import { TtdService } from "../../src/services/ttd/ttd-service.js";

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

// An unconfigured limiter never constrains a batch: these tests are not about
// bulk capacity (see ttd-bulk-capacity.test.ts), so the pre-check always passes.
const unlimitedBulkCapacityCheck = (
  toolName: string,
  itemCount: number,
  costPerItem: readonly number[]
) => ({
  rateLimiter: new RateLimiter(),
  toolName,
  itemCount,
  buckets: [{ key: "ttd:test", costPerItem }],
});

describe("ttd bid list tools", () => {
  let mockTtdService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTtdService = {
      bulkCapacityCheck: unlimitedBulkCapacityCheck,
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

  // ── GraphQL failure detection (real TtdService, mocked transport) ──
  //
  // TTD GraphQL reports failures with HTTP 200: top-level `errors[]`, the
  // payload's `userErrors` (bidListCreate/Update/Set — PayloadWithErrorsOfBidList)
  // or `errors` (bidListDelete). Before this, the tools returned such a response
  // as a success and emitted the governed `bid_list(s)_managed` effect.

  describe("GraphQL error handling through the real service", () => {
    let fetchDirect: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchDirect = vi.fn();
      const service = new TtdService(
        { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
        new RateLimiter(),
        { partnerId: "p", fetch: vi.fn(), fetchDirect } as any
      );
      mockResolveSessionServices.mockReturnValue({ ttdService: service });
    });

    function sentQuery(call = 0): string {
      return JSON.parse(fetchDirect.mock.calls[call][2].body).query as string;
    }

    it("create: payload userErrors fail the call and emit no effect", async () => {
      fetchDirect.mockResolvedValueOnce({
        data: {
          bidListCreate: {
            data: null,
            userErrors: [{ field: ["input", "owner"], message: "Owner not found" }],
          },
        },
      });

      await expect(
        bidListLogic(
          { operation: "create", data: { name: "T" } } as any,
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow(/bidListCreate failed: input\.owner: Owner not found/);
      expect(sentQuery()).toContain("userErrors { field message }");
    });

    it("update: top-level GraphQL errors fail the call", async () => {
      fetchDirect.mockResolvedValueOnce({
        data: null,
        errors: [{ message: "Bid list not found", extensions: { code: "NOT_FOUND" } }],
      });

      await expect(
        bidListLogic(
          { operation: "update", bidListId: "bl-1", data: { id: "bl-1" } } as any,
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow(/Bid list not found/);
    });

    it("set: payload userErrors fail the call", async () => {
      fetchDirect.mockResolvedValueOnce({
        data: { bidListSet: { data: null, userErrors: [{ message: "Invalid owner" }] } },
      });

      await expect(
        bidListLogic(
          { operation: "set", bidListId: "bl-1", data: { id: "bl-1" } } as any,
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow(/bidListSet failed: Invalid owner/);
    });

    it("delete: selects TTD's documented payload and fails on payload errors", async () => {
      fetchDirect.mockResolvedValueOnce({
        data: {
          bidListDelete: {
            data: null,
            errors: [{ __typename: "InSchemaError", field: "id", message: "Unknown id" }],
          },
        },
      });

      await expect(
        bidListLogic(
          { operation: "delete", data: { id: "bl-1" } } as any,
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow(/bidListDelete failed: id: Unknown id/);
      expect(sentQuery()).toContain("data { wasDeleted }");
      expect(sentQuery()).toContain("... on InSchemaError { field message }");
    });

    it("delete: wasDeleted:false is not reported as success", async () => {
      fetchDirect.mockResolvedValueOnce({
        data: { bidListDelete: { data: { wasDeleted: false }, errors: [] } },
      });

      await expect(
        bidListLogic(
          { operation: "delete", data: { id: "bl-1" } } as any,
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow(/did not confirm the deletion/);
    });

    it("delete: a confirmed deletion still succeeds and emits the effect", async () => {
      fetchDirect.mockResolvedValueOnce({
        data: { bidListDelete: { data: { wasDeleted: true }, errors: [] } },
      });

      const result = await bidListLogic(
        { operation: "delete", data: { id: "bl-1" } } as any,
        createMockContext(),
        createMockSdkContext()
      );
      expect(result.effect?.effectKind).toBe("bid_list_managed");
    });

    it("create: a clean response succeeds and emits the effect", async () => {
      fetchDirect.mockResolvedValueOnce({
        data: { bidListCreate: { data: { id: "bl-9", name: "T" }, userErrors: [] } },
      });

      const result = await bidListLogic(
        { operation: "create", data: { name: "T" } } as any,
        createMockContext(),
        createMockSdkContext()
      );
      expect(result.effect?.effectKind).toBe("bid_list_managed");
    });

    it("batch_update: an item with userErrors is counted as failed, not succeeded", async () => {
      fetchDirect
        .mockResolvedValueOnce({
          data: { bidListUpdate: { data: { id: "bl-1" }, userErrors: [] } },
        })
        .mockResolvedValueOnce({
          data: { bidListUpdate: { data: null, userErrors: [{ message: "Bad line" }] } },
        })
        .mockResolvedValueOnce({ data: null, errors: [{ message: "boom" }] });

      const result = await bidListBulkLogic(
        {
          operation: "batch_update",
          items: [{ id: "bl-1" }, { id: "bl-2" }, { id: "bl-3" }],
        } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.totalItems).toBe(3);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(2);
      expect(result.effect?.summary).toMatchObject({ succeeded: 1, failed: 2 });
      const failed = result.results.filter((r) => r.success === false);
      expect(failed.map((r) => String(r.error))).toEqual(
        expect.arrayContaining([expect.stringMatching(/Bad line/), expect.stringMatching(/boom/)])
      );
    });

    it("batch_get: a top-level GraphQL error fails that item", async () => {
      fetchDirect
        .mockResolvedValueOnce({ data: { bidList: { id: "bl-1", name: "A" } } })
        .mockResolvedValueOnce({ data: { bidList: null }, errors: [{ message: "denied" }] });

      const result = await bidListBulkLogic(
        { operation: "batch_get", bidListIds: ["bl-1", "bl-2"] } as any,
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
    });
  });
});
