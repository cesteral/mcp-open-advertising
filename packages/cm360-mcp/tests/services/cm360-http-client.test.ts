import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for CM360HttpClient — auth headers, retry delegation, raw fetch.
 *
 * The CM360HttpClient delegates retry logic to `executeWithRetry` from shared.
 * We mock both `executeWithRetry` and `fetchWithTimeout` to test the client's
 * own responsibilities: header construction, URL assembly, and telemetry wrapping.
 */

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
    executeWithRetry: vi.fn(),
  };
});

vi.mock("../../src/utils/telemetry/tracing.js", () => ({
  withCM360ApiSpan: vi.fn(
    async (_op: string, _path: string, fn: (span: any) => Promise<any>) =>
      fn({ setAttribute: vi.fn() })
  ),
}));

import { CM360HttpClient } from "../../src/services/cm360/cm360-http-client.js";
import { fetchWithTimeout, executeWithRetry } from "@cesteral/shared";

const mockExecuteWithRetry = vi.mocked(executeWithRetry);
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

function createMockAuthAdapter() {
  return {
    getAccessToken: vi.fn().mockResolvedValue("mock-access-token"),
    validate: vi.fn().mockResolvedValue(undefined),
  } as any;
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
    statusText: status === 200 ? "OK" : "Error",
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(typeof body === "string" ? body : JSON.stringify(body)),
    headers: new Headers(headers ?? {}),
  } as unknown as Response;
}

describe("CM360HttpClient", () => {
  let client: CM360HttpClient;
  let authAdapter: ReturnType<typeof createMockAuthAdapter>;
  let logger: any;

  beforeEach(() => {
    authAdapter = createMockAuthAdapter();
    logger = createMockLogger();
    client = new CM360HttpClient(
      authAdapter,
      "https://dfareporting.googleapis.com/dfareporting/v5",
      logger
    );
    mockExecuteWithRetry.mockReset();
    mockFetchWithTimeout.mockReset();
  });

  describe("fetch", () => {
    it("delegates to executeWithRetry with correct URL", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({ items: [] });

      await client.fetch("/userprofiles");

      expect(mockExecuteWithRetry).toHaveBeenCalledTimes(1);
      const callArgs = mockExecuteWithRetry.mock.calls[0];
      const retryConfig = callArgs[0];
      expect(retryConfig.platformName).toBe("CM360");
      expect(retryConfig.maxRetries).toBe(3);

      const requestOptions = callArgs[1];
      expect(requestOptions.url).toBe(
        "https://dfareporting.googleapis.com/dfareporting/v5/userprofiles"
      );
    });

    it("passes fetch options through to executeWithRetry", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({ id: "123" });

      await client.fetch("/userprofiles/123/campaigns", undefined, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      });

      const requestOptions = mockExecuteWithRetry.mock.calls[0][1];
      expect(requestOptions.fetchOptions?.method).toBe("POST");
      expect(requestOptions.fetchOptions?.body).toBe(JSON.stringify({ name: "Test" }));
    });

    it("provides getHeaders that returns Bearer auth header", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({});

      await client.fetch("/test");

      const requestOptions = mockExecuteWithRetry.mock.calls[0][1];
      const headers = await requestOptions.getHeaders();
      expect(headers.Authorization).toBe("Bearer mock-access-token");
    });

    it("refreshes access token on each getHeaders call", async () => {
      authAdapter.getAccessToken
        .mockResolvedValueOnce("token-1")
        .mockResolvedValueOnce("token-2");

      mockExecuteWithRetry.mockResolvedValueOnce({});

      await client.fetch("/test");

      const requestOptions = mockExecuteWithRetry.mock.calls[0][1];
      const headers1 = await requestOptions.getHeaders();
      expect(headers1.Authorization).toBe("Bearer token-1");

      const headers2 = await requestOptions.getHeaders();
      expect(headers2.Authorization).toBe("Bearer token-2");
    });

    it("returns the result from executeWithRetry", async () => {
      const expected = { campaigns: [{ id: "1" }] };
      mockExecuteWithRetry.mockResolvedValueOnce(expected);

      const result = await client.fetch("/test");
      expect(result).toEqual(expected);
    });

    it("propagates errors from executeWithRetry", async () => {
      mockExecuteWithRetry.mockRejectedValueOnce(
        new Error("CM360 API request failed: 403")
      );

      await expect(client.fetch("/test")).rejects.toThrow("CM360 API request failed: 403");
    });

    it("passes request context through", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({});
      const context = { requestId: "req-123" };

      await client.fetch("/test", context);

      const requestOptions = mockExecuteWithRetry.mock.calls[0][1];
      expect(requestOptions.context).toEqual(context);
    });
  });

  describe("fetchRaw", () => {
    it("makes raw authenticated fetch with correct URL and timeout", async () => {
      const resp = mockResponse(200, "csv-data");
      mockFetchWithTimeout.mockResolvedValueOnce(resp);

      const result = await client.fetchRaw("https://example.com/report", 30_000);

      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
      const callArgs = mockFetchWithTimeout.mock.calls[0];
      expect(callArgs[0]).toBe("https://example.com/report");
      expect(callArgs[1]).toBe(30_000);

      const options = callArgs[3] as RequestInit;
      const headers = options.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer mock-access-token");
      expect(result).toBe(resp);
    });

    it("passes request context to fetchWithTimeout", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(mockResponse(200, "ok"));
      const context = { requestId: "req-456" };

      await client.fetchRaw("https://example.com/report", 30_000, context);

      const callArgs = mockFetchWithTimeout.mock.calls[0];
      expect(callArgs[2]).toEqual(context);
    });

    it("passes additional options to fetchWithTimeout", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(mockResponse(200, "ok"));

      await client.fetchRaw("https://example.com/report", 30_000, undefined, {
        method: "GET",
        headers: { Accept: "text/csv" },
      });

      const options = mockFetchWithTimeout.mock.calls[0][3] as RequestInit;
      expect(options.method).toBe("GET");
      const headers = options.headers as Record<string, string>;
      expect(headers.Accept).toBe("text/csv");
      expect(headers.Authorization).toBe("Bearer mock-access-token");
    });
  });
});
