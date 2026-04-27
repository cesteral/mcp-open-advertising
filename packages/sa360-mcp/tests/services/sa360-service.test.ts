import { describe, it, expect, vi, beforeEach } from "vitest";
import { SA360Service } from "../../src/services/sa360/sa360-service.js";

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

describe("SA360Service", () => {
  let service: SA360Service;
  let logger: ReturnType<typeof createMockLogger>;
  let httpClient: ReturnType<typeof createMockHttpClient>;
  let rateLimiter: ReturnType<typeof createMockRateLimiter>;

  beforeEach(() => {
    logger = createMockLogger();
    httpClient = createMockHttpClient();
    rateLimiter = createMockRateLimiter();
    service = new SA360Service(logger, rateLimiter, httpClient);
  });

  // ==========================================================================
  // sa360Search
  // ==========================================================================

  describe("sa360Search", () => {
    it("calls httpClient.fetch with correct search path", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [], totalResultsCount: 0 });

      await service.sa360Search("1234567890", "SELECT campaign.id FROM campaign");

      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/customers/1234567890/searchAds360:search");
    });

    it("sends query in POST body", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.sa360Search("123", "SELECT campaign.id FROM campaign");

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.query).toBe("SELECT campaign.id FROM campaign");
      expect(options.method).toBe("POST");
    });

    it("includes pageSize and pageToken when provided", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.sa360Search("123", "SELECT campaign.id FROM campaign", 50, "next-page");

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.pageSize).toBe(50);
      expect(body.pageToken).toBe("next-page");
    });

    it("omits pageSize and pageToken when not provided", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.sa360Search("123", "SELECT campaign.id FROM campaign");

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.pageSize).toBeUndefined();
      expect(body.pageToken).toBeUndefined();
    });

    it("returns results and pagination info", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        results: [{ campaign: { id: "1" } }],
        nextPageToken: "page-2",
        totalResultsCount: 100,
      });

      const result = await service.sa360Search("123", "SELECT campaign.id FROM campaign");

      expect(result.results).toHaveLength(1);
      expect(result.nextPageToken).toBe("page-2");
      expect(result.totalResultsCount).toBe(100);
    });

    it("returns empty array when no results in response", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      const result = await service.sa360Search("123", "SELECT campaign.id FROM campaign");

      expect(result.results).toEqual([]);
    });

    it("consumes rate limiter with customer ID", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.sa360Search("customer-abc", "SELECT campaign.id FROM campaign");

      expect(rateLimiter.consume).toHaveBeenCalledWith("sa360:customer-abc");
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

    it("returns empty array when no resource names", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      const result = await service.listAccessibleCustomers();

      expect(result.resourceNames).toEqual([]);
    });

    it("consumes rate limiter with global key", async () => {
      httpClient.fetch.mockResolvedValueOnce({ resourceNames: [] });

      await service.listAccessibleCustomers();

      expect(rateLimiter.consume).toHaveBeenCalledWith("sa360:global");
    });
  });

  // ==========================================================================
  // getEntity
  // ==========================================================================

  describe("getEntity", () => {
    it("calls sa360Search with a get-by-id query", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        results: [{ campaign: { id: "456", name: "Test" } }],
      });

      const result = await service.getEntity("campaign", "123", "456");

      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/customers/123/searchAds360:search");

      const body = JSON.parse(options.body);
      expect(body.query).toContain("campaign.id = 456");
      expect(result).toEqual({ campaign: { id: "456", name: "Test" } });
    });

    it("throws when entity not found", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await expect(service.getEntity("campaign", "123", "999")).rejects.toThrow(
        "campaign with ID 999 not found in customer 123"
      );
    });

    it("requests pageSize of 1", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        results: [{ campaign: { id: "456" } }],
      });

      await service.getEntity("campaign", "123", "456");

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.pageSize).toBe(1);
    });
  });

  // ==========================================================================
  // listEntities
  // ==========================================================================

  describe("listEntities", () => {
    it("builds and executes a list query", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        results: [
          { campaign: { id: "1", name: "Campaign A" } },
          { campaign: { id: "2", name: "Campaign B" } },
        ],
        totalResultsCount: 2,
      });

      const result = await service.listEntities("campaign", "123");

      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      expect(result.entities).toHaveLength(2);
      expect(result.totalResultsCount).toBe(2);
    });

    it("passes filters to the query builder", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.listEntities("campaign", "123", {
        "campaign.status": "= 'ENABLED'",
      });

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.query).toContain("campaign.status = 'ENABLED'");
    });

    it("passes pageSize and pageToken", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.listEntities("campaign", "123", undefined, 50, "next-page");

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.pageSize).toBe(50);
      expect(body.pageToken).toBe("next-page");
    });

    it("passes orderBy to the query builder", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.listEntities(
        "campaign",
        "123",
        undefined,
        undefined,
        undefined,
        "campaign.name ASC"
      );

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.query).toContain("ORDER BY campaign.name ASC");
    });
  });

  // ==========================================================================
  // searchFields
  // ==========================================================================

  describe("searchFields", () => {
    it("calls the searchAds360Fields endpoint", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.searchFields("SELECT name FROM searchAds360Fields WHERE name LIKE 'campaign%'");

      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/searchAds360Fields:search");
      expect(options.method).toBe("POST");
    });

    it("sends query in POST body", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.searchFields("SELECT name FROM searchAds360Fields");

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.query).toBe("SELECT name FROM searchAds360Fields");
    });

    it("includes pageSize when provided", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.searchFields("SELECT name FROM searchAds360Fields", 25);

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.pageSize).toBe(25);
    });

    it("returns fields and totalSize", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        results: [{ name: "campaign.id", dataType: "INT64" }],
        totalSize: 1,
      });

      const result = await service.searchFields("SELECT name FROM searchAds360Fields");

      expect(result.fields).toHaveLength(1);
      expect(result.totalSize).toBe(1);
    });

    it("consumes rate limiter with global key", async () => {
      httpClient.fetch.mockResolvedValueOnce({ results: [] });

      await service.searchFields("SELECT name FROM searchAds360Fields");

      expect(rateLimiter.consume).toHaveBeenCalledWith("sa360:global");
    });
  });

  // ==========================================================================
  // listCustomColumns
  // ==========================================================================

  describe("listCustomColumns", () => {
    it("calls correct endpoint", async () => {
      httpClient.fetch.mockResolvedValueOnce({ customColumns: [] });

      await service.listCustomColumns("123");

      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/customers/123/customColumns");
      expect(options.method).toBe("GET");
    });

    it("returns custom columns", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        customColumns: [{ id: "col1", name: "My Column" }],
      });

      const result = await service.listCustomColumns("123");

      expect(result.customColumns).toHaveLength(1);
    });

    it("returns empty array when no custom columns", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      const result = await service.listCustomColumns("123");

      expect(result.customColumns).toEqual([]);
    });

    it("consumes rate limiter with customer ID", async () => {
      httpClient.fetch.mockResolvedValueOnce({ customColumns: [] });

      await service.listCustomColumns("customer-xyz");

      expect(rateLimiter.consume).toHaveBeenCalledWith("sa360:customer-xyz");
    });
  });
});
