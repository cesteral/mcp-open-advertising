// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The Meta limiter keys: what `consume` draws on and what the bulk capacity
 * projection reads must be the same bucket, the identity must be the session's
 * Graph user and never its token, and every Graph call must draw its own token.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPlatformRateLimiter } from "@cesteral/shared";
import type { RateLimiter } from "@cesteral/shared";
import { metaQuotaUser, MetaAccessTokenAdapter } from "../../src/auth/meta-auth-adapter.js";
import {
  consumeMetaAccountQuota,
  consumeMetaUserQuota,
  metaAccountQuotaBucket,
  metaUserQuotaBucket,
} from "../../src/services/meta/rate-limit-keys.js";
import { metaBulkBuckets } from "../../src/mcp-server/tools/utils/bulk-capacity.js";
import { MetaInsightsService } from "../../src/services/meta/meta-insights-service.js";

const TOKEN = "EAAB-secret-token-value";
const scope = { quotaUser: "10150000000000001" };
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;

let limiter: RateLimiter;

beforeEach(() => {
  limiter = createPlatformRateLimiter("meta", 20);
});

afterEach(() => {
  limiter.destroy();
  vi.restoreAllMocks();
});

describe("meta rate-limit keys", () => {
  it("consume and the bulk projection address the same buckets", async () => {
    const user = metaUserQuotaBucket(scope, [1]).key;
    const account = metaAccountQuotaBucket(scope, "act_42", [1]).key;

    await consumeMetaUserQuota(limiter, scope, 3);
    await consumeMetaAccountQuota(limiter, scope, "42", 2);

    expect(limiter.getRemainingTokens(user)).toBe(17);
    expect(limiter.getRemainingTokens(account)).toBe(18);
  });

  it("the bulk tools project against the session's buckets", () => {
    expect(metaBulkBuckets.bulkUpdate(scope)[0]!.key).toBe(metaUserQuotaBucket(scope, [3]).key);
    expect(metaBulkBuckets.adjustBids(scope)[0]!.key).toBe(metaUserQuotaBucket(scope, [1]).key);
    expect(metaBulkBuckets.bulkCreate(scope, "42")[0]!.key).toBe(
      metaAccountQuotaBucket(scope, "act_42", [3]).key
    );
  });

  it("keys are meta:user:{id} and meta:user:{id}:account:act_{n}, under the configured meta:* limit", () => {
    const user = metaUserQuotaBucket(scope, [1]).key;
    const account = metaAccountQuotaBucket(scope, "42", [1]).key;
    expect(user).toBe("meta:user:10150000000000001");
    expect(account).toBe("meta:user:10150000000000001:account:act_42");
    expect(limiter.getRemainingTokens(user)).toBe(20);
    expect(limiter.getRemainingTokens(account)).toBe(20);
  });

  it("an ad-account bucket belongs to the user: another user naming the same account is a different bucket", () => {
    const other = { quotaUser: "2002" };
    expect(metaAccountQuotaBucket(other, "42", [1]).key).not.toBe(
      metaAccountQuotaBucket(scope, "42", [1]).key
    );
  });

  it("the adapter's identity is the /me id, and never the token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "10150000000000001", name: "u" }), { status: 200 })
    );
    const adapter = new MetaAccessTokenAdapter(TOKEN, "https://graph.facebook.com/v26.0");
    // Before validation: a one-way hash, not the token.
    expect(adapter.quotaUser).toMatch(/^token-[0-9a-f]{16}$/);
    expect(adapter.quotaUser).not.toContain(TOKEN);

    await adapter.validate();
    expect(adapter.quotaUser).toBe("10150000000000001");
  });

  it("the fallback is stable per token and distinct across tokens", () => {
    expect(metaQuotaUser("", TOKEN)).toBe(metaQuotaUser(undefined, TOKEN));
    expect(metaQuotaUser("", TOKEN)).not.toBe(metaQuotaUser("", `${TOKEN}-2`));
    expect(metaQuotaUser("777", TOKEN)).toBe("777");
  });

  it("an async report download draws one read per page it fetches", async () => {
    const pages = [
      { data: [{ a: 1 }], paging: { cursors: { after: "p2" }, next: "https://x/p2" } },
      { data: [{ a: 2 }], paging: { cursors: { after: "p3" }, next: "https://x/p3" } },
      { data: [{ a: 3 }], paging: {} },
    ];
    const httpClient = {
      quotaUser: scope.quotaUser,
      get: vi.fn().mockImplementation(async () => pages.shift()),
    } as any;
    const service = new MetaInsightsService(limiter, httpClient, logger);

    const result = await service.getReportResults("run-1", {});

    expect(result.data).toHaveLength(3);
    expect(httpClient.get).toHaveBeenCalledTimes(3);
    expect(limiter.getRemainingTokens(metaUserQuotaBucket(scope, [1]).key)).toBe(17);
  });
});
