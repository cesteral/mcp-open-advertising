import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.hoisted(() => vi.fn());
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: mockFetch };
});

import { describeRetryPolicy } from "@cesteral/shared";
import {
  AMAZON_DSP_RETRY_CONFIG,
  AmazonDspHttpClient,
  isAmazonDspRetryable,
} from "../../src/services/amazon-dsp/amazon-dsp-http-client.js";
import type { AmazonDspAuthAdapter } from "../../src/auth/amazon-dsp-auth-adapter.js";

/**
 * Pins amazon-dsp's deliberate "never retry 429" posture against the REAL
 * predicate and config (fleet review amazon-dsp #21). The shared
 * operational-envelope test models it with a local `status >= 500` lambda, so
 * a change to `isAmazonDspRetryable` itself used to fail no test anywhere.
 */
describe("amazon-dsp retry policy", () => {
  it("does not treat 429 as retryable", () => {
    expect(isAmazonDspRetryable(429, "")).toBe(false);
    expect(isAmazonDspRetryable(429, '{"message":"Too Many Requests"}')).toBe(false);
  });

  it("treats 5xx as retryable and 4xx as terminal", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(isAmazonDspRetryable(status, "")).toBe(true);
    }
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(isAmazonDspRetryable(status, "")).toBe(false);
    }
  });

  it("publishes no all-method-safe status and 3 total attempts on the server card", () => {
    const policy = describeRetryPolicy(isAmazonDspRetryable, AMAZON_DSP_RETRY_CONFIG.maxRetries);
    expect(policy.retryOnStatus).not.toContain(429);
    expect(policy.resendSafeForAllMethods).toEqual([]);
    expect(policy.maxTotalAttempts).toBe(3);
  });

  describe("on the wire", () => {
    const adapter = {
      getAccessToken: vi.fn().mockResolvedValue("test_token"),
      validate: vi.fn(),
      clientId: "client_abc",
    } as unknown as AmazonDspAuthAdapter;
    const logger: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    logger.child = vi.fn().mockReturnValue(logger);

    beforeEach(() => {
      mockFetch.mockReset();
    });

    it("sends a GET that gets 429 exactly once", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        headers: { get: () => null },
        text: async () => '{"message":"Too Many Requests"}',
      });
      const client = new AmazonDspHttpClient(
        adapter,
        "profile_123",
        "https://advertising-api.amazon.com",
        logger
      );

      await expect(client.get("/dsp/orders")).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
