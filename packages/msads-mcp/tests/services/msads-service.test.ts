import { describe, it, expect, vi, beforeEach } from "vitest";
import { MsAdsService } from "../../src/services/msads/msads-service.js";
import { MSADS_ALL_CAMPAIGN_TYPES } from "../../src/mcp-server/tools/utils/entity-mapping.js";
import type { MsAdsHttpClient } from "../../src/services/msads/msads-http-client.js";
import type { RateLimiter } from "@cesteral/shared";
import pino from "pino";

const logger = pino({ level: "silent" });

function createMockHttpClient(): MsAdsHttpClient {
  const client = {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  } as unknown as MsAdsHttpClient;
  (client as unknown as { request: typeof client.post }).request = vi.fn(
    async (method: "GET" | "POST" | "PUT" | "DELETE", path: string, data?: unknown) => {
      const verb = method.toLowerCase() as "get" | "post" | "put" | "delete";
      return (client[verb] as unknown as (...a: unknown[]) => Promise<unknown>)(path, data);
    }
  );
  return client;
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
    service = new MsAdsService(rateLimiter, httpClient, logger, { userId: "u1", customerId: "c1" });
  });

  describe("listEntities", () => {
    it("lists campaigns by account ID", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        Campaigns: [{ Id: 1, Name: "Test Campaign" }],
      });

      const result = await service.listEntities("campaign", { accountId: "123" });
      // GetCampaignsByAccountId returns Search campaigns only unless
      // CampaignType is set (getcampaignsbyaccountid.md) — every type is asked for.
      expect(httpClient.post).toHaveBeenCalledWith(
        "/Campaigns/QueryByAccountId",
        {
          AccountId: 123,
          CampaignType: "Search, Shopping, DynamicSearchAds, Audience, Hotel, PerformanceMax, App",
        },
        undefined
      );
      expect(result).toEqual({ entities: [{ Id: 1, Name: "Test Campaign" }] });
    });

    it("lets a caller narrow CampaignType through filters", async () => {
      await service.listEntities("campaign", {
        accountId: "123",
        filters: { CampaignType: "Shopping" },
      });
      expect(httpClient.post).toHaveBeenCalledWith(
        "/Campaigns/QueryByAccountId",
        { AccountId: 123, CampaignType: "Shopping" },
        undefined
      );
    });

    it("sends no CampaignType on non-campaign lists", async () => {
      await service.listEntities("adGroup", { parentId: "456" });
      const body = (httpClient.post as ReturnType<typeof vi.fn>).mock.calls[0]![1];
      expect(body).not.toHaveProperty("CampaignType");
    });

    it("lists adGroups by parent campaign ID", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        AdGroups: [{ Id: 2 }],
      });

      await service.listEntities("adGroup", { parentId: "456" });
      expect(httpClient.post).toHaveBeenCalledWith(
        "/AdGroups/QueryByCampaignId",
        { CampaignId: 456 },
        undefined
      );
    });

    it("lists keywords by parent ad group ID", async () => {
      await service.listEntities("keyword", { parentId: "789" });
      expect(httpClient.post).toHaveBeenCalledWith(
        "/Keywords/QueryByAdGroupId",
        { AdGroupId: 789 },
        undefined
      );
    });

    it("throws when campaign list is missing accountId", async () => {
      await expect(service.listEntities("campaign", {})).rejects.toThrow("requires accountId");
    });

    it("throws for entity types without list support", async () => {
      await expect(service.listEntities("budget", {})).rejects.toThrow(
        "Use getEntity with specific BudgetIds"
      );
    });
  });

  describe("getEntity", () => {
    it("gets entities by IDs", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        Campaigns: [{ Id: 1 }],
      });

      await service.getEntity("campaign", ["1", "2"], { AccountId: 123 });
      expect(httpClient.post).toHaveBeenCalledWith(
        "/Campaigns/QueryByIds",
        expect.objectContaining({ CampaignIds: [1, 2], AccountId: 123 }),
        undefined
      );
    });

    it("asks for every campaign type so a non-Search ID is not an EntityIdFilterMismatch", async () => {
      await service.getEntity("campaign", ["1"], { AccountId: 123 });
      expect(httpClient.post).toHaveBeenCalledWith(
        "/Campaigns/QueryByIds",
        { CampaignIds: [1], CampaignType: MSADS_ALL_CAMPAIGN_TYPES, AccountId: 123 },
        undefined
      );
    });

    it("throws when required query context is missing", async () => {
      await expect(service.getEntity("campaign", ["1"])).rejects.toThrow("requires AccountId");
    });
  });

  describe("createEntity", () => {
    it("creates an entity via Add operation", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        CampaignIds: [111],
      });

      const data = { AccountId: 123, Campaigns: [{ Name: "New Campaign" }] };
      await service.createEntity("campaign", data);
      expect(httpClient.post).toHaveBeenCalledWith("/Campaigns", data, undefined);
    });
  });

  describe("updateEntity", () => {
    it("updates an entity via PUT on the collection path", async () => {
      const data = { AccountId: 123, Campaigns: [{ Id: 1, Name: "Updated" }] };
      await service.updateEntity("campaign", data);
      expect(httpClient.put).toHaveBeenCalledWith("/Campaigns", data, undefined);
      expect(httpClient.post).not.toHaveBeenCalled();
    });

    it.each([
      ["campaign", "AccountId", { Campaigns: [{ Id: 1 }] }],
      ["adGroup", "CampaignId", { AdGroups: [{ Id: 1 }] }],
      ["ad", "AdGroupId", { Ads: [{ Id: 1 }] }],
      ["keyword", "AdGroupId", { Keywords: [{ Id: 1 }] }],
      ["adExtension", "AccountId", { AdExtensions: [{ Id: 1 }] }],
    ] as const)(
      "refuses a %s Update without the request-body %s",
      async (entityType, field, data) => {
        await expect(service.updateEntity(entityType, { ...data })).rejects.toThrow(
          `requires ${field}`
        );
        expect(httpClient.put).not.toHaveBeenCalled();
      }
    );

    it("sends budget updates without a parent element", async () => {
      const data = { Budgets: [{ Id: 1, Amount: 5 }] };
      await service.updateEntity("budget", data);
      expect(httpClient.put).toHaveBeenCalledWith("/Budgets", data, undefined);
    });
  });

  describe("deleteEntity", () => {
    it("deletes entities via DELETE on the collection path", async () => {
      await service.deleteEntity("campaign", ["1", "2"], { AccountId: 123 });
      expect(httpClient.delete).toHaveBeenCalledWith(
        "/Campaigns",
        expect.objectContaining({ CampaignIds: [1, 2], AccountId: 123 }),
        undefined
      );
      expect(httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe("bulkCreateEntities", () => {
    it("batches creation within batch limits", async () => {
      const items = Array.from({ length: 3 }, (_, i) => ({ Name: `Campaign ${i}` }));
      await service.bulkCreateEntities("campaign", items, undefined, "123");
      expect(httpClient.post).toHaveBeenCalledOnce();
      // AddCampaigns body = AccountId + Campaigns (addcampaigns.md).
      expect(httpClient.post).toHaveBeenCalledWith(
        "/Campaigns",
        { AccountId: 123, Campaigns: items },
        undefined
      );
    });

    it("puts the parent element in every batch body", async () => {
      const items = Array.from({ length: 51 }, (_, i) => ({ Type: "ResponsiveSearch", n: i }));
      await service.bulkCreateEntities("ad", items, undefined, "777");
      // AddAds: max 50 per call, body = AdGroupId + Ads (addads.md).
      expect(httpClient.post).toHaveBeenCalledTimes(2);
      for (const call of (httpClient.post as ReturnType<typeof vi.fn>).mock.calls) {
        expect(call[0]).toBe("/Ads");
        expect(call[1].AdGroupId).toBe(777);
      }
    });

    it("sends CampaignId for ad groups and nothing for labels", async () => {
      await service.bulkCreateEntities("adGroup", [{ Name: "g" }], undefined, "55");
      await service.bulkCreateEntities("label", [{ Name: "l" }]);
      expect(httpClient.post).toHaveBeenNthCalledWith(
        1,
        "/AdGroups",
        { CampaignId: 55, AdGroups: [{ Name: "g" }] },
        undefined
      );
      expect(httpClient.post).toHaveBeenNthCalledWith(
        2,
        "/Labels",
        { Labels: [{ Name: "l" }] },
        undefined
      );
    });

    it("refuses a keyword create without AdGroupId before calling the API", async () => {
      await expect(service.bulkCreateEntities("keyword", [{ Text: "x" }])).rejects.toThrow(
        "requires AdGroupId"
      );
      expect(httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe("bulkUpdateEntities", () => {
    it("sends the request-body parent element with each batch", async () => {
      await service.bulkUpdateEntities("keyword", [{ Id: 1, Bid: { Amount: 1 } }], undefined, "9");
      expect(httpClient.put).toHaveBeenCalledWith(
        "/Keywords",
        { AdGroupId: 9, Keywords: [{ Id: 1, Bid: { Amount: 1 } }] },
        undefined
      );
    });
  });

  describe("bulkUpdateStatus", () => {
    it("updates status for multiple entities with per-entity PUT calls", async () => {
      const result = await service.bulkUpdateStatus(
        "campaign",
        ["1", "2"],
        "Paused",
        undefined,
        "123"
      );

      // Should make one PUT call per entity, each carrying the AccountId body element
      expect(httpClient.put).toHaveBeenCalledTimes(2);
      expect(httpClient.put).toHaveBeenCalledWith(
        "/Campaigns",
        { AccountId: 123, Campaigns: [{ Id: 1, Status: "Paused" }] },
        undefined
      );
      expect(httpClient.put).toHaveBeenCalledWith(
        "/Campaigns",
        { AccountId: 123, Campaigns: [{ Id: 2, Status: "Paused" }] },
        undefined
      );

      // Should return per-entity results
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ entityId: "1", success: true });
      expect(result.results[1]).toEqual({ entityId: "2", success: true });
    });

    it("reports per-entity failures without failing the entire batch", async () => {
      (httpClient.put as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({}) // entity "1" succeeds
        .mockRejectedValueOnce(new Error("Entity 2 not found")); // entity "2" fails

      const result = await service.bulkUpdateStatus(
        "campaign",
        ["1", "2"],
        "Paused",
        undefined,
        "123"
      );

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
    it("reads via POST then writes the update via PUT", async () => {
      // Mock getEntity (getByIdsOperation) — read uses POST
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        Keywords: [{ Id: 1, Bid: { Amount: 1.5 } }],
      });
      (httpClient.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ PartialErrors: null });

      await service.adjustBids("keyword", [{ entityId: "1", bidField: "Bid", newBid: 2.0 }], {
        AdGroupId: 123,
      });

      expect(httpClient.post).toHaveBeenCalledTimes(1);
      expect(httpClient.post).toHaveBeenCalledWith(
        "/Keywords/QueryByIds",
        expect.objectContaining({ KeywordIds: [1], AdGroupId: 123 }),
        undefined
      );
      expect(httpClient.put).toHaveBeenCalledTimes(1);
      const updateCall = (httpClient.put as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(updateCall[0]).toBe("/Keywords");
      // Keyword.Bid is a Bid object (bid.md: { "Amount": double }); the Update
      // is a minimal patch plus the request-body AdGroupId (updatekeywords.md).
      expect(updateCall[1]).toEqual({
        AdGroupId: 123,
        Keywords: [{ Id: 1, Bid: { Amount: 2.0 } }],
      });
    });

    it("writes ad group CpcBid as a Bid object with the CampaignId body element", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        AdGroups: [{ Id: 7, CpcBid: { Amount: 0.5 }, Name: "g", EditorialStatus: "Active" }],
      });
      await service.adjustBids("adGroup", [{ entityId: "7", bidField: "CpcBid", newBid: 0.8 }], {
        CampaignId: 44,
      });
      const updateCall = (httpClient.put as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(updateCall[0]).toBe("/AdGroups");
      expect(updateCall[1]).toEqual({
        CampaignId: 44,
        AdGroups: [{ Id: 7, CpcBid: { Amount: 0.8 } }],
      });
    });

    it("refuses keyword bids without the AdGroupId parent", async () => {
      await expect(
        service.adjustBids("keyword", [{ entityId: "1", bidField: "Bid", newBid: 2 }], {})
      ).rejects.toThrow("requires AdGroupId");
      expect(httpClient.put).not.toHaveBeenCalled();
    });
  });

  describe("getAccountCurrency", () => {
    it("reads Account.CurrencyCode via GetAccount once per session", async () => {
      const customerClient = createMockHttpClient();
      (customerClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        Account: { Id: 42, CurrencyCode: "EUR" },
      });
      const svc = new MsAdsService(
        rateLimiter,
        httpClient,
        logger,
        { userId: "u1", customerId: "c1" },
        {
          customerClient,
          accountId: "42",
        }
      );
      await expect(svc.getAccountCurrency()).resolves.toBe("EUR");
      await expect(svc.getAccountCurrency()).resolves.toBe("EUR");
      expect(customerClient.post).toHaveBeenCalledTimes(1);
      expect(customerClient.post).toHaveBeenCalledWith(
        "/Account/Query",
        { AccountId: 42 },
        undefined
      );
    });

    it("throws without an account lookup, and retries after a failed lookup", async () => {
      await expect(service.getAccountCurrency()).rejects.toThrow("not configured");
      const customerClient = createMockHttpClient();
      (customerClient.post as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ Account: {} })
        .mockResolvedValueOnce({ Account: { CurrencyCode: "JPY" } });
      const svc = new MsAdsService(
        rateLimiter,
        httpClient,
        logger,
        { userId: "u1", customerId: "c1" },
        {
          customerClient,
          accountId: "42",
        }
      );
      await expect(svc.getAccountCurrency()).rejects.toThrow("no ISO CurrencyCode");
      await expect(svc.getAccountCurrency()).resolves.toBe("JPY");
    });
  });

  describe("executeReadOperation", () => {
    it("consumes 1 read token per user AND per customer, and POSTs to the read endpoint", async () => {
      const data = { Predicates: [] };
      await service.executeReadOperation("/Accounts/Search", data);
      expect(vi.mocked(rateLimiter.consume).mock.calls).toEqual([
        ["msads:user:u1:read", 1],
        ["msads:customer:c1:read", 1],
      ]);
      expect(httpClient.post).toHaveBeenCalledWith("/Accounts/Search", data, undefined);
    });
  });

  describe("executeOperation", () => {
    it("defaults to POST and consumes 3 write tokens per user AND per customer", async () => {
      const data = { AdExtensionIds: [1, 2] };
      await service.executeOperation("/AdExtensions/QueryByIds", data);
      expect(vi.mocked(rateLimiter.consume).mock.calls).toEqual([
        ["msads:user:u1:write", 3],
        ["msads:customer:c1:write", 3],
      ]);
      expect(httpClient.post).toHaveBeenCalledWith("/AdExtensions/QueryByIds", data);
    });

    it("dispatches PUT when caller requests it", async () => {
      const data = { Campaigns: [{ Id: 1 }] };
      await service.executeOperation("/CampaignCriterions", data, undefined, "PUT");
      expect(httpClient.put).toHaveBeenCalledWith("/CampaignCriterions", data);
    });

    it("dispatches DELETE when caller requests it", async () => {
      const data = { AdExtensionIds: [1] };
      await service.executeOperation("/AdExtensionsAssociations", data, undefined, "DELETE");
      expect(httpClient.delete).toHaveBeenCalledWith("/AdExtensionsAssociations", data);
    });

    const spec = {
      operation: "setAssociations",
      entityLabel: "ad extension associations",
      itemsField: "AdExtensionIdToEntityIdAssociations",
    };
    const twoAssociations = {
      AccountId: 1,
      AssociationType: "Campaign",
      AdExtensionIdToEntityIdAssociations: [
        { AdExtensionId: 1, EntityId: 10 },
        { AdExtensionId: 2, EntityId: 10 },
      ],
    };

    it("throws when every batch item came back in PartialErrors", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        PartialErrors: [
          { Index: 0, ErrorCode: "InvalidAdExtensionId", Code: 1, Message: "bad" },
          { Index: 1, ErrorCode: "InvalidAdExtensionId", Code: 1, Message: "bad" },
        ],
      });
      await expect(
        service.executeOperation(
          "/AdExtensionsAssociations/Set",
          twoAssociations,
          undefined,
          "POST",
          spec
        )
      ).rejects.toThrow("Microsoft Ads rejected setAssociations");
    });

    it("returns per-item counts on a partial success", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        PartialErrors: [{ Index: 1, ErrorCode: "Duplicate", Code: 2, Message: "dup" }],
      });
      const out = await service.executeOperation(
        "/AdExtensionsAssociations/Set",
        twoAssociations,
        undefined,
        "POST",
        spec
      );
      expect(out).toMatchObject({ requested: 2, succeeded: 1, failed: 1 });
      expect(out.failures).toEqual([expect.objectContaining({ index: 1, success: false })]);
    });

    it("maps NestedPartialErrors and null Add ids (criterions)", async () => {
      (httpClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        CampaignCriterionIds: [null],
        NestedPartialErrors: [
          { Index: 0, BatchErrors: [{ ErrorCode: "InvalidCriterion", Code: 3, Message: "no" }] },
        ],
      });
      await expect(
        service.executeOperation(
          "/CampaignCriterions",
          { CampaignCriterions: [{ CampaignId: 5 }], CriterionType: "Location" },
          undefined,
          "POST",
          {
            operation: "add",
            entityLabel: "campaign criterions",
            itemsField: "CampaignCriterions",
            idsField: "CampaignCriterionIds",
          }
        )
      ).rejects.toThrow("InvalidCriterion");
    });
  });
});
