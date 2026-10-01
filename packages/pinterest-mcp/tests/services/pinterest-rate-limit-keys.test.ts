// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The Pinterest limiter keys: what `consume` draws on and what the bulk
 * capacity projection reads must be the same bucket, and the identity must be
 * the session's Pinterest user and never its token.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPlatformRateLimiter } from "@cesteral/shared";
import type { RateLimiter } from "@cesteral/shared";
import {
  PinterestAccessTokenAdapter,
  PinterestRefreshTokenAdapter,
  pinterestQuotaUser,
} from "../../src/auth/pinterest-auth-adapter.js";
import {
  consumePinterestAccountQuota,
  consumePinterestReportingQuota,
  consumePinterestUserQuota,
  pinterestAccountQuotaBucket,
  pinterestReportingQuotaBucket,
  pinterestUserQuotaBucket,
} from "../../src/services/pinterest/rate-limit-keys.js";
import { pinterestBulkBuckets } from "../../src/mcp-server/tools/utils/bulk-capacity.js";

const TOKEN = "pina_secret-token-value";
const scope = { quotaUser: "7000000000000000001" };

let limiter: RateLimiter;

beforeEach(() => {
  limiter = createPlatformRateLimiter("pinterest", 10);
});

afterEach(() => {
  limiter.destroy();
  vi.restoreAllMocks();
});

function userAccountResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("pinterest rate-limit keys", () => {
  it("consume and the bulk projection address the same buckets", async () => {
    await consumePinterestAccountQuota(limiter, scope, "549755885175", 3);
    await consumePinterestUserQuota(limiter, scope, 2);
    await consumePinterestReportingQuota(limiter, scope, 1);

    expect(
      limiter.getRemainingTokens(pinterestAccountQuotaBucket(scope, "549755885175", [1]).key)
    ).toBe(7);
    expect(limiter.getRemainingTokens(pinterestUserQuotaBucket(scope, [1]).key)).toBe(8);
    expect(limiter.getRemainingTokens(pinterestReportingQuotaBucket(scope, [1]).key)).toBe(9);
  });

  it("every bulk tool projects one entry per consume on the session's account bucket", () => {
    const key = pinterestAccountQuotaBucket(scope, "549755885175", [1]).key;
    expect(pinterestBulkBuckets.adjustBids(scope, "549755885175")).toEqual([
      { key, costPerItem: [1, 3] },
    ]);
    expect(pinterestBulkBuckets.perItemWrite(scope, "549755885175")).toEqual([
      { key, costPerItem: [3] },
    ]);
    // One write per id for archive types and for Pin DELETEs alike.
    expect(pinterestBulkBuckets.delete(scope, "549755885175")).toEqual([{ key, costPerItem: [3] }]);
  });

  it("keys are pinterest:user:{id}[:account:{acct} | :reporting], under the configured pinterest:* limit", () => {
    const keys = [
      pinterestAccountQuotaBucket(scope, "549755885175", [1]).key,
      pinterestUserQuotaBucket(scope, [1]).key,
      pinterestReportingQuotaBucket(scope, [1]).key,
    ];
    expect(keys).toEqual([
      "pinterest:user:7000000000000000001:account:549755885175",
      "pinterest:user:7000000000000000001",
      "pinterest:user:7000000000000000001:reporting",
    ]);
    for (const key of keys) expect(limiter.getRemainingTokens(key)).toBe(10);
  });

  it("the access-token adapter's identity is the /v5/user_account id, and never the token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      userAccountResponse({ id: "7000000000000000001", username: "u", account_type: "BUSINESS" })
    );
    const adapter = new PinterestAccessTokenAdapter(TOKEN, "549755885175");
    expect(adapter.quotaUser).toMatch(/^token-[0-9a-f]{16}$/);
    expect(adapter.quotaUser).not.toContain(TOKEN);

    await adapter.validate();
    expect(adapter.quotaUser).toBe("7000000000000000001");
    // `userId` stays the username (it is logged / reported as before).
    expect(adapter.userId).toBe("u");
  });

  it("the refresh adapter's identity is the user id too, stable across token refreshes", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/v5/oauth/token")) {
        return userAccountResponse({ access_token: "pina_access", expires_in: 3600 });
      }
      return userAccountResponse({
        id: "7000000000000000001",
        username: "u",
        account_type: "BUSINESS",
      });
    });
    const adapter = new PinterestRefreshTokenAdapter(
      { appId: "app", appSecret: "secret", refreshToken: "pinr_refresh-secret" },
      "549755885175"
    );
    expect(adapter.quotaUser).not.toContain("pinr_refresh-secret");
    await adapter.validate();
    expect(adapter.quotaUser).toBe("7000000000000000001");
  });

  it("the fallback is stable per credential, distinct across credentials, and used when the id is absent", async () => {
    expect(pinterestQuotaUser("", TOKEN)).toBe(pinterestQuotaUser(undefined, TOKEN));
    expect(pinterestQuotaUser("", TOKEN)).not.toBe(pinterestQuotaUser("", `${TOKEN}-2`));

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      userAccountResponse({ username: "u", account_type: "BUSINESS" })
    );
    const adapter = new PinterestAccessTokenAdapter(TOKEN, "549755885175");
    await adapter.validate();
    expect(adapter.quotaUser).toBe(pinterestQuotaUser("", TOKEN));
  });
});
