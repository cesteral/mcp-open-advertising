import { describe, it, expect, vi, beforeEach } from "vitest";
import { TtdService } from "../../src/services/ttd/ttd-service.js";

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: "debug",
  } as any;
}

function createMockHttpClient() {
  return {
    fetch: vi.fn().mockResolvedValue({}),
    fetchDirect: vi.fn().mockResolvedValue({}),
    partnerId: "test-partner",
  } as any;
}

function createMockRateLimiter() {
  return {
    consume: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe("TtdService advanced methods", () => {
  let service: TtdService;
  let httpClient: ReturnType<typeof createMockHttpClient>;
  let rateLimiter: ReturnType<typeof createMockRateLimiter>;

  const TEST_GRAPHQL_URL = "https://desk.thetradedesk.com/graphql";

  beforeEach(() => {
    httpClient = createMockHttpClient();
    rateLimiter = createMockRateLimiter();
    service = new TtdService(createMockLogger(), rateLimiter, httpClient, TEST_GRAPHQL_URL);
    vi.clearAllMocks();
  });

  describe("validateEntity", () => {
    it("returns valid=true for create when API call succeeds", async () => {
      httpClient.fetch.mockResolvedValueOnce({ CampaignId: "c1" });

      const result = await service.validateEntity(
        "campaign",
        { CampaignName: "A" },
        "create"
      );

      expect(result).toEqual({ valid: true });
      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/campaign");
      expect(options.method).toBe("POST");
    });

    it("returns valid=true for update when API call succeeds", async () => {
      httpClient.fetch.mockResolvedValueOnce({ CampaignId: "c1" });

      const result = await service.validateEntity(
        "campaign",
        { CampaignName: "A" },
        "update",
        "c1"
      );

      expect(result).toEqual({ valid: true });
      const [path, , options] = httpClient.fetch.mock.calls[0];
      // TTD PUT: no ID in URL, ID injected into body
      expect(path).toBe("/campaign");
      expect(options.method).toBe("PUT");
      expect(JSON.parse(options.body)).toEqual({ CampaignId: "c1", CampaignName: "A" });
    });

    it("returns valid=false and error message when API call fails", async () => {
      httpClient.fetch.mockRejectedValueOnce(new Error("Invalid payload"));

      const result = await service.validateEntity(
        "campaign",
        { CampaignName: "" },
        "create"
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(["Invalid payload"]);
    });
  });

  describe("bulkCreateEntities", () => {
    it("returns per-item success/failure results", async () => {
      httpClient.fetch
        .mockResolvedValueOnce({ CampaignId: "c1" })
        .mockRejectedValueOnce(new Error("bad item"))
        .mockResolvedValueOnce({ CampaignId: "c3" });

      const result = await service.bulkCreateEntities("campaign", [
        { CampaignName: "one" },
        { CampaignName: "two" },
        { CampaignName: "three" },
      ]);

      expect(result.results).toHaveLength(3);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toContain("bad item");
      expect(result.results[2].success).toBe(true);
    });
  });

  describe("bulkUpdateEntities", () => {
    it("calls update endpoint for each item", async () => {
      httpClient.fetch
        .mockResolvedValueOnce({ CampaignId: "c1" })
        .mockResolvedValueOnce({ CampaignId: "c2" });

      const result = await service.bulkUpdateEntities("campaign", [
        { entityId: "c1", data: { CampaignName: "A" } },
        { entityId: "c2", data: { CampaignName: "B" } },
      ]);

      expect(result.results.every((r) => r.success)).toBe(true);
      expect(httpClient.fetch).toHaveBeenCalledTimes(2);
      // TTD PUT: no ID in URL, ID injected into body
      expect(httpClient.fetch.mock.calls[0][0]).toBe("/campaign");
      expect(httpClient.fetch.mock.calls[1][0]).toBe("/campaign");
    });
  });

  describe("archiveEntities", () => {
    it("uses read-modify-write: GET entity, set Availability=Archived, PUT full entity", async () => {
      // Single entity to keep assertion ordering simple
      httpClient.fetch
        .mockResolvedValueOnce({ CampaignId: "c1", CampaignName: "Camp1", Availability: "Available" }) // GET
        .mockResolvedValueOnce({}); // PUT result

      const result = await service.archiveEntities("campaign", ["c1"]);

      expect(result.results).toEqual([
        { entityId: "c1", success: true },
      ]);

      // GET then PUT
      expect(httpClient.fetch).toHaveBeenCalledTimes(2);
      expect(httpClient.fetch.mock.calls[0][0]).toBe("/campaign/c1");
      expect(httpClient.fetch.mock.calls[0][2].method).toBe("GET");
      expect(httpClient.fetch.mock.calls[1][0]).toBe("/campaign");
      expect(httpClient.fetch.mock.calls[1][2].method).toBe("PUT");
      const putBody = JSON.parse(httpClient.fetch.mock.calls[1][2].body);
      expect(putBody.Availability).toBe("Archived");
      expect(putBody.CampaignName).toBe("Camp1"); // preserves other fields
    });
  });

  describe("bulkUpdateStatus", () => {
    it("uses read-modify-write: GET entity, set Availability, PUT full entity", async () => {
      // GET returns full entity
      httpClient.fetch
        .mockResolvedValueOnce({ AdGroupId: "ag1", AdGroupName: "AG1", Availability: "Available" })
        .mockResolvedValueOnce({}); // PUT result

      const result = await service.bulkUpdateStatus(
        "adGroup",
        ["ag1"],
        "Paused"
      );

      expect(result.results).toEqual([{ entityId: "ag1", success: true }]);
      // GET
      expect(httpClient.fetch.mock.calls[0][0]).toBe("/adgroup/ag1");
      expect(httpClient.fetch.mock.calls[0][2].method).toBe("GET");
      // PUT (no ID in URL)
      expect(httpClient.fetch.mock.calls[1][0]).toBe("/adgroup");
      expect(httpClient.fetch.mock.calls[1][2].method).toBe("PUT");
      const putBody = JSON.parse(httpClient.fetch.mock.calls[1][2].body);
      expect(putBody.Availability).toBe("Paused");
      expect(putBody.AdGroupName).toBe("AG1"); // preserves other fields
    });
  });

  describe("adjustBids", () => {
    it("does read-modify-write for each adGroup", async () => {
      httpClient.fetch
        .mockResolvedValueOnce({
          AdGroupId: "ag1",
          RTBAttributes: { BaseBidCPM: { Amount: 1, CurrencyCode: "USD" } },
        })
        .mockResolvedValueOnce({
          AdGroupId: "ag1",
          RTBAttributes: {
            BaseBidCPM: { Amount: 2.5, CurrencyCode: "USD" },
            MaxBidCPM: { Amount: 5.0, CurrencyCode: "USD" },
          },
        });

      const result = await service.adjustBids([
        { adGroupId: "ag1", baseBidCpm: 2.5, maxBidCpm: 5.0 },
      ]);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      expect(httpClient.fetch).toHaveBeenCalledTimes(2);
      expect(httpClient.fetch.mock.calls[0][0]).toBe("/adgroup/ag1");
      expect(httpClient.fetch.mock.calls[0][2].method).toBe("GET");
      // TTD PUT: no ID in URL
      expect(httpClient.fetch.mock.calls[1][0]).toBe("/adgroup");
      expect(httpClient.fetch.mock.calls[1][2].method).toBe("PUT");
      const putBody = JSON.parse(httpClient.fetch.mock.calls[1][2].body);
      expect(putBody.RTBAttributes.BaseBidCPM.Amount).toBe(2.5);
      expect(putBody.RTBAttributes.MaxBidCPM.Amount).toBe(5);
    });
  });

  describe("graphqlQuery", () => {
    it("posts query and variables to the configured GraphQL URL via fetchDirect", async () => {
      httpClient.fetchDirect.mockResolvedValueOnce({ data: { advertiser: { id: "a1" } } });

      const result = await service.graphqlQuery(
        "query ($id: ID!) { advertiser(id: $id) { id } }",
        { id: "a1" }
      );

      expect(result).toEqual({ data: { advertiser: { id: "a1" } } });
      const [url, , options] = httpClient.fetchDirect.mock.calls[0];
      expect(url).toBe(TEST_GRAPHQL_URL);
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(body.variables.id).toBe("a1");
    });
  });
});
