import { describe, it, expect, vi, beforeEach } from "vitest";
import { TikTokService } from "../../src/services/tiktok/tiktok-service.js";

// Mock the HTTP client
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();

const mockHttpClient: any = {
  get: mockGet,
  post: mockPost,
  delete: mockDelete,
};

const mockConsume = vi.fn().mockResolvedValue(undefined);
const mockRateLimiter: any = {
  consume: mockConsume,
  destroy: vi.fn(),
};

const mockLogger: any = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("TikTokService", () => {
  let service: TikTokService;

  beforeEach(() => {
    service = new TikTokService(mockRateLimiter, mockHttpClient, mockLogger);
    mockGet.mockReset();
    mockPost.mockReset();
    mockDelete.mockReset();
    mockConsume.mockResolvedValue(undefined);
  });

  describe("listEntities()", () => {
    it("calls correct GET path for campaigns", async () => {
      mockGet.mockResolvedValueOnce({
        list: [{ campaign_id: "123" }],
        page_info: { page: 1, page_size: 10, total_number: 1, total_page: 1 },
      });

      const result = await service.listEntities("campaign");

      expect(mockGet).toHaveBeenCalledWith(
        "/open_api/v1.3/campaign/get/",
        expect.objectContaining({ page: "1", page_size: "10" }),
        undefined
      );
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]?.campaign_id).toBe("123");
      expect(result.pageInfo.total_number).toBe(1);
    });

    it("calls correct GET path for ad groups", async () => {
      mockGet.mockResolvedValueOnce({
        list: [],
        page_info: { page: 1, page_size: 10, total_number: 0, total_page: 0 },
      });

      await service.listEntities("adGroup", {}, 2, 5);

      expect(mockGet).toHaveBeenCalledWith(
        "/open_api/v1.3/adgroup/get/",
        expect.objectContaining({ page: "2", page_size: "5" }),
        undefined
      );
    });

    it("includes filters as JSON string when provided", async () => {
      mockGet.mockResolvedValueOnce({
        list: [],
        page_info: { page: 1, page_size: 10, total_number: 0, total_page: 0 },
      });

      await service.listEntities("campaign", { status: "ENABLE" });

      expect(mockGet).toHaveBeenCalledWith(
        "/open_api/v1.3/campaign/get/",
        expect.objectContaining({ filtering: JSON.stringify({ status: "ENABLE" }) }),
        undefined
      );
    });
  });

  describe("createEntity()", () => {
    it("calls correct POST path for campaigns", async () => {
      mockPost.mockResolvedValueOnce({ campaign_id: "1800000001" });

      const data = { campaign_name: "Test", objective_type: "TRAFFIC" };
      const result = await service.createEntity("campaign", data as any);

      expect(mockPost).toHaveBeenCalledWith("/open_api/v1.3/campaign/create/", data, undefined);
      expect(result.campaign_id).toBe("1800000001");
    });

    it("calls correct POST path for ads", async () => {
      mockPost.mockResolvedValueOnce({ ad_id: "1600000001" });

      const data = { adgroup_id: "1700000001", ad_name: "Test Ad" };
      await service.createEntity("ad", data);

      expect(mockPost).toHaveBeenCalledWith("/open_api/v1.3/ad/create/", data, undefined);
    });
  });

  describe("updateEntity()", () => {
    it("calls correct POST update path with entity ID in body", async () => {
      mockPost.mockResolvedValueOnce({});

      await service.updateEntity("campaign", "1800000001", {
        campaign_name: "Updated Name",
      });

      expect(mockPost).toHaveBeenCalledWith(
        "/open_api/v1.3/campaign/update/",
        expect.objectContaining({
          campaign_id: "1800000001",
          campaign_name: "Updated Name",
        }),
        undefined
      );
    });
  });

  describe("deleteEntity()", () => {
    it("calls correct POST delete path with IDs array", async () => {
      mockPost.mockResolvedValueOnce({});

      await service.deleteEntity("campaign", ["1800000001", "1800000002"]);

      expect(mockPost).toHaveBeenCalledWith(
        "/open_api/v1.3/campaign/delete/",
        { campaign_ids: ["1800000001", "1800000002"] },
        undefined
      );
    });
  });

  describe("updateEntityStatus()", () => {
    it("calls status update endpoint with operation_status", async () => {
      mockPost.mockResolvedValueOnce({});

      await service.updateEntityStatus("adGroup", ["1700000001", "1700000002"], "DISABLE");

      expect(mockPost).toHaveBeenCalledWith(
        "/open_api/v1.3/adgroup/status/update/",
        {
          adgroup_ids: ["1700000001", "1700000002"],
          operation_status: "DISABLE",
        },
        undefined
      );
    });

    it("supports ENABLE operation", async () => {
      mockPost.mockResolvedValueOnce({});

      await service.updateEntityStatus("campaign", ["1800000001"], "ENABLE");

      expect(mockPost).toHaveBeenCalledWith(
        "/open_api/v1.3/campaign/status/update/",
        expect.objectContaining({ operation_status: "ENABLE" }),
        undefined
      );
    });
  });

  describe("getEntity()", () => {
    it("queries by ID and returns first result", async () => {
      const mockEntity = { campaign_id: "1800000001", campaign_name: "Test" };
      mockGet.mockResolvedValueOnce({
        list: [mockEntity],
        page_info: { page: 1, page_size: 1, total_number: 1, total_page: 1 },
      });

      const result = await service.getEntity("campaign", "1800000001");
      expect(result).toEqual(mockEntity);
      expect(result.campaign_name).toBe("Test");
      expect(mockGet).toHaveBeenCalledWith(
        "/open_api/v1.3/campaign/get/",
        expect.objectContaining({
          filtering: JSON.stringify({ campaign_ids: ["1800000001"] }),
        }),
        undefined
      );
    });

    it("throws when entity not found", async () => {
      mockGet.mockResolvedValueOnce({
        list: [],
        page_info: { page: 1, page_size: 1, total_number: 0, total_page: 0 },
      });

      await expect(service.getEntity("campaign", "nonexistent-id")).rejects.toThrow("not found");
    });
  });

  describe("bulkUpdateStatus()", () => {
    it("returns success results for all entity IDs on success", async () => {
      mockPost.mockResolvedValueOnce({});

      const result = await service.bulkUpdateStatus(
        "campaign",
        ["1800000001", "1800000002"],
        "DISABLE"
      );

      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
    });

    it("returns failure results when status update throws", async () => {
      mockPost.mockRejectedValueOnce(new Error("API error"));

      const result = await service.bulkUpdateStatus("campaign", ["1800000001"], "DISABLE");

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain("API error");
    });
  });

  describe("adjustBids()", () => {
    it("reads the current ad group bid before updating it", async () => {
      mockGet.mockResolvedValueOnce({
        list: [
          {
            adgroup_id: "1700000001",
            adgroup_name: "AG 1",
            campaign_id: "1800000001",
            advertiser_id: "1900000001",
            status: "ENABLE",
            bid_price: 1.5,
          },
        ],
        page_info: { page: 1, page_size: 1, total_number: 1, total_page: 1 },
      });
      mockPost.mockResolvedValueOnce({});

      const result = await service.adjustBids([{ adGroupId: "1700000001", bidPrice: 2.25 }]);

      expect(mockPost).toHaveBeenCalledWith(
        "/open_api/v1.3/adgroup/update/",
        expect.objectContaining({
          adgroup_id: "1700000001",
          bid_price: 2.25,
        }),
        undefined
      );
      expect(result.results[0]).toEqual({
        adGroupId: "1700000001",
        success: true,
        previousBid: 1.5,
        newBid: 2.25,
      });
    });
  });

  describe("targeting tools", () => {
    it("uses official tool targeting search endpoint", async () => {
      mockPost.mockResolvedValueOnce({ list: [{ geo_id: "1", name: "Stockholm" }] });

      const result = await service.searchTargeting({
        keyword: "stockholm",
        scene: "GEO",
        placements: ["PLACEMENT_TIKTOK"],
        objective_type: "TRAFFIC",
      });

      expect(mockPost).toHaveBeenCalledWith(
        "/open_api/v1.3/tool/targeting/search/",
        {
          keyword: "stockholm",
          scene: "GEO",
          placements: ["PLACEMENT_TIKTOK"],
          objective_type: "TRAFFIC",
        },
        undefined
      );
      expect(result).toEqual({ list: [{ geo_id: "1", name: "Stockholm" }] });
    });

    it("dispatches language options to the official language endpoint", async () => {
      mockGet.mockResolvedValueOnce({ list: [{ code: "en", name: "English" }] });

      const result = await service.getTargetingOptions("LANGUAGE", {});

      expect(mockGet).toHaveBeenCalledWith("/open_api/v1.3/tool/language/", {}, undefined);
      expect(result).toEqual({ list: [{ code: "en", name: "English" }] });
    });

    it("dispatches location options to the official region endpoint", async () => {
      mockGet.mockResolvedValueOnce({ list: [{ location_id: "6252001", name: "United States" }] });

      await service.getTargetingOptions("LOCATION", {
        placements: ["PLACEMENT_TIKTOK"],
        objective_type: "TRAFFIC",
      });

      expect(mockGet).toHaveBeenCalledWith(
        "/open_api/v1.3/tool/region/",
        {
          placements: JSON.stringify(["PLACEMENT_TIKTOK"]),
          objective_type: "TRAFFIC",
        },
        undefined
      );
    });
  });
});
