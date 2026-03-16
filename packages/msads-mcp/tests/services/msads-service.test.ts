import { describe, it, expect, vi, beforeEach } from "vitest";
import { MsAdsService } from "../../src/services/msads/msads-service.js";
import type { MsAdsHttpClient } from "../../src/services/msads/msads-http-client.js";
import type { RateLimiter } from "@cesteral/shared";
import pino from "pino";

const logger = pino({ level: "silent" });

function createMockHttpClient(): MsAdsHttpClient {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  } as unknown as MsAdsHttpClient;
}

function createMockRateLimiter(): RateLimiter {
  return { consume: vi.fn().mockResolvedValue(undefined) } as unknown as RateLimiter;
}

describe("MsAdsService", () => {
  let service: MsAdsService;
  let httpClient: MsAdsHttpClient;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    vi.clearAllMocks();
    httpClient = createMockHttpClient();
    rateLimiter = createMockRateLimiter();
    service = new MsAdsService(rateLimiter, httpClient, logger);
  });

  describe("listEntities", () => {
    it("lists campaigns by account ID", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        Campaigns: [{ Id: 1, Name: "Test Campaign" }],
      });

      const result = await service.listEntities("campaign", { accountId: "acct-123" });
      expect(httpClient.post).toHaveBeenCalledWith(
        "/Campaigns/GetByAccountId",
        { AccountId: "acct-123" },
        undefined
      );
      expect(result).toEqual({ Campaigns: [{ Id: 1, Name: "Test Campaign" }] });
    });

    it("lists adGroups by parent campaign ID", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        AdGroups: [{ Id: 2 }],
      });

      await service.listEntities("adGroup", { parentId: "camp-456" });
      expect(httpClient.post).toHaveBeenCalledWith(
        "/AdGroups/GetByCampaignId",
        { CampaignId: "camp-456" },
        undefined
      );
    });

    it("lists keywords by parent ad group ID", async () => {
      await service.listEntities("keyword", { parentId: "ag-789" });
      expect(httpClient.post).toHaveBeenCalledWith(
        "/Keywords/GetByAdGroupId",
        { AdGroupId: "ag-789" },
        undefined
      );
    });

    it("throws for entity types without list support", async () => {
      await expect(
        service.listEntities("budget", {})
      ).rejects.toThrow("does not support listing");
    });
  });

  describe("getEntity", () => {
    it("gets entities by IDs", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        Campaigns: [{ Id: 1 }],
      });

      await service.getEntity("campaign", ["1", "2"]);
      expect(httpClient.post).toHaveBeenCalledWith(
        "/Campaigns/GetByIds",
        expect.objectContaining({ CampaignIds: [1, 2] }),
        undefined
      );
    });
  });

  describe("createEntity", () => {
    it("creates an entity via Add operation", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        CampaignIds: [111],
      });

      const data = { Campaigns: [{ Name: "New Campaign" }] };
      await service.createEntity("campaign", data);
      expect(httpClient.post).toHaveBeenCalledWith("/Campaigns/Add", data, undefined);
    });
  });

  describe("updateEntity", () => {
    it("updates an entity via Update operation", async () => {
      const data = { Campaigns: [{ Id: 1, Name: "Updated" }] };
      await service.updateEntity("campaign", data);
      expect(httpClient.post).toHaveBeenCalledWith("/Campaigns/Update", data, undefined);
    });
  });

  describe("deleteEntity", () => {
    it("deletes entities by IDs", async () => {
      await service.deleteEntity("campaign", ["1", "2"]);
      expect(httpClient.post).toHaveBeenCalledWith(
        "/Campaigns/Delete",
        expect.objectContaining({ CampaignIds: [1, 2] }),
        undefined
      );
    });
  });

  describe("bulkCreateEntities", () => {
    it("batches creation within batch limits", async () => {
      const items = Array.from({ length: 3 }, (_, i) => ({ Name: `Campaign ${i}` }));
      await service.bulkCreateEntities("campaign", items);
      expect(httpClient.post).toHaveBeenCalledOnce();
      expect(httpClient.post).toHaveBeenCalledWith(
        "/Campaigns/Add",
        { Campaigns: items },
        undefined
      );
    });
  });

  describe("bulkUpdateStatus", () => {
    it("updates status for multiple entities with per-entity calls", async () => {
      const result = await service.bulkUpdateStatus("campaign", ["1", "2"], "Paused");

      // Should make one call per entity
      expect(httpClient.post).toHaveBeenCalledTimes(2);
      expect(httpClient.post).toHaveBeenCalledWith(
        "/Campaigns/Update",
        { Campaigns: [{ Id: 1, Status: "Paused" }] },
        undefined
      );
      expect(httpClient.post).toHaveBeenCalledWith(
        "/Campaigns/Update",
        { Campaigns: [{ Id: 2, Status: "Paused" }] },
        undefined
      );

      // Should return per-entity results
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ entityId: "1", success: true });
      expect(result.results[1]).toEqual({ entityId: "2", success: true });
    });

    it("reports per-entity failures without failing the entire batch", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({}) // entity "1" succeeds
        .mockRejectedValueOnce(new Error("Entity 2 not found")); // entity "2" fails

      const result = await service.bulkUpdateStatus("campaign", ["1", "2"], "Paused");

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ entityId: "1", success: true });
      expect(result.results[1]).toEqual({
        entityId: "2",
        success: false,
        error: "Entity 2 not found",
      });
    });
  });

  describe("adjustBids", () => {
    it("performs read-modify-write bid adjustment", async () => {
      // Mock getEntity (getByIdsOperation)
      (httpClient.post as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          Keywords: [{ Id: 1, Bid: { Amount: 1.50 } }],
        })
        .mockResolvedValueOnce({ PartialErrors: null });

      await service.adjustBids("keyword", [
        { entityId: "1", bidField: "Bid", newBid: 2.0 },
      ]);

      // First call: getByIds, second call: update
      expect(httpClient.post).toHaveBeenCalledTimes(2);
      const updateCall = (httpClient.post as ReturnType<typeof vi.fn>).mock.calls[1]!;
      expect(updateCall[0]).toBe("/Keywords/Update");
      expect(updateCall[1].Keywords[0].Bid).toBe(2.0);
    });
  });

  describe("executeReadOperation", () => {
    it("consumes msads:read with cost 1", async () => {
      const data = { Query: "New York", MaxResults: 25 };
      await service.executeReadOperation("/LocationTarget/Search", data);
      expect(rateLimiter.consume).toHaveBeenCalledWith("msads:read");
      expect(httpClient.post).toHaveBeenCalledWith("/LocationTarget/Search", data, undefined);
    });
  });

  describe("executeOperation", () => {
    it("consumes msads:write with cost 3", async () => {
      const data = { AdExtensionIds: [1, 2] };
      await service.executeOperation("/AdExtensions/GetByIds", data);
      expect(rateLimiter.consume).toHaveBeenCalledWith("msads:write", 3);
      expect(httpClient.post).toHaveBeenCalledWith("/AdExtensions/GetByIds", data, undefined);
    });
  });
});
