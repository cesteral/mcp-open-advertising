// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The Snapchat limiter keys: what `consume` draws on and what the bulk
 * capacity projection reads must be the same bucket, and the keys must name
 * the Snap user (or a hash of the credential) without ever carrying a token.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPlatformRateLimiter } from "@cesteral/shared";
import type { RateLimiter } from "@cesteral/shared";
import {
  SnapchatAccessTokenAdapter,
  SnapchatRefreshTokenAdapter,
  getSnapchatCredentialFingerprint,
  snapchatQuotaPrincipal,
} from "../../src/auth/snapchat-auth-adapter.js";
import {
  consumeSnapchatQuota,
  consumeSnapchatReportingQuota,
  snapchatQuotaKey,
  snapchatReportingQuotaKey,
} from "../../src/services/snapchat/rate-limit-keys.js";
import { SnapchatService } from "../../src/services/snapchat/snapchat-service.js";
import { snapchatBulkCost } from "../../src/mcp-server/tools/utils/bulk-capacity.js";

const TOKEN = "snapchat-access-token-value";
const USER = "3b8f2c1e-0000-4000-8000-00000000000a";
const ACCOUNT = "acct-1";

let limiter: RateLimiter;
let fetchSpy: ReturnType<typeof vi.spyOn>;

function meResponse(id: unknown) {
  return new Response(JSON.stringify({ request_status: "SUCCESS", me: { id } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  limiter = createPlatformRateLimiter("snapchat", 10);
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => meResponse(USER));
});

afterEach(() => {
  limiter.destroy();
  vi.restoreAllMocks();
});

describe("snapchat rate-limit keys", () => {
  it("keys a validated session by its Snap user: snapchat:user:{me.id} (and :reporting)", async () => {
    const adapter = new SnapchatAccessTokenAdapter(TOKEN, ACCOUNT);
    await adapter.validate();
    expect(snapchatQuotaKey(adapter)).toBe(`snapchat:user:${USER}`);
    expect(snapchatReportingQuotaKey(adapter)).toBe(`snapchat:user:${USER}:reporting`);
    expect(limiter.getRemainingTokens(snapchatQuotaKey(adapter))).not.toBe(Infinity);
    expect(limiter.getRemainingTokens(snapchatReportingQuotaKey(adapter))).not.toBe(Infinity);
  });

  it("consume and the bulk projection address the same bucket", async () => {
    const adapter = new SnapchatAccessTokenAdapter(TOKEN, ACCOUNT);
    await adapter.validate();
    const service = new SnapchatService(
      { quotaPrincipal: adapter.quotaPrincipal } as any,
      "",
      ACCOUNT,
      limiter
    );
    const model = snapchatBulkCost.bulkUpdate(service, "campaign");

    expect(model.key).toBe(snapchatQuotaKey(adapter));
    await consumeSnapchatQuota(limiter, adapter, 3);
    expect(limiter.getRemainingTokens(model.key)).toBe(7);
    await consumeSnapchatReportingQuota(limiter, adapter);
    expect(limiter.getRemainingTokens(model.key)).toBe(7);
    expect(limiter.getRemainingTokens(snapchatReportingQuotaKey(adapter))).toBe(9);
  });

  it("keeps the user's bucket across the refresh flow's token rotation", async () => {
    const refresh = new SnapchatRefreshTokenAdapter(
      { appId: "app", appSecret: "secret", refreshToken: "refresh" },
      ACCOUNT
    );
    // The token exchange, then /v1/me.
    fetchSpy
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ access_token: "rotating-1", expires_in: 1800 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
      )
      .mockImplementationOnce(async () => meResponse(USER));
    await refresh.validate();
    const staticToken = new SnapchatAccessTokenAdapter("rotating-2", ACCOUNT);
    await staticToken.validate();
    expect(snapchatQuotaKey(refresh)).toBe(snapchatQuotaKey(staticToken));
  });

  it("never carries a token: before validate() or without a usable id it is a credential hash", async () => {
    const unvalidated = new SnapchatAccessTokenAdapter(TOKEN, ACCOUNT);
    expect(unvalidated.quotaPrincipal).toMatch(/^cred:[0-9a-f]{16}$/);
    expect(snapchatQuotaKey(unvalidated)).not.toContain(TOKEN);
    const binding = getSnapchatCredentialFingerprint(TOKEN, ACCOUNT);
    expect(snapchatQuotaKey(unvalidated)).not.toContain(binding.slice(0, 16));

    fetchSpy.mockImplementation(async () => meResponse(undefined));
    const noId = new SnapchatAccessTokenAdapter("token-without-id", ACCOUNT);
    await noId.validate();
    expect(noId.userId).toBe("unknown");
    // Two credentials whose /v1/me had no id do not collapse into one "unknown" bucket.
    const other = new SnapchatAccessTokenAdapter("another-token-without-id", ACCOUNT);
    await other.validate();
    expect(noId.quotaPrincipal).toMatch(/^cred:[0-9a-f]{16}$/);
    expect(noId.quotaPrincipal).not.toBe(other.quotaPrincipal);
  });

  it("accepts only an id-shaped user id", () => {
    expect(snapchatQuotaPrincipal(USER, TOKEN)).toBe(`user:${USER}`);
    expect(snapchatQuotaPrincipal("unknown", TOKEN)).toMatch(/^cred:/);
    expect(snapchatQuotaPrincipal("", TOKEN)).toMatch(/^cred:/);
    expect(snapchatQuotaPrincipal("a:b*c", TOKEN)).toMatch(/^cred:/);
  });

  it("ignores the caller-supplied ad account: one user is one bucket", async () => {
    const a = new SnapchatAccessTokenAdapter(TOKEN, "acct-1");
    const b = new SnapchatAccessTokenAdapter(TOKEN, "acct-2");
    await a.validate();
    await b.validate();
    expect(a.quotaPrincipal).toBe(b.quotaPrincipal);
  });
});
