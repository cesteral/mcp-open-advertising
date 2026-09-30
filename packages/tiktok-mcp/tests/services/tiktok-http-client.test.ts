import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetchWithTimeout from shared
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

import { TikTokHttpClient } from "../../src/services/tiktok/tiktok-http-client.js";
import type { TikTokAuthAdapter } from "../../src/auth/tiktok-auth-adapter.js";

const ADVERTISER_ID = "1234567890";
const BASE_URL = "https://business-api.tiktok.com";

const mockAuthAdapter: TikTokAuthAdapter = {
  getAccessToken: vi.fn().mockResolvedValue("test-access-token"),
  validate: vi.fn().mockResolvedValue(undefined),
  userId: "test-user",
  advertiserId: ADVERTISER_ID,
};

const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};
mockLogger.child.mockReturnValue(mockLogger);

describe("TikTokHttpClient", () => {
  let client: TikTokHttpClient;

  beforeEach(() => {
    client = new TikTokHttpClient(mockAuthAdapter, ADVERTISER_ID, BASE_URL, mockLogger);
    mockFetchWithTimeout.mockReset();
    vi.mocked(mockAuthAdapter.getAccessToken).mockResolvedValue("test-access-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockTikTokSuccessResponse(data: unknown) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, message: "OK", data }),
      headers: new Headers(),
    } as unknown as Response);
  }

  function mockTikTokErrorResponse(code: number, message: string) {
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
    it("injects advertiser_id into query params", async () => {
      mockTikTokSuccessResponse({ list: [], page_info: {} });

      await client.get("/open_api/v1.3/campaign/get/", { page: "1" });

      const calledUrl = mockFetchWithTimeout.mock.calls[0][0] as string;
      expect(calledUrl).toContain(`advertiser_id=${ADVERTISER_ID}`);
      expect(calledUrl).toContain("page=1");
    });

    it("sends the token in TikTok's Access-Token header, not Authorization: Bearer", async () => {
      mockTikTokSuccessResponse({ list: [] });

      await client.get("/open_api/v1.3/campaign/get/");

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      const headers = options.headers as Record<string, string>;
      expect(headers["Access-Token"]).toBe("test-access-token");
      expect(headers["Authorization"]).toBeUndefined();
    });

    it("returns data field from response on success", async () => {
      const mockData = { list: [{ campaign_id: "123" }], page_info: { total_number: 1 } };
      mockTikTokSuccessResponse(mockData);

      const result = await client.get("/open_api/v1.3/campaign/get/");
      expect(result).toEqual(mockData);
    });

    it("throws McpError on TikTok error code", async () => {
      mockTikTokErrorResponse(40102, "Access token is expired");

      await expect(client.get("/open_api/v1.3/campaign/get/")).rejects.toThrow(
        "Access token is expired"
      );
    });
  });

  describe("POST requests", () => {
    it("injects advertiser_id into JSON body", async () => {
      mockTikTokSuccessResponse({ campaign_id: "1800000001" });

      await client.post("/open_api/v1.3/campaign/create/", {
        campaign_name: "Test Campaign",
        budget: 100,
      });

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.advertiser_id).toBe(ADVERTISER_ID);
      expect(body.campaign_name).toBe("Test Campaign");
      expect(body.budget).toBe(100);
    });

    it("sets Content-Type: application/json header", async () => {
      mockTikTokSuccessResponse({});

      await client.post("/open_api/v1.3/campaign/create/", { campaign_name: "Test" });

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      expect((options.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    });

    it("uses POST method", async () => {
      mockTikTokSuccessResponse({});

      await client.post("/open_api/v1.3/campaign/create/", {});

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      expect(options.method).toBe("POST");
    });
  });

  describe("multipart uploads", () => {
    it("sends the token in the Access-Token header", async () => {
      mockTikTokSuccessResponse({ image_id: "img-1" });

      await client.postMultipart(
        "/open_api/v1.3/file/image/ad/upload/",
        {},
        "image_file",
        Buffer.from("x"),
        "a.png",
        "image/png"
      );

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      const headers = options.headers as Record<string, string>;
      expect(headers["Access-Token"]).toBe("test-access-token");
      expect(headers["Authorization"]).toBeUndefined();
    });
  });

  describe("DELETE requests", () => {
    it("injects advertiser_id into body and uses POST method", async () => {
      mockTikTokSuccessResponse({});

      await client.delete("/open_api/v1.3/campaign/delete/", {
        campaign_ids: ["1800000001"],
      });

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.advertiser_id).toBe(ADVERTISER_ID);
      expect(body.campaign_ids).toEqual(["1800000001"]);
      expect(options.method).toBe("DELETE");
    });
  });

  describe("retry behavior", () => {
    it("retries on rate limit error code 40100", async () => {
      mockTikTokErrorResponse(40100, "Rate limit exceeded");
      mockTikTokSuccessResponse({ list: [] });

      const result = await client.get("/open_api/v1.3/campaign/get/");
      expect(result).toEqual({ list: [] });
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("retries on HTTP 500 errors", async () => {
      mockHttpErrorResponse(500);
      mockTikTokSuccessResponse({ list: [] });

      const result = await client.get("/open_api/v1.3/campaign/get/");
      expect(result).toEqual({ list: [] });
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("does NOT retry on non-retryable errors (e.g., code 40002)", async () => {
      mockTikTokErrorResponse(40002, "Invalid parameter");

      await expect(client.get("/open_api/v1.3/campaign/get/")).rejects.toThrow("Invalid parameter");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("error mapping", () => {
    // Codes per the vendor table in the official SDK's tiktok_code.py.
    it.each([
      [40102, -32006], // ACCESS_TOKEN_EXPIRE -> Unauthorized
      [40104, -32006], // EMPTY_ACCESS_TOKEN -> Unauthorized
      [40105, -32006], // INVALID_ACCESS_TOKEN -> Unauthorized
      [40001, -32005], // PERMISSION_ERROR -> Forbidden
      [40002, -32602], // PARAM_ERROR -> InvalidParams (was Unauthorized)
      [40000, -32602], // INVALID_PARAMS -> InvalidParams
    ])("maps TikTok code %i to JSON-RPC %i", async (tiktokCode, expected) => {
      mockTikTokErrorResponse(tiktokCode, "err");

      try {
        await client.get("/open_api/v1.3/campaign/get/");
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.code).toBe(expected);
      }
    });

    it("does not treat 40002 PARAM_ERROR as an auth failure", async () => {
      mockTikTokErrorResponse(40002, "Invalid parameter");

      try {
        await client.get("/open_api/v1.3/campaign/get/");
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.code).not.toBe(-32006);
        expect(error.data?.nextAction ?? "").not.toMatch(/Renew the TikTok access token/);
      }
    });

    it("does not retry 40101 INVALID_PARTNER as a rate limit", async () => {
      mockTikTokErrorResponse(40101, "Invalid partner");

      await expect(client.get("/open_api/v1.3/campaign/get/")).rejects.toThrow("Invalid partner");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("maps rate limit codes to RateLimited", async () => {
      // Need 4 errors: initial attempt + 3 retries (MAX_RETRIES = 3)
      mockTikTokErrorResponse(40100, "Rate limit");
      mockTikTokErrorResponse(40100, "Rate limit");
      mockTikTokErrorResponse(40100, "Rate limit");
      mockTikTokErrorResponse(40100, "Rate limit");

      try {
        await client.get("/open_api/v1.3/campaign/get/");
        expect.fail("Should have thrown after max retries");
      } catch (error: any) {
        expect(error.code).toBe(-32003); // RateLimited
      }
    }, 60000); // Extended timeout to accommodate retry backoff delays
  });
});
