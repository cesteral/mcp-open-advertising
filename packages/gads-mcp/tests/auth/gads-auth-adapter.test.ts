import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GAdsRefreshTokenAuthAdapter,
  parseGAdsCredentialsFromHeaders,
  getGAdsCredentialFingerprint,
  type GAdsCredentials,
} from "../../src/auth/gads-auth-adapter.js";

const VALID_CREDENTIALS: GAdsCredentials = {
  clientId: "test-client-id.apps.googleusercontent.com",
  clientSecret: "test-client-secret",
  refreshToken: "1//test-refresh-token",
  developerToken: "dev-token-22chars-test",
  loginCustomerId: "1234567890",
};

function mockTokenResponse(
  accessToken: string,
  expiresIn: number
): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      access_token: accessToken,
      expires_in: expiresIn,
      token_type: "Bearer",
    }),
  } as unknown as Response;
}

describe("GAdsRefreshTokenAuthAdapter", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  describe("getAccessToken", () => {
    it("fetches a new access token on first call", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockTokenResponse("access-token-1", 3600)
      );

      const adapter = new GAdsRefreshTokenAuthAdapter(VALID_CREDENTIALS);
      const token = await adapter.getAccessToken();

      expect(token).toBe("access-token-1");
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      // Verify token endpoint and body
      const [url, options] = (globalThis.fetch as any).mock.calls[0];
      expect(url).toBe("https://oauth2.googleapis.com/token");
      expect(options.method).toBe("POST");
      expect(options.body).toContain("grant_type=refresh_token");
      expect(options.body).toContain(`client_id=${encodeURIComponent(VALID_CREDENTIALS.clientId)}`);
    });

    it("returns cached token on subsequent calls within expiry window", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockTokenResponse("access-token-cached", 3600)
      );

      const adapter = new GAdsRefreshTokenAuthAdapter(VALID_CREDENTIALS);

      const token1 = await adapter.getAccessToken();
      const token2 = await adapter.getAccessToken();

      expect(token1).toBe("access-token-cached");
      expect(token2).toBe("access-token-cached");
      // Should only call fetch once (cached for second call)
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("refreshes token after expiry (minus 60s buffer)", async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(mockTokenResponse("token-1", 120)) // 2 minutes
        .mockResolvedValueOnce(mockTokenResponse("token-2", 3600));

      const adapter = new GAdsRefreshTokenAuthAdapter(VALID_CREDENTIALS);

      const token1 = await adapter.getAccessToken();
      expect(token1).toBe("token-1");

      // Advance time by 61 seconds — past the 120s - 60s buffer = 60s validity
      vi.advanceTimersByTime(61_000);

      const token2 = await adapter.getAccessToken();
      expect(token2).toBe("token-2");
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it("deduplicates concurrent token requests (mutex)", async () => {
      let resolveToken: (val: Response) => void;
      const pendingFetch = new Promise<Response>((resolve) => {
        resolveToken = resolve;
      });

      globalThis.fetch = vi.fn().mockReturnValue(pendingFetch);

      const adapter = new GAdsRefreshTokenAuthAdapter(VALID_CREDENTIALS);

      // Start two concurrent requests
      const p1 = adapter.getAccessToken();
      const p2 = adapter.getAccessToken();

      // Only one fetch should be in flight
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      // Resolve the pending fetch
      resolveToken!(mockTokenResponse("shared-token", 3600));

      const [t1, t2] = await Promise.all([p1, p2]);
      expect(t1).toBe("shared-token");
      expect(t2).toBe("shared-token");
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("throws on token exchange failure", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: vi.fn().mockResolvedValue("invalid_grant"),
      });

      const adapter = new GAdsRefreshTokenAuthAdapter(VALID_CREDENTIALS);

      await expect(adapter.getAccessToken()).rejects.toThrow(
        "Google OAuth2 token exchange failed: 401"
      );
    });
  });

  describe("validate", () => {
    it("resolves when token exchange succeeds", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockTokenResponse("access-token-1", 3600)
      );

      const adapter = new GAdsRefreshTokenAuthAdapter(VALID_CREDENTIALS);

      await expect(adapter.validate()).resolves.toBeUndefined();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("rejects when token exchange fails", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: vi.fn().mockResolvedValue("invalid_grant"),
      });

      const adapter = new GAdsRefreshTokenAuthAdapter(VALID_CREDENTIALS);

      await expect(adapter.validate()).rejects.toThrow(
        "Google OAuth2 token exchange failed: 401"
      );
    });

    it("caches token — validate + getAccessToken = 1 fetch total", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockTokenResponse("access-token-cached", 3600)
      );

      const adapter = new GAdsRefreshTokenAuthAdapter(VALID_CREDENTIALS);

      await adapter.validate();
      const token = await adapter.getAccessToken();

      expect(token).toBe("access-token-cached");
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("credential properties", () => {
    it("exposes developerToken", () => {
      const adapter = new GAdsRefreshTokenAuthAdapter(VALID_CREDENTIALS);
      expect(adapter.developerToken).toBe(VALID_CREDENTIALS.developerToken);
    });

    it("exposes loginCustomerId", () => {
      const adapter = new GAdsRefreshTokenAuthAdapter(VALID_CREDENTIALS);
      expect(adapter.loginCustomerId).toBe("1234567890");
    });

    it("loginCustomerId is undefined when not provided", () => {
      const { loginCustomerId: _, ...withoutLogin } = VALID_CREDENTIALS;
      const adapter = new GAdsRefreshTokenAuthAdapter(withoutLogin);
      expect(adapter.loginCustomerId).toBeUndefined();
    });
  });
});

describe("parseGAdsCredentialsFromHeaders", () => {
  it("parses all required headers", () => {
    const headers = {
      "x-gads-developer-token": "dev-token",
      "x-gads-client-id": "client-id",
      "x-gads-client-secret": "client-secret",
      "x-gads-refresh-token": "refresh-token",
    };

    const creds = parseGAdsCredentialsFromHeaders(headers);
    expect(creds.developerToken).toBe("dev-token");
    expect(creds.clientId).toBe("client-id");
    expect(creds.clientSecret).toBe("client-secret");
    expect(creds.refreshToken).toBe("refresh-token");
    expect(creds.loginCustomerId).toBeUndefined();
  });

  it("includes optional loginCustomerId when present", () => {
    const headers = {
      "x-gads-developer-token": "dev-token",
      "x-gads-client-id": "client-id",
      "x-gads-client-secret": "client-secret",
      "x-gads-refresh-token": "refresh-token",
      "x-gads-login-customer-id": "9876543210",
    };

    const creds = parseGAdsCredentialsFromHeaders(headers);
    expect(creds.loginCustomerId).toBe("9876543210");
  });

  it("throws when developer token is missing", () => {
    expect(() =>
      parseGAdsCredentialsFromHeaders({
        "x-gads-client-id": "id",
        "x-gads-client-secret": "secret",
        "x-gads-refresh-token": "token",
      })
    ).toThrow("Missing required header: X-GAds-Developer-Token");
  });

  it("throws when client id is missing", () => {
    expect(() =>
      parseGAdsCredentialsFromHeaders({
        "x-gads-developer-token": "token",
        "x-gads-client-secret": "secret",
        "x-gads-refresh-token": "token",
      })
    ).toThrow("Missing required header: X-GAds-Client-Id");
  });

  it("throws when client secret is missing", () => {
    expect(() =>
      parseGAdsCredentialsFromHeaders({
        "x-gads-developer-token": "token",
        "x-gads-client-id": "id",
        "x-gads-refresh-token": "token",
      })
    ).toThrow("Missing required header: X-GAds-Client-Secret");
  });

  it("throws when refresh token is missing", () => {
    expect(() =>
      parseGAdsCredentialsFromHeaders({
        "x-gads-developer-token": "token",
        "x-gads-client-id": "id",
        "x-gads-client-secret": "secret",
      })
    ).toThrow("Missing required header: X-GAds-Refresh-Token");
  });

  it("handles array header values (takes first)", () => {
    const headers = {
      "x-gads-developer-token": ["token1", "token2"],
      "x-gads-client-id": "id",
      "x-gads-client-secret": "secret",
      "x-gads-refresh-token": "refresh",
    } as Record<string, string | string[] | undefined>;

    const creds = parseGAdsCredentialsFromHeaders(headers);
    expect(creds.developerToken).toBe("token1");
  });
});

describe("getGAdsCredentialFingerprint", () => {
  it("produces a 16-character hex string", () => {
    const fingerprint = getGAdsCredentialFingerprint(VALID_CREDENTIALS);
    expect(fingerprint).toHaveLength(16);
    expect(fingerprint).toMatch(/^[0-9a-f]+$/);
  });

  it("produces consistent fingerprints for same credentials", () => {
    const fp1 = getGAdsCredentialFingerprint(VALID_CREDENTIALS);
    const fp2 = getGAdsCredentialFingerprint(VALID_CREDENTIALS);
    expect(fp1).toBe(fp2);
  });

  it("produces different fingerprints for different client IDs", () => {
    const fp1 = getGAdsCredentialFingerprint(VALID_CREDENTIALS);
    const fp2 = getGAdsCredentialFingerprint({
      ...VALID_CREDENTIALS,
      clientId: "different-client-id",
    });
    expect(fp1).not.toBe(fp2);
  });
});
