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

import { CM360HttpClient, RETRY_CONFIG } from "../../src/services/cm360/cm360-http-client.js";
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
      authAdapter.getAccessToken.mockResolvedValueOnce("token-1").mockResolvedValueOnce("token-2");

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
      mockExecuteWithRetry.mockRejectedValueOnce(new Error("CM360 API request failed: 403"));

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
    const DOWNLOAD_URL = "https://www.googleapis.com/dfareporting/v5/reports/1/files/2?alt=media";

    // Cross-fleet #22: fetchRaw used to loop by hand, so a failed download left
    // no upstream trail in tool_failure logs and ignored Retry-After. It now
    // goes through executeWithRetry with the client's own policy.
    it("delegates to executeWithRetry with rawResponse, the shared policy and the download timeout", async () => {
      const resp = mockResponse(200, "csv-data");
      mockExecuteWithRetry.mockResolvedValueOnce(resp);

      const result = await client.fetchRaw(DOWNLOAD_URL, 30_000);

      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
      expect(mockExecuteWithRetry).toHaveBeenCalledTimes(1);
      const [retryConfig, requestOptions] = mockExecuteWithRetry.mock.calls[0];
      expect(retryConfig).toEqual({ ...RETRY_CONFIG, timeoutMs: 30_000 });
      expect(requestOptions.url).toBe(DOWNLOAD_URL);
      expect(requestOptions.rawResponse).toBe(true);
      const headers = await requestOptions.getHeaders();
      expect(headers.Authorization).toBe("Bearer mock-access-token");
      expect(result).toBe(resp);
    });

    // fetchRaw attaches the user's Google token to a URL supplied by the MCP
    // client (cm360_download_report). Off-host URLs must never receive it.
    it.each([
      "https://attacker.example/steal",
      "https://googleapis.com.attacker.example/x",
      "http://www.googleapis.com/dfareporting/v5/reports/1/files/2",
      "https://169.254.169.254/computeMetadata/v1/",
    ])("refuses %s without fetching a token or the URL", async (url) => {
      await expect(client.fetchRaw(url, 30_000)).rejects.toThrow("download URL");
      expect(authAdapter.getAccessToken).not.toHaveBeenCalled();
      expect(mockExecuteWithRetry).not.toHaveBeenCalled();
      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });

    it("passes request context and fetch options through", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce(mockResponse(200, "ok"));
      const context = { requestId: "req-456" };

      await client.fetchRaw(DOWNLOAD_URL, 30_000, context, {
        method: "GET",
        headers: { Accept: "text/csv" },
      });

      const requestOptions = mockExecuteWithRetry.mock.calls[0][1];
      expect(requestOptions.context).toEqual(context);
      expect(requestOptions.fetchOptions?.method).toBe("GET");
      expect((requestOptions.fetchOptions?.headers as Record<string, string>).Accept).toBe(
        "text/csv"
      );
    });

    it("propagates errors from executeWithRetry", async () => {
      mockExecuteWithRetry.mockRejectedValueOnce(new Error("CM360 API request failed: 404"));

      await expect(client.fetchRaw(DOWNLOAD_URL, 30_000)).rejects.toThrow(
        "CM360 API request failed: 404"
      );
    });
  });
});
