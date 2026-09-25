import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

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
    getUploadBaseUrl: vi.fn().mockReturnValue("https://displayvideo.googleapis.com/upload/v4"),
    getMediaUploadUrl: vi
      .fn()
      .mockImplementation(
        (resourceName: string) => `https://displayvideo.googleapis.com/upload/media/${resourceName}`
      ),
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
    // DV360's reservation resourceName for the upload location.
    const SCRIPT_REF = "customBiddingAlgorithm/algo-42/scriptRef/xyz";

    it("reserves a location (GET) then POSTs the bytes to the media URL", async () => {
      // Step 1: GET :uploadScript reserves a location.
      httpClient.fetch.mockResolvedValue({ resourceName: SCRIPT_REF });
      // Step 2: POST the bytes to the version-less media endpoint.
      httpClient.fetchRaw.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(""),
      });

      const result = await service.uploadCustomBiddingScript(
        "algo-42",
        "function main() { return 1.0; }",
        { advertiserId: "adv-1" }
      );

      // The reserved resourceName is returned for scripts.create.
      expect(result).toEqual({ resourceName: SCRIPT_REF });

      // Step 1 assertions: GET (no body) on the regular API base, owner-scoped.
      expect(httpClient.fetch).toHaveBeenCalledTimes(1);
      expect(httpClient.fetch).toHaveBeenCalledWith(
        "/customBiddingAlgorithms/algo-42:uploadScript?advertiserId=adv-1",
        undefined
      );

      // Step 2 assertions: POST the octet-stream body to /upload/media/{ref}.
      expect(httpClient.fetchRaw).toHaveBeenCalledTimes(1);
      const [url, timeout, _context, opts] = httpClient.fetchRaw.mock.calls[0];
      expect(url).toBe(
        `https://displayvideo.googleapis.com/upload/media/${SCRIPT_REF}?uploadType=media`
      );
      expect(timeout).toBe(30000);
      expect(opts.method).toBe("POST");
      expect(opts.headers["Content-Type"]).toBe("application/octet-stream");
      expect(opts.body).toBe("function main() { return 1.0; }");
    });

    it("throws if the reservation returns no resourceName", async () => {
      httpClient.fetch.mockResolvedValue({});

      await expect(
        service.uploadCustomBiddingScript("algo-42", "content", { advertiserId: "adv-1" })
      ).rejects.toThrow(McpError);
      // No bytes are uploaded without a reserved location.
      expect(httpClient.fetchRaw).not.toHaveBeenCalled();
    });

    it("throws McpError on non-OK media response (client error)", async () => {
      httpClient.fetch.mockResolvedValue({ resourceName: SCRIPT_REF });
      const responseObj = {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: vi.fn(),
        text: vi.fn().mockResolvedValue("invalid script format"),
      };
      httpClient.fetchRaw.mockResolvedValue(responseObj);

      try {
        await service.uploadCustomBiddingScript("algo-42", "bad content", {
          advertiserId: "adv-1",
        });
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(McpError);
        expect((err as McpError).code).toBe(JsonRpcErrorCode.InvalidRequest);
        expect((err as McpError).message).toContain("Failed to upload custom bidding script");
      }
    });

    it("throws McpError with ServiceUnavailable for 5xx media responses", async () => {
      httpClient.fetch.mockResolvedValue({ resourceName: SCRIPT_REF });
      httpClient.fetchRaw.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: vi.fn(),
        text: vi.fn().mockResolvedValue("service down"),
      });

      try {
        await service.uploadCustomBiddingScript("algo-42", "some script", {
          advertiserId: "adv-1",
        });
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

      const result = await service.createCustomBiddingScript("algo-42", "media/abc123", {
        advertiserId: "adv-1",
      });

      expect(result).toEqual(scriptResource);
      expect(httpClient.fetch).toHaveBeenCalledWith(
        "/customBiddingAlgorithms/algo-42/scripts?advertiserId=adv-1",
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

      const result = await service.listCustomBiddingScripts("algo-42", undefined, 10, {
        advertiserId: "adv-1",
      });

      expect(result.scripts).toEqual(scripts);
      expect(result.nextPageToken).toBe("next");

      const calledPath = httpClient.fetch.mock.calls[0][0] as string;
      expect(calledPath).toContain("/customBiddingAlgorithms/algo-42/scripts");
      expect(calledPath).toContain("pageSize=10");
    });

    it("returns empty scripts array when response has no scripts", async () => {
      httpClient.fetch.mockResolvedValue({});

      const result = await service.listCustomBiddingScripts("algo-42", undefined, undefined, {
        advertiserId: "adv-1",
      });

      expect(result.scripts).toEqual([]);
      expect(result.nextPageToken).toBeUndefined();
    });
  });

  // ==========================================================================
  // Custom Bidding — uploadCustomBiddingRules
  // ==========================================================================

  describe("uploadCustomBiddingRules", () => {
    const RULES_REF = "customBiddingAlgorithm/algo-42/rulesRef/abc";

    it("reserves a location (GET) then POSTs the bytes to the media URL", async () => {
      httpClient.fetch.mockResolvedValue({ resourceName: RULES_REF });
      httpClient.fetchRaw.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: vi.fn().mockResolvedValue({}),
        text: vi.fn().mockResolvedValue(""),
      });

      const result = await service.uploadCustomBiddingRules("algo-42", '{"rules": []}', {
        advertiserId: "adv-1",
      });

      expect(result).toEqual({ resourceName: RULES_REF });

      expect(httpClient.fetch).toHaveBeenCalledWith(
        "/customBiddingAlgorithms/algo-42:uploadRules?advertiserId=adv-1",
        undefined
      );

      const [url, _timeout, _ctx, opts] = httpClient.fetchRaw.mock.calls[0];
      expect(url).toBe(
        `https://displayvideo.googleapis.com/upload/media/${RULES_REF}?uploadType=media`
      );
      expect(opts.method).toBe("POST");
      expect(opts.headers["Content-Type"]).toBe("application/octet-stream");
      expect(opts.body).toBe('{"rules": []}');
    });

    it("throws McpError on non-OK rules media response", async () => {
      httpClient.fetch.mockResolvedValue({ resourceName: RULES_REF });
      const responseObj = {
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        json: vi.fn(),
        text: vi.fn().mockResolvedValue("invalid rules format"),
      };
      httpClient.fetchRaw.mockResolvedValue(responseObj);

      try {
        await service.uploadCustomBiddingRules("algo-42", "bad rules", { advertiserId: "adv-1" });
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

      const result = await service.createCustomBiddingRules("algo-42", "media/rules-456", {
        advertiserId: "adv-1",
      });

      expect(result).toEqual(rulesResource);
      expect(httpClient.fetch).toHaveBeenCalledWith(
        "/customBiddingAlgorithms/algo-42/rules?advertiserId=adv-1",
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

      const result = await service.getCustomBiddingScript("algo-42", "s-7", {
        advertiserId: "adv-1",
      });

      expect(result).toEqual(script);
      expect(httpClient.fetch).toHaveBeenCalledWith(
        "/customBiddingAlgorithms/algo-42/scripts/s-7?advertiserId=adv-1",
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

      const result = await service.getCustomBiddingRules("algo-42", "r-9", {
        advertiserId: "adv-1",
      });

      expect(result).toEqual(rules);
      expect(httpClient.fetch).toHaveBeenCalledWith(
        "/customBiddingAlgorithms/algo-42/rules/r-9?advertiserId=adv-1",
        undefined
      );
    });
  });

  // ==========================================================================
  // Custom bidding response enums — v4 Discovery
  // ==========================================================================

  describe("custom bidding response parsing (v4 Discovery enums)", () => {
    it("parses a REJECTED rules resource with CONSTRAINT_VIOLATION_ERROR and no message", async () => {
      // Discovery `CustomBiddingAlgorithmRulesError` = { errorCode } only; the
      // enum value is CONSTRAINT_VIOLATION_ERROR (not CONSTRAINT_VIOLATION).
      const rules = {
        name: "customBiddingAlgorithms/algo-42/rules/r-9",
        customBiddingAlgorithmId: "algo-42",
        customBiddingAlgorithmRulesId: "r-9",
        state: "REJECTED",
        error: { errorCode: "CONSTRAINT_VIOLATION_ERROR" },
      };
      httpClient.fetch.mockResolvedValue(rules);

      const result = await service.getCustomBiddingRules("algo-42", "r-9", {
        advertiserId: "adv-1",
      });

      expect(result.state).toBe("REJECTED");
      expect(result.error?.errorCode).toBe("CONSTRAINT_VIOLATION_ERROR");
    });

    it("accepts STATE_UNSPECIFIED on rules and scripts", async () => {
      httpClient.fetch.mockResolvedValueOnce({
        name: "n",
        customBiddingAlgorithmId: "a",
        customBiddingAlgorithmRulesId: "r",
        state: "STATE_UNSPECIFIED",
      });
      await expect(
        service.getCustomBiddingRules("a", "r", { advertiserId: "adv-1" })
      ).resolves.toMatchObject({ state: "STATE_UNSPECIFIED" });

      httpClient.fetch.mockResolvedValueOnce({
        name: "n",
        customBiddingAlgorithmId: "a",
        customBiddingScriptId: "s",
        state: "STATE_UNSPECIFIED",
        errors: [
          { errorCode: "ERROR_CODE_UNSPECIFIED", line: "1", column: "1", errorMessage: "?" },
        ],
      });
      await expect(
        service.getCustomBiddingScript("a", "s", { advertiserId: "adv-1" })
      ).resolves.toMatchObject({ state: "STATE_UNSPECIFIED" });
    });
  });

  // ==========================================================================
  // duplicateEntity
  // ==========================================================================

  describe("duplicateEntity", () => {
    beforeEach(() => {
      mockEntityConfig({
        // Line-item calls carry a lineItemId; the IO create carries only the
        // advertiserId parent.
        apiPath: (ids: Record<string, string>) =>
          ids.lineItemId !== undefined
            ? `/advertisers/${ids.advertiserId}/lineItems`
            : `/advertisers/${ids.advertiserId}/insertionOrders`,
      });
      mockEntitySchema();
    });

    it("creates insertion-order copies in ENTITY_STATUS_DRAFT (the only status CreateInsertionOrder accepts)", async () => {
      httpClient.fetch
        .mockResolvedValueOnce({
          name: "advertisers/1/insertionOrders/io-1",
          insertionOrderId: "io-1",
          displayName: "Src IO",
          entityStatus: "ENTITY_STATUS_ACTIVE",
          updateTime: "t",
        })
        .mockResolvedValueOnce({ insertionOrderId: "io-2", entityStatus: "ENTITY_STATUS_DRAFT" });

      await service.duplicateEntity("insertionOrder", {
        advertiserId: "1",
        insertionOrderId: "io-1",
      });

      const [path, , init] = httpClient.fetch.mock.calls[1];
      expect(path).toBe("/advertisers/1/insertionOrders");
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string);
      expect(body.entityStatus).toBe("ENTITY_STATUS_DRAFT");
      expect(body.displayName).toBe("Copy of Src IO");
      expect(body.insertionOrderId).toBeUndefined();
      expect(body.name).toBeUndefined();
    });

    it("duplicates line items with the native lineItems:duplicate method, not GET→POST create", async () => {
      httpClient.fetch
        // source read
        .mockResolvedValueOnce({
          lineItemId: "li-1",
          displayName: "Src LI",
          entityStatus: "ENTITY_STATUS_ACTIVE",
          containsEuPoliticalAds: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        })
        // :duplicate
        .mockResolvedValueOnce({ duplicateLineItemId: "li-2" })
        // copy read-back
        .mockResolvedValueOnce({ lineItemId: "li-2", entityStatus: "ENTITY_STATUS_DRAFT" });

      const result = await service.duplicateEntity(
        "lineItem",
        { advertiserId: "1", lineItemId: "li-1" },
        "My Copy"
      );

      const dupCall = httpClient.fetch.mock.calls[1];
      expect(dupCall[0]).toBe("/advertisers/1/lineItems/li-1:duplicate");
      expect(dupCall[2].method).toBe("POST");
      expect(JSON.parse(dupCall[2].body as string)).toEqual({
        targetDisplayName: "My Copy",
        containsEuPoliticalAds: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
      });
      // Discovery flags this method as high-latency — longer timeout.
      expect(dupCall[3]).toEqual({ timeoutMs: 120_000 });
      // No POST to the lineItems collection (the old create-based copy).
      expect(
        httpClient.fetch.mock.calls.some(
          (c: any[]) => c[0] === "/advertisers/1/lineItems" && c[2]?.method === "POST"
        )
      ).toBe(false);
      expect(httpClient.fetch.mock.calls[2][0]).toBe("/advertisers/1/lineItems/li-2");
      expect(result).toEqual({ lineItemId: "li-2", entityStatus: "ENTITY_STATUS_DRAFT" });
    });

    it("defaults the line-item copy name to `Copy of {source}`", async () => {
      httpClient.fetch
        .mockResolvedValueOnce({ lineItemId: "li-1", displayName: "Src LI" })
        .mockResolvedValueOnce({ duplicateLineItemId: "li-2" })
        .mockResolvedValueOnce({ lineItemId: "li-2", entityStatus: "ENTITY_STATUS_DRAFT" });

      await service.duplicateEntity("lineItem", { advertiserId: "1", lineItemId: "li-1" });

      expect(JSON.parse(httpClient.fetch.mock.calls[1][2].body as string)).toEqual({
        targetDisplayName: "Copy of Src LI",
      });
    });

    it("pauses a line-item copy that DV360 returns ACTIVE", async () => {
      const activeCopy = { lineItemId: "li-2", entityStatus: "ENTITY_STATUS_ACTIVE" };
      httpClient.fetch
        .mockResolvedValueOnce({ lineItemId: "li-1", displayName: "Src LI" })
        .mockResolvedValueOnce({ duplicateLineItemId: "li-2" })
        .mockResolvedValueOnce(activeCopy)
        .mockResolvedValueOnce({ lineItemId: "li-2", entityStatus: "ENTITY_STATUS_PAUSED" });

      const result = (await service.duplicateEntity("lineItem", {
        advertiserId: "1",
        lineItemId: "li-1",
      })) as Record<string, unknown>;

      const patch = httpClient.fetch.mock.calls[3];
      expect(patch[0]).toBe("/advertisers/1/lineItems/li-2?updateMask=entityStatus");
      expect(patch[2].method).toBe("PATCH");
      expect(JSON.parse(patch[2].body as string).entityStatus).toBe("ENTITY_STATUS_PAUSED");
      expect(result.entityStatus).toBe("ENTITY_STATUS_PAUSED");
    });

    it("reports the created copy's ID when the read-back fails", async () => {
      httpClient.fetch
        .mockResolvedValueOnce({ lineItemId: "li-1", displayName: "Src LI" })
        .mockResolvedValueOnce({ duplicateLineItemId: "li-2" })
        .mockRejectedValueOnce(new Error("boom"));

      await expect(
        service.duplicateEntity("lineItem", { advertiserId: "1", lineItemId: "li-1" })
      ).rejects.toThrow(/created duplicate line item li-2/);
    });

    it("throws when :duplicate returns no duplicateLineItemId", async () => {
      httpClient.fetch
        .mockResolvedValueOnce({ lineItemId: "li-1", displayName: "Src LI" })
        .mockResolvedValueOnce({});

      await expect(
        service.duplicateEntity("lineItem", { advertiserId: "1", lineItemId: "li-1" })
      ).rejects.toThrow(/no duplicateLineItemId/);
    });
  });

  // ==========================================================================
  // getDeliveryEstimate
  // ==========================================================================

  describe("getDeliveryEstimate", () => {
    it("reads the line item and its assigned targeting; never calls generateDefault", async () => {
      httpClient.fetch
        .mockResolvedValueOnce({ lineItemId: "li-1" })
        .mockResolvedValueOnce({ lineItemAssignedTargetingOptions: [] });

      const result = await service.getDeliveryEstimate("1", "li-1");

      const paths = httpClient.fetch.mock.calls.map((c: any[]) => c[0] as string);
      expect(paths).toEqual([
        "/advertisers/1/lineItems/li-1",
        "/advertisers/1/lineItems:bulkListAssignedTargetingOptions?lineItemIds=li-1",
      ]);
      expect(paths.some((p) => p.includes("generateDefault"))).toBe(false);
      expect(result.source).toBe("lineItem");
    });
  });
});
