import { beforeEach, describe, expect, it, vi } from "vitest";
import { SnapchatService } from "../../src/services/snapchat/snapchat-service.js";

/**
 * Regression tests for the P1 fixes in SnapchatService:
 * - create/bulk-create inject the parent ID the descriptions promise
 * - duplicate keeps ad_account_id on the copy
 * - a rejected single create/update surfaces Snapchat's sub-request error
 * - entity-ID operations refuse entities from another ad account
 * - keyword targeting search pages past the first page
 */

const mockHttpClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};
const mockRateLimiter = { consume: vi.fn().mockResolvedValue(undefined) };

const BOUND = "acct_456";

function campaignEnvelope(campaign: Record<string, unknown>) {
  return {
    request_status: "SUCCESS",
    campaigns: [{ sub_request_status: "SUCCESS", campaign }],
  };
}
function adSquadEnvelope(adsquad: Record<string, unknown>) {
  return { request_status: "SUCCESS", adsquads: [{ sub_request_status: "SUCCESS", adsquad }] };
}
function adEnvelope(ad: Record<string, unknown>) {
  return { request_status: "SUCCESS", ads: [{ sub_request_status: "SUCCESS", ad }] };
}

describe("SnapchatService P1 fixes", () => {
  let service: SnapchatService;

  beforeEach(() => {
    vi.resetAllMocks();
    mockRateLimiter.consume.mockResolvedValue(undefined);
    service = new SnapchatService(mockHttpClient as any, "org_123", BOUND, mockRateLimiter as any);
  });

  describe("parent-ID injection on create", () => {
    it("injects campaign_id into an ad squad create from campaignId, after checking the campaign's account", async () => {
      mockHttpClient.get.mockResolvedValueOnce(
        campaignEnvelope({ id: "c1", ad_account_id: BOUND })
      );
      mockHttpClient.post.mockResolvedValueOnce({
        request_status: "SUCCESS",
        adsquads: [{ sub_request_status: "SUCCESS", adsquad: { id: "sq1" } }],
      });

      await service.createEntity(
        "adGroup",
        { adAccountId: BOUND, campaignId: "c1" },
        { name: "S" }
      );

      expect(mockHttpClient.get).toHaveBeenCalledWith("/v1/campaigns/c1", undefined, undefined);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        "/v1/campaigns/c1/adsquads",
        { adsquads: [{ name: "S", campaign_id: "c1" }] },
        undefined
      );
    });

    it("injects ad_squad_id into an ad create from adSquadId", async () => {
      mockHttpClient.get.mockResolvedValueOnce(
        adSquadEnvelope({ id: "sq1", campaign_id: "c1", ad_account_id: BOUND })
      );
      mockHttpClient.post.mockResolvedValueOnce({
        request_status: "SUCCESS",
        ads: [{ sub_request_status: "SUCCESS", ad: { id: "ad1" } }],
      });

      await service.createEntity("ad", { adAccountId: BOUND, adSquadId: "sq1" }, { name: "A" });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        "/v1/adsquads/sq1/ads",
        { ads: [{ name: "A", ad_squad_id: "sq1" }] },
        undefined
      );
    });

    it("injects ad_account_id into a creative create", async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        request_status: "SUCCESS",
        creatives: [{ sub_request_status: "SUCCESS", creative: { id: "cr1" } }],
      });

      await service.createEntity("creative", { adAccountId: BOUND }, { name: "C" });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        `/v1/adaccounts/${BOUND}/creatives`,
        { creatives: [{ name: "C", ad_account_id: BOUND }] },
        undefined
      );
    });

    it("uses data.campaign_id for the route when campaignId is omitted (never a literal {campaignId})", async () => {
      mockHttpClient.get.mockResolvedValueOnce(
        campaignEnvelope({ id: "c9", ad_account_id: BOUND })
      );
      mockHttpClient.post.mockResolvedValueOnce({
        request_status: "SUCCESS",
        adsquads: [{ sub_request_status: "SUCCESS", adsquad: { id: "sq1" } }],
      });

      await service.createEntity(
        "adGroup",
        { adAccountId: BOUND },
        { name: "S", campaign_id: "c9" }
      );

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        "/v1/campaigns/c9/adsquads",
        { adsquads: [{ name: "S", campaign_id: "c9" }] },
        undefined
      );
    });

    it("refuses an ad squad create with no parent campaign at all", async () => {
      await expect(
        service.createEntity("adGroup", { adAccountId: BOUND }, { name: "S" })
      ).rejects.toThrow(/campaignId is required/);
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it("refuses a body parent that disagrees with the route parent", async () => {
      await expect(
        service.createEntity(
          "adGroup",
          { adAccountId: BOUND, campaignId: "c1" },
          { name: "S", campaign_id: "c2" }
        )
      ).rejects.toThrow(/data\.campaign_id 'c2' does not match campaignId 'c1'/);
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it("injects ad_account_id into every bulk-create item and rejects a conflicting item", async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [
          { sub_request_status: "SUCCESS", campaign: { id: "n1" } },
          { sub_request_status: "SUCCESS", campaign: { id: "n2" } },
        ],
      });

      await service.bulkCreateEntities("campaign", { adAccountId: BOUND }, [
        { name: "A" },
        { name: "B", ad_account_id: BOUND },
      ]);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        `/v1/adaccounts/${BOUND}/campaigns`,
        {
          campaigns: [
            { name: "A", ad_account_id: BOUND },
            { name: "B", ad_account_id: BOUND },
          ],
        },
        undefined
      );

      await expect(
        service.bulkCreateEntities("campaign", { adAccountId: BOUND }, [
          { name: "A" },
          { name: "B", ad_account_id: "acct_other" },
        ])
      ).rejects.toThrow(/items\[1\]\.ad_account_id 'acct_other'/);
    });

    it("duplicate keeps ad_account_id on the copy (it was stripped and never re-added)", async () => {
      mockHttpClient.get.mockResolvedValueOnce(
        campaignEnvelope({
          id: "c1",
          ad_account_id: BOUND,
          name: "Orig",
          status: "PAUSED",
          created_at: "x",
        })
      );
      mockHttpClient.post.mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [{ sub_request_status: "SUCCESS", campaign: { id: "c2" } }],
      });

      await service.duplicateEntity("campaign", { adAccountId: BOUND }, "c1", { name: "Copy" });

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        `/v1/adaccounts/${BOUND}/campaigns`,
        { campaigns: [{ name: "Copy", status: "PAUSED", ad_account_id: BOUND }] },
        undefined
      );
    });
  });

  describe("sub-request errors on single writes", () => {
    it("surfaces sub_request_error_message when a single create is rejected", async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        request_status: "SUCCESS",
        campaigns: [
          {
            sub_request_status: "ERROR",
            sub_request_error_message: "start_time is required",
          },
        ],
      });

      await expect(
        service.createEntity("campaign", { adAccountId: BOUND }, { name: "X" })
      ).rejects.toThrow(/Snapchat rejected the Campaign create: start_time is required/);
    });

    it("surfaces sub_request_error_message when a single update is rejected", async () => {
      mockHttpClient.get.mockResolvedValueOnce(
        campaignEnvelope({ id: "c1", ad_account_id: BOUND })
      );
      mockHttpClient.put.mockResolvedValueOnce({
        request_status: "PARTIAL",
        campaigns: [{ sub_request_status: "ERROR", sub_request_error_message: "budget too low" }],
      });

      await expect(
        service.updateEntity("campaign", "c1", { adAccountId: BOUND }, { daily_budget_micro: 1 })
      ).rejects.toThrow(/Campaign c1 update: budget too low/);
    });

    it("errors instead of returning undefined when the create response has no result", async () => {
      mockHttpClient.post.mockResolvedValueOnce({ request_status: "SUCCESS", campaigns: [] });

      await expect(
        service.createEntity("campaign", { adAccountId: BOUND }, { name: "X" })
      ).rejects.toThrow(/no 'campaigns' sub-request result/);
    });
  });

  describe("ad-account ownership of entity-ID operations", () => {
    it("refuses to return a campaign that belongs to another ad account", async () => {
      mockHttpClient.get.mockResolvedValueOnce(
        campaignEnvelope({ id: "c1", ad_account_id: "acct_other" })
      );

      await expect(service.getEntity("campaign", "c1")).rejects.toThrow(
        /belongs to ad account 'acct_other', not this session's ad account 'acct_456'/
      );
    });

    it("walks ad -> ad squad -> campaign to find an ad's account, and memoizes the walk", async () => {
      mockHttpClient.get
        .mockResolvedValueOnce(adEnvelope({ id: "ad1", ad_squad_id: "sq1" }))
        .mockResolvedValueOnce(adSquadEnvelope({ id: "sq1", campaign_id: "c1" }))
        .mockResolvedValueOnce(campaignEnvelope({ id: "c1", ad_account_id: "acct_other" }));

      await expect(service.getEntity("ad", "ad1")).rejects.toThrow(/Ad ad1 belongs to ad account/);
      expect(mockHttpClient.get).toHaveBeenNthCalledWith(
        2,
        "/v1/adsquads/sq1",
        undefined,
        undefined
      );
      expect(mockHttpClient.get).toHaveBeenNthCalledWith(
        3,
        "/v1/campaigns/c1",
        undefined,
        undefined
      );

      // A second ad in the same squad needs no further parent reads.
      mockHttpClient.get.mockResolvedValueOnce(adEnvelope({ id: "ad2", ad_squad_id: "sq1" }));
      await expect(service.getEntity("ad", "ad2")).rejects.toThrow(/Ad ad2 belongs to ad account/);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(4);
    });

    it("returns an entity with no account-linking field (cannot determine ownership)", async () => {
      mockHttpClient.get.mockResolvedValueOnce(campaignEnvelope({ id: "c1", name: "n" }));
      await expect(service.getEntity("campaign", "c1")).resolves.toMatchObject({ id: "c1" });
    });

    it("never issues the DELETE for an entity from another ad account", async () => {
      mockHttpClient.get.mockResolvedValueOnce(
        adSquadEnvelope({ id: "sq1", campaign_id: "c1", ad_account_id: "acct_other" })
      );

      await expect(service.deleteEntity("adGroup", "sq1")).rejects.toThrow(/belongs to ad account/);
      expect(mockHttpClient.delete).not.toHaveBeenCalled();
    });

    it("refuses the creative preview for a creative from another ad account", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        request_status: "SUCCESS",
        creatives: [
          { sub_request_status: "SUCCESS", creative: { id: "cr1", ad_account_id: "acct_other" } },
        ],
      });

      await expect(service.getCreativePreview("cr1")).rejects.toThrow(/belongs to ad account/);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    });

    it("refuses an update whose pre-read shows another account, without sending the PUT", async () => {
      mockHttpClient.get.mockResolvedValueOnce(
        campaignEnvelope({ id: "c1", ad_account_id: "acct_other" })
      );

      await expect(
        service.updateEntity("campaign", "c1", { adAccountId: BOUND }, { name: "x" })
      ).rejects.toThrow(/belongs to ad account/);
      expect(mockHttpClient.put).not.toHaveBeenCalled();
    });

    it("refuses an ad squad create under a campaign from another ad account", async () => {
      mockHttpClient.get.mockResolvedValueOnce(
        campaignEnvelope({ id: "c1", ad_account_id: "acct_other" })
      );

      await expect(
        service.createEntity("adGroup", { adAccountId: BOUND, campaignId: "c1" }, { name: "S" })
      ).rejects.toThrow(/belongs to ad account/);
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });
  });

  describe("keyword targeting search", () => {
    function page(names: string[], next?: string) {
      return {
        request_status: "SUCCESS",
        targeting_dimensions: names.map((name, i) => ({
          sub_request_status: "SUCCESS",
          scls: { id: `${name}_${i}`, name },
        })),
        paging: next ? { next_link: next } : {},
      };
    }

    it("finds a match that is only on the second page", async () => {
      mockHttpClient.get
        .mockResolvedValueOnce(page(["Adventure"], "https://adsapi.snapchat.com/next?c=2"))
        .mockResolvedValueOnce(page(["Gaming Fans"]));

      const result = await service.searchTargeting("interests_slc", "us", "gaming", 20);

      expect(result.results).toEqual([{ id: "Gaming Fans_0", name: "Gaming Fans" }]);
      expect(result.pagesScanned).toBe(2);
      expect(result.searchedAllPages).toBe(true);
      expect(mockHttpClient.get).toHaveBeenNthCalledWith(
        2,
        "https://adsapi.snapchat.com/next?c=2",
        {},
        undefined
      );
    });

    it("stops at the page cap and reports that pages were left unsearched", async () => {
      mockHttpClient.get.mockResolvedValue(page(["Nothing"], "https://adsapi.snapchat.com/next"));

      const result = await service.searchTargeting("interests_slc", "us", "gaming", 20);

      expect(result.results).toEqual([]);
      expect(result.pagesScanned).toBe(5);
      expect(result.searchedAllPages).toBe(false);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(5);
    });

    it("stops paging once enough matches are found", async () => {
      mockHttpClient.get.mockResolvedValueOnce(
        page(["gaming a", "gaming b"], "https://adsapi.snapchat.com/next")
      );

      const result = await service.searchTargeting("interests_slc", "us", "gaming", 2);

      expect(result.results).toHaveLength(2);
      expect(result.searchedAllPages).toBe(false);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    });
  });
});
