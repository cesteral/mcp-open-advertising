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

    it("sends campaignId / adGroupId as the v5 plural filters campaign_ids / ad_group_ids", async () => {
      mockGet.mockResolvedValueOnce({ items: [], bookmark: null });

      await service.listEntities("ad", {
        adAccountId: "549755813599",
        campaignId: "111",
        adGroupId: "222",
      });

      const params = mockGet.mock.calls[0][1] as Record<string, string>;
      // Singular campaign_id / ad_group_id are not v5 parameters and were ignored.
      expect(params).not.toHaveProperty("campaign_id");
      expect(params).not.toHaveProperty("ad_group_id");
      expect(mockGet).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/ads",
        expect.objectContaining({ campaign_ids: "111", ad_group_ids: "222" }),
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

    it("posts a single PinCreate object (not an array) to /v5/pins", async () => {
      mockPost.mockResolvedValueOnce({ id: "900" });
      const pinCreate = { board_id: "1", media_source: { source_type: "image_url", url: "u" } };

      await service.createEntity("creative", filters, pinCreate);

      expect(mockPost).toHaveBeenCalledWith("/v5/pins", pinCreate, undefined);
      expect(Array.isArray(mockPost.mock.calls[0][1])).toBe(false);
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

    it("sends entityId as the item id even when the patch carries its own id", async () => {
      mockPatch.mockResolvedValueOnce({ items: [{ data: { id: "687201361754" } }] });

      await service.updateEntity("campaign", filters, "687201361754", {
        id: "999999999999",
        status: "PAUSED",
      });

      expect(mockPatch).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/campaigns",
        [{ id: "687201361754", status: "PAUSED" }],
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
    // Pinterest v5 has no DELETE on campaigns/ad_groups/ads (GET/POST/PATCH only):
    // removal is a PATCH to status ARCHIVED.
    it.each([
      ["campaign", "campaigns"],
      ["adGroup", "ad_groups"],
      ["ad", "ads"],
    ] as const)("archives %s via PATCH status ARCHIVED, never DELETE", async (type, segment) => {
      mockPatch
        .mockResolvedValueOnce({ items: [{ data: { id: "111", status: "ARCHIVED" } }] })
        .mockResolvedValueOnce({ items: [{ data: { id: "222", status: "ARCHIVED" } }] });

      const result = await service.deleteEntity(type, filters, ["111", "222"]);

      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockPatch).toHaveBeenCalledTimes(2);
      expect(mockPatch).toHaveBeenCalledWith(
        `/v5/ad_accounts/549755813599/${segment}`,
        [{ id: "111", status: "ARCHIVED" }],
        undefined
      );
      expect(mockPatch).toHaveBeenCalledWith(
        `/v5/ad_accounts/549755813599/${segment}`,
        [{ id: "222", status: "ARCHIVED" }],
        undefined
      );
      expect(result).toEqual({
        removal: "archived",
        results: [
          { entityId: "111", success: true },
          { entityId: "222", success: true },
        ],
      });
    });

    it("reports an archive Pinterest rejected (HTTP 200 + exceptions) as a per-id failure", async () => {
      mockPatch.mockResolvedValueOnce({ items: [{ data: { id: "111" } }] }).mockResolvedValueOnce({
        items: [{ exceptions: [{ code: 2, message: "Campaign not found" }] }],
      });

      const result = await service.deleteEntity("campaign", filters, ["111", "222"]);

      expect(result.removal).toBe("archived");
      expect(result.results[0]).toEqual({ entityId: "111", success: true });
      expect(result.results[1]).toMatchObject({ entityId: "222", success: false });
      expect(result.results[1].error).toContain("Campaign not found");
    });

    it("deletes creatives (Pins) with DELETE /v5/pins/{pin_id}, one request per id", async () => {
      mockDelete.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("404"));

      const result = await service.deleteEntity("creative", filters, ["900", "901"]);

      expect(mockPatch).not.toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalledWith("/v5/pins/900", {}, undefined);
      expect(mockDelete).toHaveBeenCalledWith("/v5/pins/901", {}, undefined);
      expect(result).toEqual({
        removal: "deleted",
        results: [
          { entityId: "900", success: true },
          { entityId: "901", success: false, error: "404" },
        ],
      });
    });
  });

  describe("targeting", () => {
    it("searchTargeting reads GET /v5/resources/targeting/{type} and filters/limits client-side", async () => {
      mockGet.mockResolvedValueOnce([
        { US: "United States", GB: "United Kingdom", "811": "U.S.: Reno", GR: "Greece" },
      ]);

      const result = await service.searchTargeting("LOCATION", "u.s", 1, filters);

      expect(mockGet).toHaveBeenCalledWith(
        "/v5/resources/targeting/LOCATION",
        { ad_account_id: "549755813599" },
        undefined
      );
      // No keyword/count query params exist on this endpoint.
      const params = mockGet.mock.calls[0][1] as Record<string, string>;
      expect(params).not.toHaveProperty("keyword");
      expect(params).not.toHaveProperty("count");
      expect(result).toEqual([{ id: "811", name: "U.S.: Reno" }]);
    });

    it("searchTargeting passes non-map option objects through", async () => {
      mockGet.mockResolvedValueOnce([{ id: "935", name: "Gaming", level: 1 }]);

      const result = await service.searchTargeting("INTEREST", "gam", 10, filters);
      expect(result).toEqual([{ id: "935", name: "Gaming", level: 1 }]);
    });

    it("getTargetingOptions reads GET /v5/resources/targeting/{type}", async () => {
      mockGet.mockResolvedValueOnce([{ "18-24": "18-24" }]);

      const result = await service.getTargetingOptions("AGE_BUCKET", filters);

      expect(mockGet).toHaveBeenCalledWith(
        "/v5/resources/targeting/AGE_BUCKET",
        { ad_account_id: "549755813599" },
        undefined
      );
      expect(result).toEqual({ targeting_type: "AGE_BUCKET", options: [{ "18-24": "18-24" }] });
    });

    it("getTargetingOptions without a type returns the v5 PublicTargetingType list, no API call", async () => {
      const result = await service.getTargetingOptions(undefined, filters);
      expect(mockGet).not.toHaveBeenCalled();
      expect(result).toEqual({
        targeting_types: [
          "APPTYPE",
          "GENDER",
          "LOCALE",
          "AGE_BUCKET",
          "LOCATION",
          "GEO",
          "INTEREST",
          "KEYWORD",
          "AUDIENCE_INCLUDE",
          "AUDIENCE_EXCLUDE",
        ],
      });
    });
  });

  describe("getAudienceEstimate()", () => {
    it("POSTs the spec as targeting_spec to /ad_groups/audience_sizing", async () => {
      mockPost.mockResolvedValueOnce({
        audience_size_lower_bound: 100,
        audience_size_upper_bound: 200,
      });
      const spec = { GENDER: ["female"], LOCATION: ["US"] };

      const result = await service.getAudienceEstimate(filters, spec);

      expect(mockGet).not.toHaveBeenCalled();
      expect(mockPost).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/ad_groups/audience_sizing",
        { targeting_spec: spec },
        undefined
      );
      expect(result).toEqual({ audience_size_lower_bound: 100, audience_size_upper_bound: 200 });
    });
  });

  describe("getAdPreviews()", () => {
    it("reads the ad's pin_id and POSTs it to /ad_previews", async () => {
      mockGet.mockResolvedValueOnce({ id: "1600", pin_id: "7389" });
      mockPost.mockResolvedValueOnce({ url: "https://ads.pinterest.com/ad-preview/abc/" });

      const result = await service.getAdPreviews(filters, "1600", "MAX_VIDEO");

      expect(mockGet).toHaveBeenCalledWith("/v5/ad_accounts/549755813599/ads/1600", {}, undefined);
      expect(mockPost).toHaveBeenCalledWith(
        "/v5/ad_accounts/549755813599/ad_previews",
        { pin_id: "7389", creative_type: "MAX_VIDEO" },
        undefined
      );
      expect(result).toEqual({
        pinId: "7389",
        preview: { url: "https://ads.pinterest.com/ad-preview/abc/" },
      });
    });

    it("fails clearly when the ad has no pin_id", async () => {
      mockGet.mockResolvedValueOnce({ id: "1600" });

      await expect(service.getAdPreviews(filters, "1600")).rejects.toThrow(/has no pin_id/);
      expect(mockPost).not.toHaveBeenCalled();
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
