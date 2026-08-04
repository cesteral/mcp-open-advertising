// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  classifyOAuth2RefreshFailure,
  OAuth2RefreshAdapterBase,
  type OAuth2RefreshAdapterOptions,
  type OAuth2RefreshTokenCredentials,
  type OAuth2TokenResponse,
} from "../../src/auth/oauth2-refresh-adapter-base.js";
import { JsonRpcErrorCode } from "../../src/utils/mcp-errors.js";

/**
 * Minimal concrete subclass for testing the base directly. The real adapters
 * (AmazonDspRefreshTokenAdapter, MetaRefreshTokenAdapter, LinkedInRefreshTokenAdapter,
 * TikTokRefreshTokenAdapter, PinterestRefreshTokenAdapter, SnapchatRefreshTokenAdapter,
 * GAdsRefreshTokenAuthAdapter) add platform-specific validation but rely on the base
 * for caching, single-flight, expiry math, and refresh-token rotation — exactly the
 * surface this tests.
 */
class TestAdapter extends OAuth2RefreshAdapterBase<OAuth2RefreshTokenCredentials> {
  constructor(
    credentials: OAuth2RefreshTokenCredentials,
    requestToken: (refreshToken: string) => Promise<OAuth2TokenResponse>,
    expiryBufferMs?: number,
    onRefreshTokenRotated?: OAuth2RefreshAdapterOptions<OAuth2RefreshTokenCredentials>["onRefreshTokenRotated"]
  ) {
    super({
      platformName: "Test",
      credentials,
      requestToken,
      expiryBufferMs,
      onRefreshTokenRotated,
    });
  }
}

const baseCreds: OAuth2RefreshTokenCredentials = {
  appId: "app-1",
  appSecret: "secret-1",
  refreshToken: "rt-1",
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("OAuth2RefreshAdapterBase", () => {
  it("returns the cached token within the expiry window without re-issuing", async () => {
    const requestToken = vi
      .fn<[string], Promise<OAuth2TokenResponse>>()
      .mockResolvedValue({ access_token: "tok-1", expires_in: 3600 });
    const adapter = new TestAdapter(baseCreds, requestToken);

    const a = await adapter.getAccessToken();
    const b = await adapter.getAccessToken();

    expect(a).toBe("tok-1");
    expect(b).toBe("tok-1");
    expect(requestToken).toHaveBeenCalledTimes(1);
  });

  it("re-refreshes once the cached token's expiry (with safety buffer) has elapsed", async () => {
    const requestToken = vi
      .fn<[string], Promise<OAuth2TokenResponse>>()
      .mockResolvedValueOnce({ access_token: "tok-1", expires_in: 60 })
      .mockResolvedValueOnce({ access_token: "tok-2", expires_in: 60 });
    // 10s buffer → effective TTL = 50s for a 60s token.
    const adapter = new TestAdapter(baseCreds, requestToken, 10_000);

    expect(await adapter.getAccessToken()).toBe("tok-1");
    vi.setSystemTime(Date.now() + 49_000);
    expect(await adapter.getAccessToken()).toBe("tok-1");
    vi.setSystemTime(Date.now() + 2_000); // total 51s — past 50s effective TTL
    expect(await adapter.getAccessToken()).toBe("tok-2");
    expect(requestToken).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent refresh requests into a single in-flight call (single-flight)", async () => {
    let resolve!: (value: OAuth2TokenResponse) => void;
    const pending = new Promise<OAuth2TokenResponse>((r) => {
      resolve = r;
    });
    const requestToken = vi.fn<[string], Promise<OAuth2TokenResponse>>().mockReturnValue(pending);
    const adapter = new TestAdapter(baseCreds, requestToken);

    const p1 = adapter.getAccessToken();
    const p2 = adapter.getAccessToken();
    const p3 = adapter.getAccessToken();

    resolve({ access_token: "shared", expires_in: 3600 });

    expect(await p1).toBe("shared");
    expect(await p2).toBe("shared");
    expect(await p3).toBe("shared");
    expect(requestToken).toHaveBeenCalledTimes(1);
  });

  it("clears pendingAuth on refresh failure so the next call retries instead of replaying the rejection", async () => {
    const requestToken = vi
      .fn<[string], Promise<OAuth2TokenResponse>>()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ access_token: "recovered", expires_in: 3600 });
    const adapter = new TestAdapter(baseCreds, requestToken);

    await expect(adapter.getAccessToken()).rejects.toThrow("network down");
    expect(await adapter.getAccessToken()).toBe("recovered");
    expect(requestToken).toHaveBeenCalledTimes(2);
  });

  it("throws when the refresh response omits access_token (no negative cache poisoning)", async () => {
    const requestToken = vi
      .fn<[string], Promise<OAuth2TokenResponse>>()
      .mockResolvedValueOnce({ expires_in: 3600 } as OAuth2TokenResponse)
      .mockResolvedValueOnce({ access_token: "ok", expires_in: 3600 });
    const adapter = new TestAdapter(baseCreds, requestToken);

    await expect(adapter.getAccessToken()).rejects.toThrow(/missing access_token/i);
    expect(await adapter.getAccessToken()).toBe("ok");
  });

  it("rotates to a new refresh_token when the response provides one", async () => {
    const requestToken = vi
      .fn<[string], Promise<OAuth2TokenResponse>>()
      .mockResolvedValueOnce({
        access_token: "tok-1",
        expires_in: 60,
        refresh_token: "rt-2", // server rotated the refresh token
      })
      .mockResolvedValueOnce({ access_token: "tok-2", expires_in: 60 });
    const adapter = new TestAdapter(baseCreds, requestToken, 0);

    await adapter.getAccessToken();
    vi.setSystemTime(Date.now() + 61_000);
    await adapter.getAccessToken();

    expect(requestToken).toHaveBeenNthCalledWith(1, "rt-1");
    expect(requestToken).toHaveBeenNthCalledWith(2, "rt-2");
  });

  it("retains the previous refresh_token when the response doesn't return a new one", async () => {
    const requestToken = vi
      .fn<[string], Promise<OAuth2TokenResponse>>()
      .mockResolvedValue({ access_token: "tok", expires_in: 60 });
    const adapter = new TestAdapter(baseCreds, requestToken, 0);

    await adapter.getAccessToken();
    vi.setSystemTime(Date.now() + 61_000);
    await adapter.getAccessToken();

    expect(requestToken).toHaveBeenNthCalledWith(1, "rt-1");
    expect(requestToken).toHaveBeenNthCalledWith(2, "rt-1");
  });

  it("falls back to a 3600s TTL when the response omits expires_in", async () => {
    const requestToken = vi
      .fn<[string], Promise<OAuth2TokenResponse>>()
      .mockResolvedValue({ access_token: "tok" });
    const adapter = new TestAdapter(baseCreds, requestToken, 0);

    await adapter.getAccessToken();
    // Within the default 3600s — should still be cached
    vi.setSystemTime(Date.now() + 3_500_000);
    await adapter.getAccessToken();
    expect(requestToken).toHaveBeenCalledTimes(1);

    // Past 3600s — should refresh
    vi.setSystemTime(Date.now() + 200_000);
    await adapter.getAccessToken();
    expect(requestToken).toHaveBeenCalledTimes(2);
  });

  it("notifies onRefreshTokenRotated when the response rotates the refresh token", async () => {
    const requestToken = vi
      .fn<[string], Promise<OAuth2TokenResponse>>()
      .mockResolvedValue({ access_token: "tok", expires_in: 60, refresh_token: "rt-2" });
    const onRotated = vi.fn();
    const adapter = new TestAdapter(baseCreds, requestToken, undefined, onRotated);

    await adapter.getAccessToken();
    expect(onRotated).toHaveBeenCalledTimes(1);
    expect(onRotated).toHaveBeenCalledWith("rt-2");
  });

  it("does not notify onRefreshTokenRotated when the token is unchanged or absent", async () => {
    const requestToken = vi
      .fn<[string], Promise<OAuth2TokenResponse>>()
      .mockResolvedValueOnce({ access_token: "tok-1", expires_in: 60, refresh_token: "rt-1" })
      .mockResolvedValueOnce({ access_token: "tok-2", expires_in: 60 });
    const onRotated = vi.fn();
    const adapter = new TestAdapter(baseCreds, requestToken, 0, onRotated);

    await adapter.getAccessToken(); // refresh_token === current — no rotation
    vi.setSystemTime(Date.now() + 61_000);
    await adapter.getAccessToken(); // no refresh_token in response
    expect(onRotated).not.toHaveBeenCalled();
  });

  it("does not fail the refresh when onRefreshTokenRotated throws or rejects", async () => {
    const requestToken = vi
      .fn<[string], Promise<OAuth2TokenResponse>>()
      .mockResolvedValue({ access_token: "tok", expires_in: 60, refresh_token: "rt-2" });
    const adapter = new TestAdapter(baseCreds, requestToken, undefined, () => {
      throw new Error("persist failed");
    });

    await expect(adapter.getAccessToken()).resolves.toBe("tok");

    const rejecting = new TestAdapter(baseCreds, requestToken, undefined, () =>
      Promise.reject(new Error("persist failed"))
    );
    await expect(rejecting.getAccessToken()).resolves.toBe("tok");
  });
});

describe("classifyOAuth2RefreshFailure", () => {
  it("maps invalid_grant to Unauthorized with a re-authorization message", () => {
    const err = classifyOAuth2RefreshFailure(
      "AmazonDsp",
      400,
      "Bad Request",
      JSON.stringify({ error: "invalid_grant", error_description: "refresh token expired" })
    );
    expect(err.code).toBe(JsonRpcErrorCode.Unauthorized);
    expect(err.message).toContain("invalid_grant");
    expect(err.message).toContain("Re-authorization");
  });

  it("maps invalid_client and unauthorized_client to Unauthorized", () => {
    for (const code of ["invalid_client", "unauthorized_client"]) {
      const err = classifyOAuth2RefreshFailure(
        "Test",
        401,
        "Unauthorized",
        JSON.stringify({ error: code })
      );
      expect(err.code).toBe(JsonRpcErrorCode.Unauthorized);
    }
  });

  it("keeps 5xx and non-terminal OAuth errors as InternalError", () => {
    expect(
      classifyOAuth2RefreshFailure("Test", 503, "Service Unavailable", "upstream down").code
    ).toBe(JsonRpcErrorCode.InternalError);
    expect(
      classifyOAuth2RefreshFailure(
        "Test",
        400,
        "Bad Request",
        JSON.stringify({ error: "temporarily_unavailable" })
      ).code
    ).toBe(JsonRpcErrorCode.InternalError);
  });

  it("treats a non-JSON body as InternalError and truncates it into the message", () => {
    const err = classifyOAuth2RefreshFailure("Test", 400, "Bad Request", "x".repeat(500));
    expect(err.code).toBe(JsonRpcErrorCode.InternalError);
    expect(err.message.length).toBeLessThan(400);
  });
});
