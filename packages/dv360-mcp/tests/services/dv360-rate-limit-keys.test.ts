// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The DV360 limiter keys: what `consume` draws on and what the bulk capacity
 * projection reads must be the same bucket, and every DV360 API call must draw
 * its own token — including the calls that name only a partner, or carry their
 * owner as a query parameter instead of in the path (#236, dv360 #24).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPlatformRateLimiter } from "@cesteral/shared";
import type { RateLimiter } from "@cesteral/shared";
import { consumeDv360Quota, dv360QuotaBucket } from "../../src/services/dv360/rate-limit-keys.js";
import { dv360BulkCapacityChecks } from "../../src/services/dv360/bulk-capacity-checks.js";
import { DV360Service } from "../../src/services/dv360/DV360-service.js";

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
const LIMIT = 6;

let limiter: RateLimiter;

beforeEach(() => {
  limiter = createPlatformRateLimiter("dv360", LIMIT);
});

afterEach(() => {
  limiter.destroy();
});

function service(fetch: ReturnType<typeof vi.fn>): DV360Service {
  return new DV360Service(logger, limiter, { fetch } as any);
}

const SCRIPT = {
  name: "customBiddingAlgorithms/7001/scripts/8001",
  customBiddingAlgorithmId: "7001",
  customBiddingScriptId: "8001",
  state: "ACCEPTED",
  active: true,
  createTime: "2026-09-30T00:00:00Z",
};

describe("dv360 rate-limit keys", () => {
  it("consume and the bulk projection address the same bucket", async () => {
    await consumeDv360Quota(limiter, { advertiserId: "111" }, 2);
    await consumeDv360Quota(limiter, { partnerId: "555" }, 1);

    expect(limiter.getRemainingTokens(dv360QuotaBucket({ advertiserId: "111" }, [1])!.key)).toBe(4);
    expect(limiter.getRemainingTokens(dv360QuotaBucket({ partnerId: "555" }, [1])!.key)).toBe(5);
    expect(dv360BulkCapacityChecks(limiter, "probe", ["111"], [1])[0]!.buckets[0]!.key).toBe(
      dv360QuotaBucket({ advertiserId: "111" }, [1])!.key
    );
  });

  it("the advertiser wins over the partner, and a call naming neither draws nothing", async () => {
    expect(dv360QuotaBucket({ advertiserId: "111", partnerId: "555" }, [1])!.key).toBe("dv360:111");
    expect(dv360QuotaBucket({ partnerId: "555" }, [1])!.key).toBe("dv360:partner:555");
    expect(dv360QuotaBucket({}, [1])).toBeUndefined();

    const consume = vi.spyOn(limiter, "consume");
    await consumeDv360Quota(limiter, {});
    expect(consume).not.toHaveBeenCalled();
  });

  it("both keys fall under the configured dv360:* limit", () => {
    expect(limiter.getRemainingTokens("dv360:111")).toBe(LIMIT);
    expect(limiter.getRemainingTokens("dv360:partner:555")).toBe(LIMIT);
  });
});

describe("every DV360 call draws its own token", () => {
  // getDeliveryEstimate used to draw one token for its two GETs (#236).
  it("delivery estimate: the line-item GET and the targeting GET draw one each", async () => {
    const fetch = vi.fn().mockResolvedValue({});
    await service(fetch).getDeliveryEstimate("111", "222");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(limiter.getRemainingTokens("dv360:111")).toBe(LIMIT - 2);
  });

  it("list custom bidding algorithms by partner draws on the partner's bucket", async () => {
    const fetch = vi.fn().mockResolvedValue({ customBiddingAlgorithms: [] });
    await service(fetch).listCustomBiddingAlgorithmsEntities("555");
    expect(limiter.getRemainingTokens("dv360:partner:555")).toBe(LIMIT - 1);
  });

  it("custom bidding script/rules reads draw on the owner's bucket", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ customBiddingScripts: [] })
      .mockResolvedValueOnce(SCRIPT)
      .mockResolvedValueOnce({ customBiddingAlgorithmRules: [] })
      .mockResolvedValueOnce({
        name: "customBiddingAlgorithms/7001/rules/8002",
        customBiddingAlgorithmId: "7001",
        customBiddingAlgorithmRulesId: "8002",
        state: "ACCEPTED",
        active: true,
        createTime: "2026-09-30T00:00:00Z",
      });
    const svc = service(fetch);

    await svc.listCustomBiddingScripts("7001", undefined, undefined, { partnerId: "555" });
    await svc.getCustomBiddingScript("7001", "8001", { partnerId: "555" });
    await svc.listCustomBiddingRules("7001", undefined, undefined, { advertiserId: "111" });
    await svc.getCustomBiddingRules("7001", "8002", { advertiserId: "111" });

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(limiter.getRemainingTokens("dv360:partner:555")).toBe(LIMIT - 2);
    expect(limiter.getRemainingTokens("dv360:111")).toBe(LIMIT - 2);
  });
});
