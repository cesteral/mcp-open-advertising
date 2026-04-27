import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpError, JsonRpcErrorCode } from "../../src/utils/errors/index.js";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock("../../src/utils/telemetry/index.js", () => ({
  withDV360ApiSpan: vi
    .fn()
    .mockImplementation((_op: string, _type: string, fn: () => unknown) => fn()),
  setSpanAttribute: vi.fn(),
}));

vi.mock("../../src/services/domain/entity-mapping.js", () => ({
  getEntityConfigDynamic: vi.fn(),
  getEntitySchemaForOperation: vi.fn(),
}));

import { DV360Service } from "../../src/services/dv360/DV360-service.js";
import {
  getEntityConfigDynamic,
  getEntitySchemaForOperation,
} from "../../src/services/domain/entity-mapping.js";

// ---------------------------------------------------------------------------
// Helpers
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

function createMockRateLimiter() {
  return { consume: vi.fn().mockResolvedValue(undefined) } as any;
}

function createMockHttpClient() {
  return {
    fetch: vi.fn(),
    fetchRaw: vi.fn(),
    getUploadBaseUrl: vi
      .fn()
      .mockReturnValue("https://displayvideo.googleapis.com/upload/displayvideo/v4"),
  } as any;
}

/**
 * Configure the mocked getEntityConfigDynamic to return a config object.
 * Merges sensible defaults with any caller overrides.
 */
function mockEntityConfig(overrides?: Partial<Record<string, unknown>>) {
  const config = {
    apiPath: "/advertisers/123/lineItems",
    parentIds: ["advertiserId"],
    queryParamIds: [] as string[],
    filterParamIds: [] as string[],
    supportsFilter: true,
    supportsCreate: true,
    supportsUpdate: true,
    supportsDelete: true,
    ...overrides,
  };
  (getEntityConfigDynamic as ReturnType<typeof vi.fn>).mockReturnValue(config);
  return config;
}

/**
 * Configure the mocked getEntitySchemaForOperation to return a passthrough
 * schema whose `.parse()` simply returns whatever value it receives.
 */
function mockEntitySchema() {
  const schema = { parse: vi.fn().mockImplementation((v: unknown) => v) };
  (getEntitySchemaForOperation as ReturnType<typeof vi.fn>).mockReturnValue(schema);
  return schema;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DV360Service", () => {
  let service: DV360Service;
  let logger: ReturnType<typeof createMockLogger>;
  let rateLimiter: ReturnType<typeof createMockRateLimiter>;
  let httpClient: ReturnType<typeof createMockHttpClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    rateLimiter = createMockRateLimiter();
    httpClient = createMockHttpClient();
    service = new DV360Service(logger, rateLimiter, httpClient);
  });

  // ==========================================================================
  // listEntities
  // ==========================================================================

  describe("listEntities", () => {
    it("lists entities successfully", async () => {
      mockEntityConfig();
      mockEntitySchema();
      httpClient.fetch.mockResolvedValue({
        lineItems: [{ id: "li-1" }, { id: "li-2" }],
        nextPageToken: "page2",
      });

      const result = await service.listEntities("lineItem", { advertiserId: "123" });

      expect(result.entities).toEqual([{ id: "li-1" }, { id: "li-2" }]);
      expect(result.nextPageToken).toBe("page2");
      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
    });

    it("throws McpError when a required parent ID is missing", async () => {
      mockEntityConfig({ parentIds: ["advertiserId", "campaignId"] });

      await expect(service.listEntities("lineItem", { advertiserId: "123" })).rejects.toThrow(
        McpError
      );

      try {
        await service.listEntities("lineItem", { advertiserId: "123" });
      } catch (err) {
        expect((err as McpError).code).toBe(JsonRpcErrorCode.InvalidParams);
        expect((err as McpError).message).toContain("campaignId");
      }
    });

    it("passes filter, pageToken, and pageSize as query params", async () => {
      mockEntityConfig();
      mockEntitySchema();
      httpClient.fetch.mockResolvedValue({ lineItems: [] });

      await service.listEntities(
        "lineItem",
        { advertiserId: "123" },
        "status=ACTIVE",
        "next-page",
        25
      );

      const calledPath = httpClient.fetch.mock.calls[0][0] as string;
      expect(calledPath).toContain("filter=status%3DACTIVE");
      expect(calledPath).toContain("pageToken=next-page");
      expect(calledPath).toContain("pageSize=25");
    });

    it("uses function-based apiPath when config provides one", async () => {
      mockEntityConfig({
        apiPath: (ids: Record<string, string>) => `/advertisers/${ids.advertiserId}/lineItems`,
        parentIds: ["advertiserId"],
      });
      mockEntitySchema();
      httpClient.fetch.mockResolvedValue({ lineItems: [] });

      await service.listEntities("lineItem", { advertiserId: "456" });

      const calledPath = httpClient.fetch.mock.calls[0][0] as string;
      expect(calledPath).toContain("/advertisers/456/lineItems");
    });

    it("adds queryParamIds to query string", async () => {
      mockEntityConfig({
        apiPath: "/advertisers",
        parentIds: ["partnerId"],
        queryParamIds: ["partnerId"],
      });
      mockEntitySchema();
      httpClient.fetch.mockResolvedValue({ advertisers: [] });

      await service.listEntities("advertiser", { partnerId: "p-99" });

      const calledPath = httpClient.fetch.mock.calls[0][0] as string;
      expect(calledPath).toContain("partnerId=p-99");
    });

    it("rate-limits by advertiserId", async () => {
      mockEntityConfig();
      mockEntitySchema();
      httpClient.fetch.mockResolvedValue({ lineItems: [] });

      await service.listEntities("lineItem", { advertiserId: "789" });

      expect(rateLimiter.consume).toHaveBeenCalledWith("dv360:789", 1);
    });

    it("returns entities and nextPageToken from validated response", async () => {
      mockEntityConfig();
      const schema = mockEntitySchema();
      const responsePayload = {
        lineItems: [{ id: "li-100" }],
        nextPageToken: "tkn-abc",
      };
      httpClient.fetch.mockResolvedValue(responsePayload);

      const result = await service.listEntities("lineItem", { advertiserId: "123" });

      expect(schema.parse).toHaveBeenCalledWith(responsePayload);
      expect(result.entities).toEqual([{ id: "li-100" }]);
      expect(result.nextPageToken).toBe("tkn-abc");
    });

    it("returns empty entities when response has no matching key", async () => {
      mockEntityConfig();
      mockEntitySchema();
      httpClient.fetch.mockResolvedValue({});

      const result = await service.listEntities("lineItem", { advertiserId: "123" });

      expect(result.entities).toEqual([]);
      expect(result.nextPageToken).toBeUndefined();
    });
  });

  // ==========================================================================
  // getEntity
  // ==========================================================================

  describe("getEntity", () => {
    it("gets entity by ID", async () => {
      mockEntityConfig();
      mockEntitySchema();
      const entity = { lineItemId: "li-1", displayName: "My Line Item" };
      httpClient.fetch.mockResolvedValue(entity);

      const result = await service.getEntity("lineItem", {
        advertiserId: "123",
        lineItemId: "li-1",
      });

      expect(result).toEqual(entity);
      const calledPath = httpClient.fetch.mock.calls[0][0] as string;
      expect(calledPath).toBe("/advertisers/123/lineItems/li-1");
    });

    it("throws McpError when entity ID is missing", async () => {
      mockEntityConfig();

      await expect(service.getEntity("lineItem", { advertiserId: "123" })).rejects.toThrow(
        McpError
      );

      try {
        await service.getEntity("lineItem", { advertiserId: "123" });
      } catch (err) {
        expect((err as McpError).code).toBe(JsonRpcErrorCode.InvalidParams);
        expect((err as McpError).message).toContain("Entity ID is required");
      }
    });

    it("rate-limits by advertiserId", async () => {
      mockEntityConfig();
      mockEntitySchema();
      httpClient.fetch.mockResolvedValue({ lineItemId: "li-1" });

      await service.getEntity("lineItem", { advertiserId: "555", lineItemId: "li-1" });

      expect(rateLimiter.consume).toHaveBeenCalledWith("dv360:555", 1);
    });

    it("does not rate-limit when advertiserId is absent", async () => {
      mockEntityConfig({ parentIds: [] });
      mockEntitySchema();
      httpClient.fetch.mockResolvedValue({ partnerId: "p-1" });

      await service.getEntity("partner", { partnerId: "p-1" });

      expect(rateLimiter.consume).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // createEntity
  // ==========================================================================

  describe("createEntity", () => {
    it("creates entity with POST", async () => {
      mockEntityConfig();
      mockEntitySchema();
      const inputData = { displayName: "New Line Item" };
      const created = { lineItemId: "li-new", displayName: "New Line Item" };
      httpClient.fetch.mockResolvedValue(created);

      const result = await service.createEntity("lineItem", { advertiserId: "123" }, inputData);

      expect(result).toEqual(created);
      expect(httpClient.fetch).toHaveBeenCalledWith(
        "/advertisers/123/lineItems",
        undefined,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inputData),
        })
      );
    });

    it("throws McpError when create is not supported", async () => {
      mockEntityConfig({ supportsCreate: false });

      await expect(service.createEntity("partner", {}, { displayName: "test" })).rejects.toThrow(
        McpError
      );

      try {
        await service.createEntity("partner", {}, { displayName: "test" });
      } catch (err) {
        expect((err as McpError).code).toBe(JsonRpcErrorCode.InvalidParams);
        expect((err as McpError).message).toContain("does not support create");
      }
    });

    it("rate-limits by advertiserId on create", async () => {
      mockEntityConfig();
      mockEntitySchema();
      httpClient.fetch.mockResolvedValue({});

      await service.createEntity("lineItem", { advertiserId: "321" }, { displayName: "Test" });

      expect(rateLimiter.consume).toHaveBeenCalledWith("dv360:321", 1);
    });
  });

  // ==========================================================================
  // updateEntity
  // ==========================================================================

  describe("updateEntity", () => {
    it("gets current entity, deep-merges, and PATCHes with updateMask", async () => {
      mockEntityConfig();
      mockEntitySchema();
      const currentEntity = {
        lineItemId: "li-1",
        displayName: "Old Name",
        budget: { amount: 100 },
      };
      const updateData = { displayName: "New Name" };
      const patchResponse = { ...currentEntity, ...updateData };

      // First call is getEntity (internal), second is the PATCH
      httpClient.fetch
        .mockResolvedValueOnce(currentEntity) // getEntity
        .mockResolvedValueOnce(patchResponse); // PATCH

      const result = await service.updateEntity(
        "lineItem",
        { advertiserId: "123", lineItemId: "li-1" },
        updateData,
        "displayName"
      );

      expect(result).toEqual(patchResponse);

      // The PATCH call is the second httpClient.fetch call
      const patchCall = httpClient.fetch.mock.calls[1];
      expect(patchCall[0]).toContain("/advertisers/123/lineItems/li-1");
      expect(patchCall[0]).toContain("updateMask=displayName");
      expect(patchCall[2].method).toBe("PATCH");

      // Verify the body is the deep-merged entity
      const sentBody = JSON.parse(patchCall[2].body);
      expect(sentBody.displayName).toBe("New Name");
      expect(sentBody.budget).toEqual({ amount: 100 });
    });

    it("throws McpError when update is not supported", async () => {
      mockEntityConfig({ supportsUpdate: false });

      await expect(
        service.updateEntity("partner", { partnerId: "p-1" }, { displayName: "x" }, "displayName")
      ).rejects.toThrow(McpError);

      try {
        await service.updateEntity(
          "partner",
          { partnerId: "p-1" },
          { displayName: "x" },
          "displayName"
        );
      } catch (err) {
        expect((err as McpError).code).toBe(JsonRpcErrorCode.InvalidParams);
        expect((err as McpError).message).toContain("does not support update");
      }
    });

    it("encodes updateMask in the URL", async () => {
      mockEntityConfig();
      mockEntitySchema();
      httpClient.fetch
        .mockResolvedValueOnce({ lineItemId: "li-1" }) // getEntity
        .mockResolvedValueOnce({}); // PATCH

      await service.updateEntity(
        "lineItem",
        { advertiserId: "123", lineItemId: "li-1" },
        { displayName: "Updated" },
        "displayName,budget.amount"
      );

      const patchPath = httpClient.fetch.mock.calls[1][0] as string;
      expect(patchPath).toContain("updateMask=displayName%2Cbudget.amount");
    });

    it("rate-limits by advertiserId for the PATCH call", async () => {
      mockEntityConfig();
      mockEntitySchema();
      httpClient.fetch.mockResolvedValueOnce({ lineItemId: "li-1" }).mockResolvedValueOnce({});

      await service.updateEntity(
        "lineItem",
        { advertiserId: "777", lineItemId: "li-1" },
        { displayName: "X" },
        "displayName"
      );

      // Rate limiter should have been called for both getEntity and updateEntity
      const consumeCalls = rateLimiter.consume.mock.calls.filter(
        (c: string[]) => c[0] === "dv360:777"
      );
      expect(consumeCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // deleteEntity
  // ==========================================================================

  describe("deleteEntity", () => {
    it("deletes entity with DELETE", async () => {
      mockEntityConfig();
      httpClient.fetch.mockResolvedValue(undefined);

      await service.deleteEntity("lineItem", { advertiserId: "123", lineItemId: "li-1" });

      expect(httpClient.fetch).toHaveBeenCalledWith("/advertisers/123/lineItems/li-1", undefined, {
        method: "DELETE",
      });
    });

    it("throws McpError when delete is not supported", async () => {
      mockEntityConfig({ supportsDelete: false });

      await expect(service.deleteEntity("partner", { partnerId: "p-1" })).rejects.toThrow(McpError);

      try {
        await service.deleteEntity("partner", { partnerId: "p-1" });
      } catch (err) {
        expect((err as McpError).code).toBe(JsonRpcErrorCode.InvalidParams);
        expect((err as McpError).message).toContain("does not support delete");
      }
    });

    it("throws McpError when entity ID is missing for delete", async () => {
      mockEntityConfig();

      await expect(service.deleteEntity("lineItem", { advertiserId: "123" })).rejects.toThrow(
        McpError
      );

      try {
        await service.deleteEntity("lineItem", { advertiserId: "123" });
      } catch (err) {
        expect((err as McpError).code).toBe(JsonRpcErrorCode.InvalidParams);
        expect((err as McpError).message).toContain("Entity ID is required");
      }
    });

    it("rate-limits by advertiserId on delete", async () => {
      mockEntityConfig();
      httpClient.fetch.mockResolvedValue(undefined);

      await service.deleteEntity("lineItem", { advertiserId: "888", lineItemId: "li-1" });

      expect(rateLimiter.consume).toHaveBeenCalledWith("dv360:888", 1);
    });
  });

  // ==========================================================================
  // Custom Bidding — uploadCustomBiddingScript
  // ==========================================================================

  describe("uploadCustomBiddingScript", () => {
    it("sends binary POST to the correct upload URL", async () => {
      const responseObj = {
        ok: true,
        status: 200,
        statusText: "OK",
        json: vi.fn().mockResolvedValue({ resourceName: "media/abc123" }),
        text: vi.fn().mockResolvedValue(""),
      };
      httpClient.fetchRaw.mockResolvedValue(responseObj);

      const result = await service.uploadCustomBiddingScript(
        "algo-42",
        "function main() { return 1.0; }"
      );

      expect(result).toEqual({ resourceName: "media/abc123" });
      expect(httpClient.fetchRaw).toHaveBeenCalledTimes(1);

      const [url, timeout, _context, opts] = httpClient.fetchRaw.mock.calls[0];
      expect(url).toBe(
        "https://displayvideo.googleapis.com/upload/displayvideo/v4/customBiddingAlgorithms/algo-42:uploadScript"
      );
      expect(timeout).toBe(30000);
      expect(opts.method).toBe("POST");
      expect(opts.headers["Content-Type"]).toBe("application/octet-stream");
      expect(opts.body).toBe("function main() { return 1.0; }");
    });

    it("throws McpError on non-OK response (client error)", async () => {
      const responseObj = {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: vi.fn(),
        text: vi.fn().mockResolvedValue("invalid script format"),
      };
      httpClient.fetchRaw.mockResolvedValue(responseObj);

      await expect(service.uploadCustomBiddingScript("algo-42", "bad content")).rejects.toThrow(
        McpError
      );

      try {
        // Reset mock for second call
        httpClient.fetchRaw.mockResolvedValue(responseObj);
        await service.uploadCustomBiddingScript("algo-42", "bad content");
      } catch (err) {
        expect((err as McpError).code).toBe(JsonRpcErrorCode.InvalidRequest);
        expect((err as McpError).message).toContain("Failed to upload custom bidding script");
      }
    });

    it("throws McpError with ServiceUnavailable for 5xx responses", async () => {
      const responseObj = {
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: vi.fn(),
        text: vi.fn().mockResolvedValue("service down"),
      };
      httpClient.fetchRaw.mockResolvedValue(responseObj);

      try {
        await service.uploadCustomBiddingScript("algo-42", "some script");
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(McpError);
        expect((err as McpError).code).toBe(JsonRpcErrorCode.ServiceUnavailable);
      }
    });
  });

  // ==========================================================================
  // Custom Bidding — createCustomBiddingScript
  // ==========================================================================

  describe("createCustomBiddingScript", () => {
    it("creates script resource with POST", async () => {
      const scriptResource = {
        name: "customBiddingAlgorithms/algo-42/scripts/script-1",
        customBiddingAlgorithmId: "algo-42",
        customBiddingScriptId: "script-1",
        createTime: "2025-01-15T12:00:00Z",
        active: false,
        state: "PENDING" as const,
      };
      httpClient.fetch.mockResolvedValue(scriptResource);

      const result = await service.createCustomBiddingScript("algo-42", "media/abc123");

      expect(result).toEqual(scriptResource);
      expect(httpClient.fetch).toHaveBeenCalledWith(
        "/customBiddingAlgorithms/algo-42/scripts",
        undefined,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            script: { resourceName: "media/abc123" },
          }),
        })
      );
    });
  });

  // ==========================================================================
  // Custom Bidding — listCustomBiddingScripts
  // ==========================================================================

  describe("listCustomBiddingScripts", () => {
    it("lists scripts with pagination", async () => {
      const scripts = [
        { name: "algo/42/scripts/1", customBiddingScriptId: "1", state: "ACCEPTED" },
      ];
      httpClient.fetch.mockResolvedValue({
        customBiddingScripts: scripts,
        nextPageToken: "next",
      });

      const result = await service.listCustomBiddingScripts("algo-42", undefined, 10);

      expect(result.scripts).toEqual(scripts);
      expect(result.nextPageToken).toBe("next");

      const calledPath = httpClient.fetch.mock.calls[0][0] as string;
      expect(calledPath).toContain("/customBiddingAlgorithms/algo-42/scripts");
      expect(calledPath).toContain("pageSize=10");
    });

    it("returns empty scripts array when response has no scripts", async () => {
      httpClient.fetch.mockResolvedValue({});

      const result = await service.listCustomBiddingScripts("algo-42");

      expect(result.scripts).toEqual([]);
      expect(result.nextPageToken).toBeUndefined();
    });
  });

  // ==========================================================================
  // Custom Bidding — uploadCustomBiddingRules
  // ==========================================================================

  describe("uploadCustomBiddingRules", () => {
    it("sends binary POST to the rules upload URL", async () => {
      const responseObj = {
        ok: true,
        status: 200,
        statusText: "OK",
        json: vi.fn().mockResolvedValue({ resourceName: "media/rules-456" }),
        text: vi.fn().mockResolvedValue(""),
      };
      httpClient.fetchRaw.mockResolvedValue(responseObj);

      const result = await service.uploadCustomBiddingRules("algo-42", '{"rules": []}');

      expect(result).toEqual({ resourceName: "media/rules-456" });

      const [url, _timeout, _ctx, opts] = httpClient.fetchRaw.mock.calls[0];
      expect(url).toBe(
        "https://displayvideo.googleapis.com/upload/displayvideo/v4/customBiddingAlgorithms/algo-42:uploadRules"
      );
      expect(opts.method).toBe("POST");
      expect(opts.headers["Content-Type"]).toBe("application/octet-stream");
    });

    it("throws McpError on non-OK rules upload response", async () => {
      const responseObj = {
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        json: vi.fn(),
        text: vi.fn().mockResolvedValue("invalid rules format"),
      };
      httpClient.fetchRaw.mockResolvedValue(responseObj);

      try {
        await service.uploadCustomBiddingRules("algo-42", "bad rules");
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(McpError);
        expect((err as McpError).code).toBe(JsonRpcErrorCode.InvalidRequest);
        expect((err as McpError).message).toContain("Failed to upload custom bidding rules");
      }
    });
  });

  // ==========================================================================
  // Custom Bidding — createCustomBiddingRules
  // ==========================================================================

  describe("createCustomBiddingRules", () => {
    it("creates rules resource with POST", async () => {
      const rulesResource = {
        name: "customBiddingAlgorithms/algo-42/rules/rules-1",
        customBiddingAlgorithmId: "algo-42",
        customBiddingAlgorithmRulesId: "rules-1",
        createTime: "2025-01-15T12:00:00Z",
        active: false,
        state: "ACCEPTED" as const,
      };
      httpClient.fetch.mockResolvedValue(rulesResource);

      const result = await service.createCustomBiddingRules("algo-42", "media/rules-456");

      expect(result).toEqual(rulesResource);
      expect(httpClient.fetch).toHaveBeenCalledWith(
        "/customBiddingAlgorithms/algo-42/rules",
        undefined,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            rules: { resourceName: "media/rules-456" },
          }),
        })
      );
    });
  });

  // ==========================================================================
  // Custom Bidding — getCustomBiddingScript / getCustomBiddingRules
  // ==========================================================================

  describe("getCustomBiddingScript", () => {
    it("fetches a specific script by algorithm and script ID", async () => {
      const script = {
        name: "customBiddingAlgorithms/algo-42/scripts/s-7",
        customBiddingAlgorithmId: "algo-42",
        customBiddingScriptId: "s-7",
        state: "ACCEPTED",
      };
      httpClient.fetch.mockResolvedValue(script);

      const result = await service.getCustomBiddingScript("algo-42", "s-7");

      expect(result).toEqual(script);
      expect(httpClient.fetch).toHaveBeenCalledWith(
        "/customBiddingAlgorithms/algo-42/scripts/s-7",
        undefined
      );
    });
  });

  describe("getCustomBiddingRules", () => {
    it("fetches specific rules by algorithm and rules ID", async () => {
      const rules = {
        name: "customBiddingAlgorithms/algo-42/rules/r-9",
        customBiddingAlgorithmId: "algo-42",
        customBiddingAlgorithmRulesId: "r-9",
        state: "ACCEPTED",
      };
      httpClient.fetch.mockResolvedValue(rules);

      const result = await service.getCustomBiddingRules("algo-42", "r-9");

      expect(result).toEqual(rules);
      expect(httpClient.fetch).toHaveBeenCalledWith(
        "/customBiddingAlgorithms/algo-42/rules/r-9",
        undefined
      );
    });
  });
});
