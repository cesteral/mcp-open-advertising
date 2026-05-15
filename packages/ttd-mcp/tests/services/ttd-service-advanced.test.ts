import { describe, it, expect, vi, beforeEach } from "vitest";
import { TtdService } from "../../src/services/ttd/ttd-service.js";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";

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

  describe("testCreateOrUpdate", () => {
    it("returns valid=true for create when API call succeeds", async () => {
      httpClient.fetch.mockResolvedValueOnce({ CampaignId: "c1" });

      const result = await service.testCreateOrUpdate("campaign", { CampaignName: "A" }, "create");

      expect(result).toEqual({ valid: true });
      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/campaign");
      expect(options.method).toBe("POST");
    });

    it("returns valid=true for update when API call succeeds", async () => {
      httpClient.fetch.mockResolvedValueOnce({ CampaignId: "c1" });

      const result = await service.testCreateOrUpdate(
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
      httpClient.fetch.mockRejectedValueOnce(
        new McpError(JsonRpcErrorCode.InvalidRequest, "Invalid payload")
      );

      const result = await service.testCreateOrUpdate("campaign", { CampaignName: "" }, "create");

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
    it("partial PUT only: sends {idField, Availability:'Archived'} — no GET round-trip", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      const result = await service.archiveEntities("campaign", ["c1"]);

      expect(result.results).toEqual([{ entityId: "c1", success: true }]);

      // Single call — partial PUT, no GET (TTD deprecates fields silently;
      // round-tripping the full entity causes 410 Gone).
      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      expect(httpClient.fetch.mock.calls[0][0]).toBe("/campaign");
      expect(httpClient.fetch.mock.calls[0][2].method).toBe("PUT");
      const putBody = JSON.parse(httpClient.fetch.mock.calls[0][2].body);
      expect(putBody).toEqual({ CampaignId: "c1", Availability: "Archived" });
    });
  });

  describe("bulkUpdateStatus", () => {
    it("partial PUT only: sends {idField, Availability}", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      const result = await service.bulkUpdateStatus("adGroup", ["ag1"], "Paused");

      expect(result.results).toEqual([{ entityId: "ag1", success: true }]);
      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      expect(httpClient.fetch.mock.calls[0][0]).toBe("/adgroup");
      expect(httpClient.fetch.mock.calls[0][2].method).toBe("PUT");
      const putBody = JSON.parse(httpClient.fetch.mock.calls[0][2].body);
      expect(putBody).toEqual({ AdGroupId: "ag1", Availability: "Paused" });
    });
  });

  describe("adjustBids", () => {
    it("partial PUT only: sends {AdGroupId, RTBAttributes:{BaseBidCPM, MaxBidCPM}} — no GET round-trip", async () => {
      httpClient.fetch.mockResolvedValueOnce({
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
      // Single call — partial PUT (round-tripping the full entity surfaces 410 Gone
      // when TTD-deprecated fields like AdBrainHouseholdCrossDeviceEnabled come back from GET).
      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      expect(httpClient.fetch.mock.calls[0][0]).toBe("/adgroup");
      expect(httpClient.fetch.mock.calls[0][2].method).toBe("PUT");
      const putBody = JSON.parse(httpClient.fetch.mock.calls[0][2].body);
      expect(putBody).toEqual({
        AdGroupId: "ag1",
        RTBAttributes: {
          BaseBidCPM: { Amount: 2.5, CurrencyCode: "USD" },
          MaxBidCPM: { Amount: 5.0, CurrencyCode: "USD" },
        },
      });
    });
  });

  describe("graphqlQuery", () => {
    it("posts query and variables to the configured GraphQL URL via fetchDirect", async () => {
      httpClient.fetchDirect.mockResolvedValueOnce({ data: { advertiser: { id: "a1" } } });

      const result = await service.graphqlQuery("query ($id: ID!) { advertiser(id: $id) { id } }", {
        id: "a1",
      });

      expect(result).toEqual({ data: { advertiser: { id: "a1" } } });
      const [url, , options] = httpClient.fetchDirect.mock.calls[0];
      expect(url).toBe(TEST_GRAPHQL_URL);
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(body.variables.id).toBe("a1");
    });

    it("passes TTD-GQL-Beta header when betaFeatures is provided", async () => {
      httpClient.fetchDirect.mockResolvedValueOnce({ data: {} });

      await service.graphqlQuery("query { partners { nodes { id } } }", undefined, undefined, {
        betaFeatures: "my-beta-flag",
      });

      const [, , options] = httpClient.fetchDirect.mock.calls[0];
      expect(options.headers).toEqual({ "TTD-GQL-Beta": "my-beta-flag" });
    });
  });
});
