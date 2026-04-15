import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MetaAccessTokenAdapter,
  MetaRefreshTokenAdapter,
  parseMetaTokenFromHeaders,
  parseMetaAppCredentialsFromHeaders,
  getMetaCredentialFingerprint,
} from "../../src/auth/meta-auth-adapter.js";

// Mock fetchWithTimeout from shared
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

describe("getMetaCredentialFingerprint", () => {
  it("returns deterministic 32-char hex output", () => {
    const fp1 = getMetaCredentialFingerprint("EAABwzLixnjY...");
    const fp2 = getMetaCredentialFingerprint("EAABwzLixnjY...");
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(32);
    expect(fp1).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces different fingerprints for tokens with same 16-char prefix", () => {
    const sharedPrefix = "EAABwzLixnjYBAA"; // 16 chars
    const tokenA = sharedPrefix + "aaaa_different_suffix_A";
    const tokenB = sharedPrefix + "bbbb_different_suffix_B";
    const fpA = getMetaCredentialFingerprint(tokenA);
    const fpB = getMetaCredentialFingerprint(tokenB);
    expect(fpA).not.toBe(fpB);
  });

  it("trims whitespace before hashing", () => {
    const fp1 = getMetaCredentialFingerprint("  mytoken  ");
    const fp2 = getMetaCredentialFingerprint("mytoken");
    expect(fp1).toBe(fp2);
  });
});

describe("parseMetaTokenFromHeaders", () => {
  it("extracts Bearer token from Authorization header", () => {
    const token = parseMetaTokenFromHeaders({
      authorization: "Bearer EAABwzLixnjYBAA",
    });
    expect(token).toBe("EAABwzLixnjYBAA");
  });

  it("is case-insensitive for Bearer scheme", () => {
    const token = parseMetaTokenFromHeaders({
      authorization: "bearer EAABwzLixnjYBAA",
    });
    expect(token).toBe("EAABwzLixnjYBAA");
  });

  it("throws on missing Authorization header", () => {
    expect(() => parseMetaTokenFromHeaders({})).toThrow(
      "Missing required Authorization header"
    );
  });

  it("throws on non-Bearer Authorization header", () => {
    expect(() =>
      parseMetaTokenFromHeaders({ authorization: "Basic abc123" })
    ).toThrow("Authorization header must use Bearer scheme");
  });

  it("handles array header values (takes first)", () => {
    const token = parseMetaTokenFromHeaders({
      authorization: ["Bearer token1", "Bearer token2"],
    });
    expect(token).toBe("token1");
  });
});

describe("MetaAccessTokenAdapter", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockSuccessResponse(body = { id: "12345", name: "Test User" }) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => body,
    } as unknown as Response);
  }

  describe("validate()", () => {
    it("calls /me and sets userId", async () => {
      const adapter = new MetaAccessTokenAdapter("test-token", "https://graph.test/v21.0");
      mockSuccessResponse();

      await adapter.validate();
      expect(adapter.userId).toBe("12345");
    });

    it("caches result on subsequent calls", async () => {
      const adapter = new MetaAccessTokenAdapter("test-token");
      mockSuccessResponse();

      await adapter.validate();
      await adapter.validate();

      expect(adapter.userId).toBe("12345");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("uses the v25.0 default Graph API base URL when none is provided", async () => {
      const adapter = new MetaAccessTokenAdapter("test-token");
      mockSuccessResponse();

      await adapter.validate();

      expect(mockFetchWithTimeout.mock.calls[0]?.[0]).toBe(
        "https://graph.facebook.com/v25.0/me?fields=id,name"
      );
    });

    it("passes token in Authorization header, not in URL", async () => {
      const adapter = new MetaAccessTokenAdapter(
        "SECRET_TOKEN_123",
        "https://graph.test/v21.0"
      );

      mockSuccessResponse();
      await adapter.validate();

      // URL should NOT contain the access token
      const calledUrl = mockFetchWithTimeout.mock.calls[0][0] as string;
      expect(calledUrl).not.toContain("access_token");
      expect(calledUrl).toBe("https://graph.test/v21.0/me?fields=id,name");

      // Token should be in the Authorization header
      const calledOptions = mockFetchWithTimeout.mock.calls[0][3] as { headers: Record<string, string> };
      expect(calledOptions.headers.Authorization).toBe("Bearer SECRET_TOKEN_123");
    });

    it("throws on non-ok response", async () => {
      const adapter = new MetaAccessTokenAdapter("bad-token");
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Invalid token",
      } as unknown as Response);

      await expect(adapter.validate()).rejects.toThrow(
        "Meta token validation failed: 401 Unauthorized"
      );
    });
  });

  describe("getAccessToken()", () => {
    it("returns the token", async () => {
      const adapter = new MetaAccessTokenAdapter("my-access-token");
      const token = await adapter.getAccessToken();
      expect(token).toBe("my-access-token");
    });
  });
});

const MOCK_APP_CREDENTIALS = { appId: "test-app-id", appSecret: "test-app-secret" };

const MOCK_EXCHANGE_RESPONSE = {
  access_token: "long-lived-token",
  token_type: "bearer",
  expires_in: 5184000, // 60 days
};

describe("MetaRefreshTokenAdapter", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function mockExchangeResponse(body = MOCK_EXCHANGE_RESPONSE) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => body,
    } as unknown as Response);
  }

  function mockMeResponse(body = { id: "12345", name: "Test User" }) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => body,
    } as unknown as Response);
  }

  describe("getAccessToken", () => {
    it("exchanges for long-lived token via POST to /oauth/access_token", async () => {
      const adapter = new MetaRefreshTokenAdapter(
        "short-lived-token",
        MOCK_APP_CREDENTIALS,
        "https://graph.test/v21.0"
      );
      mockExchangeResponse();

      const token = await adapter.getAccessToken();
      expect(token).toBe("long-lived-token");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);

      const call = mockFetchWithTimeout.mock.calls[0];
      expect(call[0]).toBe("https://graph.test/v21.0/oauth/access_token");

      const options = call[3] as RequestInit;
      expect(options.method).toBe("POST");
      expect((options.headers as Record<string, string>)["Content-Type"]).toBe(
        "application/x-www-form-urlencoded"
      );

      const body = new URLSearchParams(options.body as string);
      expect(body.get("grant_type")).toBe("fb_exchange_token");
      expect(body.get("client_id")).toBe("test-app-id");
      expect(body.get("client_secret")).toBe("test-app-secret");
      expect(body.get("fb_exchange_token")).toBe("short-lived-token");
    });

    it("returns cached token when not expired", async () => {
      vi.useFakeTimers();

      const adapter = new MetaRefreshTokenAdapter(
        "short-lived-token",
        MOCK_APP_CREDENTIALS
      );
      mockExchangeResponse();

      const first = await adapter.getAccessToken();
      expect(first).toBe("long-lived-token");

      // Advance time but stay within validity window
      // expires_in=5184000s, buffer=86400s (24h) => valid for 5097600s
      vi.advanceTimersByTime(1000 * 1000); // 1000s, well within range

      const second = await adapter.getAccessToken();
      expect(second).toBe("long-lived-token");

      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("uses the v25.0 default Graph API base URL when none is provided", async () => {
      const adapter = new MetaRefreshTokenAdapter(
        "short-lived-token",
        MOCK_APP_CREDENTIALS
      );
      mockExchangeResponse();

      await adapter.getAccessToken();

      expect(mockFetchWithTimeout.mock.calls[0]?.[0]).toBe(
        "https://graph.facebook.com/v25.0/oauth/access_token"
      );
    });

    it("re-exchanges when token approaching expiry", async () => {
      vi.useFakeTimers();

      const adapter = new MetaRefreshTokenAdapter(
        "short-lived-token",
        MOCK_APP_CREDENTIALS
      );
      mockExchangeResponse();

      const first = await adapter.getAccessToken();
      expect(first).toBe("long-lived-token");

      // Advance past (expires_in - 24h buffer): 5184000s - 86400s = 5097600s
      vi.advanceTimersByTime(5097601 * 1000);

      mockExchangeResponse({
        access_token: "refreshed-long-lived-token",
        token_type: "bearer",
        expires_in: 5184000,
      });

      const second = await adapter.getAccessToken();
      expect(second).toBe("refreshed-long-lived-token");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("concurrent calls share pending exchange (mutex)", async () => {
      const adapter = new MetaRefreshTokenAdapter(
        "short-lived-token",
        MOCK_APP_CREDENTIALS
      );

      let resolveExchange!: (value: unknown) => void;
      mockFetchWithTimeout.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveExchange = resolve;
        })
      );

      const p1 = adapter.getAccessToken();
      const p2 = adapter.getAccessToken();
      const p3 = adapter.getAccessToken();

      resolveExchange({
        ok: true,
        json: async () => MOCK_EXCHANGE_RESPONSE,
      } as unknown as Response);

      const [t1, t2, t3] = await Promise.all([p1, p2, p3]);
      expect(t1).toBe("long-lived-token");
      expect(t2).toBe("long-lived-token");
      expect(t3).toBe("long-lived-token");

      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("clears pending on failure (retry works)", async () => {
      const adapter = new MetaRefreshTokenAdapter(
        "short-lived-token",
        MOCK_APP_CREDENTIALS
      );

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Temporary failure",
      } as unknown as Response);

      await expect(adapter.getAccessToken()).rejects.toThrow(
        "Meta token exchange failed"
      );

      // After failure, pending should be cleared so a second call retries
      mockExchangeResponse();
      const token = await adapter.getAccessToken();
      expect(token).toBe("long-lived-token");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("throws on non-ok HTTP response", async () => {
      const adapter = new MetaRefreshTokenAdapter(
        "short-lived-token",
        MOCK_APP_CREDENTIALS
      );

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "Invalid grant",
      } as unknown as Response);

      await expect(adapter.getAccessToken()).rejects.toThrow(
        "Meta token exchange failed: 400 Bad Request. Invalid grant"
      );
    });

    it("throws on missing access_token in response", async () => {
      const adapter = new MetaRefreshTokenAdapter(
        "short-lived-token",
        MOCK_APP_CREDENTIALS
      );

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as unknown as Response);

      await expect(adapter.getAccessToken()).rejects.toThrow(
        "Meta token exchange returned no access_token"
      );
    });

    it("caches system user token indefinitely (no expires_in)", async () => {
      vi.useFakeTimers();

      const adapter = new MetaRefreshTokenAdapter(
        "system-user-token",
        MOCK_APP_CREDENTIALS
      );

      mockExchangeResponse({
        access_token: "system-long-lived-token",
        token_type: "bearer",
        // no expires_in — system user token
      } as any);

      const first = await adapter.getAccessToken();
      expect(first).toBe("system-long-lived-token");

      // Advance time far into the future — token should still be cached
      vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000); // 1 year

      const second = await adapter.getAccessToken();
      expect(second).toBe("system-long-lived-token");

      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("uses cached token for refresh (not initial token)", async () => {
      vi.useFakeTimers();

      const adapter = new MetaRefreshTokenAdapter(
        "initial-short-lived-token",
        MOCK_APP_CREDENTIALS,
        "https://graph.test/v21.0"
      );

      // First exchange: initial token → long-lived-token-1
      mockExchangeResponse({
        access_token: "long-lived-token-1",
        token_type: "bearer",
        expires_in: 5184000,
      });

      const first = await adapter.getAccessToken();
      expect(first).toBe("long-lived-token-1");

      // Verify first exchange used the initial token
      const firstCall = mockFetchWithTimeout.mock.calls[0];
      const firstBody = new URLSearchParams((firstCall[3] as RequestInit).body as string);
      expect(firstBody.get("fb_exchange_token")).toBe("initial-short-lived-token");

      // Expire the cache
      vi.advanceTimersByTime(5097601 * 1000);

      // Second exchange should use long-lived-token-1 (not initial token)
      mockExchangeResponse({
        access_token: "long-lived-token-2",
        token_type: "bearer",
        expires_in: 5184000,
      });

      const second = await adapter.getAccessToken();
      expect(second).toBe("long-lived-token-2");

      const secondCall = mockFetchWithTimeout.mock.calls[1];
      const secondBody = new URLSearchParams((secondCall[3] as RequestInit).body as string);
      expect(secondBody.get("fb_exchange_token")).toBe("long-lived-token-1");
    });
  });

  describe("validate", () => {
    it("exchanges token and validates via /me", async () => {
      const adapter = new MetaRefreshTokenAdapter(
        "short-lived-token",
        MOCK_APP_CREDENTIALS,
        "https://graph.test/v21.0"
      );

      // First call: token exchange
      mockExchangeResponse();
      // Second call: /me validation
      mockMeResponse();

      await adapter.validate();
      expect(adapter.userId).toBe("12345");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);

      // First call should be token exchange
      expect(mockFetchWithTimeout.mock.calls[0][0]).toBe(
        "https://graph.test/v21.0/oauth/access_token"
      );

      // Second call should be /me with the exchanged token
      expect(mockFetchWithTimeout.mock.calls[1][0]).toBe(
        "https://graph.test/v21.0/me?fields=id,name"
      );
      const meOptions = mockFetchWithTimeout.mock.calls[1][3] as {
        headers: Record<string, string>;
      };
      expect(meOptions.headers.Authorization).toBe("Bearer long-lived-token");
    });
  });
});

describe("parseMetaAppCredentialsFromHeaders", () => {
  it("returns credentials when both headers present", () => {
    const result = parseMetaAppCredentialsFromHeaders({
      "x-meta-app-id": "my-app-id",
      "x-meta-app-secret": "my-app-secret",
    });
    expect(result).toEqual({ appId: "my-app-id", appSecret: "my-app-secret" });
  });

  it("returns undefined when x-meta-app-id is missing", () => {
    const result = parseMetaAppCredentialsFromHeaders({
      "x-meta-app-secret": "my-app-secret",
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when x-meta-app-secret is missing", () => {
    const result = parseMetaAppCredentialsFromHeaders({
      "x-meta-app-id": "my-app-id",
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when both headers are missing", () => {
    const result = parseMetaAppCredentialsFromHeaders({});
    expect(result).toBeUndefined();
  });
});
