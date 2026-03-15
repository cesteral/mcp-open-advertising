import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetchWithTimeout from shared
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

import { PinterestHttpClient } from "../../src/services/pinterest/pinterest-http-client.js";
import type { PinterestAuthAdapter } from "../../src/auth/pinterest-auth-adapter.js";

const AD_ACCOUNT_ID = "549755813599";
const BASE_URL = "https://api.pinterest.com/v5";

const mockAuthAdapter: PinterestAuthAdapter = {
  getAccessToken: vi.fn().mockResolvedValue("test-access-token"),
  validate: vi.fn().mockResolvedValue(undefined),
  userId: "test-user",
  adAccountId: AD_ACCOUNT_ID,
};

const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};
mockLogger.child.mockReturnValue(mockLogger);

/**
 * Pinterest v5 returns plain JSON at the top level — NO { code, data } envelope.
 * Responses use standard HTTP status codes to signal success/error.
 */
describe("PinterestHttpClient", () => {
  let client: PinterestHttpClient;

  beforeEach(() => {
    client = new PinterestHttpClient(mockAuthAdapter, AD_ACCOUNT_ID, BASE_URL, mockLogger);
    mockFetchWithTimeout.mockReset();
    vi.mocked(mockAuthAdapter.getAccessToken).mockResolvedValue("test-access-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Helper: mock a successful Pinterest v5 response — plain JSON, no envelope */
  function mockPinterestSuccessResponse(body: unknown) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => body,
      headers: new Headers(),
    } as unknown as Response);
  }

  /** Helper: mock an HTTP error response (4xx/5xx) */
  function mockHttpErrorResponse(status: number, statusText = "Error", body = "HTTP error") {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status,
      statusText,
      text: async () => body,
      headers: new Headers(),
    } as unknown as Response);
  }

  describe("GET requests", () => {
    it("passes query params to the URL", async () => {
      mockPinterestSuccessResponse({ items: [], bookmark: null });

      await client.get("/ad_accounts/549755813599/campaigns", { order: "ASCENDING" });

      const calledUrl = mockFetchWithTimeout.mock.calls[0][0] as string;
      expect(calledUrl).toContain("order=ASCENDING");
      // v5: adAccountId is in the path, NOT auto-injected as query param
      expect(calledUrl).not.toContain("ad_account_id=");
    });

    it("sets Authorization: Bearer header", async () => {
      mockPinterestSuccessResponse({ items: [] });

      await client.get("/ad_accounts/549755813599/campaigns");

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      expect((options.headers as Record<string, string>)["Authorization"]).toBe(
        "Bearer test-access-token"
      );
    });

    it("returns raw JSON body directly — no data unwrapping", async () => {
      // Pinterest v5 response: items and bookmark at top level, not inside .data
      const pinterestResponse = {
        items: [{ id: "687201361754", name: "Test Campaign" }],
        bookmark: "ZmVlZDE%3D",
      };
      mockPinterestSuccessResponse(pinterestResponse);

      const result = await client.get("/ad_accounts/549755813599/campaigns");

      // Must return the full response — NOT response.data or response.items
      expect(result).toEqual(pinterestResponse);
      // Ensure we're NOT accidentally getting { items, bookmark } from a .data wrapper
      expect((result as any).code).toBeUndefined();
    });

    it("returns single entity response directly", async () => {
      const campaignEntity = { id: "687201361754", name: "Spring Sale", status: "ACTIVE" };
      mockPinterestSuccessResponse(campaignEntity);

      const result = await client.get("/ad_accounts/549755813599/campaigns/687201361754");

      expect(result).toEqual(campaignEntity);
    });

    it("throws on HTTP 401 error", async () => {
      mockHttpErrorResponse(401, "Unauthorized", "Invalid access token");

      await expect(client.get("/ad_accounts/549755813599/campaigns")).rejects.toThrow(
        "401"
      );
    });

    it("throws on HTTP 400 error", async () => {
      mockHttpErrorResponse(400, "Bad Request", "Invalid parameters");

      await expect(client.get("/ad_accounts/549755813599/campaigns")).rejects.toThrow(
        "400"
      );
    });
  });

  describe("POST requests", () => {
    it("serializes body as JSON without injecting ad_account_id", async () => {
      mockPinterestSuccessResponse({ items: [{ id: "687201361754", name: "New Campaign" }] });

      await client.post("/ad_accounts/549755813599/campaigns", [
        { name: "New Campaign", objective_type: "AWARENESS" },
      ]);

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      const body = JSON.parse(options.body as string);
      // v5: body is array, adAccountId is in the URL path — NOT auto-injected
      expect(Array.isArray(body)).toBe(true);
      expect(body[0].name).toBe("New Campaign");
      expect(body[0].objective_type).toBe("AWARENESS");
      expect(body[0].ad_account_id).toBeUndefined();
    });

    it("sets Content-Type: application/json header", async () => {
      mockPinterestSuccessResponse({ id: "687201361754" });

      await client.post("/ad_accounts/549755813599/campaigns", { name: "Test" });

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      expect((options.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    });

    it("uses POST method", async () => {
      mockPinterestSuccessResponse({ id: "687201361754" });

      await client.post("/ad_accounts/549755813599/campaigns", {});

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      expect(options.method).toBe("POST");
    });

    it("returns created entity directly — no data unwrapping", async () => {
      const createdCampaign = { id: "687201361754", name: "New Campaign", status: "PAUSED" };
      mockPinterestSuccessResponse(createdCampaign);

      const result = await client.post("/ad_accounts/549755813599/campaigns", {
        name: "New Campaign",
      });

      expect(result).toEqual(createdCampaign);
      expect((result as any).code).toBeUndefined();
    });
  });

  describe("DELETE requests", () => {
    it("uses DELETE method and passes params as query string", async () => {
      mockPinterestSuccessResponse({});

      await client.delete(
        "/ad_accounts/549755813599/campaigns",
        { campaign_ids: "687201361754,687201361755" }
      );

      const calledUrl = mockFetchWithTimeout.mock.calls[0][0] as string;
      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      // v5: IDs go in query params, not body
      expect(options.method).toBe("DELETE");
      expect(calledUrl).toContain("campaign_ids=687201361754%2C687201361755");
      // No body for DELETE
      expect(options.body).toBeUndefined();
    });
  });

  describe("retry behavior", () => {
    it("retries on HTTP 429 rate limit", async () => {
      mockHttpErrorResponse(429, "Too Many Requests");
      mockPinterestSuccessResponse({ items: [] });

      const result = await client.get("/ad_accounts/549755813599/campaigns");
      expect(result).toEqual({ items: [] });
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("retries on HTTP 500 server error", async () => {
      mockHttpErrorResponse(500, "Internal Server Error");
      mockPinterestSuccessResponse({ items: [] });

      const result = await client.get("/ad_accounts/549755813599/campaigns");
      expect(result).toEqual({ items: [] });
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("does NOT retry on HTTP 400 client errors", async () => {
      mockHttpErrorResponse(400, "Bad Request", "Invalid parameter");

      await expect(client.get("/ad_accounts/549755813599/campaigns")).rejects.toThrow();
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry on HTTP 403 forbidden", async () => {
      mockHttpErrorResponse(403, "Forbidden", "Insufficient permissions");

      await expect(client.get("/ad_accounts/549755813599/campaigns")).rejects.toThrow();
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("error mapping based on HTTP status codes (no code field)", () => {
    it("throws error with HTTP status in message on 401", async () => {
      mockHttpErrorResponse(401, "Unauthorized", "Invalid access token");

      try {
        await client.get("/ad_accounts/549755813599/campaigns");
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).toContain("401");
      }
    });

    it("throws error with HTTP status in message on 429", async () => {
      // Need 4 errors: initial attempt + 3 retries (MAX_RETRIES = 3)
      mockHttpErrorResponse(429, "Too Many Requests");
      mockHttpErrorResponse(429, "Too Many Requests");
      mockHttpErrorResponse(429, "Too Many Requests");
      mockHttpErrorResponse(429, "Too Many Requests");

      try {
        await client.get("/ad_accounts/549755813599/campaigns");
        expect.fail("Should have thrown after max retries");
      } catch (error: any) {
        expect(error.message).toContain("429");
      }
    }, 60000);
  });
});
