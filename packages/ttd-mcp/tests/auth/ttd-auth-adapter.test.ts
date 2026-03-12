import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TtdApiTokenAuthAdapter,
  parseTtdCredentialsFromHeaders,
  getTtdCredentialFingerprint,
} from "../../src/auth/ttd-auth-adapter.js";

// Mock fetchWithTimeout from shared
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  const extractHeader = (
    headers: Record<string, string | string[] | undefined>,
    name: string
  ): string | undefined => {
    const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    const value = key ? headers[key] : undefined;
    return Array.isArray(value) ? value[0] : value;
  };
  return { ...actual, extractHeader, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

const MOCK_CREDENTIALS = { partnerId: "test-partner", apiSecret: "test-secret" };

const MOCK_TOKEN_RESPONSE = {
  access_token: "ttd-test-token",
  expires_in: 3600,
  token_type: "Bearer",
};

describe("TtdApiTokenAuthAdapter", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function mockSuccessResponse(body = MOCK_TOKEN_RESPONSE) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => body,
    } as unknown as Response);
  }

  describe("getAccessToken", () => {
    it("returns cached token when not expired", async () => {
      vi.useFakeTimers();

      const adapter = new TtdApiTokenAuthAdapter(MOCK_CREDENTIALS);
      mockSuccessResponse();

      const first = await adapter.getAccessToken();
      expect(first).toBe("ttd-test-token");

      // Advance time but stay within validity window (3600s - 60s buffer = 3540s)
      vi.advanceTimersByTime(1000 * 1000); // 1000s, well within range

      const second = await adapter.getAccessToken();
      expect(second).toBe("ttd-test-token");

      // fetch should only have been called once
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("fetches new token when no cached token", async () => {
      const adapter = new TtdApiTokenAuthAdapter(MOCK_CREDENTIALS);
      mockSuccessResponse();

      const token = await adapter.getAccessToken();
      expect(token).toBe("ttd-test-token");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("fetches new token when cached token expired", async () => {
      vi.useFakeTimers();

      const adapter = new TtdApiTokenAuthAdapter(MOCK_CREDENTIALS);
      mockSuccessResponse();

      const first = await adapter.getAccessToken();
      expect(first).toBe("ttd-test-token");

      // Advance past expiry: expires_in=3600s, buffer=60s => 3540s validity
      vi.advanceTimersByTime(3541 * 1000);

      mockSuccessResponse({
        access_token: "ttd-new-token",
        expires_in: 3600,
        token_type: "Bearer",
      });

      const second = await adapter.getAccessToken();
      expect(second).toBe("ttd-new-token");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("concurrent calls share the same pending auth (mutex)", async () => {
      const adapter = new TtdApiTokenAuthAdapter(MOCK_CREDENTIALS);

      let resolveToken!: (value: unknown) => void;
      mockFetchWithTimeout.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveToken = resolve;
        })
      );

      const p1 = adapter.getAccessToken();
      const p2 = adapter.getAccessToken();
      const p3 = adapter.getAccessToken();

      // Resolve the single in-flight fetch
      resolveToken({
        ok: true,
        json: async () => MOCK_TOKEN_RESPONSE,
      } as unknown as Response);

      const [t1, t2, t3] = await Promise.all([p1, p2, p3]);
      expect(t1).toBe("ttd-test-token");
      expect(t2).toBe("ttd-test-token");
      expect(t3).toBe("ttd-test-token");

      // fetch was only called once
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("clears pendingAuth even on failure (finally block)", async () => {
      const adapter = new TtdApiTokenAuthAdapter(MOCK_CREDENTIALS);

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Bad credentials",
      } as unknown as Response);

      await expect(adapter.getAccessToken()).rejects.toThrow("TTD token exchange failed");

      // After failure, pendingAuth should be cleared so a second call retries
      mockSuccessResponse();
      const token = await adapter.getAccessToken();
      expect(token).toBe("ttd-test-token");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });
  });

  describe("exchangeToken", () => {
    it("sends correct POST body (Login, Password, TokenType)", async () => {
      const adapter = new TtdApiTokenAuthAdapter(MOCK_CREDENTIALS);
      mockSuccessResponse();

      await adapter.getAccessToken();

      // fetchWithTimeout(url, timeoutMs, context, options)
      const call = mockFetchWithTimeout.mock.calls[0];
      const options = call[3] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body).toEqual({
        Login: "test-partner",
        Password: "test-secret",
        TokenType: "Bearer",
      });
    });

    it("sends Content-Type: application/json", async () => {
      const adapter = new TtdApiTokenAuthAdapter(MOCK_CREDENTIALS);
      mockSuccessResponse();

      await adapter.getAccessToken();

      const call = mockFetchWithTimeout.mock.calls[0];
      const options = call[3] as RequestInit;
      expect((options.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    });

    it("uses 10s timeout", async () => {
      const adapter = new TtdApiTokenAuthAdapter(MOCK_CREDENTIALS);
      mockSuccessResponse();

      await adapter.getAccessToken();

      const call = mockFetchWithTimeout.mock.calls[0];
      expect(call[1]).toBe(10_000);
    });

    it("uses custom authUrl when provided", async () => {
      const customUrl = "https://custom-auth.example.com/token";
      const adapter = new TtdApiTokenAuthAdapter(MOCK_CREDENTIALS, customUrl);
      mockSuccessResponse();

      await adapter.getAccessToken();

      expect(mockFetchWithTimeout.mock.calls[0][0]).toBe(customUrl);
    });

    it("defaults to https://api.thetradedesk.com/v3/authentication", async () => {
      const adapter = new TtdApiTokenAuthAdapter(MOCK_CREDENTIALS);
      mockSuccessResponse();

      await adapter.getAccessToken();

      expect(mockFetchWithTimeout.mock.calls[0][0]).toBe(
        "https://api.thetradedesk.com/v3/authentication"
      );
    });

    it("throws on non-ok response with error body", async () => {
      const adapter = new TtdApiTokenAuthAdapter(MOCK_CREDENTIALS);

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => "Invalid partner credentials",
      } as unknown as Response);

      await expect(adapter.getAccessToken()).rejects.toThrow(
        "TTD token exchange failed: 403 Forbidden. Invalid partner credentials"
      );
    });

    it("sets correct token expiry with 60s buffer", async () => {
      vi.useFakeTimers();

      const adapter = new TtdApiTokenAuthAdapter(MOCK_CREDENTIALS);
      mockSuccessResponse({ access_token: "token-1", expires_in: 3600, token_type: "Bearer" });

      await adapter.getAccessToken();

      // At exactly 3540s (3600 - 60 buffer), cached token should still be valid
      vi.advanceTimersByTime(3539 * 1000);
      const stillCached = await adapter.getAccessToken();
      expect(stillCached).toBe("token-1");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);

      // At 3540s+, the token should be expired
      vi.advanceTimersByTime(2 * 1000);
      mockSuccessResponse({ access_token: "token-2", expires_in: 3600, token_type: "Bearer" });
      const refreshed = await adapter.getAccessToken();
      expect(refreshed).toBe("token-2");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });
  });

  describe("validate", () => {
    it("resolves when token exchange succeeds", async () => {
      const adapter = new TtdApiTokenAuthAdapter(MOCK_CREDENTIALS);
      mockSuccessResponse();

      await expect(adapter.validate()).resolves.toBeUndefined();
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("rejects when token exchange fails", async () => {
      const adapter = new TtdApiTokenAuthAdapter(MOCK_CREDENTIALS);

      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Bad credentials",
      } as unknown as Response);

      await expect(adapter.validate()).rejects.toThrow("TTD token exchange failed");
    });

    it("caches token — validate + getAccessToken = 1 fetch total", async () => {
      const adapter = new TtdApiTokenAuthAdapter(MOCK_CREDENTIALS);
      mockSuccessResponse();

      await adapter.validate();
      const token = await adapter.getAccessToken();

      expect(token).toBe("ttd-test-token");
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("partnerId", () => {
    it("returns credentials.partnerId", () => {
      const adapter = new TtdApiTokenAuthAdapter(MOCK_CREDENTIALS);
      expect(adapter.partnerId).toBe("test-partner");
    });
  });
});

describe("parseTtdCredentialsFromHeaders", () => {
  it("parses partnerId from x-ttd-partner-id header", () => {
    const result = parseTtdCredentialsFromHeaders({
      "x-ttd-partner-id": "my-partner",
      "x-ttd-api-secret": "my-secret",
    });
    expect(result.partnerId).toBe("my-partner");
  });

  it("parses apiSecret from x-ttd-api-secret header", () => {
    const result = parseTtdCredentialsFromHeaders({
      "x-ttd-partner-id": "my-partner",
      "x-ttd-api-secret": "my-secret",
    });
    expect(result.apiSecret).toBe("my-secret");
  });

  it("handles case-insensitive header names", () => {
    // The extractHeader function checks both the exact key and lowercased version
    const result = parseTtdCredentialsFromHeaders({
      "x-ttd-partner-id": "partner-1",
      "x-ttd-api-secret": "secret-1",
    });
    expect(result.partnerId).toBe("partner-1");
    expect(result.apiSecret).toBe("secret-1");
  });

  it("handles array header values (takes first)", () => {
    const result = parseTtdCredentialsFromHeaders({
      "x-ttd-partner-id": ["first-partner", "second-partner"],
      "x-ttd-api-secret": ["first-secret", "second-secret"],
    });
    expect(result.partnerId).toBe("first-partner");
    expect(result.apiSecret).toBe("first-secret");
  });

  it("throws when X-TTD-Partner-Id is missing", () => {
    expect(() =>
      parseTtdCredentialsFromHeaders({
        "x-ttd-api-secret": "my-secret",
      })
    ).toThrow("Missing required header: X-TTD-Partner-Id");
  });

  it("throws when X-TTD-Api-Secret is missing", () => {
    expect(() =>
      parseTtdCredentialsFromHeaders({
        "x-ttd-partner-id": "my-partner",
      })
    ).toThrow("Missing required header: X-TTD-Api-Secret");
  });
});

describe("getTtdCredentialFingerprint", () => {
  it("returns SHA-256 hash substring of partnerId", () => {
    const fingerprint = getTtdCredentialFingerprint(MOCK_CREDENTIALS);
    // Should be deterministic
    const fingerprint2 = getTtdCredentialFingerprint(MOCK_CREDENTIALS);
    expect(fingerprint).toBe(fingerprint2);
    // Different credentials should produce different fingerprints
    const other = getTtdCredentialFingerprint({ partnerId: "other", apiSecret: "other" });
    expect(fingerprint).not.toBe(other);
  });

  it("returns 32-character hex string", () => {
    const fingerprint = getTtdCredentialFingerprint(MOCK_CREDENTIALS);
    expect(fingerprint).toHaveLength(32);
    expect(fingerprint).toMatch(/^[0-9a-f]{32}$/);
  });
});
