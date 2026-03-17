import { describe, it, expect, vi, beforeEach } from "vitest";
import { AmazonDspService } from "../../src/services/amazon-dsp/amazon-dsp-service.js";

const mockHttpClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

const mockRateLimiter = {
  consume: vi.fn().mockResolvedValue(undefined),
};

describe("AmazonDspService", () => {
  let service: AmazonDspService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AmazonDspService(mockRateLimiter as any, mockHttpClient as any);
  });

  describe("listEntities", () => {
    it("calls correct list path for orders with offset pagination", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ orders: [{ orderId: "o1" }], totalResults: 1 });
      const result = await service.listEntities("order", { advertiserId: "adv_123" });
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/dsp/orders",
        expect.objectContaining({ advertiserId: "adv_123", startIndex: "0", count: "25" }),
        undefined
      );
      expect(result.entities[0]).toEqual({ orderId: "o1" });
      expect(result.pageInfo.totalResults).toBe(1);
    });

    it("passes startIndex for offset pagination", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ orders: [], totalResults: 50 });
      await service.listEntities("order", { advertiserId: "adv_123" }, 25);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/dsp/orders",
        expect.objectContaining({ startIndex: "25" }),
        undefined
      );
    });

    it("passes orderId filter for lineItems", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ lineItems: [{ lineItemId: "li1" }], totalResults: 1 });
      await service.listEntities("lineItem", { orderId: "order_1" });
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/dsp/lineItems",
        expect.objectContaining({ orderId: "order_1" }),
        undefined
      );
    });
  });

  describe("getEntity", () => {
    it("calls entity-specific GET path", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ orderId: "o1", name: "Test" });
      const result = await service.getEntity("order", "o1");
      expect(mockHttpClient.get).toHaveBeenCalledWith("/dsp/orders/o1", undefined, undefined);
      expect((result as any).orderId).toBe("o1");
    });
  });

  describe("createEntity", () => {
    it("sends POST with data directly as the body (no array wrapping)", async () => {
      mockHttpClient.post.mockResolvedValueOnce({ orderId: "new_order" });
      await service.createEntity("order", { name: "New", advertiserId: "adv_1" });
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        "/dsp/orders",
        { name: "New", advertiserId: "adv_1" },
        undefined
      );
    });
  });

  describe("updateEntity", () => {
    it("sends PUT to entity-specific path", async () => {
      mockHttpClient.put.mockResolvedValueOnce({ orderId: "o1", name: "Updated" });
      await service.updateEntity("order", "o1", { name: "Updated" });
      expect(mockHttpClient.put).toHaveBeenCalledWith("/dsp/orders/o1", { name: "Updated" }, undefined);
    });
  });

  describe("deleteEntity (archive)", () => {
    it("archives via PUT with state ARCHIVED (no DELETE endpoint)", async () => {
      mockHttpClient.put.mockResolvedValueOnce({ orderId: "o1", state: "ARCHIVED" });
      await service.deleteEntity("order", "o1");
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        "/dsp/orders/o1",
        { state: "ARCHIVED" },
        undefined
      );
      expect(mockHttpClient.delete).not.toHaveBeenCalled();
    });
  });

  describe("updateEntityStatus", () => {
    it("sends PUT with state to entity path", async () => {
      mockHttpClient.put.mockResolvedValueOnce({ orderId: "o1", state: "PAUSED" });
      await service.updateEntityStatus("order", "o1", "PAUSED");
      expect(mockHttpClient.put).toHaveBeenCalledWith("/dsp/orders/o1", { state: "PAUSED" }, undefined);
    });
  });
});
