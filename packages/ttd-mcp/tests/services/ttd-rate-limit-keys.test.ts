// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The TTD limiter key: what `consume` draws on and what the bulk capacity
 * projection reads must be the same bucket, REST and GraphQL must share it,
 * and it must identify the credential without carrying it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPlatformRateLimiter } from "@cesteral/shared";
import type { RateLimiter } from "@cesteral/shared";
import {
  TtdDirectTokenAuthAdapter,
  getTtdDirectTokenFingerprint,
} from "../../src/auth/ttd-auth-adapter.js";
import { consumeTtdQuota, ttdQuotaBucket } from "../../src/services/ttd/rate-limit-keys.js";
import { TtdService } from "../../src/services/ttd/ttd-service.js";
import { TtdReportingService } from "../../src/services/ttd/ttd-reporting-service.js";

const TOKEN = "ttd-api-token-value";

let limiter: RateLimiter;

beforeEach(() => {
  limiter = createPlatformRateLimiter("ttd", 60);
});

afterEach(() => {
  limiter.destroy();
});

describe("ttd rate-limit keys", () => {
  it("consume and the bulk projection address the same bucket", async () => {
    const scope = new TtdDirectTokenAuthAdapter(TOKEN);
    const { key } = ttdQuotaBucket(scope, [1]);

    expect(limiter.getRemainingTokens(key)).toBe(60);
    await consumeTtdQuota(limiter, scope, 3);
    expect(limiter.getRemainingTokens(key)).toBe(57);
  });

  it("is ttd:client:{16 hex}, governed by the configured ttd:* limit", () => {
    const { key } = ttdQuotaBucket(new TtdDirectTokenAuthAdapter(TOKEN), [1]);
    expect(key).toMatch(/^ttd:client:[0-9a-f]{16}$/);
    expect(limiter.getRemainingTokens(key)).not.toBe(Infinity);
  });

  it("carries neither the token nor the session-binding fingerprint", () => {
    const { key } = ttdQuotaBucket(new TtdDirectTokenAuthAdapter(TOKEN), [1]);
    const binding = getTtdDirectTokenFingerprint({ token: TOKEN });
    expect(key).not.toContain(TOKEN);
    expect(key).not.toContain(binding.slice(0, 16));
  });

  it("REST, GraphQL and reporting calls of one session drain one bucket", async () => {
    const adapter = new TtdDirectTokenAuthAdapter(TOKEN);
    const httpClient = {
      quotaClient: adapter.quotaClient,
      fetch: vi.fn().mockResolvedValue({}),
      fetchDirect: vi.fn().mockResolvedValue({ data: {} }),
    } as any;
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const service = new TtdService(logger, limiter, httpClient);
    const reporting = new TtdReportingService(limiter, httpClient, logger);
    const { key } = service.bulkCapacityCheck("probe", 1, [1]).buckets[0]!;

    await service.getEntity("campaign", "c-1"); // REST
    await service.graphqlQuery("{ __typename }"); // GraphQL
    await reporting.getReportSchedule("42"); // MyReports REST

    expect(limiter.getRemainingTokens(key)).toBe(57);
  });

  // uploadVideoCreative used to draw ONE token for its two TTD calls (#236).
  // basis: Foundations §12 limits calls per client per endpoint — the
  // generate-URL POST and the /creative POST are two calls; the PUT goes to the
  // presigned storage URL, not TTD's API.
  it("a video upload draws one token per TTD call, none for the presigned PUT", async () => {
    const adapter = new TtdDirectTokenAuthAdapter(TOKEN);
    const httpClient = {
      quotaClient: adapter.quotaClient,
      fetch: vi
        .fn()
        .mockResolvedValueOnce({ UploadUrl: "https://storage.example/presigned", MediaId: "m1" })
        .mockResolvedValueOnce({ CreativeId: "cr-1" }),
      fetchDirect: vi.fn(),
    } as any;
    const put = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const service = new TtdService(logger, limiter, httpClient);
    const { key } = service.bulkCapacityCheck("probe", 1, [1]).buckets[0]!;

    await service.uploadVideoCreative("adv1", "v.mp4", Buffer.from("vid"), "video/mp4", {
      CreativeName: "Promo",
    });

    expect(httpClient.fetch.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      "/creative/generateuploadurlforvideocreative",
      "/creative",
    ]);
    expect(put).toHaveBeenCalledOnce();
    expect(limiter.getRemainingTokens(key)).toBe(58);
    put.mockRestore();
  });
});
