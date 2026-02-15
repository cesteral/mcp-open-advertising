import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for GAdsHttpClient — retry logic, error parsing, status code mapping.
 *
 * Uses vi.stubGlobal to mock the global fetch and the fetchWithTimeout helper.
 * The HTTP client is imported dynamically after mocking.
 */

// Mock the fetch-with-timeout module
vi.mock("../../src/utils/network/fetch-with-timeout.js", () => ({
  fetchWithTimeout: vi.fn(),
}));

import { GAdsHttpClient } from "../../src/services/gads/gads-http-client.js";
import { fetchWithTimeout } from "../../src/utils/network/fetch-with-timeout.js";
import type { GAdsAuthAdapter } from "../../src/auth/gads-auth-adapter.js";

const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

function createMockAdapter(overrides?: Partial<GAdsAuthAdapter>): GAdsAuthAdapter {
  return {
    getAccessToken: vi.fn().mockResolvedValue("mock-access-token"),
    developerToken: "dev-token-123",
    loginCustomerId: undefined,
    ...overrides,
  };
}

function createMockLogger(): any {
  return {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  };
}

function mockResponse(status: number, body: any, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : status === 429 ? "Too Many Requests" : "Error",
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(typeof body === "string" ? body : JSON.stringify(body)),
    headers: new Headers(headers ?? {}),
  } as unknown as Response;
}

describe("GAdsHttpClient", () => {
  let client: GAdsHttpClient;
  let adapter: GAdsAuthAdapter;
  let logger: any;

  beforeEach(() => {
    adapter = createMockAdapter();
    logger = createMockLogger();
    client = new GAdsHttpClient(adapter, "https://googleads.googleapis.com/v23", logger);
    mockFetchWithTimeout.mockReset();
  });

  describe("successful requests", () => {
    it("makes authenticated request with correct headers", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(
        mockResponse(200, { results: [] })
      );

      await client.fetch("/customers/123/googleAds:search", undefined, {
        method: "POST",
        body: JSON.stringify({ query: "SELECT campaign.id FROM campaign" }),
      });

      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
      const callArgs = mockFetchWithTimeout.mock.calls[0];
      expect(callArgs[0]).toBe("https://googleads.googleapis.com/v23/customers/123/googleAds:search");

      const options = callArgs[3] as RequestInit;
      const headers = options.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer mock-access-token");
      expect(headers["developer-token"]).toBe("dev-token-123");
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("includes login-customer-id header when set", async () => {
      adapter = createMockAdapter({ loginCustomerId: "9876543210" });
      client = new GAdsHttpClient(adapter, "https://googleads.googleapis.com/v23", logger);

      mockFetchWithTimeout.mockResolvedValueOnce(
        mockResponse(200, { results: [] })
      );

      await client.fetch("/test", undefined, { method: "GET" });

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      const headers = options.headers as Record<string, string>;
      expect(headers["login-customer-id"]).toBe("9876543210");
    });

    it("returns empty object for 204 No Content", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(
        mockResponse(204, "")
      );

      const result = await client.fetch("/test");
      expect(result).toEqual({});
    });

    it("returns parsed JSON for 200", async () => {
      const data = { results: [{ campaign: { id: "123" } }] };
      mockFetchWithTimeout.mockResolvedValueOnce(
        mockResponse(200, data)
      );

      const result = await client.fetch("/test");
      expect(result).toEqual(data);
    });
  });

  describe("retry logic", () => {
    it("retries on 429 status", async () => {
      mockFetchWithTimeout
        .mockResolvedValueOnce(mockResponse(429, "Rate limited"))
        .mockResolvedValueOnce(mockResponse(200, { results: [] }));

      const result = await client.fetch("/test");
      expect(result).toEqual({ results: [] });
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    }, 15_000);

    it("retries on 500 status", async () => {
      mockFetchWithTimeout
        .mockResolvedValueOnce(mockResponse(500, "Internal error"))
        .mockResolvedValueOnce(mockResponse(200, { results: [] }));

      const result = await client.fetch("/test");
      expect(result).toEqual({ results: [] });
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    }, 15_000);

    it("does not retry on 400 client error", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(
        mockResponse(400, { error: { message: "Bad request" } })
      );

      await expect(client.fetch("/test")).rejects.toThrow("Google Ads API request failed: 400");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("does not retry on 403 forbidden", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(
        mockResponse(403, { error: { message: "Forbidden" } })
      );

      await expect(client.fetch("/test")).rejects.toThrow("Google Ads API request failed: 403");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("gives up after max retries", async () => {
      mockFetchWithTimeout
        .mockResolvedValue(mockResponse(500, "Server error"));

      await expect(client.fetch("/test")).rejects.toThrow("Google Ads API request failed: 500");
      // 1 initial + 3 retries = 4 total calls
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(4);
    }, 30_000);
  });

  describe("error parsing", () => {
    it("parses Google Ads structured error format", async () => {
      const errorBody = {
        error: {
          details: [
            {
              errors: [
                {
                  errorCode: { campaignError: "DUPLICATE_CAMPAIGN_NAME" },
                  message: "Campaign name already exists",
                },
              ],
            },
          ],
        },
      };

      mockFetchWithTimeout.mockResolvedValueOnce(
        mockResponse(400, errorBody)
      );

      await expect(client.fetch("/test")).rejects.toThrow("DUPLICATE_CAMPAIGN_NAME");
    });

    it("falls back to top-level error message", async () => {
      const errorBody = {
        error: { message: "Permission denied for customer 123" },
      };

      mockFetchWithTimeout.mockResolvedValueOnce(
        mockResponse(403, errorBody)
      );

      await expect(client.fetch("/test")).rejects.toThrow("Permission denied for customer 123");
    });

    it("handles non-JSON error body gracefully", async () => {
      const resp = {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: vi.fn().mockRejectedValue(new Error("not json")),
        text: vi.fn().mockResolvedValue("plain text error"),
        headers: new Headers(),
      } as unknown as Response;

      mockFetchWithTimeout.mockResolvedValueOnce(resp);

      await expect(client.fetch("/test")).rejects.toThrow("Google Ads API request failed: 400");
    });
  });

  describe("properties", () => {
    it("exposes developerToken from adapter", () => {
      expect(client.developerToken).toBe("dev-token-123");
    });

    it("exposes loginCustomerId from adapter", () => {
      expect(client.loginCustomerId).toBeUndefined();

      const adapter2 = createMockAdapter({ loginCustomerId: "999" });
      const client2 = new GAdsHttpClient(adapter2, "https://example.com", logger);
      expect(client2.loginCustomerId).toBe("999");
    });
  });
});
