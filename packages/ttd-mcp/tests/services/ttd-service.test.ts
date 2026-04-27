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
    fetchDirect: vi.fn().mockResolvedValue({}),
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
    it("calls httpClient.fetch with correct scoped query path for campaigns", async () => {
      httpClient.fetch.mockResolvedValueOnce({ Result: [], TotalCount: 0, ResultCount: 0 });

      await service.listEntities("campaign", { AdvertiserId: "adv1" });

      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/campaign/query/advertiser");
    });

    it("calls httpClient.fetch with correct scoped query path for advertisers", async () => {
      httpClient.fetch.mockResolvedValueOnce({ Result: [], TotalCount: 0, ResultCount: 0 });

      await service.listEntities("advertiser", { PartnerId: "partner-123" });

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/advertiser/query/partner");
    });

    it("calls httpClient.fetch with correct scoped query path for adGroups", async () => {
      httpClient.fetch.mockResolvedValueOnce({ Result: [], TotalCount: 0, ResultCount: 0 });

      await service.listEntities("adGroup", { AdvertiserId: "adv1" });

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/adgroup/query/campaign");
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

    it("uses caller-supplied PartnerId for advertiser entity type", async () => {
      httpClient.fetch.mockResolvedValueOnce({ Result: [], TotalCount: 0, ResultCount: 0 });

      await service.listEntities("advertiser", { PartnerId: "partner-123" });

      const [, , options] = httpClient.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.PartnerId).toBe("partner-123");
    });

    it("throws when advertiser query is missing PartnerId", async () => {
      await expect(service.listEntities("advertiser", {})).rejects.toThrow(
        "partnerId is required when listing advertiser entities"
      );
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
    it("calls httpClient.fetch with PUT, no ID in URL, and ID injected into body", async () => {
      const data = { CampaignName: "Updated" };
      httpClient.fetch.mockResolvedValueOnce({ CampaignId: "c1", ...data });

      await service.updateEntity("campaign", "c1", data);

      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/campaign");
      expect(options.method).toBe("PUT");
      expect(JSON.parse(options.body)).toEqual({ CampaignId: "c1", CampaignName: "Updated" });
    });

    it("calls rateLimiter.consume", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.updateEntity("campaign", "c1", { CampaignName: "Updated" });

      expect(rateLimiter.consume).toHaveBeenCalledWith("ttd:test-partner");
    });
  });

  // ==========================================================================
  // executeEntityReport
  // ==========================================================================

  describe("executeEntityReport", () => {
    it("calls adGroupReportExecute mutation for adGroup", async () => {
      httpClient.fetchDirect.mockResolvedValueOnce({
        data: {
          adGroupReportExecute: {
            data: { id: "r1", url: "https://ttd.com/report.csv", hasSampleData: false },
          },
        },
      });

      await service.executeEntityReport("adGroup", "ag123", "AD_GROUP");

      expect(httpClient.fetchDirect).toHaveBeenCalledTimes(1);
      const [url, , options] = httpClient.fetchDirect.mock.calls[0];
      expect(url).toBe("https://desk.thetradedesk.com/graphql");
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body);
      expect(body.query).toContain("adGroupReportExecute");
      expect(body.query).toContain("report: AD_GROUP");
      expect(body.variables.entityId).toBe("ag123");
      expect(body.variables.reportType).toBeUndefined();
    });

    it("calls campaignReportExecute mutation for campaign", async () => {
      httpClient.fetchDirect.mockResolvedValueOnce({
        data: { campaignReportExecute: { data: { url: "https://ttd.com/r.csv" } } },
      });

      await service.executeEntityReport("campaign", "c123", "CAMPAIGN");

      const body = JSON.parse(httpClient.fetchDirect.mock.calls[0][2].body);
      expect(body.query).toContain("campaignReportExecute");
      expect(body.query).toContain("report: CAMPAIGN");
    });

    it("calls advertiserReportExecute mutation for advertiser", async () => {
      httpClient.fetchDirect.mockResolvedValueOnce({
        data: { advertiserReportExecute: { data: { url: "https://ttd.com/r.csv" } } },
      });

      await service.executeEntityReport("advertiser", "adv1", "ADVERTISER");

      const body = JSON.parse(httpClient.fetchDirect.mock.calls[0][2].body);
      expect(body.query).toContain("advertiserReportExecute");
      expect(body.query).toContain("report: ADVERTISER");
    });

    it("consumes rate limiter once", async () => {
      httpClient.fetchDirect.mockResolvedValueOnce({ data: {} });
      await service.executeEntityReport("adGroup", "ag1", "AD_GROUP");
      expect(rateLimiter.consume).toHaveBeenCalledTimes(1);
      expect(rateLimiter.consume).toHaveBeenCalledWith("ttd:test-partner");
    });

    it("rejects invalid enum-like reportType values before sending the request", async () => {
      await expect(service.executeEntityReport("campaign", "c1", "bad-value")).rejects.toThrow(
        "reportType must be a valid CampaignReportType enum value"
      );

      expect(httpClient.fetchDirect).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // getEntityReportMetadata
  // ==========================================================================

  describe("getEntityReportMetadata", () => {
    it("calls programmaticTileReportMetadata query with adGroupId for adGroup", async () => {
      httpClient.fetchDirect.mockResolvedValueOnce({
        data: { programmaticTileReportMetadata: { data: [] } },
      });

      await service.getEntityReportMetadata("adGroup", "ag123", "Ag");

      const body = JSON.parse(httpClient.fetchDirect.mock.calls[0][2].body);
      expect(body.query).toContain("programmaticTileReportMetadata");
      expect(body.variables.adGroupId).toBe("ag123");
      expect(body.variables.tile).toBe("Ag");
      expect(body.variables.campaignId).toBeUndefined();
    });

    it("sets campaignId for campaign entityType", async () => {
      httpClient.fetchDirect.mockResolvedValueOnce({ data: {} });
      await service.getEntityReportMetadata("campaign", "c1", "Ca");
      const body = JSON.parse(httpClient.fetchDirect.mock.calls[0][2].body);
      expect(body.variables.campaignId).toBe("c1");
      expect(body.variables.adGroupId).toBeUndefined();
    });

    it("sets advertiserId for advertiser entityType", async () => {
      httpClient.fetchDirect.mockResolvedValueOnce({ data: {} });
      await service.getEntityReportMetadata("advertiser", "adv1", "Af");
      const body = JSON.parse(httpClient.fetchDirect.mock.calls[0][2].body);
      expect(body.variables.advertiserId).toBe("adv1");
    });

    it("consumes rate limiter once", async () => {
      httpClient.fetchDirect.mockResolvedValueOnce({ data: {} });
      await service.getEntityReportMetadata("adGroup", "ag1", "Ag");
      expect(rateLimiter.consume).toHaveBeenCalledTimes(1);
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

      await service.deleteEntity("creative", "cr1");

      expect(rateLimiter.consume).toHaveBeenCalledWith("ttd:test-partner");
    });
  });
});
