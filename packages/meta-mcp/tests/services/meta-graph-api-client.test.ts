import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetchWithTimeout from shared
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

import { MetaGraphApiClient } from "../../src/services/meta/meta-graph-api-client.js";
import type { MetaAuthAdapter } from "../../src/auth/meta-auth-adapter.js";

const mockAuthAdapter: MetaAuthAdapter = {
  getAccessToken: vi.fn().mockResolvedValue("test-access-token"),
  userId: "test-user",
};

const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};
mockLogger.child.mockReturnValue(mockLogger);

describe("MetaGraphApiClient", () => {
  let client: MetaGraphApiClient;

  beforeEach(() => {
    client = new MetaGraphApiClient(
      mockAuthAdapter,
      "https://graph.test/v21.0",
      mockLogger
    );
    mockFetchWithTimeout.mockReset();
    vi.mocked(mockAuthAdapter.getAccessToken).mockResolvedValue("test-access-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockOkResponse(body: unknown = { data: "ok" }) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => body,
      headers: new Headers(),
    } as unknown as Response);
  }

  function mockErrorResponse(
    status: number,
    metaError?: { error: { message: string; type: string; code: number } }
  ) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status,
      text: async () => metaError ? JSON.stringify(metaError) : "error",
      headers: new Headers(),
    } as unknown as Response);
  }

  describe("GET requests", () => {
    it("makes correct GET request with access_token appended", async () => {
      mockOkResponse({ id: "123" });

      const result = await client.get("/me", { fields: "id,name" });
      expect(result).toEqual({ id: "123" });

      const calledUrl = mockFetchWithTimeout.mock.calls[0][0];
      expect(calledUrl).toContain("access_token=test-access-token");
      expect(calledUrl).toContain("/me");
      expect(calledUrl).toContain("fields=id%2Cname");
    });
  });

  describe("POST requests", () => {
    it("makes correct POST request with form-encoded body", async () => {
      mockOkResponse({ success: true });

      await client.post("/act_123/campaigns", { name: "Test Campaign" });

      const [url, , , options] = mockFetchWithTimeout.mock.calls[0];
      expect(url).toContain("access_token=test-access-token");
      expect(options?.method).toBe("POST");
      expect((options?.headers as Record<string, string>)["Content-Type"]).toBe(
        "application/x-www-form-urlencoded"
      );
    });
  });

  describe("DELETE requests", () => {
    it("makes correct DELETE request", async () => {
      mockOkResponse({});

      await client.delete("/123456");

      const [url, , , options] = mockFetchWithTimeout.mock.calls[0];
      expect(url).toContain("/123456");
      expect(options?.method).toBe("DELETE");
    });
  });

  describe("retry behavior", () => {
    it("retries on 429 Too Many Requests", async () => {
      mockErrorResponse(429, {
        error: { message: "Rate limit hit", type: "OAuthException", code: 4 },
      });
      mockOkResponse({ retried: true });

      const result = await client.get("/me");
      expect(result).toEqual({ retried: true });
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("retries on 5xx server errors", async () => {
      mockErrorResponse(500, {
        error: {
          message: "Internal Server Error",
          type: "OAuthException",
          code: 2,
        },
      });
      mockOkResponse({ retried: true });

      const result = await client.get("/me");
      expect(result).toEqual({ retried: true });
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("does NOT retry on 4xx client errors (e.g. 400)", async () => {
      mockErrorResponse(400, {
        error: {
          message: "Invalid parameter",
          type: "OAuthException",
          code: 100,
        },
      });

      await expect(client.get("/me")).rejects.toThrow("Invalid parameter");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry on 401 Unauthorized", async () => {
      mockErrorResponse(401, {
        error: {
          message: "Invalid token",
          type: "OAuthException",
          code: 190,
        },
      });

      await expect(client.get("/me")).rejects.toThrow("Invalid token");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("token masking in errors", () => {
    it("error metadata URL does not contain raw access token", async () => {
      mockErrorResponse(400, {
        error: {
          message: "Bad request",
          type: "OAuthException",
          code: 100,
        },
      });

      try {
        await client.get("/me");
      } catch (error: any) {
        // The error metadata URL should never contain the raw token.
        // The base url is used (without access_token param), so the token
        // doesn't appear; the url.replace() call is a safety net.
        expect(error.data?.url).not.toContain("test-access-token");
      }
    });

    it("retry log messages mask access_token", async () => {
      // First request: retryable 429
      mockErrorResponse(429, {
        error: { message: "Rate limit", type: "OAuthException", code: 4 },
      });
      // Second request: success
      mockOkResponse({ ok: true });

      await client.get("/me");

      // The warn log for retry should contain masked URL
      const warnCall = mockLogger.warn.mock.calls.find(
        (call: any[]) => typeof call[1] === "string" && call[1].includes("Retrying")
      );
      if (warnCall) {
        expect(warnCall[0].url).not.toContain("test-access-token");
      }
    });
  });

  describe("URL sanitizer in fetchWithTimeout", () => {
    it("passes sanitizer as 5th argument to fetchWithTimeout", async () => {
      mockOkResponse();

      await client.get("/me");

      // The 5th argument to fetchWithTimeout should be the sanitizer function
      const sanitizer = mockFetchWithTimeout.mock.calls[0][4];
      expect(sanitizer).toBeTypeOf("function");

      // Verify the sanitizer masks access_token
      const sanitized = sanitizer!(
        "https://graph.test/v21.0/me?access_token=SECRET&fields=id"
      );
      expect(sanitized).toContain("access_token=***");
      expect(sanitized).not.toContain("SECRET");
    });
  });
});
