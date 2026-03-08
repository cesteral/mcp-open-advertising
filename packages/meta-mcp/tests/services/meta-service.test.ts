import { describe, it, expect, vi, beforeEach } from "vitest";
import { MetaService } from "../../src/services/meta/meta-service.js";

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

describe("MetaService", () => {
  let service: MetaService;
  let httpClient: ReturnType<typeof createMockHttpClient>;
  let rateLimiter: ReturnType<typeof createMockRateLimiter>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    httpClient = createMockHttpClient();
    rateLimiter = createMockRateLimiter();
    logger = createMockLogger();
    service = new MetaService(rateLimiter, httpClient, logger);
  });

  // ==========================================================================
  // normalizeAccountId (tested indirectly via public methods)
  // ==========================================================================

  describe("normalizeAccountId", () => {
    it("adds act_ prefix when missing", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listEntities("campaign", "123456789");

      const [path] = httpClient.get.mock.calls[0];
      expect(path).toBe("/act_123456789/campaigns");
    });

    it("keeps act_ prefix when already present", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listEntities("campaign", "act_123456789");

      const [path] = httpClient.get.mock.calls[0];
      expect(path).toBe("/act_123456789/campaigns");
    });
  });

  // ==========================================================================
  // listEntities
  // ==========================================================================

  describe("listEntities", () => {
    it("calls httpClient.get with correct path for campaigns", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listEntities("campaign", "act_123");

      expect(httpClient.get).toHaveBeenCalledTimes(1);
      const [path] = httpClient.get.mock.calls[0];
      expect(path).toBe("/act_123/campaigns");
    });

    it("calls httpClient.get with correct path for adSets", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listEntities("adSet", "act_123");

      const [path] = httpClient.get.mock.calls[0];
      expect(path).toBe("/act_123/adsets");
    });

    it("calls httpClient.get with correct path for ads", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listEntities("ad", "act_123");

      const [path] = httpClient.get.mock.calls[0];
      expect(path).toBe("/act_123/ads");
    });

    it("calls httpClient.get with correct path for adCreatives", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listEntities("adCreative", "act_123");

      const [path] = httpClient.get.mock.calls[0];
      expect(path).toBe("/act_123/adcreatives");
    });

    it("calls httpClient.get with correct path for customAudiences", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listEntities("customAudience", "act_123");

      const [path] = httpClient.get.mock.calls[0];
      expect(path).toBe("/act_123/customaudiences");
    });

    it("passes fields as comma-separated query param", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listEntities("campaign", "act_123", ["id", "name", "status"]);

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.fields).toBe("id,name,status");
    });

    it("uses default fields when none provided", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listEntities("campaign", "act_123");

      const [, params] = httpClient.get.mock.calls[0];
      // Campaign default fields include id, name, status, etc.
      expect(params.fields).toContain("id");
      expect(params.fields).toContain("name");
      expect(params.fields).toContain("status");
    });

    it("passes filtering as JSON string", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      const filtering = [{ field: "name", operator: "CONTAIN", value: "test" }];
      await service.listEntities("campaign", "act_123", undefined, filtering);

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.filtering).toBe(JSON.stringify(filtering));
    });

    it("passes limit as string", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listEntities("campaign", "act_123", undefined, undefined, 50);

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.limit).toBe("50");
    });

    it("passes after cursor", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listEntities("campaign", "act_123", undefined, undefined, undefined, "cursor123");

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.after).toBe("cursor123");
    });

    it("returns entities from data array", async () => {
      const campaigns = [{ id: "c1" }, { id: "c2" }];
      httpClient.get.mockResolvedValueOnce({ data: campaigns });

      const result = await service.listEntities("campaign", "act_123");

      expect(result.entities).toEqual(campaigns);
    });

    it("returns nextCursor from paging.cursors.after", async () => {
      httpClient.get.mockResolvedValueOnce({
        data: [{ id: "c1" }],
        paging: { cursors: { before: "abc", after: "xyz" } },
      });

      const result = await service.listEntities("campaign", "act_123");

      expect(result.nextCursor).toBe("xyz");
    });

    it("returns undefined nextCursor when no paging", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [{ id: "c1" }] });

      const result = await service.listEntities("campaign", "act_123");

      expect(result.nextCursor).toBeUndefined();
    });

    it("returns empty entities array when data is missing", async () => {
      httpClient.get.mockResolvedValueOnce({});

      const result = await service.listEntities("campaign", "act_123");

      expect(result.entities).toEqual([]);
    });

    it("returns empty entities array and logs a warning when data is not an array", async () => {
      httpClient.get.mockResolvedValueOnce({ data: { id: "c1" } });

      const result = await service.listEntities("campaign", "act_123");

      expect(result.entities).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        { dataType: "object", entityType: "campaign" },
        "Meta API returned unexpected non-array data field"
      );
    });

    it("calls rateLimiter.consume with account key", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listEntities("campaign", "act_123");

      expect(rateLimiter.consume).toHaveBeenCalledWith("meta:act_123");
    });
  });

  // ==========================================================================
  // getEntity
  // ==========================================================================

  describe("getEntity", () => {
    it("calls httpClient.get with entityId in path", async () => {
      const entity = { id: "123", name: "Test Campaign" };
      httpClient.get.mockResolvedValueOnce(entity);

      const result = await service.getEntity("campaign", "123");

      expect(result).toEqual(entity);
      expect(httpClient.get).toHaveBeenCalledTimes(1);
      const [path] = httpClient.get.mock.calls[0];
      expect(path).toBe("/123");
    });

    it("passes fields as comma-separated query param", async () => {
      httpClient.get.mockResolvedValueOnce({});

      await service.getEntity("campaign", "123", ["id", "name"]);

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.fields).toBe("id,name");
    });

    it("uses default fields when none provided", async () => {
      httpClient.get.mockResolvedValueOnce({});

      await service.getEntity("campaign", "123");

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.fields).toContain("id");
      expect(params.fields).toContain("name");
    });

    it("calls rateLimiter.consume with default key", async () => {
      httpClient.get.mockResolvedValueOnce({});

      await service.getEntity("campaign", "123");

      expect(rateLimiter.consume).toHaveBeenCalledWith("meta:default");
    });
  });

  // ==========================================================================
  // createEntity
  // ==========================================================================

  describe("createEntity", () => {
    it("calls httpClient.post with correct path and data", async () => {
      const data = { name: "New Campaign", objective: "OUTCOME_TRAFFIC" };
      const created = { id: "c1" };
      httpClient.post.mockResolvedValueOnce(created);

      const result = await service.createEntity("campaign", "act_123", data);

      expect(result).toEqual(created);
      const [path, body] = httpClient.post.mock.calls[0];
      expect(path).toBe("/act_123/campaigns");
      expect(body).toEqual(data);
    });

    it("normalizes account ID with act_ prefix", async () => {
      httpClient.post.mockResolvedValueOnce({ id: "c1" });

      await service.createEntity("campaign", "123456", { name: "Test" });

      const [path] = httpClient.post.mock.calls[0];
      expect(path).toBe("/act_123456/campaigns");
    });

    it("keeps act_ prefix when already present", async () => {
      httpClient.post.mockResolvedValueOnce({ id: "c1" });

      await service.createEntity("campaign", "act_123456", { name: "Test" });

      const [path] = httpClient.post.mock.calls[0];
      expect(path).toBe("/act_123456/campaigns");
    });

    it("calls rateLimiter.consume with 3x write cost", async () => {
      httpClient.post.mockResolvedValueOnce({});

      await service.createEntity("campaign", "act_123", { name: "Test" });

      expect(rateLimiter.consume).toHaveBeenCalledWith("meta:act_123", 3);
    });

    it("uses correct edge for adSet entities", async () => {
      httpClient.post.mockResolvedValueOnce({ id: "as1" });

      await service.createEntity("adSet", "act_123", { name: "Test Ad Set" });

      const [path] = httpClient.post.mock.calls[0];
      expect(path).toBe("/act_123/adsets");
    });
  });

  // ==========================================================================
  // updateEntity
  // ==========================================================================

  describe("updateEntity", () => {
    it("calls httpClient.post with entityId in path (PATCH semantics)", async () => {
      const data = { status: "PAUSED" };
      httpClient.post.mockResolvedValueOnce({ success: true });

      const result = await service.updateEntity("entity-123", data);

      expect(result).toEqual({ success: true });
      const [path, body] = httpClient.post.mock.calls[0];
      expect(path).toBe("/entity-123");
      expect(body).toEqual(data);
    });

    it("calls rateLimiter.consume with 3x write cost", async () => {
      httpClient.post.mockResolvedValueOnce({});

      await service.updateEntity("entity-123", { status: "ACTIVE" });

      expect(rateLimiter.consume).toHaveBeenCalledWith("meta:default", 3);
    });
  });

  // ==========================================================================
  // deleteEntity
  // ==========================================================================

  describe("deleteEntity", () => {
    it("calls httpClient.delete with entityId in path", async () => {
      httpClient.delete.mockResolvedValueOnce({ success: true });

      const result = await service.deleteEntity("entity-123");

      expect(result).toEqual({ success: true });
      const [path] = httpClient.delete.mock.calls[0];
      expect(path).toBe("/entity-123");
    });

    it("calls rateLimiter.consume with 3x write cost", async () => {
      httpClient.delete.mockResolvedValueOnce({});

      await service.deleteEntity("entity-123");

      expect(rateLimiter.consume).toHaveBeenCalledWith("meta:default", 3);
    });
  });

  // ==========================================================================
  // bulkCreateEntities
  // ==========================================================================

  describe("bulkCreateEntities", () => {
    it("creates multiple entities and returns results", async () => {
      httpClient.post
        .mockResolvedValueOnce({ id: "c1" })
        .mockResolvedValueOnce({ id: "c2" })
        .mockResolvedValueOnce({ id: "c3" });

      const items = [
        { name: "Campaign 1" },
        { name: "Campaign 2" },
        { name: "Campaign 3" },
      ];

      const result = await service.bulkCreateEntities("campaign", "act_123", items);

      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toEqual({ success: true, entity: { id: "c1" } });
      expect(result.results[1]).toEqual({ success: true, entity: { id: "c2" } });
      expect(result.results[2]).toEqual({ success: true, entity: { id: "c3" } });
    });

    it("handles partial failures", async () => {
      httpClient.post
        .mockResolvedValueOnce({ id: "c1" })
        .mockRejectedValueOnce(new Error("Rate limited"))
        .mockResolvedValueOnce({ id: "c3" });

      const items = [
        { name: "Campaign 1" },
        { name: "Campaign 2" },
        { name: "Campaign 3" },
      ];

      const result = await service.bulkCreateEntities("campaign", "act_123", items);

      expect(result.results).toHaveLength(3);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe("Rate limited");
      expect(result.results[2].success).toBe(true);
    });

    it("handles empty items array", async () => {
      const result = await service.bulkCreateEntities("campaign", "act_123", []);

      expect(result.results).toHaveLength(0);
      expect(httpClient.post).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // bulkUpdateStatus
  // ==========================================================================

  describe("bulkUpdateStatus", () => {
    it("updates multiple entity statuses", async () => {
      httpClient.post
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true });

      const result = await service.bulkUpdateStatus(
        ["entity-1", "entity-2"],
        "PAUSED"
      );

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ entityId: "entity-1", success: true });
      expect(result.results[1]).toEqual({ entityId: "entity-2", success: true });
    });

    it("includes entityId in each result", async () => {
      httpClient.post.mockResolvedValue({ success: true });

      const result = await service.bulkUpdateStatus(
        ["a", "b", "c"],
        "ACTIVE"
      );

      expect(result.results.map((r) => r.entityId)).toEqual(["a", "b", "c"]);
    });

    it("handles partial failures with error messages", async () => {
      httpClient.post
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error("Cannot pause archived entity"));

      const result = await service.bulkUpdateStatus(
        ["entity-1", "entity-2"],
        "PAUSED"
      );

      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe("Cannot pause archived entity");
    });
  });

  // ==========================================================================
  // listAdAccounts
  // ==========================================================================

  describe("listAdAccounts", () => {
    it("calls correct path /me/adaccounts", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listAdAccounts();

      const [path] = httpClient.get.mock.calls[0];
      expect(path).toBe("/me/adaccounts");
    });

    it("uses default fields when none provided", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listAdAccounts();

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.fields).toContain("id");
      expect(params.fields).toContain("name");
      expect(params.fields).toContain("account_status");
      expect(params.fields).toContain("currency");
    });

    it("uses custom fields when provided", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listAdAccounts(["id", "name"]);

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.fields).toBe("id,name");
    });

    it("passes limit as string", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listAdAccounts(undefined, 10);

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.limit).toBe("10");
    });

    it("calls rateLimiter.consume with default key", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.listAdAccounts();

      expect(rateLimiter.consume).toHaveBeenCalledWith("meta:default");
    });

    it("returns empty accounts array and logs a warning when data is not an array", async () => {
      httpClient.get.mockResolvedValueOnce({ data: { id: "act_1" } });

      const result = await service.listAdAccounts();

      expect(result.accounts).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        { dataType: "object" },
        "Meta API returned unexpected non-array data field for ad accounts"
      );
    });
  });

  // ==========================================================================
  // duplicateEntity
  // ==========================================================================

  describe("duplicateEntity", () => {
    it("calls httpClient.post with /{entityId}/copies", async () => {
      httpClient.post.mockResolvedValueOnce({ copied_id: "new-123" });

      await service.duplicateEntity("entity-123", { rename_options: { rename_suffix: " - Copy" } });

      const [path, body] = httpClient.post.mock.calls[0];
      expect(path).toBe("/entity-123/copies");
      expect(body).toEqual({ rename_options: { rename_suffix: " - Copy" } });
    });

    it("calls rateLimiter.consume with 3x write cost", async () => {
      httpClient.post.mockResolvedValueOnce({});

      await service.duplicateEntity("entity-123");

      expect(rateLimiter.consume).toHaveBeenCalledWith("meta:default", 3);
    });
  });

  // ==========================================================================
  // getDeliveryEstimate
  // ==========================================================================

  describe("getDeliveryEstimate", () => {
    it("calls httpClient.get with correct path and targeting_spec", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      const targetingSpec = { geo_locations: { countries: ["US"] } };
      await service.getDeliveryEstimate("act_123", targetingSpec);

      const [path, params] = httpClient.get.mock.calls[0];
      expect(path).toBe("/act_123/delivery_estimate");
      expect(params.targeting_spec).toBe(JSON.stringify(targetingSpec));
    });

    it("normalizes account ID", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getDeliveryEstimate("123456", {});

      const [path] = httpClient.get.mock.calls[0];
      expect(path).toBe("/act_123456/delivery_estimate");
    });

    it("passes optimization_goal when provided", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getDeliveryEstimate("act_123", {}, "LINK_CLICKS");

      const [, params] = httpClient.get.mock.calls[0];
      expect(params.optimization_goal).toBe("LINK_CLICKS");
    });

    it("calls rateLimiter.consume with account key", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getDeliveryEstimate("act_123", {});

      expect(rateLimiter.consume).toHaveBeenCalledWith("meta:act_123");
    });
  });

  // ==========================================================================
  // getAdPreviews
  // ==========================================================================

  describe("getAdPreviews", () => {
    it("calls httpClient.get with correct path and ad_format param", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getAdPreviews("ad-123", "DESKTOP_FEED_STANDARD");

      const [path, params] = httpClient.get.mock.calls[0];
      expect(path).toBe("/ad-123/previews");
      expect(params.ad_format).toBe("DESKTOP_FEED_STANDARD");
    });

    it("calls rateLimiter.consume with default key", async () => {
      httpClient.get.mockResolvedValueOnce({ data: [] });

      await service.getAdPreviews("ad-123", "MOBILE_FEED_STANDARD");

      expect(rateLimiter.consume).toHaveBeenCalledWith("meta:default");
    });
  });
});
