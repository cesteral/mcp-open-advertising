import { describe, it, expect, vi, beforeEach } from "vitest";
import { CM360Service } from "../../src/services/cm360/cm360-service.js";

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
    fetchRaw: vi.fn().mockResolvedValue({}),
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

describe("CM360Service", () => {
  let service: CM360Service;
  let logger: ReturnType<typeof createMockLogger>;
  let httpClient: ReturnType<typeof createMockHttpClient>;
  let rateLimiter: ReturnType<typeof createMockRateLimiter>;

  beforeEach(() => {
    logger = createMockLogger();
    httpClient = createMockHttpClient();
    rateLimiter = createMockRateLimiter();
    service = new CM360Service(logger, rateLimiter, httpClient);
  });

  // ==========================================================================
  // listUserProfiles
  // ==========================================================================

  describe("listUserProfiles", () => {
    it("calls correct endpoint", async () => {
      httpClient.fetch.mockResolvedValueOnce({ items: [] });

      await service.listUserProfiles();

      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/userprofiles");
    });

    it("consumes rate limiter", async () => {
      httpClient.fetch.mockResolvedValueOnce({ items: [] });

      await service.listUserProfiles();

      expect(rateLimiter.consume).toHaveBeenCalledWith("cm360");
    });

    it("passes request context", async () => {
      httpClient.fetch.mockResolvedValueOnce({ items: [] });
      const context = { requestId: "req-1" };

      await service.listUserProfiles(context);

      const [, ctx] = httpClient.fetch.mock.calls[0];
      expect(ctx).toEqual(context);
    });

    it("returns raw API response", async () => {
      const data = { items: [{ profileId: "123", accountName: "Test" }] };
      httpClient.fetch.mockResolvedValueOnce(data);

      const result = await service.listUserProfiles();
      expect(result).toEqual(data);
    });
  });

  // ==========================================================================
  // listEntities
  // ==========================================================================

  describe("listEntities", () => {
    it("constructs correct path for campaigns", async () => {
      httpClient.fetch.mockResolvedValueOnce({ campaigns: [] });

      await service.listEntities("campaign", "12345");

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/userprofiles/12345/campaigns");
    });

    it("constructs correct path for placements", async () => {
      httpClient.fetch.mockResolvedValueOnce({ placements: [] });

      await service.listEntities("placement", "12345");

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/userprofiles/12345/placements");
    });

    it("constructs correct path for floodlightActivities", async () => {
      httpClient.fetch.mockResolvedValueOnce({ floodlightActivities: [] });

      await service.listEntities("floodlightActivity", "12345");

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/userprofiles/12345/floodlightActivities");
    });

    it("includes filters as query parameters", async () => {
      httpClient.fetch.mockResolvedValueOnce({ campaigns: [] });

      await service.listEntities("campaign", "12345", { advertiserId: "999" });

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toContain("advertiserId=999");
    });

    it("includes pagination parameters", async () => {
      httpClient.fetch.mockResolvedValueOnce({ campaigns: [] });

      await service.listEntities("campaign", "12345", undefined, "next-token", 50);

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toContain("pageToken=next-token");
      expect(path).toContain("maxResults=50");
    });

    it("returns entities and nextPageToken", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        campaigns: [{ id: "1" }, { id: "2" }],
        nextPageToken: "page-2",
      });

      const result = await service.listEntities("campaign", "12345");

      expect(result.entities).toHaveLength(2);
      expect(result.nextPageToken).toBe("page-2");
    });

    it("returns empty array when collection key is missing", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      const result = await service.listEntities("campaign", "12345");

      expect(result.entities).toEqual([]);
      expect(result.nextPageToken).toBeUndefined();
    });

    it("consumes rate limiter with cm360 key", async () => {
      httpClient.fetch.mockResolvedValueOnce({ campaigns: [] });

      await service.listEntities("campaign", "12345");

      expect(rateLimiter.consume).toHaveBeenCalledWith("cm360");
    });

    it("omits undefined/null filter values", async () => {
      httpClient.fetch.mockResolvedValueOnce({ campaigns: [] });

      await service.listEntities("campaign", "12345", {
        advertiserId: "999",
        searchString: undefined,
        archived: null,
      });

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toContain("advertiserId=999");
      expect(path).not.toContain("searchString");
      expect(path).not.toContain("archived");
    });
  });

  // ==========================================================================
  // getEntity
  // ==========================================================================

  describe("getEntity", () => {
    it("constructs correct path", async () => {
      httpClient.fetch.mockResolvedValueOnce({ id: "789" });

      await service.getEntity("campaign", "12345", "789");

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/userprofiles/12345/campaigns/789");
    });

    it("constructs correct path for floodlightConfiguration", async () => {
      httpClient.fetch.mockResolvedValueOnce({ id: "999" });

      await service.getEntity("floodlightConfiguration", "12345", "999");

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/userprofiles/12345/floodlightConfigurations/999");
    });

    it("returns entity data", async () => {
      const entity = { id: "789", name: "Test Campaign" };
      httpClient.fetch.mockResolvedValueOnce(entity);

      const result = await service.getEntity("campaign", "12345", "789");
      expect(result).toEqual(entity);
    });

    it("consumes rate limiter", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.getEntity("campaign", "12345", "789");

      expect(rateLimiter.consume).toHaveBeenCalledWith("cm360");
    });
  });

  // ==========================================================================
  // createEntity
  // ==========================================================================

  describe("createEntity", () => {
    it("POSTs to correct collection path", async () => {
      httpClient.fetch.mockResolvedValueOnce({ id: "new-1" });

      await service.createEntity("campaign", "12345", { name: "New Campaign" });

      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/userprofiles/12345/campaigns");
      expect(options.method).toBe("POST");
    });

    it("sends JSON body with Content-Type header", async () => {
      httpClient.fetch.mockResolvedValueOnce({ id: "new-1" });

      const data = { name: "New Campaign", advertiserId: "999" };
      await service.createEntity("campaign", "12345", data);

      const [, , options] = httpClient.fetch.mock.calls[0];
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(options.body)).toEqual(data);
    });

    it("returns created entity", async () => {
      const created = { id: "new-1", name: "New Campaign" };
      httpClient.fetch.mockResolvedValueOnce(created);

      const result = await service.createEntity("campaign", "12345", { name: "New Campaign" });
      expect(result).toEqual(created);
    });

    it("consumes rate limiter", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.createEntity("campaign", "12345", {});

      expect(rateLimiter.consume).toHaveBeenCalledWith("cm360");
    });
  });

  // ==========================================================================
  // updateEntity
  // ==========================================================================

  describe("updateEntity", () => {
    it("PUTs to correct collection path", async () => {
      httpClient.fetch.mockResolvedValueOnce({ id: "789" });

      await service.updateEntity("campaign", "12345", { id: "789", name: "Updated" });

      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/userprofiles/12345/campaigns");
      expect(options.method).toBe("PUT");
    });

    it("sends full entity data in body", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      const data = { id: "789", name: "Updated", advertiserId: "999" };
      await service.updateEntity("campaign", "12345", data);

      const [, , options] = httpClient.fetch.mock.calls[0];
      expect(JSON.parse(options.body)).toEqual(data);
    });

    it("consumes rate limiter", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.updateEntity("campaign", "12345", { id: "789" });

      expect(rateLimiter.consume).toHaveBeenCalledWith("cm360");
    });
  });

  // ==========================================================================
  // deleteEntity
  // ==========================================================================

  describe("deleteEntity", () => {
    it("DELETEs at correct path for deletable entity types", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.deleteEntity("floodlightActivity", "12345", "999");

      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/userprofiles/12345/floodlightActivities/999");
      expect(options.method).toBe("DELETE");
    });

    it("throws for non-deletable entity types", async () => {
      await expect(service.deleteEntity("campaign", "12345", "789")).rejects.toThrow(
        "Delete is not supported for entity type: campaign"
      );

      expect(httpClient.fetch).not.toHaveBeenCalled();
    });

    it("throws for non-deletable entity types (advertiser)", async () => {
      await expect(service.deleteEntity("advertiser", "12345", "789")).rejects.toThrow(
        "Delete is not supported for entity type: advertiser"
      );
    });

    it("consumes rate limiter before deletion", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.deleteEntity("floodlightActivity", "12345", "999");

      expect(rateLimiter.consume).toHaveBeenCalledWith("cm360");
    });
  });

  // ==========================================================================
  // listTargetingOptions
  // ==========================================================================

  describe("listTargetingOptions", () => {
    it("constructs correct path with targeting type", async () => {
      httpClient.fetch.mockResolvedValueOnce({ browsers: [] });

      await service.listTargetingOptions("12345", "browsers");

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/userprofiles/12345/browsers");
    });

    it("includes filters and pagination", async () => {
      httpClient.fetch.mockResolvedValueOnce({ operatingSystems: [] });

      await service.listTargetingOptions(
        "12345",
        "operatingSystems",
        { name: "Windows" },
        "next",
        25
      );

      const [path] = httpClient.fetch.mock.calls[0];
      expect(path).toContain("name=Windows");
      expect(path).toContain("pageToken=next");
      expect(path).toContain("maxResults=25");
    });

    it("returns options and nextPageToken", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        browsers: [{ id: "1", name: "Chrome" }],
        nextPageToken: "page-2",
      });

      const result = await service.listTargetingOptions("12345", "browsers");

      expect(result.options).toHaveLength(1);
      expect(result.nextPageToken).toBe("page-2");
    });

    it("returns empty array when targeting type key is missing", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      const result = await service.listTargetingOptions("12345", "browsers");

      expect(result.options).toEqual([]);
    });

    it("consumes rate limiter", async () => {
      httpClient.fetch.mockResolvedValueOnce({ browsers: [] });

      await service.listTargetingOptions("12345", "browsers");

      expect(rateLimiter.consume).toHaveBeenCalledWith("cm360");
    });
  });
});
