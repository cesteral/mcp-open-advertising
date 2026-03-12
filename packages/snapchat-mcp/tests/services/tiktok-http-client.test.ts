import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetchWithTimeout from shared
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

import { SnapchatHttpClient } from "../../src/services/snapchat/snapchat-http-client.js";
import type { SnapchatAuthAdapter } from "../../src/auth/snapchat-auth-adapter.js";

const ADVERTISER_ID = "1234567890";
const BASE_URL = "https://business-api.snapchat.com";

const mockAuthAdapter: SnapchatAuthAdapter = {
  getAccessToken: vi.fn().mockResolvedValue("test-access-token"),
  validate: vi.fn().mockResolvedValue(undefined),
  userId: "test-user",
  adAccountId: ADVERTISER_ID,
};

const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};
mockLogger.child.mockReturnValue(mockLogger);

describe("SnapchatHttpClient", () => {
  let client: SnapchatHttpClient;

  beforeEach(() => {
    client = new SnapchatHttpClient(mockAuthAdapter, ADVERTISER_ID, BASE_URL, mockLogger);
    mockFetchWithTimeout.mockReset();
    vi.mocked(mockAuthAdapter.getAccessToken).mockResolvedValue("test-access-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockSnapchatSuccessResponse(data: unknown) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, message: "OK", data }),
      headers: new Headers(),
    } as unknown as Response);
  }

  function mockSnapchatErrorResponse(code: number, message: string) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ code, message, data: null }),
      headers: new Headers(),
    } as unknown as Response);
  }

  function mockHttpErrorResponse(status: number) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status,
      statusText: "Error",
      text: async () => "HTTP error",
      headers: new Headers(),
    } as unknown as Response);
  }

  describe("GET requests", () => {
    it("injects ad_account_id into query params", async () => {
      mockSnapchatSuccessResponse({ list: [], page_info: {} });

      await client.get("/open_api/v1.3/campaign/get/", { page: "1" });

      const calledUrl = mockFetchWithTimeout.mock.calls[0][0] as string;
      expect(calledUrl).toContain(`ad_account_id=${ADVERTISER_ID}`);
      expect(calledUrl).toContain("page=1");
    });

    it("sets Authorization: Bearer header", async () => {
      mockSnapchatSuccessResponse({ list: [] });

      await client.get("/open_api/v1.3/campaign/get/");

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      expect((options.headers as Record<string, string>)["Authorization"]).toBe(
        "Bearer test-access-token"
      );
    });

    it("returns data field from response on success", async () => {
      const mockData = { list: [{ campaign_id: "123" }], page_info: { total_number: 1 } };
      mockSnapchatSuccessResponse(mockData);

      const result = await client.get("/open_api/v1.3/campaign/get/");
      expect(result).toEqual(mockData);
    });

    it("throws McpError on Snapchat error code", async () => {
      mockSnapchatErrorResponse(40001, "Access token is expired");

      await expect(client.get("/open_api/v1.3/campaign/get/")).rejects.toThrow(
        "Access token is expired"
      );
    });
  });

  describe("POST requests", () => {
    it("injects ad_account_id into JSON body", async () => {
      mockSnapchatSuccessResponse({ campaign_id: "1800000001" });

      await client.post("/open_api/v1.3/campaign/create/", {
        campaign_name: "Test Campaign",
        budget: 100,
      });

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.ad_account_id).toBe(ADVERTISER_ID);
      expect(body.campaign_name).toBe("Test Campaign");
      expect(body.budget).toBe(100);
    });

    it("sets Content-Type: application/json header", async () => {
      mockSnapchatSuccessResponse({});

      await client.post("/open_api/v1.3/campaign/create/", { campaign_name: "Test" });

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      expect((options.headers as Record<string, string>)["Content-Type"]).toBe(
        "application/json"
      );
    });

    it("uses POST method", async () => {
      mockSnapchatSuccessResponse({});

      await client.post("/open_api/v1.3/campaign/create/", {});

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      expect(options.method).toBe("POST");
    });
  });

  describe("DELETE requests", () => {
    it("injects ad_account_id into body and uses POST method", async () => {
      mockSnapchatSuccessResponse({});

      await client.delete("/open_api/v1.3/campaign/delete/", {
        campaign_ids: ["1800000001"],
      });

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.ad_account_id).toBe(ADVERTISER_ID);
      expect(body.campaign_ids).toEqual(["1800000001"]);
      expect(options.method).toBe("DELETE");
    });
  });

  describe("retry behavior", () => {
    it("retries on rate limit error code 40100", async () => {
      mockSnapchatErrorResponse(40100, "Rate limit exceeded");
      mockSnapchatSuccessResponse({ list: [] });

      const result = await client.get("/open_api/v1.3/campaign/get/");
      expect(result).toEqual({ list: [] });
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("retries on HTTP 500 errors", async () => {
      mockHttpErrorResponse(500);
      mockSnapchatSuccessResponse({ list: [] });

      const result = await client.get("/open_api/v1.3/campaign/get/");
      expect(result).toEqual({ list: [] });
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("does NOT retry on non-retryable errors (e.g., code 40002)", async () => {
      mockSnapchatErrorResponse(40002, "Invalid parameter");

      await expect(client.get("/open_api/v1.3/campaign/get/")).rejects.toThrow("Invalid parameter");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("error mapping", () => {
    it("maps auth error codes to Unauthorized", async () => {
      mockSnapchatErrorResponse(40001, "Access token expired");

      try {
        await client.get("/open_api/v1.3/campaign/get/");
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.code).toBe(-32006); // Unauthorized
      }
    });

    it("maps rate limit codes to RateLimited", async () => {
      // Need 4 errors: initial attempt + 3 retries (MAX_RETRIES = 3)
      mockSnapchatErrorResponse(40100, "Rate limit");
      mockSnapchatErrorResponse(40100, "Rate limit");
      mockSnapchatErrorResponse(40100, "Rate limit");
      mockSnapchatErrorResponse(40100, "Rate limit");

      try {
        await client.get("/open_api/v1.3/campaign/get/");
        expect.fail("Should have thrown after max retries");
      } catch (error: any) {
        expect(error.code).toBe(-32003); // RateLimited
      }
    }, 60000); // Extended timeout to accommodate retry backoff delays
  });
});
