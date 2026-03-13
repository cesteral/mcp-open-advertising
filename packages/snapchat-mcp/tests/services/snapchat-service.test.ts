import { describe, it, expect, vi, beforeEach } from "vitest";
import { SnapchatService } from "../../src/services/snapchat/snapchat-service.js";

const mockHttpClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

const mockRateLimiter = { consume: vi.fn().mockResolvedValue(undefined) };

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    RateLimiter: vi.fn().mockImplementation(() => mockRateLimiter),
  };
});

describe("SnapchatService", () => {
  let service: SnapchatService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SnapchatService(mockHttpClient as any, "org_123", "acct_456");
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
});
