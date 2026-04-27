import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for SA360HttpClient — auth headers, login-customer-id, retry via executeWithRetry, error mapping.
 *
 * The client delegates to executeWithRetry from @cesteral/shared,
 * so we mock executeWithRetry + fetchWithTimeout to test header construction and error handling.
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

import { SA360HttpClient } from "../../src/services/sa360/sa360-http-client.js";
import { executeWithRetry } from "@cesteral/shared";
import type { SA360AuthAdapter } from "../../src/auth/sa360-auth-adapter.js";

const mockExecuteWithRetry = vi.mocked(executeWithRetry);

function createMockAdapter(overrides?: Partial<SA360AuthAdapter>): SA360AuthAdapter {
  return {
    getAccessToken: vi.fn().mockResolvedValue("mock-access-token"),
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

describe("SA360HttpClient", () => {
  let client: SA360HttpClient;
  let adapter: SA360AuthAdapter;
  let logger: any;

  beforeEach(() => {
    adapter = createMockAdapter();
    logger = createMockLogger();
    client = new SA360HttpClient(adapter, "https://searchads360.googleapis.com/v0", logger);
    mockExecuteWithRetry.mockReset();
  });

  describe("fetch", () => {
    it("calls executeWithRetry with the correct URL", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({ results: [] });

      await client.fetch("/customers/123/searchAds360:search", undefined, {
        method: "POST",
        body: JSON.stringify({ query: "SELECT campaign.id FROM campaign" }),
      });

      expect(mockExecuteWithRetry).toHaveBeenCalledTimes(1);
      const callArgs = mockExecuteWithRetry.mock.calls[0];
      // First arg is retry config
      expect(callArgs[0]).toMatchObject({ platformName: "SA360" });
      // Second arg is options with url
      expect(callArgs[1].url).toBe(
        "https://searchads360.googleapis.com/v0/customers/123/searchAds360:search"
      );
    });

    it("provides getHeaders function that returns auth headers", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({ results: [] });

      await client.fetch("/test", undefined, { method: "GET" });

      const retryOpts = mockExecuteWithRetry.mock.calls[0][1];
      const headers = await retryOpts.getHeaders();

      expect(headers["Authorization"]).toBe("Bearer mock-access-token");
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("includes login-customer-id header when adapter has it", async () => {
      adapter = createMockAdapter({ loginCustomerId: "9876543210" });
      client = new SA360HttpClient(adapter, "https://searchads360.googleapis.com/v0", logger);
      mockExecuteWithRetry.mockResolvedValueOnce({});

      await client.fetch("/test", undefined, { method: "GET" });

      const retryOpts = mockExecuteWithRetry.mock.calls[0][1];
      const headers = await retryOpts.getHeaders();

      expect(headers["login-customer-id"]).toBe("9876543210");
    });

    it("omits login-customer-id header when not set", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({});

      await client.fetch("/test");

      const retryOpts = mockExecuteWithRetry.mock.calls[0][1];
      const headers = await retryOpts.getHeaders();

      expect(headers["login-customer-id"]).toBeUndefined();
    });

    it("returns the result from executeWithRetry", async () => {
      const data = { results: [{ campaign: { id: "123" } }] };
      mockExecuteWithRetry.mockResolvedValueOnce(data);

      const result = await client.fetch("/test");
      expect(result).toEqual(data);
    });

    it("passes fetchOptions through to executeWithRetry", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({});

      const fetchOptions = {
        method: "POST",
        body: JSON.stringify({ query: "SELECT campaign.id FROM campaign" }),
      };
      await client.fetch("/test", undefined, fetchOptions);

      const retryOpts = mockExecuteWithRetry.mock.calls[0][1];
      expect(retryOpts.fetchOptions).toEqual(fetchOptions);
    });

    it("passes request context to executeWithRetry", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({});

      const context = { requestId: "req-123" };
      await client.fetch("/test", context);

      const retryOpts = mockExecuteWithRetry.mock.calls[0][1];
      expect(retryOpts.context).toEqual(context);
    });

    it("propagates errors from executeWithRetry", async () => {
      mockExecuteWithRetry.mockRejectedValueOnce(new Error("SA360 API request failed: 400"));

      await expect(client.fetch("/test")).rejects.toThrow("SA360 API request failed: 400");
    });

    it("provides a mapStatusCode function in retry options", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({});

      await client.fetch("/test");

      const retryOpts = mockExecuteWithRetry.mock.calls[0][1];
      expect(typeof retryOpts.mapStatusCode).toBe("function");
    });

    it("provides a parseErrorBody function in retry options", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({});

      await client.fetch("/test");

      const retryOpts = mockExecuteWithRetry.mock.calls[0][1];
      expect(typeof retryOpts.parseErrorBody).toBe("function");
    });
  });

  describe("loginCustomerId property", () => {
    it("exposes loginCustomerId from adapter", () => {
      expect(client.loginCustomerId).toBeUndefined();

      const adapter2 = createMockAdapter({ loginCustomerId: "999" });
      const client2 = new SA360HttpClient(
        adapter2,
        "https://searchads360.googleapis.com/v0",
        logger
      );
      expect(client2.loginCustomerId).toBe("999");
    });
  });

  describe("retry configuration", () => {
    it("uses SA360 retry config with maxRetries 3", async () => {
      mockExecuteWithRetry.mockResolvedValueOnce({});

      await client.fetch("/test");

      const retryConfig = mockExecuteWithRetry.mock.calls[0][0];
      expect(retryConfig.maxRetries).toBe(3);
      expect(retryConfig.platformName).toBe("SA360");
    });
  });
});
