import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TtdService } from "../../src/services/ttd/ttd-service.js";

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
    partnerId: "test-partner",
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

describe("TtdService", () => {
  let service: TtdService;
  let logger: ReturnType<typeof createMockLogger>;
  let httpClient: ReturnType<typeof createMockHttpClient>;
  let rateLimiter: ReturnType<typeof createMockRateLimiter>;

  beforeEach(() => {
    logger = createMockLogger();
    httpClient = createMockHttpClient();
    rateLimiter = createMockRateLimiter();
    service = new TtdService(logger, rateLimiter, httpClient);
  });

  // ==========================================================================
  // listEntities
  // ==========================================================================

  describe("listEntities", () => {
    it("calls httpClient.fetch with correct path for campaigns", async () => {
      httpClient.fetch.mockResolvedValueOnce({ Result: [], TotalCount: 0, ResultCount: 0 });

      await service.listEntities("campaign", { AdvertiserId: "adv1" });

      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/campaign/query");
    });

    it("calls httpClient.fetch with correct path for advertisers", async () => {
      httpClient.fetch.mockResolvedValueOnce({ Result: [], TotalCount: 0, ResultCount: 0 });

      await service.listEntities("advertiser", {});

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/advertiser/query");
    });

    it("calls httpClient.fetch with correct path for adGroups", async () => {
      httpClient.fetch.mockResolvedValueOnce({ Result: [], TotalCount: 0, ResultCount: 0 });

      await service.listEntities("adGroup", { AdvertiserId: "adv1" });

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/adgroup/query");
    });

    it("calls httpClient.fetch with correct path for ads", async () => {
      httpClient.fetch.mockResolvedValueOnce({ Result: [], TotalCount: 0, ResultCount: 0 });

      await service.listEntities("ad", { AdvertiserId: "adv1" });

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/ad/query");
    });

    it("uses POST method with filters in body", async () => {
      httpClient.fetch.mockResolvedValueOnce({ Result: [], TotalCount: 0, ResultCount: 0 });

      const filters = { AdvertiserId: "adv1", CampaignName: "test" };
      await service.listEntities("campaign", filters);

      const [, , options] = httpClient.fetch.mock.calls[0];
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(body.AdvertiserId).toBe("adv1");
      expect(body.CampaignName).toBe("test");
    });

    it("includes PageSize (defaults to 25)", async () => {
      httpClient.fetch.mockResolvedValueOnce({ Result: [], TotalCount: 0, ResultCount: 0 });

      await service.listEntities("campaign", {});

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.PageSize).toBe(25);
    });

    it("uses custom pageSize when provided", async () => {
      httpClient.fetch.mockResolvedValueOnce({ Result: [], TotalCount: 0, ResultCount: 0 });

      await service.listEntities("campaign", {}, undefined, 50);

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.PageSize).toBe(50);
    });

    it("adds PartnerId for advertiser entity type", async () => {
      httpClient.fetch.mockResolvedValueOnce({ Result: [], TotalCount: 0, ResultCount: 0 });

      await service.listEntities("advertiser", {});

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.PartnerId).toBe("test-partner");
    });

    it("does NOT add PartnerId for non-advertiser entity types", async () => {
      httpClient.fetch.mockResolvedValueOnce({ Result: [], TotalCount: 0, ResultCount: 0 });

      await service.listEntities("campaign", {});

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.PartnerId).toBeUndefined();
    });

    it("handles pagination (PageStartIndex from pageToken)", async () => {
      httpClient.fetch.mockResolvedValueOnce({ Result: [], TotalCount: 100, ResultCount: 25 });

      await service.listEntities("campaign", {}, "25");

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.PageStartIndex).toBe(25);
    });

    it("returns entities from Result array", async () => {
      const campaigns = [{ CampaignId: "c1" }, { CampaignId: "c2" }];
      httpClient.fetch.mockResolvedValueOnce({
        Result: campaigns,
        TotalCount: 2,
        ResultCount: 2,
      });

      const result = await service.listEntities("campaign", {});

      expect(result.entities).toEqual(campaigns);
    });

    it("returns nextPageToken when more results available", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        Result: [{ CampaignId: "c1" }],
        TotalCount: 50,
        ResultCount: 25,
      });

      const result = await service.listEntities("campaign", {});

      expect(result.nextPageToken).toBe("25");
    });

    it("no nextPageToken when all results returned", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        Result: [{ CampaignId: "c1" }],
        TotalCount: 1,
        ResultCount: 1,
      });

      const result = await service.listEntities("campaign", {});

      expect(result.nextPageToken).toBeUndefined();
    });

    it("calls rateLimiter.consume", async () => {
      httpClient.fetch.mockResolvedValueOnce({ Result: [], TotalCount: 0, ResultCount: 0 });

      await service.listEntities("campaign", {});

      expect(rateLimiter.consume).toHaveBeenCalledWith("ttd:test-partner");
    });
  });

  // ==========================================================================
  // getEntity
  // ==========================================================================

  describe("getEntity", () => {
    it("calls httpClient.fetch with correct path", async () => {
      const entity = { CampaignId: "c1", CampaignName: "Test" };
      httpClient.fetch.mockResolvedValueOnce(entity);

      const result = await service.getEntity("campaign", "c1");

      expect(result).toEqual(entity);
      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/campaign/c1");
    });

    it("uses GET method", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.getEntity("adGroup", "ag1");

      const [, , options] = httpClient.fetch.mock.calls[0];
      expect(options.method).toBe("GET");
    });

    it("calls rateLimiter.consume", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.getEntity("campaign", "c1");

      expect(rateLimiter.consume).toHaveBeenCalledWith("ttd:test-partner");
    });
  });

  // ==========================================================================
  // createEntity
  // ==========================================================================

  describe("createEntity", () => {
    it("calls httpClient.fetch with POST and body", async () => {
      const data = { CampaignName: "New Campaign", AdvertiserId: "adv1" };
      const created = { CampaignId: "c1", ...data };
      httpClient.fetch.mockResolvedValueOnce(created);

      const result = await service.createEntity("campaign", data);

      expect(result).toEqual(created);
      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/campaign");
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body)).toEqual(data);
    });

    it("calls rateLimiter.consume", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.createEntity("campaign", { CampaignName: "Test" });

      expect(rateLimiter.consume).toHaveBeenCalledWith("ttd:test-partner");
    });
  });

  // ==========================================================================
  // updateEntity
  // ==========================================================================

  describe("updateEntity", () => {
    it("calls httpClient.fetch with PUT, correct path, and body", async () => {
      const data = { CampaignName: "Updated" };
      httpClient.fetch.mockResolvedValueOnce({ CampaignId: "c1", ...data });

      await service.updateEntity("campaign", "c1", data);

      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/campaign/c1");
      expect(options.method).toBe("PUT");
      expect(JSON.parse(options.body)).toEqual(data);
    });

    it("calls rateLimiter.consume", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.updateEntity("campaign", "c1", { CampaignName: "Updated" });

      expect(rateLimiter.consume).toHaveBeenCalledWith("ttd:test-partner");
    });
  });

  // ==========================================================================
  // deleteEntity
  // ==========================================================================

  describe("deleteEntity", () => {
    it("calls httpClient.fetch with DELETE", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.deleteEntity("campaign", "c1");

      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/campaign/c1");
      expect(options.method).toBe("DELETE");
    });

    it("calls rateLimiter.consume", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.deleteEntity("ad", "a1");

      expect(rateLimiter.consume).toHaveBeenCalledWith("ttd:test-partner");
    });
  });
});
