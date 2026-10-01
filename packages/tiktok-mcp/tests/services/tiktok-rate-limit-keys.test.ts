// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The TikTok limiter keys: what `consume` draws on and what the bulk capacity
 * projection reads must be the same bucket, and the keys must identify the
 * access token without carrying it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPlatformRateLimiter } from "@cesteral/shared";
import type { RateLimiter } from "@cesteral/shared";
import {
  TikTokAccessTokenAdapter,
  getTikTokCredentialFingerprint,
  tiktokQuotaClient,
} from "../../src/auth/tiktok-auth-adapter.js";
import {
  consumeTikTokQuota,
  consumeTikTokReportingQuota,
  tiktokQuotaBucket,
  tiktokReportingQuotaKey,
} from "../../src/services/tiktok/rate-limit-keys.js";
import { TikTokService } from "../../src/services/tiktok/tiktok-service.js";
import { TikTokReportingService } from "../../src/services/tiktok/tiktok-reporting-service.js";

const TOKEN = "tiktok-access-token-value";
const ADVERTISER = "7000000000000000001";

let limiter: RateLimiter;

beforeEach(() => {
  limiter = createPlatformRateLimiter("tiktok", 10);
});

afterEach(() => {
  limiter.destroy();
});

describe("tiktok rate-limit keys", () => {
  it("consume and the bulk projection address the same bucket", async () => {
    const scope = new TikTokAccessTokenAdapter(TOKEN, ADVERTISER);
    const { key } = tiktokQuotaBucket(scope, [1]);

    expect(limiter.getRemainingTokens(key)).toBe(10);
    await consumeTikTokQuota(limiter, scope, 3);
    expect(limiter.getRemainingTokens(key)).toBe(7);
  });

  it("is tiktok:token:{16 hex} (and :reporting), governed by the configured tiktok:* limit", () => {
    const scope = new TikTokAccessTokenAdapter(TOKEN, ADVERTISER);
    const { key } = tiktokQuotaBucket(scope, [1]);
    expect(key).toMatch(/^tiktok:token:[0-9a-f]{16}$/);
    expect(tiktokReportingQuotaKey(scope)).toBe(`${key}:reporting`);
    expect(limiter.getRemainingTokens(key)).not.toBe(Infinity);
    expect(limiter.getRemainingTokens(tiktokReportingQuotaKey(scope))).not.toBe(Infinity);
  });

  it("carries neither the token nor the session-binding fingerprint", () => {
    const { key } = tiktokQuotaBucket(new TikTokAccessTokenAdapter(TOKEN, ADVERTISER), [1]);
    const binding = getTikTokCredentialFingerprint(TOKEN, ADVERTISER);
    expect(key).not.toContain(TOKEN);
    expect(key).not.toContain(binding.slice(0, 16));
    expect(key).toBe(`tiktok:token:${tiktokQuotaClient(TOKEN)}`);
  });

  it("ignores the caller-supplied advertiser id: one token is one bucket", () => {
    const a = new TikTokAccessTokenAdapter(TOKEN, "7000000000000000001");
    const b = new TikTokAccessTokenAdapter(TOKEN, "7000000000000000002");
    const other = new TikTokAccessTokenAdapter("another-token", "7000000000000000001");
    expect(a.quotaClient).toBe(b.quotaClient);
    expect(a.quotaClient).not.toBe(other.quotaClient);
  });

  it("a session's CRUD calls drain its bulk bucket; report calls drain its reporting bucket", async () => {
    const adapter = new TikTokAccessTokenAdapter(TOKEN, ADVERTISER);
    const httpClient = {
      quotaClient: adapter.quotaClient,
      get: vi.fn().mockResolvedValue({ list: [{ campaign_id: "c-1" }] }),
      post: vi.fn().mockResolvedValue({}),
    } as any;
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const service = new TikTokService(limiter, httpClient, logger);
    const reporting = new TikTokReportingService(limiter, httpClient, logger);
    const { key } = service.bulkCapacityBucket([1]);

    await service.getEntity("campaign", "c-1"); // read, 1
    await service.updateEntity("campaign", "c-1", { budget: 1 }); // write, 3
    await reporting.checkReportStatus("task-1");
    await consumeTikTokReportingQuota(limiter, adapter);

    expect(limiter.getRemainingTokens(key)).toBe(6);
    expect(limiter.getRemainingTokens(tiktokReportingQuotaKey(adapter))).toBe(8);
  });
});
