import { describe, it, expect, vi, beforeEach } from "vitest";
import { MsAdsService } from "../../src/services/msads/msads-service.js";
import type { MsAdsHttpClient } from "../../src/services/msads/msads-http-client.js";
import pino from "pino";

const logger = pino({ level: "silent" });

function createMockHttpClient(): MsAdsHttpClient {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  } as unknown as MsAdsHttpClient;
}

describe("MsAdsService", () => {
  let service: MsAdsService;
  let httpClient: MsAdsHttpClient;

  beforeEach(() => {
    vi.clearAllMocks();
    httpClient = createMockHttpClient();
    service = new MsAdsService(httpClient, logger);
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
    it("updates status for multiple entities", async () => {
      await service.bulkUpdateStatus("campaign", ["1", "2"], "Paused");
      expect(httpClient.post).toHaveBeenCalledWith(
        "/Campaigns/Update",
        {
          Campaigns: [
            { Id: 1, Status: "Paused" },
            { Id: 2, Status: "Paused" },
          ],
        },
        undefined
      );
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

  describe("executeOperation", () => {
    it("executes a custom operation", async () => {
      const data = { AdExtensionIds: [1, 2] };
      await service.executeOperation("/AdExtensions/GetByIds", data);
      expect(httpClient.post).toHaveBeenCalledWith("/AdExtensions/GetByIds", data, undefined);
    });
  });
});
