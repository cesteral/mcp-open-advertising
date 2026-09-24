import { describe, it, expect, vi, beforeEach } from "vitest";
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

const mockRateLimiter = {
  consume: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
};

describe("LinkedInService", () => {
  let service: LinkedInService;

  beforeEach(() => {
    service = new LinkedInService(mockRateLimiter as any, mockHttpClient as any);
    mockHttpClient.get.mockReset();
    mockHttpClient.post.mockReset();
    mockHttpClient.patch.mockReset();
    mockHttpClient.delete.mockReset();
    mockRateLimiter.consume.mockReset().mockResolvedValue(undefined);
  });

  describe("listEntities()", () => {
    it("lists campaigns with adAccountUrn scoping", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        elements: [
          { id: 111222333, name: "Campaign A" },
          { id: 444555666, name: "Campaign B" },
        ],
        paging: { count: 2, start: 0, total: 2 },
      });

      const result = await service.listEntities("campaign", "urn:li:sponsoredAccount:123456789");

      expect(result.entities).toHaveLength(2);
      expect(result.total).toBe(2);

      const [path, params] = mockHttpClient.get.mock.calls[0];
      // THE structural change (#210): the ad account moves out of the query
      // string and into the path, and the numeric id — not the URN — is what
      // goes there.
      expect(path).toBe("/rest/adAccounts/123456789/adCampaigns");
      expect(params).not.toHaveProperty("accounts[0]");
      expect(params).toMatchObject({
        q: "search",
      });
    });

    it("respects start and count pagination params", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        elements: [],
        paging: { count: 0, start: 50, total: 50 },
      });

      await service.listEntities("campaign", "urn:li:sponsoredAccount:123", 50, 10);

      const [, params] = mockHttpClient.get.mock.calls[0];
      expect(params.start).toBe("50");
      expect(params.count).toBe("10");
    });

    it("caps count at 100", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ elements: [], paging: {} });

      await service.listEntities("campaign", "urn:li:sponsoredAccount:123", 0, 200);

      const [, params] = mockHttpClient.get.mock.calls[0];
      expect(parseInt(params.count, 10)).toBeLessThanOrEqual(100);
    });

    it("does not include accounts filter for adAccount entity type", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        elements: [{ id: 123456789 }],
        paging: { count: 1, start: 0, total: 1 },
      });

      await service.listEntities("adAccount");

      const [path, params] = mockHttpClient.get.mock.calls[0];
      expect(path).toBe("/rest/adAccounts");
      expect(params).not.toHaveProperty("accounts[0]");
    });
  });

  describe("getEntity()", () => {
    it("encodes URN in path and calls GET", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ id: 111222333, name: "My Campaign" });

      const result = await service.getEntity("campaign", "urn:li:sponsoredCampaign:111222333");

      expect(result).toMatchObject({ name: "My Campaign" });
      const [path] = mockHttpClient.get.mock.calls[0];
      expect(path).toContain("/v2/adCampaigns/");
      expect(path).toContain(encodeURIComponent("urn:li:sponsoredCampaign:111222333"));
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
      await service.getEntity("adAccount", URN);
      expect(mockHttpClient.get.mock.calls[0][0]).toBe("/rest/adAccounts/508915158");
    });

    it("PARTIAL_UPDATEs /rest/adAccounts/{numericId}", async () => {
      mockHttpClient.patch.mockResolvedValueOnce({});
      await service.updateEntity("adAccount", URN, { name: "Renamed" });
      expect(mockHttpClient.patch.mock.calls[0][0]).toBe("/rest/adAccounts/508915158");
    });

    it("DELETEs /rest/adAccounts/{numericId}", async () => {
      mockHttpClient.delete.mockResolvedValueOnce({});
      await service.deleteEntity("adAccount", URN);
      expect(mockHttpClient.delete.mock.calls[0][0]).toBe("/rest/adAccounts/508915158");
    });

    it("accepts a bare numeric id and rejects a non-account URN", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ id: 42 });
      await service.getEntity("adAccount", "42");
      expect(mockHttpClient.get.mock.calls[0][0]).toBe("/rest/adAccounts/42");
      await expect(service.getEntity("adAccount", "urn:li:sponsoredCampaign:1")).rejects.toThrow(
        /ad account URN/i
      );
    });

    it("leaves the other entity types on their encoded-URN item paths", async () => {
      mockHttpClient.get.mockResolvedValueOnce({});
      await service.getEntity("creative", "urn:li:sponsoredCreative:9");
      expect(mockHttpClient.get.mock.calls[0][0]).toBe(
        "/v2/adCreatives/urn%3Ali%3AsponsoredCreative%3A9"
      );
    });
  });

  describe("legacy list scoping params", () => {
    it("scopes creatives with a Rest.li 2.0 list, not the 1.0 `accounts[0]` key", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ elements: [] });
      await service.listEntities("creative", "urn:li:sponsoredAccount:7");
      const [path, params] = mockHttpClient.get.mock.calls[0];
      expect(path).toBe("/v2/adCreatives");
      expect(params.accounts).toEqual(["urn:li:sponsoredAccount:7"]);
      expect(Object.keys(params)).not.toContain("accounts[0]");
    });

    it("scopes conversion rules with a scalar `account`", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ elements: [] });
      await service.listEntities("conversionRule", "urn:li:sponsoredAccount:7");
      const [, params] = mockHttpClient.get.mock.calls[0];
      expect(params.account).toBe("urn:li:sponsoredAccount:7");
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

      const result = await service.createEntity("campaignGroup", data);

      expect(result).toEqual({ id: 987654321 });
      const [path, body] = mockHttpClient.post.mock.calls[0];
      // The account moves from the payload into the path under /rest/. The
      // payload still carries it, which is why create could migrate without a
      // new tool parameter.
      expect(path).toBe("/rest/adAccounts/123456789/adCampaignGroups");
      expect(body).toMatchObject(data);
    });
  });

  describe("updateEntity()", () => {
    it("patches the entity with encoded URN", async () => {
      mockHttpClient.patch.mockResolvedValueOnce({});

      await service.updateEntity("campaign", "urn:li:sponsoredCampaign:111222333", {
        status: "PAUSED",
      });

      const [path, data] = mockHttpClient.patch.mock.calls[0];
      expect(path).toContain(encodeURIComponent("urn:li:sponsoredCampaign:111222333"));
      expect(data).toMatchObject({ status: "PAUSED" });
    });
  });

  describe("deleteEntity()", () => {
    it("sends DELETE request with encoded URN", async () => {
      mockHttpClient.delete.mockResolvedValueOnce({});

      await service.deleteEntity("campaign", "urn:li:sponsoredCampaign:111222333");

      const [path] = mockHttpClient.delete.mock.calls[0];
      expect(path).toContain(encodeURIComponent("urn:li:sponsoredCampaign:111222333"));
    });
  });

  describe("listAdAccounts()", () => {
    it("calls the adAccounts endpoint", async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        elements: [{ id: 123456789, name: "My Ad Account" }],
        paging: { count: 1, start: 0, total: 1 },
      });

      const result = await service.listAdAccounts();

      expect(result.accounts).toHaveLength(1);
      const [path] = mockHttpClient.get.mock.calls[0];
      expect(path).toBe("/rest/adAccounts");
    });
  });

  describe("bulkUpdateStatus()", () => {
    it("updates status for multiple entities concurrently", async () => {
      mockHttpClient.patch.mockResolvedValue({});

      const result = await service.bulkUpdateStatus(
        "campaign",
        ["urn:li:sponsoredCampaign:111", "urn:li:sponsoredCampaign:222"],
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
        "PAUSED"
      );

      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toContain("Entity not found");
    });
  });
});
