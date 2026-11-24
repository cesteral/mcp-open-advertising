import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RateLimiter } from "@cesteral/shared";
import { createSpiedRateLimiter } from "../helpers/spied-rate-limiter.js";
import { LinkedInService } from "../../src/services/linkedin/linkedin-service.js";

// Mock the LinkedInHttpClient module — we provide a static encodeUrn and instance methods separately
vi.mock("../../src/services/linkedin/linkedin-http-client.js", () => ({
  LinkedInHttpClient: {
    encodeUrn: vi.fn((urn: string) => encodeURIComponent(urn)),
  },
}));

const mockHttpClient = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

let mockRateLimiter: RateLimiter;

describe("LinkedInService", () => {
  let service: LinkedInService;

  beforeEach(() => {
    mockRateLimiter = createSpiedRateLimiter();
    service = new LinkedInService(mockRateLimiter, mockHttpClient as any);
    mockHttpClient.get.mockReset();
    mockHttpClient.post.mockReset();
    mockHttpClient.patch.mockReset();
    mockHttpClient.delete.mockReset();
  });

  describe("listEntities()", () => {
    it("lists campaigns with adAccountUrn scoping", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        elements: [
          { id: 111222333, name: "Campaign A" },
          { id: 444555666, name: "Campaign B" },
        ],
        metadata: { nextPageToken: "next-1" },
      });

      const result = await service.listEntities(
        "campaign",
        "urn:li:sponsoredAccount:123456789",
        {}
      );

      expect(result.entities).toHaveLength(2);
      expect(result.nextPageToken).toBe("next-1");

      const [path, params] = mockHttpClient.get.mock.calls[0];
      // THE structural change (#210): the ad account moves out of the query
      // string and into the path, and the numeric id — not the URN — is what
      // goes there.
      expect(path).toBe("/rest/adAccounts/123456789/adCampaigns");
      expect(params).not.toHaveProperty("accounts[0]");
      expect(params).toEqual({ q: "search", pageSize: "25" });
    });

    it("sends count as pageSize and the pageToken back", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ elements: [], metadata: {} });

      const out = await service.listEntities("campaign", "urn:li:sponsoredAccount:123", {
        pageToken: "tok",
        count: 10,
      });

      const [, params] = mockHttpClient.get.mock.calls[0];
      expect(params).toEqual({ q: "search", pageSize: "10", pageToken: "tok" });
      expect(params).not.toHaveProperty("start");
      expect(params).not.toHaveProperty("count");
      expect(out.nextPageToken).toBeUndefined();
    });

    it("accepts a campaign page of 1,000 and refuses a larger one", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ elements: [], metadata: {} });
      await service.listEntities("campaign", "urn:li:sponsoredAccount:123", { count: 1000 });
      expect(mockHttpClient.get.mock.calls[0][1].pageSize).toBe("1000");

      await expect(
        service.listEntities("campaign", "urn:li:sponsoredAccount:123", { count: 1001 })
      ).rejects.toThrow(/at most 1000/);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    });

    it("refuses a creative page larger than 100", async () => {
      await expect(
        service.listEntities("creative", "urn:li:sponsoredAccount:123", { count: 101 })
      ).rejects.toThrow(/at most 100 per page/);
      expect(mockHttpClient.get).not.toHaveBeenCalled();
    });

    it("does not include accounts filter for adAccount entity type", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        elements: [{ id: 123456789 }],
        metadata: {},
      });

      await service.listEntities("adAccount", undefined, {});

      const [path, params] = mockHttpClient.get.mock.calls[0];
      expect(path).toBe("/rest/adAccounts");
      expect(params).toEqual({ q: "search", pageSize: "25" });
    });
  });

  describe("getEntity()", () => {
    it("encodes URN in path and calls GET", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ id: 111222333, name: "My Campaign" });

      const result = await service.getEntity(
        "campaign",
        "urn:li:sponsoredCampaign:111222333",
        "urn:li:sponsoredAccount:7"
      );

      expect(result).toMatchObject({ name: "My Campaign" });
      const [path] = mockHttpClient.get.mock.calls[0];
      expect(path).toBe("/rest/adAccounts/7/adCampaigns/111222333");
    });
  });

  describe("adAccount item paths", () => {
    // The versioned adAccounts resource is keyed by the NUMERIC account id —
    // LinkedIn's official python client addresses it as `/adAccounts/{id}` with
    // `path_keys={"id": 123}` and expects the path `/adAccounts/123`. This used
    // to send `/rest/adAccounts/urn%3Ali%3AsponsoredAccount%3A123`.
    const URN = "urn:li:sponsoredAccount:508915158";

    it("GETs /rest/adAccounts/{numericId}", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ id: 508915158 });
      await service.getEntity("adAccount", URN, undefined);
      expect(mockHttpClient.get.mock.calls[0][0]).toBe("/rest/adAccounts/508915158");
    });

    it("PARTIAL_UPDATEs /rest/adAccounts/{numericId}", async () => {
      mockHttpClient.patch.mockResolvedValueOnce({});
      await service.updateEntity("adAccount", URN, undefined, { name: "Renamed" });
      expect(mockHttpClient.patch.mock.calls[0][0]).toBe("/rest/adAccounts/508915158");
    });

    it("DELETEs /rest/adAccounts/{numericId}", async () => {
      mockHttpClient.delete.mockResolvedValueOnce({});
      await service.deleteEntity("adAccount", URN, undefined);
      expect(mockHttpClient.delete.mock.calls[0][0]).toBe("/rest/adAccounts/508915158");
    });

    it("accepts a bare numeric id and rejects a non-account URN", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ id: 42 });
      await service.getEntity("adAccount", "42", undefined);
      expect(mockHttpClient.get.mock.calls[0][0]).toBe("/rest/adAccounts/42");
      await expect(
        service.getEntity("adAccount", "urn:li:sponsoredCampaign:1", undefined)
      ).rejects.toThrow(/ad account URN/i);
    });

    it("addresses a creative by its encoded URN under its account", async () => {
      mockHttpClient.get.mockResolvedValueOnce({});
      await service.getEntity(
        "creative",
        "urn:li:sponsoredCreative:9",
        "urn:li:sponsoredAccount:7"
      );
      expect(mockHttpClient.get.mock.calls[0][0]).toBe(
        "/rest/adAccounts/7/creatives/urn%3Ali%3AsponsoredCreative%3A9"
      );
    });
  });

  describe("list finders and conversion-rule items", () => {
    it("lists creatives under the account with the criteria finder and a page size", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ elements: [], metadata: {} });
      const out = await service.listEntities("creative", "urn:li:sponsoredAccount:7", {
        count: 10,
      });
      const [path, params, , options] = mockHttpClient.get.mock.calls[0];
      expect(path).toBe("/rest/adAccounts/7/creatives");
      expect(params).toEqual({ q: "criteria", pageSize: "10" });
      expect(options).toEqual({ restliMethod: "FINDER" });
      expect(out.paging).toBe("cursor");
      expect(out.nextPageToken).toBeUndefined();
    });

    it("refuses a pageToken for the unpaged conversion-rule finder", async () => {
      await expect(
        service.listEntities("conversionRule", "urn:li:sponsoredAccount:7", { pageToken: "x" })
      ).rejects.toThrow(/one response/);
      expect(mockHttpClient.get).not.toHaveBeenCalled();
    });

    it("lists conversion rules with the `account` finder and no paging parameters", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ elements: [] });
      await service.listEntities("conversionRule", "urn:li:sponsoredAccount:7", { count: 50 });
      const [path, params] = mockHttpClient.get.mock.calls[0];
      expect(path).toBe("/rest/conversions");
      expect(params).toEqual({ q: "account", account: "urn:li:sponsoredAccount:7" });
    });

    it("gets a conversion rule at /rest/conversions/{id} with the account as a query parameter", async () => {
      mockHttpClient.get.mockResolvedValueOnce({});
      await service.getEntity(
        "conversionRule",
        "urn:lla:llaPartnerConversion:9",
        "urn:li:sponsoredAccount:7"
      );
      const [path, params] = mockHttpClient.get.mock.calls[0];
      expect(path).toBe("/rest/conversions/9");
      expect(params).toEqual({ account: "urn:li:sponsoredAccount:7" });
    });

    it("refuses to delete a conversion rule (LinkedIn documents no delete)", async () => {
      await expect(
        service.deleteEntity(
          "conversionRule",
          "urn:lla:llaPartnerConversion:9",
          "urn:li:sponsoredAccount:7"
        )
      ).rejects.toThrow(/documents no delete/);
      expect(mockHttpClient.delete).not.toHaveBeenCalled();
    });
  });

  describe("createEntity()", () => {
    it("posts to the correct API path", async () => {
      mockHttpClient.post.mockResolvedValueOnce({ id: 987654321 });

      const data = {
        name: "New Campaign Group",
        account: "urn:li:sponsoredAccount:123456789",
        status: "DRAFT",
      };

      const result = await service.createEntity("campaignGroup", data, undefined);

      expect(result).toEqual({ id: 987654321 });
      const [path, body] = mockHttpClient.post.mock.calls[0];
      // The account moves from the payload into the path under /rest/; the
      // payload still carries it, so adAccountUrn is optional here.
      expect(path).toBe("/rest/adAccounts/123456789/adCampaignGroups");
      expect(body).toMatchObject(data);
    });

    it("posts a creative under adAccountUrn, with no account in the body", async () => {
      mockHttpClient.post.mockResolvedValueOnce({ id: "urn:li:sponsoredCreative:1" });
      const data = {
        campaign: "urn:li:sponsoredCampaign:5",
        content: { reference: "urn:li:share:9" },
      };
      await service.createEntity("creative", data, "urn:li:sponsoredAccount:7");
      const [path, body] = mockHttpClient.post.mock.calls[0];
      expect(path).toBe("/rest/adAccounts/7/creatives");
      expect(body).toEqual(data);
    });

    it("refuses a creative create with no adAccountUrn", async () => {
      await expect(
        service.createEntity("creative", { campaign: "urn:li:sponsoredCampaign:5" }, undefined)
      ).rejects.toThrow(/Pass adAccountUrn\./);
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });
  });

  describe("updateEntity()", () => {
    it("patches the entity with encoded URN", async () => {
      mockHttpClient.patch.mockResolvedValueOnce({});

      await service.updateEntity(
        "campaign",
        "urn:li:sponsoredCampaign:111222333",
        "urn:li:sponsoredAccount:7",
        { status: "PAUSED" }
      );

      const [path, data] = mockHttpClient.patch.mock.calls[0];
      expect(path).toBe("/rest/adAccounts/7/adCampaigns/111222333");
      expect(data).toMatchObject({ status: "PAUSED" });
    });
  });

  describe("deleteEntity()", () => {
    it("sends DELETE request with encoded URN", async () => {
      mockHttpClient.delete.mockResolvedValueOnce({});

      await service.deleteEntity(
        "campaign",
        "urn:li:sponsoredCampaign:111222333",
        "urn:li:sponsoredAccount:7"
      );

      const [path] = mockHttpClient.delete.mock.calls[0];
      expect(path).toBe("/rest/adAccounts/7/adCampaigns/111222333");
    });
  });

  describe("bulkUpdateStatus()", () => {
    it("updates status for multiple entities concurrently", async () => {
      mockHttpClient.patch.mockResolvedValue({});

      const result = await service.bulkUpdateStatus(
        "campaign",
        ["urn:li:sponsoredCampaign:111", "urn:li:sponsoredCampaign:222"],
        "urn:li:sponsoredAccount:7",
        "PAUSED"
      );

      expect(result.results).toHaveLength(2);
      expect(result.results.every((r) => r.success)).toBe(true);
      expect(mockHttpClient.patch).toHaveBeenCalledTimes(2);
    });

    it("reports failures individually in results", async () => {
      mockHttpClient.patch
        .mockResolvedValueOnce({}) // First succeeds
        .mockRejectedValueOnce(new Error("Entity not found")); // Second fails

      const result = await service.bulkUpdateStatus(
        "campaign",
        ["urn:li:sponsoredCampaign:111", "urn:li:sponsoredCampaign:222"],
        "urn:li:sponsoredAccount:7",
        "PAUSED"
      );

      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toContain("Entity not found");
    });
  });
});
