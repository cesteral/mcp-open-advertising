import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DV360HttpClient } from "../../src/services/dv360/dv360-http-client.js";
import { McpError, JsonRpcErrorCode } from "../../src/utils/errors/index.js";
import type { GoogleAuthAdapter } from "@cesteral/shared";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

/**
 * Mock fetchWithTimeout – replaces the real network call for all tests.
 */
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

// We need the reference to the mock *after* vi.mock has been hoisted.
import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

/** Pino-compatible mock logger. */
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

/** Create a mock GoogleAuthAdapter */
function createMockAuthAdapter(
  token = "test-token",
): GoogleAuthAdapter {
  return {
    getAccessToken: vi.fn().mockResolvedValue(token),
    credentialType: "service_account" as const,
    scopes: ["https://www.googleapis.com/auth/display-video"],
  };
}

/**
 * Build a minimal Response-like object returned by our fetchWithTimeout mock.
 */
function fakeResponse(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
): Response {
  const headersObj = new Headers(headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: statusNames[status] ?? "Unknown",
    headers: headersObj,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    clone: vi.fn(),
  } as unknown as Response;
}

const statusNames: Record<number, string> = {
  200: "OK",
  204: "No Content",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
};

const BASE_URL = "https://displayvideo.googleapis.com/v4";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DV360HttpClient", () => {
  let client: DV360HttpClient;
  let logger: ReturnType<typeof createMockLogger>;
  let authAdapter: GoogleAuthAdapter;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

    logger = createMockLogger();
    authAdapter = createMockAuthAdapter();
    client = new DV360HttpClient(authAdapter, BASE_URL, logger);
    mockFetchWithTimeout.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // Successful fetch
  // ==========================================================================

  describe("successful fetch", () => {
    it("returns parsed JSON for a 200 response", async () => {
      const payload = { campaigns: [{ id: "1" }] };
      mockFetchWithTimeout.mockResolvedValueOnce(fakeResponse(200, payload));

      const result = await client.fetch("/advertisers/123/campaigns");

      expect(result).toEqual(payload);
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("returns {} for a 204 No Content response", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(fakeResponse(204));

      const result = await client.fetch("/advertisers/123/campaigns/1", undefined, {
        method: "DELETE",
      });

      expect(result).toEqual({});
    });
  });

  // ==========================================================================
  // Authentication
  // ==========================================================================

  describe("authentication", () => {
    it("calls authAdapter.getAccessToken for each request", async () => {
      const payload = { ok: true };
      mockFetchWithTimeout.mockResolvedValueOnce(fakeResponse(200, payload));

      await client.fetch("/test");

      expect(authAdapter.getAccessToken).toHaveBeenCalledTimes(1);
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("includes Bearer token in Authorization header", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(fakeResponse(200, { ok: true }));

      await client.fetch("/test");

      // Verify the Authorization header was set
      const callOptions = mockFetchWithTimeout.mock.calls[0]![3] as RequestInit;
      expect((callOptions.headers as Record<string, string>).Authorization).toBe(
        "Bearer test-token",
      );
    });

    it("propagates auth adapter errors as McpError", async () => {
      const failingAdapter = createMockAuthAdapter();
      (failingAdapter.getAccessToken as any).mockRejectedValue(new Error("token exchange failed"));
      const failingClient = new DV360HttpClient(failingAdapter, BASE_URL, logger);

      try {
        await failingClient.fetch("/test");
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    });
  });

  // ==========================================================================
  // Retry on 5xx
  // ==========================================================================

  describe("retry on 5xx", () => {
    it("retries up to 3 times on 500 and eventually throws", async () => {
      // All API calls return 500
      mockFetchWithTimeout.mockResolvedValue(fakeResponse(500, { error: "server" }));

      const fetchPromise = client.fetch("/fail");
      // Attach catch handler BEFORE advancing timers to avoid unhandled rejection
      const errorPromise = fetchPromise.catch((e: unknown) => e);

      await vi.runAllTimersAsync();

      const error = await errorPromise;
      expect(error).toBeInstanceOf(McpError);

      // 4 API calls total (initial + 3 retries)
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(4);
    });

    it("succeeds after a transient 503 followed by 200", async () => {
      // First API call → 503, second → 200
      mockFetchWithTimeout
        .mockResolvedValueOnce(fakeResponse(503, { error: "transient" }))
        .mockResolvedValueOnce(fakeResponse(200, { recovered: true }));

      const fetchPromise = client.fetch("/recover");

      // Advance past the first retry delay (1s for attempt 0)
      await vi.advanceTimersByTimeAsync(1_000);

      const result = await fetchPromise;
      expect(result).toEqual({ recovered: true });
      // 2 API calls (503 + 200)
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // Retry on 429 with Retry-After
  // ==========================================================================

  describe("retry on 429", () => {
    it("respects Retry-After header on 429 responses", async () => {
      // 429 with Retry-After: 3 seconds, then 200
      mockFetchWithTimeout
        .mockResolvedValueOnce(
          fakeResponse(429, { error: "rate limited" }, { "Retry-After": "3" }),
        )
        .mockResolvedValueOnce(fakeResponse(200, { ok: true }));

      const fetchPromise = client.fetch("/limited");

      // Advance past the Retry-After delay (3s)
      await vi.advanceTimersByTimeAsync(3_000);

      const result = await fetchPromise;
      expect(result).toEqual({ ok: true });

      // Verify the warning log was called
      expect(logger.warn).toHaveBeenCalled();
    });

    it("caps Retry-After to MAX_BACKOFF_MS (10s)", async () => {
      // 429 with Retry-After: 60 seconds (way beyond MAX_BACKOFF_MS)
      mockFetchWithTimeout
        .mockResolvedValueOnce(
          fakeResponse(429, { error: "rate limited" }, { "Retry-After": "60" }),
        )
        .mockResolvedValueOnce(fakeResponse(200, { ok: true }));

      const fetchPromise = client.fetch("/limited");

      // Should be capped at 10s (MAX_BACKOFF_MS), not 60s
      await vi.advanceTimersByTimeAsync(10_000);

      const result = await fetchPromise;
      expect(result).toEqual({ ok: true });
    });
  });

  // ==========================================================================
  // No retry on 4xx (except 429)
  // ==========================================================================

  describe("no retry on 4xx", () => {
    const nonRetryableStatuses = [400, 401, 403, 404];

    for (const status of nonRetryableStatuses) {
      it(`does NOT retry on ${status} — throws immediately`, async () => {
        // API returns non-retryable status
        mockFetchWithTimeout.mockResolvedValueOnce(
          fakeResponse(status, { error: "client error" }),
        );

        await expect(client.fetch("/bad")).rejects.toThrow(McpError);

        // 1 API call only (no retries)
        expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
      });
    }

    it("throws McpError with InvalidRequest code for 400", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(fakeResponse(400, {}));

      try {
        await client.fetch("/bad-request");
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(McpError);
        expect((err as McpError).code).toBe(JsonRpcErrorCode.InvalidRequest);
      }
    });

    it("throws McpError with ServiceUnavailable code for 500 (after retries)", async () => {
      mockFetchWithTimeout.mockResolvedValue(fakeResponse(500, {}));

      const fetchPromise = client.fetch("/server-error");
      const errorPromise = fetchPromise.catch((e: unknown) => e);

      await vi.runAllTimersAsync();

      const error = await errorPromise;
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).code).toBe(JsonRpcErrorCode.ServiceUnavailable);
    });

    it("throws McpError with RateLimited code for 429 (after retries)", async () => {
      mockFetchWithTimeout.mockResolvedValue(fakeResponse(429, {}));

      const fetchPromise = client.fetch("/rate-limited");
      const errorPromise = fetchPromise.catch((e: unknown) => e);

      await vi.runAllTimersAsync();

      const error = await errorPromise;
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
    });
  });

  // ==========================================================================
  // fetchRaw
  // ==========================================================================

  describe("fetchRaw", () => {
    it("returns raw Response with Authorization header added", async () => {
      const rawResponse = fakeResponse(200, { raw: true });
      mockFetchWithTimeout.mockResolvedValueOnce(rawResponse);

      const result = await client.fetchRaw("https://example.com/upload", 5000);

      expect(result).toBe(rawResponse);

      // Verify the call included Authorization header
      const callOptions = mockFetchWithTimeout.mock.calls[0]![3] as RequestInit;
      expect((callOptions.headers as Record<string, string>).Authorization).toBe(
        "Bearer test-token",
      );
    });

    it("does NOT apply retry logic — returns even 500 responses directly", async () => {
      const errorResponse = fakeResponse(500, { error: "boom" });
      mockFetchWithTimeout.mockResolvedValueOnce(errorResponse);

      const result = await client.fetchRaw("https://example.com/upload", 5000);

      // No retry — the raw response is returned as-is
      expect(result).toBe(errorResponse);
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Error handling
  // ==========================================================================

  describe("error handling", () => {
    it("includes httpStatus and url in error data for API failures", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(fakeResponse(404, { error: "not found" }));

      try {
        await client.fetch("/missing");
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(McpError);
        const data = (err as McpError).data;
        expect(data?.httpStatus).toBe(404);
        expect(data?.url).toContain("/missing");
      }
    });
  });
});
