import { describe, it, expect, vi, beforeEach } from "vitest";
import { PinterestService } from "../../src/services/pinterest/pinterest-service.js";

// Mock the HTTP client (Pinterest v5 — get, post, patch, delete)
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

const mockHttpClient: any = {
  get: mockGet,
  post: mockPost,
  patch: mockPatch,
  delete: mockDelete,
};

const mockConsume = vi.fn().mockResolvedValue(undefined);
const mockRateLimiter: any = {
  consume: mockConsume,
  destroy: vi.fn(),
};

const mockLogger: any = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("PinterestService", () => {
  let service: PinterestService;
  const filters = { adAccountId: "549755813599" };

  beforeEach(() => {
    service = new PinterestService(mockRateLimiter, mockHttpClient, mockLogger);
    mockGet.mockReset();
    mockPost.mockReset();
    mockPatch.mockReset();
    mockDelete.mockReset();
    mockConsume.mockResolvedValue(undefined);
  });

  describe("listEntities()", () => {
    it("calls correct GET path for campaigns with interpolated adAccountId", async () => {
      mockGet.mockResolvedValueOnce({
        items: [{ id: "687201361754", name: "Campaign A" }],
        bookmark: null,
      });

      const result = await service.listEntities("campaign", filters);

      expect(mockGet).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/campaigns",
        expect.objectContaining({ page_size: "25" }),
        undefined
      );
      expect(result.entities).toHaveLength(1);
      expect(result.pageInfo.bookmark).toBeNull();
    });

    it("calls correct GET path for ad groups", async () => {
      mockGet.mockResolvedValueOnce({ items: [], bookmark: null });

      await service.listEntities("adGroup", filters, "cursor123", 5);

      expect(mockGet).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/ad_groups",
        expect.objectContaining({ page_size: "5", bookmark: "cursor123" }),
        undefined
      );
    });

    it("passes campaignId and adGroupId filters as query params when provided", async () => {
      mockGet.mockResolvedValueOnce({ items: [], bookmark: null });

      await service.listEntities(
        "ad",
        { adAccountId: "549755813599", campaignId: "111", adGroupId: "222" }
      );

      expect(mockGet).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/ads",
        expect.objectContaining({ campaign_id: "111", ad_group_id: "222" }),
        undefined
      );
    });

    it("returns bookmark from response", async () => {
      mockGet.mockResolvedValueOnce({
        items: [{ id: "1" }],
        bookmark: "ZmVlZDE%3D",
      });

      const result = await service.listEntities("campaign", filters);
      expect(result.pageInfo.bookmark).toBe("ZmVlZDE%3D");
    });
  });

  describe("createEntity()", () => {
    it("calls correct POST path with array body for campaigns", async () => {
      mockPost.mockResolvedValueOnce({ items: [{ id: "687201361754" }] });

      const data = { name: "Test Campaign", status: "ACTIVE" };
      await service.createEntity("campaign", filters, data);

      expect(mockPost).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/campaigns",
        [data],
        undefined
      );
    });

    it("calls correct POST path for ads", async () => {
      mockPost.mockResolvedValueOnce({ items: [{ id: "1600000001" }] });

      const data = { name: "Test Ad", ad_group_id: "1700000001" };
      await service.createEntity("ad", filters, data);

      expect(mockPost).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/ads",
        [data],
        undefined
      );
    });

    it("returns first item from response", async () => {
      const created = { id: "687201361754", name: "Test" };
      mockPost.mockResolvedValueOnce({ items: [created] });

      const result = await service.createEntity("campaign", filters, { name: "Test" });
      expect(result).toEqual(created);
    });
  });

  describe("updateEntity()", () => {
    it("calls PATCH with array body containing id", async () => {
      mockPatch.mockResolvedValueOnce({ items: [{ id: "687201361754" }] });

      await service.updateEntity("campaign", filters, "687201361754", {
        name: "Updated Name",
      });

      expect(mockPatch).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/campaigns",
        [{ id: "687201361754", name: "Updated Name" }],
        undefined
      );
    });

    it("returns first item from response", async () => {
      const updated = { id: "687201361754", name: "Updated" };
      mockPatch.mockResolvedValueOnce({ items: [updated] });

      const result = await service.updateEntity("campaign", filters, "687201361754", { name: "Updated" });
      expect(result).toEqual(updated);
    });
  });

  describe("deleteEntity()", () => {
    it("calls DELETE with query params using deleteIdsParam", async () => {
      mockDelete.mockResolvedValueOnce({});

      await service.deleteEntity("campaign", filters, ["111", "222"]);

      expect(mockDelete).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/campaigns",
        { campaign_ids: "111,222" },
        undefined
      );
    });

    it("uses correct deleteIdsParam for ad groups", async () => {
      mockDelete.mockResolvedValueOnce({});

      await service.deleteEntity("adGroup", filters, ["333"]);

      expect(mockDelete).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/ad_groups",
        { ad_group_ids: "333" },
        undefined
      );
    });
  });

  describe("updateEntityStatus()", () => {
    it("calls updateEntity with status field for each ID", async () => {
      mockPatch.mockResolvedValue({ items: [{ id: "111" }] });

      const results = await service.updateEntityStatus(
        "adGroup",
        filters,
        ["111", "222"],
        "ACTIVE"
      );

      expect(mockPatch).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(2);
    });

    it("supports different status values", async () => {
      mockPatch.mockResolvedValueOnce({ items: [{ id: "111" }] });

      await service.updateEntityStatus("campaign", filters, ["111"], "PAUSED");

      expect(mockPatch).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/campaigns",
        [{ id: "111", status: "PAUSED" }],
        undefined
      );
    });
  });

  describe("getEntity()", () => {
    it("returns single entity from list response by id", async () => {
      const mockEntity = { id: "687201361754", name: "Campaign A" };
      mockGet.mockResolvedValueOnce({
        items: [mockEntity],
        bookmark: null,
      });

      // getEntity uses listPath which for campaign has no {entityId}, so it falls through to list
      const result = await service.getEntity("campaign", filters, "687201361754");
      expect(result).toEqual(mockEntity);
    });

    it("throws when entity not found in list", async () => {
      mockGet.mockResolvedValueOnce({ items: [], bookmark: null });

      await expect(
        service.getEntity("campaign", filters, "nonexistent-id")
      ).rejects.toThrow("not found");
    });
  });

  describe("bulkUpdateStatus()", () => {
    it("returns success results for all entity IDs on success", async () => {
      mockPatch.mockResolvedValue({ items: [{}] });

      const result = await service.bulkUpdateStatus(
        "campaign",
        filters,
        ["111", "222"],
        "PAUSED"
      );

      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
    });

    it("returns failure results when status update throws", async () => {
      mockPatch.mockRejectedValueOnce(new Error("API error"));

      const result = await service.bulkUpdateStatus(
        "campaign",
        filters,
        ["111"],
        "PAUSED"
      );

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain("API error");
    });
  });
});
