import { describe, it, expect, vi, beforeEach } from "vitest";
import { GAdsService } from "../../src/services/gads/gads-service.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
    developerToken: "test-dev-token",
    loginCustomerId: undefined,
  } as any;
}

function createMockRateLimiter() {
  return {
    consume: vi.fn().mockResolvedValue(undefined),
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GAdsService", () => {
  let service: GAdsService;
  let logger: ReturnType<typeof createMockLogger>;
  let httpClient: ReturnType<typeof createMockHttpClient>;
  let rateLimiter: ReturnType<typeof createMockRateLimiter>;

  beforeEach(() => {
    logger = createMockLogger();
    httpClient = createMockHttpClient();
    rateLimiter = createMockRateLimiter();
    service = new GAdsService(logger, rateLimiter, httpClient);
  });

  // ==========================================================================
  // gaqlSearch
  // ==========================================================================

  describe("gaqlSearch", () => {
    it("calls httpClient.fetch with correct GAQL search path", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [], totalResultsCount: 0 });

      await service.gaqlSearch("1234567890", "SELECT campaign.id FROM campaign");

      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/customers/1234567890/googleAds:search");
    });

    it("sends GAQL query in POST body", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.gaqlSearch("123", "SELECT campaign.id FROM campaign");

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.query).toBe("SELECT campaign.id FROM campaign");
      expect(options.method).toBe("POST");
    });

    it("includes pageSize and pageToken when provided", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.gaqlSearch("123", "SELECT campaign.id FROM campaign", 50, "next-page");

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.pageSize).toBe(50);
      expect(body.pageToken).toBe("next-page");
    });

    it("returns results and pagination info", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        results: [{ campaign: { id: "1" } }],
        nextPageToken: "page-2",
        totalResultsCount: 100,
      });

      const result = await service.gaqlSearch("123", "SELECT campaign.id FROM campaign");

      expect(result.results).toHaveLength(1);
      expect(result.nextPageToken).toBe("page-2");
      expect(result.totalResultsCount).toBe(100);
    });

    it("consumes rate limiter with customer ID", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.gaqlSearch("customer-abc", "SELECT campaign.id FROM campaign");

      expect(rateLimiter.consume).toHaveBeenCalledWith("gads:customer-abc");
    });
  });

  // ==========================================================================
  // listAccessibleCustomers
  // ==========================================================================

  describe("listAccessibleCustomers", () => {
    it("calls correct endpoint", async () => {
      httpClient.fetch.mockResolvedValueOnce({ resourceNames: ["customers/123"] });

      await service.listAccessibleCustomers();

      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/customers:listAccessibleCustomers");
      expect(options.method).toBe("GET");
    });

    it("returns resource names", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        resourceNames: ["customers/111", "customers/222"],
      });

      const result = await service.listAccessibleCustomers();

      expect(result.resourceNames).toEqual(["customers/111", "customers/222"]);
    });
  });

  // ==========================================================================
  // createEntity
  // ==========================================================================

  describe("createEntity", () => {
    it("calls correct :mutate endpoint for campaigns", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [{ resourceName: "customers/123/campaigns/456" }] });

      await service.createEntity("campaign", "123", { name: "Test Campaign" });

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/customers/123/campaigns:mutate");
    });

    it("sends create operation in body", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.createEntity("campaign", "123", { name: "Test Campaign" });

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.operations).toEqual([{ create: { name: "Test Campaign" } }]);
    });

    it("uses correct endpoint for adGroups", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.createEntity("adGroup", "123", { name: "Test Ad Group" });

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/customers/123/adGroups:mutate");
    });
  });

  // ==========================================================================
  // updateEntity
  // ==========================================================================

  describe("updateEntity", () => {
    it("calls :mutate endpoint with update operation and updateMask", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.updateEntity("campaign", "123", "456", { name: "Updated" }, "name");

      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/customers/123/campaigns:mutate");

      const body = JSON.parse(options.body);
      expect(body.operations[0].update.resourceName).toBe("customers/123/campaigns/456");
      expect(body.operations[0].update.name).toBe("Updated");
      expect(body.operations[0].updateMask).toBe("name");
    });
  });

  // ==========================================================================
  // removeEntity
  // ==========================================================================

  describe("removeEntity", () => {
    it("calls :mutate endpoint with remove operation", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.removeEntity("campaign", "123", "456");

      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/customers/123/campaigns:mutate");

      const body = JSON.parse(options.body);
      expect(body.operations[0].remove).toBe("customers/123/campaigns/456");
    });
  });

  // ==========================================================================
  // bulkMutate
  // ==========================================================================

  describe("bulkMutate", () => {
    it("sends all operations in a single call", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      const operations = [
        { create: { name: "Campaign A" } },
        { create: { name: "Campaign B" } },
      ];

      await service.bulkMutate("campaign", "123", operations);

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.operations).toHaveLength(2);
    });

    it("sets partialFailure flag when requested", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.bulkMutate("campaign", "123", [{ create: {} }], true);

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.partialFailure).toBe(true);
    });
  });

  // ==========================================================================
  // bulkUpdateStatus
  // ==========================================================================

  describe("bulkUpdateStatus", () => {
    it("creates update operations for ENABLED/PAUSED status", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [{}, {}] });

      const result = await service.bulkUpdateStatus(
        "campaign",
        "123",
        ["c1", "c2"],
        "PAUSED"
      );

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.operations).toHaveLength(2);
      expect(body.operations[0].update.resourceName).toBe("customers/123/campaigns/c1");
      expect(body.operations[0].updateMask).toBe("status");
    });

    it("creates remove operations for REMOVED status", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [{ resourceName: "customers/123/campaigns/c1" }] });

      await service.bulkUpdateStatus("campaign", "123", ["c1"], "REMOVED");

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.operations[0].remove).toBe("customers/123/campaigns/c1");
    });

    it("parses partial failures in REMOVE branch", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        results: [{ resourceName: "customers/123/campaigns/c1" }, {}],
        partialFailureError: { code: 3, message: "some error" },
      });

      const result = await service.bulkUpdateStatus(
        "campaign",
        "123",
        ["c1", "c2"],
        "REMOVED"
      );

      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toContain("Operation produced no result");
    });

    it("reports all success when REMOVE has no partial failures", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        results: [{ resourceName: "customers/123/campaigns/c1" }, { resourceName: "customers/123/campaigns/c2" }],
      });

      const result = await service.bulkUpdateStatus(
        "campaign",
        "123",
        ["c1", "c2"],
        "REMOVED"
      );

      expect(result.results.every((r) => r.success)).toBe(true);
    });

    it("rejects statusless entity types for ENABLED/PAUSED", async () => {
      const result = await service.bulkUpdateStatus(
        "campaignBudget",
        "123",
        ["b1"],
        "ENABLED"
      );

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain("does not have a status field");
      expect(httpClient.fetch).not.toHaveBeenCalled();
    });

    it("allows REMOVED on statusless entity types", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        results: [{ resourceName: "customers/123/campaignBudgets/b1" }],
      });

      const result = await service.bulkUpdateStatus(
        "campaignBudget",
        "123",
        ["b1"],
        "REMOVED"
      );

      expect(result.results[0].success).toBe(true);
      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
