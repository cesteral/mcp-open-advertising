import { describe, it, expect, vi, beforeEach } from "vitest";
import { SnapchatService } from "../../src/services/snapchat/snapchat-service.js";

const mockHttpClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

const mockRateLimiter = { consume: vi.fn().mockResolvedValue(undefined) };

describe("SnapchatService", () => {
  let service: SnapchatService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SnapchatService(mockHttpClient as any, "org_123", "acct_456", mockRateLimiter as any);
  });

  describe("listEntities", () => {
    it("interpolates adAccountId into campaign listPath", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [{ sub_request_status: "SUCCESS", campaign: { id: "c1", name: "Test" } }],
        paging: {},
      });
      const result = await service.listEntities("campaign", { adAccountId: "acct_456" });
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/v1/adaccounts/acct_456/campaigns",
        {},
        undefined
      );
      expect(result.entities[0]).toEqual({ id: "c1", name: "Test" });
    });

    it("interpolates campaignId into adGroup listPath", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        request_status: "SUCCESS",
        adsquads: [{ sub_request_status: "SUCCESS", adsquad: { id: "sq1", name: "Squad" } }],
        paging: {},
      });
      await service.listEntities("adGroup", { adAccountId: "acct_456", campaignId: "c1" });
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/v1/campaigns/c1/adsquads",
        {},
        undefined
      );
    });

    it("passes cursor in params when provided", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [],
        paging: { cursor: "next_cursor_123" },
      });
      await service.listEntities("campaign", { adAccountId: "acct_456" }, "cursor_abc");
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/v1/adaccounts/acct_456/campaigns",
        { cursor: "cursor_abc" },
        undefined
      );
    });
  });

  describe("getEntity", () => {
    it("calls entity-specific GET path with entityId interpolated", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [{ sub_request_status: "SUCCESS", campaign: { id: "c1", name: "Test" } }],
      });
      const result = await service.getEntity("campaign", "c1");
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/v1/campaigns/c1",
        undefined,
        undefined
      );
      expect((result as any).id).toBe("c1");
    });
  });

  describe("createEntity", () => {
    it("sends POST with Snapchat envelope body and interpolated createPath", async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [{ sub_request_status: "SUCCESS", campaign: { id: "new_c", name: "New" } }],
      });
      const result = await service.createEntity("campaign", { adAccountId: "acct_456" }, { name: "New", objective: "AWARENESS" });
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        "/v1/adaccounts/acct_456/campaigns",
        { campaigns: [{ name: "New", objective: "AWARENESS" }] },
        undefined
      );
      expect((result as any).id).toBe("new_c");
    });
  });

  describe("updateEntity", () => {
    it("sends PUT to entity-specific updatePath with entityId", async () => {
      mockHttpClient.put.mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [{ sub_request_status: "SUCCESS", campaign: { id: "c1", name: "Updated" } }],
      });
      await service.updateEntity("campaign", "c1", { adAccountId: "acct_456" }, { name: "Updated" });
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        "/v1/campaigns/c1",
        { campaigns: [{ id: "c1", name: "Updated" }] },
        undefined
      );
    });
  });

  describe("deleteEntity", () => {
    it("sends DELETE to entity-specific path with entityId interpolated", async () => {
      mockHttpClient.delete.mockResolvedValueOnce({ request_status: "SUCCESS" });
      await service.deleteEntity("campaign", "c1");
      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        "/v1/campaigns/c1",
        undefined,
        undefined
      );
    });
  });

  describe("updateEntityStatus", () => {
    it("sends PUT with status update to entity path", async () => {
      mockHttpClient.put.mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [{ sub_request_status: "SUCCESS", campaign: { id: "c1", status: "PAUSED" } }],
      });
      await service.updateEntityStatus("campaign", "c1", "PAUSED");
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        "/v1/campaigns/c1",
        { campaigns: [{ id: "c1", status: "PAUSED" }] },
        undefined
      );
    });
  });

  describe("listAdAccounts", () => {
    it("unwraps adaccounts envelope and returns entities", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        request_status: "SUCCESS",
        adaccounts: [
          { adaccount: { id: "acct_1", name: "Account 1" } },
          { adaccount: { id: "acct_2", name: "Account 2" } },
        ],
        paging: { cursor: "next_page" },
      });
      const result = await service.listAdAccounts();
      expect(result.entities).toEqual([
        { id: "acct_1", name: "Account 1" },
        { id: "acct_2", name: "Account 2" },
      ]);
      expect(result.nextCursor).toBe("next_page");
    });

    it("returns empty array when no adaccounts key present", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ request_status: "SUCCESS" });
      const result = await service.listAdAccounts();
      expect(result.entities).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });
  });

  describe("getAdPreviews", () => {
    it("calls the preview endpoint with adAccountId and adFormat", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ previews: [{ html: "<div/>" }] });
      await service.getAdPreviews("acct_456", "ad_1", "FEED");
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/v1/adaccounts/acct_456/ads/ad_1/previews",
        { ad_format: "FEED" },
        undefined
      );
    });

    it("omits ad_format param when not provided", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ previews: [] });
      await service.getAdPreviews("acct_456", "ad_1", undefined);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/v1/adaccounts/acct_456/ads/ad_1/previews",
        undefined,
        undefined
      );
    });
  });

  describe("bulkCreateEntities", () => {
    it("sends all items in a single POST and maps results by position", async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [
          { sub_request_status: "SUCCESS", campaign: { id: "c1", name: "A" } },
          { sub_request_status: "SUCCESS", campaign: { id: "c2", name: "B" } },
        ],
      });
      const result = await service.bulkCreateEntities(
        "campaign",
        { adAccountId: "acct_456" },
        [{ name: "A" }, { name: "B" }]
      );
      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
      expect(result.results).toEqual([
        { success: true, entity: { id: "c1", name: "A" } },
        { success: true, entity: { id: "c2", name: "B" } },
      ]);
    });

    it("preserves position when some subrequests fail", async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [
          { sub_request_status: "FAILED", sub_request_error_message: "Invalid name" },
          { sub_request_status: "SUCCESS", campaign: { id: "c2", name: "B" } },
        ],
      });
      const result = await service.bulkCreateEntities(
        "campaign",
        { adAccountId: "acct_456" },
        [{ name: "" }, { name: "B" }]
      );
      expect(result.results[0]).toEqual({ success: false, error: "Invalid name" });
      expect(result.results[1]).toEqual({ success: true, entity: { id: "c2", name: "B" } });
    });
  });

  describe("bulkUpdateEntities", () => {
    it("sends single PUT to collection path and maps results by position", async () => {
      mockHttpClient.put.mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [
          { sub_request_status: "SUCCESS", campaign: { id: "c1", name: "Updated A" } },
          { sub_request_status: "FAILED", sub_request_error_message: "Budget too low" },
          { sub_request_status: "SUCCESS", campaign: { id: "c3", name: "Updated C" } },
        ],
      });
      const result = await service.bulkUpdateEntities("campaign", [
        { entityId: "c1", data: { name: "Updated A" } },
        { entityId: "c2", data: { name: "Updated B" } },
        { entityId: "c3", data: { name: "Updated C" } },
      ]);
      expect(mockHttpClient.put).toHaveBeenCalledTimes(1);
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        "/v1/campaigns",
        { campaigns: [
          { id: "c1", name: "Updated A" },
          { id: "c2", name: "Updated B" },
          { id: "c3", name: "Updated C" },
        ] },
        undefined
      );
      expect(result.results[0]).toEqual({ entityId: "c1", success: true, error: undefined });
      expect(result.results[1]).toEqual({ entityId: "c2", success: false, error: "Budget too low" });
      expect(result.results[2]).toEqual({ entityId: "c3", success: true, error: undefined });
    });
  });

  describe("bulkUpdateStatus", () => {
    it("sends single PUT to collection path", async () => {
      mockHttpClient.put.mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [
          { sub_request_status: "SUCCESS", campaign: { id: "c1", status: "PAUSED" } },
          { sub_request_status: "SUCCESS", campaign: { id: "c2", status: "PAUSED" } },
        ],
      });
      const result = await service.bulkUpdateStatus("campaign", ["c1", "c2"], "PAUSED");
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        "/v1/campaigns",
        { campaigns: [{ id: "c1", status: "PAUSED" }, { id: "c2", status: "PAUSED" }] },
        undefined
      );
      expect(result.results).toEqual([
        { entityId: "c1", success: true, error: undefined },
        { entityId: "c2", success: true, error: undefined },
      ]);
    });

    it("reports failures at correct positions in mixed results", async () => {
      mockHttpClient.put.mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [
          { sub_request_status: "SUCCESS", campaign: { id: "c1", status: "PAUSED" } },
          { sub_request_status: "FAILED", sub_request_error_message: "Not found" },
          { sub_request_status: "SUCCESS", campaign: { id: "c3", status: "PAUSED" } },
        ],
      });
      const result = await service.bulkUpdateStatus("campaign", ["c1", "c2", "c3"], "PAUSED");
      expect(result.results[0].success).toBe(true);
      expect(result.results[1]).toEqual({ entityId: "c2", success: false, error: "Not found" });
      expect(result.results[2].success).toBe(true);
    });
  });
});
