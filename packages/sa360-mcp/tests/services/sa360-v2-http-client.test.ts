import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for SA360V2HttpClient — legacy v2 API client for conversion operations.
 *
 * Similar structure to the main SA360HttpClient but targets the DoubleClick Search v2 API.
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
  withSA360ApiSpan: vi.fn((_name: string, _path: string, fn: (span: any) => Promise<any>) =>
    fn({ setAttribute: vi.fn() })
  ),
}));

import { SA360V2HttpClient } from "../../src/services/sa360-v2/sa360-v2-http-client.js";
import { executeWithRetry } from "@cesteral/shared";
import type { SA360AuthAdapter } from "../../src/auth/sa360-auth-adapter.js";

const mockExecuteWithRetry = vi.mocked(executeWithRetry);

function createMockAdapter(overrides?: Partial<SA360AuthAdapter>): SA360AuthAdapter {
  return {
    getAccessToken: vi.fn().mockResolvedValue("mock-v2-access-token"),
    validate: vi.fn().mockResolvedValue(undefined),
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

describe("SA360V2HttpClient", () => {
  let client: SA360V2HttpClient;
  let adapter: SA360AuthAdapter;
  let logger: any;

  beforeEach(() => {
    adapter = createMockAdapter();
    logger = createMockLogger();
    client = new SA360V2HttpClient(
      adapter,
      "https://www.googleapis.com/doubleclicksearch/v2",
      logger
    );
    mockExecuteWithRetry.mockReset();
  });

  describe("fetch", () => {
    it("calls executeWithRetry with the correct URL", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({});

      await client.fetch("/conversion", undefined, {
        method: "POST",
        body: JSON.stringify({ kind: "doubleclicksearch#conversionList", conversion: [] }),
      });

      expect(mockExecuteWithRetry).toHaveBeenCalledTimes(1);
      const retryOpts = mockExecuteWithRetry.mock.calls[0][1];
      expect(retryOpts.url).toBe("https://www.googleapis.com/doubleclicksearch/v2/conversion");
    });

    it("provides getHeaders that returns Bearer token", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({});

      await client.fetch("/conversion", undefined, { method: "POST" });

      const retryOpts = mockExecuteWithRetry.mock.calls[0][1];
      const headers = await retryOpts.getHeaders();

      expect(headers["Authorization"]).toBe("Bearer mock-v2-access-token");
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("does NOT include login-customer-id header (v2 API does not use it)", async () => {
      adapter = createMockAdapter({ loginCustomerId: "999" });
      client = new SA360V2HttpClient(
        adapter,
        "https://www.googleapis.com/doubleclicksearch/v2",
        logger
      );
      mockExecuteWithRetry.mockResolvedValueOnce({});

      await client.fetch("/conversion", undefined, { method: "POST" });

      const retryOpts = mockExecuteWithRetry.mock.calls[0][1];
      const headers = await retryOpts.getHeaders();

      expect(headers["login-customer-id"]).toBeUndefined();
    });

    it("returns the result from executeWithRetry", async () => {
      const responseData = {
        kind: "doubleclicksearch#conversionList",
        conversion: [{ conversionId: "c1" }],
      };
      mockExecuteWithRetry.mockResolvedValueOnce(responseData);

      const result = await client.fetch("/conversion");
      expect(result).toEqual(responseData);
    });

    it("propagates errors from executeWithRetry", async () => {
      mockExecuteWithRetry.mockRejectedValueOnce(new Error("SA360 v2 API request failed: 403"));

      await expect(client.fetch("/conversion")).rejects.toThrow("SA360 v2 API request failed: 403");
    });

    it("passes fetchOptions through", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({});

      const fetchOptions = {
        method: "PUT" as const,
        body: JSON.stringify({ conversion: [] }),
      };
      await client.fetch("/conversion", undefined, fetchOptions);

      const retryOpts = mockExecuteWithRetry.mock.calls[0][1];
      expect(retryOpts.fetchOptions).toEqual(fetchOptions);
    });

    it("uses SA360 v2 retry config", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({});

      await client.fetch("/conversion");

      const retryConfig = mockExecuteWithRetry.mock.calls[0][0];
      expect(retryConfig.maxRetries).toBe(3);
      expect(retryConfig.platformName).toBe("SA360 v2");
    });

    it("provides mapStatusCode and parseErrorBody functions", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({});

      await client.fetch("/conversion");

      const retryOpts = mockExecuteWithRetry.mock.calls[0][1];
      expect(typeof retryOpts.mapStatusCode).toBe("function");
      expect(typeof retryOpts.parseErrorBody).toBe("function");
    });

    it("passes request context to executeWithRetry", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({});

      const ctx = { requestId: "req-456" };
      await client.fetch("/conversion", ctx);

      const retryOpts = mockExecuteWithRetry.mock.calls[0][1];
      expect(retryOpts.context).toEqual(ctx);
    });
  });
});
