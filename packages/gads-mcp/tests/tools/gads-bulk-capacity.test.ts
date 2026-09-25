// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Bulk capacity pre-check for `gads_adjust_bids`: a batch the rate limiter
 * cannot admit within its queue budget is refused BEFORE the confirmation
 * prompt and BEFORE any upstream call, and the dry run predicts the refusal.
 *
 * Runs the real GAdsService against a limiter built exactly like the package's
 * (`createPlatformRateLimiter("gads", ...)` — 10/min, 120s queue budget, so 30
 * calls fit), with only the HTTP transport and the confirmation prompt mocked.
 * Each adjustment is a GAQL read + a mutate (2 calls), so 15 adjustments fit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockResolveSessionServices, mockElicit } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockElicit: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, elicitBidChangeConfirmation: mockElicit };
});

import { createPlatformRateLimiter, JsonRpcErrorCode, McpError } from "@cesteral/shared";
import type { RateLimiter } from "@cesteral/shared";
import { mcpConfig } from "../../src/config/index.js";
import { rateLimiter as packageRateLimiter } from "../../src/utils/platform.js";
import { GAdsService } from "../../src/services/gads/gads-service.js";
import { adjustBidsLogic } from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";

const CUSTOMER = "1234567890";
const ctx = { requestId: "req-1" } as any;
const sdk = { sessionId: "s-1" } as any;

const adjustments = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ adGroupId: String(1000 + i), cpcBidMicros: "1500000" }));

let limiter: RateLimiter;
let fetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  limiter = createPlatformRateLimiter("gads", mcpConfig.gadsRateLimitPerMinute);
  fetch = vi.fn(async (path: string) =>
    path.endsWith("googleAds:search")
      ? { results: [{ adGroup: { id: "1", name: "AG", cpcBidMicros: "1000000" } }] }
      : { results: [{}] }
  );
  const service = new GAdsService(
    { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
    limiter,
    { fetch } as any
  );
  mockResolveSessionServices.mockReturnValue({ gadsService: service });
  mockElicit.mockResolvedValue(true);
});

afterEach(() => {
  limiter.destroy();
});

describe("gads_adjust_bids bulk capacity pre-check", () => {
  it("tests against the package's real limiter configuration (10/min, 120s budget)", () => {
    expect(limiter.describeLimits()).toEqual(packageRateLimiter.describeLimits());
    expect(limiter.describeLimits()).toEqual([
      { pattern: "gads:*", limit: 10, windowMs: 60_000, maxWaitMs: 120_000 },
    ]);
  });

  it("refuses 16 adjustments (32 calls) before the prompt and before any request", async () => {
    const error = await adjustBidsLogic(
      { customerId: CUSTOMER, adjustments: adjustments(16) } as any,
      ctx,
      sdk
    ).then(
      () => undefined,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
    expect((error as McpError).data).toMatchObject({
      reason: "bulk_exceeds_capacity",
      itemCount: 16,
      itemsThatFit: 15,
    });
    expect(mockElicit).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("dry run predicts the refusal (BULK_EXCEEDS_CAPACITY) and reserves nothing", async () => {
    const result = await adjustBidsLogic(
      { customerId: CUSTOMER, adjustments: adjustments(16), dry_run: true } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors.map((e) => e.code)).toEqual(["BULK_EXCEEDS_CAPACITY"]);
    expect(limiter.getRemainingTokens(`gads:${CUSTOMER}`)).toBe(10);
    expect(mockElicit).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a fitting dry run reports no capacity error", async () => {
    const result = await adjustBidsLogic(
      { customerId: CUSTOMER, adjustments: adjustments(15), dry_run: true } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(true);
  });

  it("a batch that fits proceeds: one prompt, a read + a mutate per ad group", async () => {
    const result = await adjustBidsLogic(
      { customerId: CUSTOMER, adjustments: adjustments(5) } as any,
      ctx,
      sdk
    );
    expect(mockElicit).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(10);
    expect(result.totalSucceeded).toBe(5);
  });
});
