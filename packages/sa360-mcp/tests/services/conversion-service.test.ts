import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConversionService } from "../../src/services/sa360-v2/conversion-service.js";
import { V2_CONVERSION_PROPERTIES } from "../helpers/v2-conversion-schema.js";

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

function createMockV2HttpClient() {
  return {
    fetch: vi.fn().mockResolvedValue({}),
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

describe("ConversionService", () => {
  let service: ConversionService;
  let logger: ReturnType<typeof createMockLogger>;
  let httpClient: ReturnType<typeof createMockV2HttpClient>;
  let rateLimiter: ReturnType<typeof createMockRateLimiter>;

  beforeEach(() => {
    logger = createMockLogger();
    httpClient = createMockV2HttpClient();
    rateLimiter = createMockRateLimiter();
    service = new ConversionService(logger, rateLimiter, httpClient);
  });

  // ==========================================================================
  // insertConversions
  // ==========================================================================

  describe("insertConversions", () => {
    it("calls POST /conversion with correct body structure", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        kind: "doubleclicksearch#conversionList",
        conversion: [{ conversionId: "c1" }],
      });

      await service.insertConversions("agency-1", "adv-1", [
        {
          clickId: "EAIaIQobChMI...",
          conversionId: "order-1",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
        },
      ]);

      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/conversion");
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body);
      expect(body.kind).toBe("doubleclicksearch#conversionList");
      expect(body.conversion).toHaveLength(1);
    });

    it("injects agencyId and advertiserId into each conversion row", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.insertConversions("agency-1", "adv-1", [
        {
          clickId: "click-1",
          conversionId: "order-1",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
        },
        {
          clickId: "click-2",
          conversionId: "order-2",
          conversionTimestamp: "1700000001000",
          segmentationType: "FLOODLIGHT",
        },
      ]);

      const body = JSON.parse(httpClient.fetch.mock.calls[0][2].body);
      expect(body.conversion[0].agencyId).toBe("agency-1");
      expect(body.conversion[0].advertiserId).toBe("adv-1");
      expect(body.conversion[1].agencyId).toBe("agency-1");
      expect(body.conversion[1].advertiserId).toBe("adv-1");
    });

    it("preserves all conversion row fields", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.insertConversions("agency-1", "adv-1", [
        {
          clickId: "click-1",
          conversionId: "order-1",
          conversionTimestamp: "1700000000000",
          revenueMicros: "5000000",
          currencyCode: "USD",
          segmentationType: "FLOODLIGHT",
          segmentationId: "11111",
          type: "TRANSACTION",
        },
      ]);

      const body = JSON.parse(httpClient.fetch.mock.calls[0][2].body);
      const row = body.conversion[0];
      expect(row.clickId).toBe("click-1");
      expect(row.conversionId).toBe("order-1");
      expect(row.revenueMicros).toBe("5000000");
      expect(row.currencyCode).toBe("USD");
      expect(row.segmentationId).toBe("11111");
      expect(row.type).toBe("TRANSACTION");
    });

    it("sends only v2 Conversion properties, even if a row carries extra keys", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.insertConversions("agency-1", "adv-1", [
        {
          clickId: "click-1",
          conversionId: "order-1",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
          segmentationName: "purchase",
          quantityMillis: "1000",
          state: "ACTIVE",
          customMetric: [{ name: "m", value: 1 }],
          customDimension: [{ name: "d", value: "x" }],
          // Legacy non-v2 keys must never reach the API.
          gclid: "g-1",
          floodlightActivityId: "11111",
        } as any,
      ]);

      const row = JSON.parse(httpClient.fetch.mock.calls[0][2].body).conversion[0];
      const unknown = Object.keys(row).filter((k) => !V2_CONVERSION_PROPERTIES.has(k));
      expect(unknown).toEqual([]);
      expect(row).not.toHaveProperty("gclid");
      expect(row).not.toHaveProperty("floodlightActivityId");
      expect(row.segmentationName).toBe("purchase");
      expect(row.customMetric).toEqual([{ name: "m", value: 1 }]);
    });

    it("returns API response", async () => {
      const apiResponse = {
        kind: "doubleclicksearch#conversionList",
        conversion: [{ conversionId: "c1", status: "SUCCESS" }],
      };
      httpClient.fetch.mockResolvedValueOnce(apiResponse);

      const result = await service.insertConversions("agency-1", "adv-1", [
        {
          clickId: "click-1",
          conversionId: "order-1",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
        },
      ]);

      expect(result).toEqual(apiResponse);
    });

    it("consumes rate limiter with advertiser key", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.insertConversions("agency-1", "adv-123", [
        {
          clickId: "click-1",
          conversionId: "order-1",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
        },
      ]);

      expect(rateLimiter.consume).toHaveBeenCalledWith("sa360v2:adv-123");
    });

    it("propagates errors from httpClient", async () => {
      httpClient.fetch.mockRejectedValueOnce(new Error("API error: 400"));

      await expect(
        service.insertConversions("agency-1", "adv-1", [
          {
            clickId: "click-1",
            conversionId: "order-1",
            conversionTimestamp: "1700000000000",
            segmentationType: "FLOODLIGHT",
          },
        ])
      ).rejects.toThrow("API error: 400");
    });
  });

  // ==========================================================================
  // updateConversions
  // ==========================================================================

  describe("updateConversions", () => {
    it("calls PUT /conversion with correct body structure", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.updateConversions("agency-1", "adv-1", [
        {
          conversionId: "c1",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
          revenueMicros: "10000000",
        },
      ]);

      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      const [path, , options] = httpClient.fetch.mock.calls[0];
      expect(path).toBe("/conversion");
      expect(options.method).toBe("PUT");

      const body = JSON.parse(options.body);
      expect(body.kind).toBe("doubleclicksearch#conversionList");
      expect(body.conversion).toHaveLength(1);
    });

    it("injects agencyId and advertiserId into each conversion row", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.updateConversions("agency-2", "adv-2", [
        {
          conversionId: "c1",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
        },
      ]);

      const body = JSON.parse(httpClient.fetch.mock.calls[0][2].body);
      expect(body.conversion[0].agencyId).toBe("agency-2");
      expect(body.conversion[0].advertiserId).toBe("adv-2");
    });

    it("preserves update fields", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.updateConversions("agency-1", "adv-1", [
        {
          conversionId: "c1",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
          revenueMicros: "15000000",
          state: "ACTIVE",
        },
      ]);

      const body = JSON.parse(httpClient.fetch.mock.calls[0][2].body);
      const row = body.conversion[0];
      expect(row.conversionId).toBe("c1");
      expect(row.revenueMicros).toBe("15000000");
      expect(row.state).toBe("ACTIVE");
    });

    it("consumes rate limiter with advertiser key", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.updateConversions("agency-1", "adv-456", [
        {
          conversionId: "c1",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
        },
      ]);

      expect(rateLimiter.consume).toHaveBeenCalledWith("sa360v2:adv-456");
    });

    it("handles multiple conversion rows", async () => {
      httpClient.fetch.mockResolvedValueOnce({});

      await service.updateConversions("agency-1", "adv-1", [
        {
          conversionId: "c1",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
        },
        {
          conversionId: "c2",
          conversionTimestamp: "1700000001000",
          segmentationType: "FLOODLIGHT",
        },
      ]);

      const body = JSON.parse(httpClient.fetch.mock.calls[0][2].body);
      expect(body.conversion).toHaveLength(2);
    });

    it("propagates errors from httpClient", async () => {
      httpClient.fetch.mockRejectedValueOnce(new Error("API error: 403"));

      await expect(
        service.updateConversions("agency-1", "adv-1", [
          {
            conversionId: "c1",
            conversionTimestamp: "1700000000000",
            segmentationType: "FLOODLIGHT",
          },
        ])
      ).rejects.toThrow("API error: 403");
    });
  });
});
