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

      await service.listEntities("ad", {
        adAccountId: "549755813599",
        campaignId: "111",
        adGroupId: "222",
      });

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
      mockPost.mockResolvedValueOnce({ items: [{ data: { id: "687201361754" }, exceptions: [] }] });

      const data = { name: "Test Campaign", status: "ACTIVE" };
      await service.createEntity("campaign", filters, data);

      expect(mockPost).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/campaigns",
        [data],
        undefined
      );
    });

    it("calls correct POST path for ads", async () => {
      mockPost.mockResolvedValueOnce({ items: [{ data: { id: "1600000001" } }] });

      const data = { name: "Test Ad", ad_group_id: "1700000001" };
      await service.createEntity("ad", filters, data);

      expect(mockPost).toHaveBeenCalledWith("/v5/ad_accounts/549755813599/ads", [data], undefined);
    });

    // Spec: POST /ad_accounts/{id}/campaigns → CampaignBatchWriteResponseModel
    // `{ items: [{ data, exceptions }] }`. The entity is `items[0].data`.
    it("returns items[0].data (not the batch wrapper) so the created ID is kept", async () => {
      const created = { id: "687201361754", name: "Test" };
      mockPost.mockResolvedValueOnce({ items: [{ data: created, exceptions: [] }] });

      const result = await service.createEntity("campaign", filters, { name: "Test" });
      expect(result).toEqual(created);
      expect((result as { id?: string }).id).toBe("687201361754");
    });

    it("throws when the item is rejected (HTTP 200 with exceptions[])", async () => {
      mockPost.mockResolvedValueOnce({
        items: [{ data: {}, exceptions: [{ code: 2, message: "Advertiser not found." }] }],
      });

      await expect(service.createEntity("campaign", filters, { name: "Test" })).rejects.toThrow(
        /Pinterest rejected create of Campaign: \[2\] Advertiser not found\./
      );
    });

    it("throws when an ad item is rejected (AdBatchItem.exceptions is a single object)", async () => {
      mockPost.mockResolvedValueOnce({
        items: [{ exceptions: { code: 4000, message: "Invalid pin_id" } }],
      });

      await expect(service.createEntity("ad", filters, { name: "Ad" })).rejects.toThrow(
        /Pinterest rejected create of Ad: \[4000\] Invalid pin_id/
      );
    });

    it("throws when the response carries no item (outcome unknown)", async () => {
      mockPost.mockResolvedValueOnce({ items: [] });

      await expect(service.createEntity("adGroup", filters, { name: "AG" })).rejects.toThrow(
        /returned no result item/
      );
    });

    it("returns the Pin response as-is for creatives (POST /pins is not a batch endpoint)", async () => {
      const pin = { id: "900", title: "Pin" };
      mockPost.mockResolvedValueOnce(pin);

      const result = await service.createEntity("creative", filters, { title: "Pin" });
      expect(result).toEqual(pin);
    });
  });

  describe("updateEntity()", () => {
    it("calls PATCH with array body containing id", async () => {
      mockPatch.mockResolvedValueOnce({ items: [{ data: { id: "687201361754" } }] });

      await service.updateEntity("campaign", filters, "687201361754", {
        name: "Updated Name",
      });

      expect(mockPatch).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/campaigns",
        [{ id: "687201361754", name: "Updated Name" }],
        undefined
      );
    });

    it("returns items[0].data from the batch response", async () => {
      const updated = { id: "687201361754", name: "Updated" };
      mockPatch.mockResolvedValueOnce({ items: [{ data: updated, exceptions: [] }] });

      const result = await service.updateEntity("campaign", filters, "687201361754", {
        name: "Updated",
      });
      expect(result).toEqual(updated);
    });

    it("throws when Pinterest rejects the update item despite HTTP 200", async () => {
      mockPatch.mockResolvedValueOnce({
        items: [{ exceptions: [{ code: 1, message: "Invalid budget" }] }],
      });

      await expect(
        service.updateEntity("adGroup", filters, "1700000001", { budget_in_micro_currency: 1 })
      ).rejects.toThrow(/Pinterest rejected update of Ad Group 1700000001: \[1\] Invalid budget/);
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
      mockPatch.mockResolvedValue({ items: [{ data: { id: "111" } }] });

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
      mockPatch.mockResolvedValueOnce({ items: [{ data: { id: "111" } }] });

      await service.updateEntityStatus("campaign", filters, ["111"], "PAUSED");

      expect(mockPatch).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/campaigns",
        [{ id: "111", status: "PAUSED" }],
        undefined
      );
    });
  });

  describe("getEntity()", () => {
    // Spec: GET /ad_accounts/{ad_account_id}/campaigns/{campaign_id} (campaigns/get),
    // /ad_groups/{ad_group_id} (ad_groups/get), /ads/{ad_id} (ads/get). The list
    // endpoints take no `id` param, so `?id=X&page_size=1` returned an arbitrary entity.
    it.each([
      ["campaign", "/v5/ad_accounts/549755813599/campaigns/687201361754"],
      ["adGroup", "/v5/ad_accounts/549755813599/ad_groups/687201361754"],
      ["ad", "/v5/ad_accounts/549755813599/ads/687201361754"],
      ["creative", "/v5/pins/687201361754"],
    ] as const)("fetches %s by ID via GET %s", async (entityType, expectedPath) => {
      const mockEntity = { id: "687201361754", name: "Entity A" };
      mockGet.mockResolvedValueOnce(mockEntity);

      const result = await service.getEntity(entityType, filters, "687201361754");

      expect(mockGet).toHaveBeenCalledWith(expectedPath, {}, undefined);
      expect(result).toEqual(mockEntity);
    });

    it("never lists-and-takes-first: a different entity in the response is NotFound", async () => {
      // What the old `?id=` list fallback would have silently returned.
      mockGet.mockResolvedValueOnce({ id: "111111111111", name: "Some other campaign" });

      await expect(service.getEntity("campaign", filters, "687201361754")).rejects.toThrow(
        "Campaign with ID 687201361754 not found"
      );
    });

    it("rejects a list-shaped response instead of taking items[0]", async () => {
      mockGet.mockResolvedValueOnce({
        items: [{ id: "111111111111", name: "First campaign in account" }],
        bookmark: null,
      });

      await expect(service.getEntity("campaign", filters, "687201361754")).rejects.toThrow(
        "not found"
      );
    });

    it("URL-encodes the entity ID into the path", async () => {
      mockGet.mockResolvedValueOnce({ id: "a/b" });

      await service.getEntity("ad", filters, "a/b");
      expect(mockGet).toHaveBeenCalledWith("/v5/ad_accounts/549755813599/ads/a%2Fb", {}, undefined);
    });
  });

  describe("adjustBids()", () => {
    it("converts the currency bidPrice to integer micros and reports both bids in currency", async () => {
      mockGet.mockResolvedValueOnce({ id: "1700000001", bid_in_micro_currency: 2_000_000 });
      mockPatch.mockResolvedValueOnce({
        items: [{ data: { id: "1700000001", bid_in_micro_currency: 1_100_000 } }],
      });

      const result = await service.adjustBids(filters, [
        { adGroupId: "1700000001", bidPrice: 1.1 },
      ]);

      expect(mockGet).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/ad_groups/1700000001",
        {},
        undefined
      );
      expect(mockPatch).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/ad_groups",
        [{ id: "1700000001", bid_in_micro_currency: 1_100_000 }],
        undefined
      );
      expect(result.results).toEqual([
        { adGroupId: "1700000001", success: true, previousBid: 2, newBid: 1.1 },
      ]);
    });

    it("reports a rejected bid write as a failure, not a success", async () => {
      mockGet.mockResolvedValueOnce({ id: "1700000001", bid_in_micro_currency: 2_000_000 });
      mockPatch.mockResolvedValueOnce({
        items: [{ exceptions: [{ code: 5, message: "Bid below floor" }] }],
      });

      const result = await service.adjustBids(filters, [
        { adGroupId: "1700000001", bidPrice: 0.01 },
      ]);

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain("Bid below floor");
    });

    it("fails an item whose bid rounds to zero micros without calling the API", async () => {
      const result = await service.adjustBids(filters, [
        { adGroupId: "1700000001", bidPrice: 0.0000001 },
      ]);

      expect(result.results[0].success).toBe(false);
      expect(mockGet).not.toHaveBeenCalled();
      expect(mockPatch).not.toHaveBeenCalled();
    });
  });

  describe("bulkCreateEntities()", () => {
    it("reports per-item rejections as failures and keeps created entities' IDs", async () => {
      mockPost
        .mockResolvedValueOnce({ items: [{ data: { id: "c1", name: "A" }, exceptions: [] }] })
        .mockResolvedValueOnce({
          items: [{ data: {}, exceptions: [{ code: 3, message: "Invalid objective_type" }] }],
        });

      const result = await service.bulkCreateEntities("campaign", filters, [
        { name: "A" },
        { name: "B" },
      ]);

      expect(result.results[0]).toEqual({ success: true, entity: { id: "c1", name: "A" } });
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toContain("Invalid objective_type");
    });
  });

  describe("bulkUpdateStatus()", () => {
    it("returns success results for all entity IDs on success", async () => {
      mockPatch.mockResolvedValue({ items: [{ data: { status: "PAUSED" } }] });

      const result = await service.bulkUpdateStatus("campaign", filters, ["111", "222"], "PAUSED");

      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
    });

    it("returns failure results when status update throws", async () => {
      mockPatch.mockRejectedValueOnce(new Error("API error"));

      const result = await service.bulkUpdateStatus("campaign", filters, ["111"], "PAUSED");

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain("API error");
    });

    it("handles partial failures — succeeds for some entities and fails for others", async () => {
      // First entity succeeds, second fails, third succeeds
      mockPatch
        .mockResolvedValueOnce({ items: [{ data: { id: "111" } }] })
        .mockRejectedValueOnce(new Error("Entity 222 not found"))
        .mockResolvedValueOnce({ items: [{ data: { id: "333" } }] });

      const result = await service.bulkUpdateStatus(
        "campaign",
        filters,
        ["111", "222", "333"],
        "PAUSED"
      );

      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toEqual({ entityId: "111", success: true, error: undefined });
      expect(result.results[1].entityId).toBe("222");
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toContain("Entity 222 not found");
      expect(result.results[2]).toEqual({ entityId: "333", success: true, error: undefined });
    });

    it("reports an item Pinterest rejected with HTTP 200 as a failure", async () => {
      mockPatch
        .mockResolvedValueOnce({ items: [{ data: { id: "111" }, exceptions: [] }] })
        .mockResolvedValueOnce({
          items: [{ data: {}, exceptions: [{ code: 2, message: "Campaign is archived" }] }],
        });

      const result = await service.bulkUpdateStatus("campaign", filters, ["111", "222"], "ACTIVE");

      expect(result.results[0].success).toBe(true);
      expect(result.results[1]).toMatchObject({ entityId: "222", success: false });
      expect(result.results[1].error).toContain("Campaign is archived");
    });
  });
});
