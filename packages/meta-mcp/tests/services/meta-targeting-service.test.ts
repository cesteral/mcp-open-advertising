import { describe, it, expect, vi, beforeEach } from "vitest";
import { MetaTargetingService } from "../../src/services/meta/meta-targeting-service.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockHttpClient() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  } as any;
}

function createMockRateLimiter() {
  return {
    consume: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MetaTargetingService", () => {
  let service: MetaTargetingService;
  let httpClient: ReturnType<typeof createMockHttpClient>;
  let rateLimiter: ReturnType<typeof createMockRateLimiter>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    httpClient = createMockHttpClient();
    rateLimiter = createMockRateLimiter();
    logger = createMockLogger();
    service = new MetaTargetingService(rateLimiter, httpClient, logger);
  });

  // ==========================================================================
  // searchTargeting
  // ==========================================================================

  describe("searchTargeting", () => {
    it("calls httpClient.get with /search path", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.searchTargeting("adinterest", "yoga");

      expect(httpClient.get).toHaveBeenCalledTimes(1);
      const [path] = httpClient.get.mock.calls[0];
      expect(path).toBe("/search");
    });

    it("passes type and query as params", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.searchTargeting("adinterest", "yoga");

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.type).toBe("adinterest");
      expect(params.q).toBe("yoga");
    });

    it("passes limit as string when provided", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.searchTargeting("adinterest", "yoga", 25);

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.limit).toBe("25");
    });

    it("does not include limit when not provided", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.searchTargeting("adinterest", "yoga");

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.limit).toBeUndefined();
    });

    it("returns the response from httpClient", async () => {
      const targetingResults = {
        data: [{ id: "6003139266461", name: "Yoga", audience_size_lower_bound: 1000000 }],
      };
      httpClient.get.mockResolvedValueOnce(targetingResults);

      const result = await service.searchTargeting("adinterest", "yoga");

      expect(result).toEqual(targetingResults);
    });

    it("calls rateLimiter.consume with default key", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.searchTargeting("adinterest", "yoga");

      expect(rateLimiter.consume).toHaveBeenCalledWith("meta:default");
    });

    it("works with different targeting types", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.searchTargeting("adgeolocation", "New York");

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.type).toBe("adgeolocation");
      expect(params.q).toBe("New York");
    });
  });

  // ==========================================================================
  // getTargetingOptions
  // ==========================================================================

  describe("getTargetingOptions", () => {
    it("calls httpClient.get with correct path", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getTargetingOptions("act_123");

      expect(httpClient.get).toHaveBeenCalledTimes(1);
      const [path] = httpClient.get.mock.calls[0];
      expect(path).toBe("/act_123/targetingbrowse");
    });

    it("normalizes account ID with act_ prefix", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getTargetingOptions("123456");

      const [path] = httpClient.get.mock.calls[0];
      expect(path).toBe("/act_123456/targetingbrowse");
    });

    it("keeps act_ prefix when already present", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getTargetingOptions("act_123456");

      const [path] = httpClient.get.mock.calls[0];
      expect(path).toBe("/act_123456/targetingbrowse");
    });

    it("passes type param when provided", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getTargetingOptions("act_123", "interests");

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.type).toBe("interests");
    });

    it("does not include type when not provided", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getTargetingOptions("act_123");

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.type).toBeUndefined();
    });

    it("returns the response from httpClient", async () => {
      const browseResults = {
        data: [{ id: "6003139266461", name: "Sports", type: "interests" }],
      };
      httpClient.get.mockResolvedValueOnce(browseResults);

      const result = await service.getTargetingOptions("act_123", "interests");

      expect(result).toEqual(browseResults);
    });

    it("calls rateLimiter.consume with default key", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getTargetingOptions("act_123");

      expect(rateLimiter.consume).toHaveBeenCalledWith("meta:default");
    });
  });
});
