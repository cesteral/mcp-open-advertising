// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * `consumeMsAdsQuota` spells its keys as template literals (so the fleet
 * ratchet can see the `msads:` prefix) and `msadsQuotaBuckets` spells them
 * again for the bulk capacity projection. If the two drift, the projection
 * reads buckets nothing consumes and approves batches that then queue past
 * every timeout. Run both against a real limiter and compare.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createPlatformRateLimiter, type RateLimiter } from "@cesteral/shared";
import {
  consumeMsAdsQuota,
  msadsQuotaBuckets,
  type MsAdsQuotaKind,
  type MsAdsQuotaScope,
} from "../../src/services/msads/rate-limit-keys.js";
import { createSessionServices } from "../../src/services/session-services.js";

const LIMIT = 10;
let limiter: RateLimiter;

afterEach(() => limiter?.destroy());

/** Keys whose remaining tokens dropped after one consume. */
async function keysConsumed(scope: MsAdsQuotaScope, kind: MsAdsQuotaKind): Promise<string[]> {
  limiter = createPlatformRateLimiter("msads", LIMIT);
  const candidates = msadsQuotaBuckets(scope, kind, [1]).map((b) => b.key);
  await consumeMsAdsQuota(limiter, scope, kind, 2);
  return candidates.filter((key) => limiter.getRemainingTokens(key) === LIMIT - 2);
}

describe("msads quota keys", () => {
  it.each<MsAdsQuotaKind>(["read", "write"])(
    "consume and projection agree on both %s buckets",
    async (kind) => {
      const scope = { userId: "41", customerId: "7" };
      expect(await keysConsumed(scope, kind)).toEqual([
        `msads:user:41:${kind}`,
        `msads:customer:7:${kind}`,
      ]);
    }
  );

  it("keeps read and write in separate buckets", async () => {
    limiter = createPlatformRateLimiter("msads", LIMIT);
    const scope = { userId: "41", customerId: "7" };
    await consumeMsAdsQuota(limiter, scope, "write", 3);
    for (const { key } of msadsQuotaBuckets(scope, "read", [1])) {
      expect(limiter.getRemainingTokens(key)).toBe(LIMIT);
    }
  });

  it("reads userId at call time, so a scope validated after construction keys by the real user", async () => {
    // The auth adapter learns userId in validate(); the service holds the
    // adapter itself as its scope rather than a copy of an empty string.
    const adapter = { userId: "", customerId: "7" };
    expect(await keysConsumed(adapter, "read")).toEqual([
      "msads:user:unvalidated:read",
      "msads:customer:7:read",
    ]);
    limiter.destroy();
    adapter.userId = "41";
    expect(await keysConsumed(adapter, "read")).toEqual([
      "msads:user:41:read",
      "msads:customer:7:read",
    ]);
  });

  it("falls back to shared placeholder keys rather than an empty segment", () => {
    expect(msadsQuotaBuckets({ userId: "", customerId: "" }, "write", [1])).toEqual([
      { key: "msads:user:unvalidated:write", costPerItem: [1] },
      { key: "msads:customer:unknown:write", costPerItem: [1] },
    ]);
  });

  it("createSessionServices scopes every service to the session's auth adapter", () => {
    limiter = createPlatformRateLimiter("msads", LIMIT);
    const adapter = {
      userId: "41",
      customerId: "7",
      accountId: "9",
      developerToken: "d",
      getAccessToken: async () => "t",
      validate: async () => {},
    };
    const services = createSessionServices(
      adapter,
      {
        campaignApiBaseUrl: "https://campaign.api.bingads.microsoft.com/CampaignManagement/v13",
        reportingApiBaseUrl: "https://reporting.api.bingads.microsoft.com/Reporting/v13",
        customerApiBaseUrl: "https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13",
        reportPollIntervalMs: 1,
        reportMaxPollAttempts: 1,
      },
      { info() {}, debug() {}, warn() {}, error() {} } as any,
      limiter
    );
    expect(services.msadsService.quotaScope).toBe(adapter);
    expect(services.msadsCustomerService.quotaScope).toBe(adapter);
  });
});
