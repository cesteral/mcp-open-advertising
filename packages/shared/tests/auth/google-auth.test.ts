import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ServiceAccountAuthAdapter,
  OAuth2RefreshTokenAuthAdapter,
  createGoogleAuthAdapter,
  parseCredentialsFromHeaders,
  getCredentialFingerprint,
} from "../../src/auth/google-auth.js";
import type {
  ServiceAccountCredentials,
  OAuth2RefreshCredentials,
} from "../../src/auth/google-auth.js";
import { createHash, createSign } from "crypto";

// ---------------------------------------------------------------------------
// Mock the crypto dynamic import used by ServiceAccountAuthAdapter.exchangeToken
// The source does `const crypto = await import("crypto")` then calls
// crypto.createSign("RSA-SHA256").update(...).sign(...)
// We mock createSign to avoid needing a real RSA private key.
// ---------------------------------------------------------------------------

vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  return {
    ...actual,
    createSign: vi.fn(),
  };
});

// Cast mocked createSign so we can control its return value per test
const mockCreateSign = createSign as unknown as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Mock credentials
// ---------------------------------------------------------------------------

const MOCK_SA_CREDENTIALS: ServiceAccountCredentials = {
  type: "service_account",
  project_id: "test-project",
  private_key_id: "key123",
  private_key: "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n",
  client_email: "test@test.iam.gserviceaccount.com",
  client_id: "123456",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url:
    "https://www.googleapis.com/robot/v1/metadata/x509/test%40test.iam.gserviceaccount.com",
};

const MOCK_OAUTH2_CREDENTIALS: OAuth2RefreshCredentials = {
  type: "oauth2",
  clientId: "client-123",
  clientSecret: "secret-456",
  refreshToken: "refresh-789",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupCreateSignMock() {
  mockCreateSign.mockReturnValue({
    update: vi.fn().mockReturnThis(),
    sign: vi.fn().mockReturnValue("mock-signature"),
  });
}

function mockFetchSuccess(token = "test-token", expiresIn = 3600) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ access_token: token, expires_in: expiresIn }),
  });
}

function mockFetchFailure(status = 401, statusText = "Unauthorized", body = "bad creds") {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText,
    text: async () => body,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ServiceAccountAuthAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupCreateSignMock();
    vi.stubGlobal("fetch", mockFetchSuccess());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("calls exchangeToken when no cached token", async () => {
    const adapter = new ServiceAccountAuthAdapter(MOCK_SA_CREDENTIALS, [
      "https://www.googleapis.com/auth/display-video",
    ]);

    const token = await adapter.getAccessToken();

    expect(token).toBe("test-token");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("returns cached token when not expired", async () => {
    const adapter = new ServiceAccountAuthAdapter(MOCK_SA_CREDENTIALS, [
      "https://www.googleapis.com/auth/display-video",
    ]);

    // First call populates cache
    await adapter.getAccessToken();
    expect(fetch).toHaveBeenCalledOnce();

    // Advance time by 30 minutes (well within 1h expiry minus 60s buffer)
    vi.advanceTimersByTime(30 * 60 * 1000);

    // Second call should use cache
    const token = await adapter.getAccessToken();
    expect(token).toBe("test-token");
    expect(fetch).toHaveBeenCalledOnce(); // still only one call
  });

  it("calls exchangeToken when token is within 60s of expiry", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "token-1", expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "token-2", expires_in: 3600 }),
        })
    );

    const adapter = new ServiceAccountAuthAdapter(MOCK_SA_CREDENTIALS, [
      "https://www.googleapis.com/auth/display-video",
    ]);

    await adapter.getAccessToken();
    expect(fetch).toHaveBeenCalledTimes(1);

    // Advance to within 60s of expiry (3600s - 59s = 3541s past)
    vi.advanceTimersByTime(3541 * 1000);

    const token = await adapter.getAccessToken();
    expect(token).toBe("token-2");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("concurrent requests share the same pending auth (mutex behavior)", async () => {
    let resolveToken: (() => void) | undefined;
    const slowFetch = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveToken = () =>
          resolve({
            ok: true,
            json: async () => ({
              access_token: "shared-token",
              expires_in: 3600,
            }),
          });
      })
    );
    vi.stubGlobal("fetch", slowFetch);

    const adapter = new ServiceAccountAuthAdapter(MOCK_SA_CREDENTIALS, [
      "https://www.googleapis.com/auth/display-video",
    ]);

    // Fire three concurrent requests
    const p1 = adapter.getAccessToken();
    const p2 = adapter.getAccessToken();
    const p3 = adapter.getAccessToken();

    // Allow microtasks to progress (dynamic import("crypto") is async)
    // so exchangeToken reaches the fetch() call
    await vi.advanceTimersByTimeAsync(0);

    // Only one fetch should have been started
    expect(slowFetch).toHaveBeenCalledOnce();

    // Resolve the pending fetch
    resolveToken!();

    const [t1, t2, t3] = await Promise.all([p1, p2, p3]);
    expect(t1).toBe("shared-token");
    expect(t2).toBe("shared-token");
    expect(t3).toBe("shared-token");
    expect(slowFetch).toHaveBeenCalledOnce();
  });

  it("throws on failed token exchange (non-ok response)", async () => {
    vi.stubGlobal("fetch", mockFetchFailure(400, "Bad Request", "invalid_grant"));

    const adapter = new ServiceAccountAuthAdapter(MOCK_SA_CREDENTIALS, [
      "https://www.googleapis.com/auth/display-video",
    ]);

    await expect(adapter.getAccessToken()).rejects.toThrow(
      /OAuth2 token exchange failed: 400 Bad Request/
    );
  });

  describe("validate", () => {
    it("resolves when token exchange succeeds", async () => {
      const adapter = new ServiceAccountAuthAdapter(MOCK_SA_CREDENTIALS, [
        "https://www.googleapis.com/auth/display-video",
      ]);

      await expect(adapter.validate()).resolves.toBeUndefined();
      expect(fetch).toHaveBeenCalledOnce();
    });

    it("rejects when token exchange fails", async () => {
      vi.stubGlobal("fetch", mockFetchFailure(401, "Unauthorized", "bad creds"));

      const adapter = new ServiceAccountAuthAdapter(MOCK_SA_CREDENTIALS, [
        "https://www.googleapis.com/auth/display-video",
      ]);

      await expect(adapter.validate()).rejects.toThrow(/OAuth2 token exchange failed/);
    });

    it("caches token — validate + getAccessToken = 1 fetch total", async () => {
      const adapter = new ServiceAccountAuthAdapter(MOCK_SA_CREDENTIALS, [
        "https://www.googleapis.com/auth/display-video",
      ]);

      await adapter.validate();
      const token = await adapter.getAccessToken();

      expect(token).toBe("test-token");
      expect(fetch).toHaveBeenCalledOnce();
    });
  });
});

describe("OAuth2RefreshTokenAuthAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", mockFetchSuccess());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("calls refreshAccessToken when no cached token", async () => {
    const adapter = new OAuth2RefreshTokenAuthAdapter(MOCK_OAUTH2_CREDENTIALS, [
      "https://www.googleapis.com/auth/display-video",
    ]);

    const token = await adapter.getAccessToken();
    expect(token).toBe("test-token");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("returns cached token when not expired", async () => {
    const adapter = new OAuth2RefreshTokenAuthAdapter(MOCK_OAUTH2_CREDENTIALS, [
      "https://www.googleapis.com/auth/display-video",
    ]);

    await adapter.getAccessToken();
    expect(fetch).toHaveBeenCalledOnce();

    // Advance 30 minutes (within the 1h expiry minus 60s buffer)
    vi.advanceTimersByTime(30 * 60 * 1000);

    const token = await adapter.getAccessToken();
    expect(token).toBe("test-token");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("throws on failed refresh (non-ok response)", async () => {
    vi.stubGlobal("fetch", mockFetchFailure(401, "Unauthorized", "invalid_client"));

    const adapter = new OAuth2RefreshTokenAuthAdapter(MOCK_OAUTH2_CREDENTIALS, [
      "https://www.googleapis.com/auth/display-video",
    ]);

    await expect(adapter.getAccessToken()).rejects.toThrow(
      /OAuth2 refresh token exchange failed: 401 Unauthorized/
    );
  });

  describe("validate", () => {
    it("resolves when token refresh succeeds", async () => {
      const adapter = new OAuth2RefreshTokenAuthAdapter(MOCK_OAUTH2_CREDENTIALS, [
        "https://www.googleapis.com/auth/display-video",
      ]);

      await expect(adapter.validate()).resolves.toBeUndefined();
      expect(fetch).toHaveBeenCalledOnce();
    });

    it("rejects when token refresh fails", async () => {
      vi.stubGlobal("fetch", mockFetchFailure(401, "Unauthorized", "invalid_client"));

      const adapter = new OAuth2RefreshTokenAuthAdapter(MOCK_OAUTH2_CREDENTIALS, [
        "https://www.googleapis.com/auth/display-video",
      ]);

      await expect(adapter.validate()).rejects.toThrow(/OAuth2 refresh token exchange failed/);
    });

    it("caches token — validate + getAccessToken = 1 fetch total", async () => {
      const adapter = new OAuth2RefreshTokenAuthAdapter(MOCK_OAUTH2_CREDENTIALS, [
        "https://www.googleapis.com/auth/display-video",
      ]);

      await adapter.validate();
      const token = await adapter.getAccessToken();

      expect(token).toBe("test-token");
      expect(fetch).toHaveBeenCalledOnce();
    });
  });
});

describe("createGoogleAuthAdapter", () => {
  it("returns ServiceAccountAuthAdapter for service_account type", () => {
    const adapter = createGoogleAuthAdapter(MOCK_SA_CREDENTIALS, ["scope1"]);
    expect(adapter).toBeInstanceOf(ServiceAccountAuthAdapter);
    expect(adapter.credentialType).toBe("service_account");
  });

  it("returns OAuth2RefreshTokenAuthAdapter for oauth2 type", () => {
    const adapter = createGoogleAuthAdapter(MOCK_OAUTH2_CREDENTIALS, ["scope1"]);
    expect(adapter).toBeInstanceOf(OAuth2RefreshTokenAuthAdapter);
    expect(adapter.credentialType).toBe("oauth2");
  });
});

describe("parseCredentialsFromHeaders", () => {
  it("throws when X-Google-Auth-Type header is missing", () => {
    expect(() => parseCredentialsFromHeaders({})).toThrow(/Missing X-Google-Auth-Type header/);
  });

  it("parses service_account credentials from base64-encoded header", () => {
    const encoded = Buffer.from(JSON.stringify(MOCK_SA_CREDENTIALS)).toString("base64");

    const result = parseCredentialsFromHeaders({
      "x-google-auth-type": "service_account",
      "x-google-credentials": encoded,
    });

    expect(result.type).toBe("service_account");
    if (result.type === "service_account") {
      expect(result.client_email).toBe("test@test.iam.gserviceaccount.com");
      expect(result.private_key).toBe(MOCK_SA_CREDENTIALS.private_key);
    }
  });

  it("throws when X-Google-Credentials header is missing for service_account", () => {
    expect(() =>
      parseCredentialsFromHeaders({
        "x-google-auth-type": "service_account",
      })
    ).toThrow(/Missing X-Google-Credentials header/);
  });

  it("throws when X-Google-Credentials is invalid base64/JSON", () => {
    expect(() =>
      parseCredentialsFromHeaders({
        "x-google-auth-type": "service_account",
        "x-google-credentials": "not-valid-base64!!!",
      })
    ).toThrow(/Invalid X-Google-Credentials/);
  });

  it("throws when service account JSON is missing required fields", () => {
    const incomplete = Buffer.from(
      JSON.stringify({ type: "service_account", project_id: "test" })
    ).toString("base64");

    expect(() =>
      parseCredentialsFromHeaders({
        "x-google-auth-type": "service_account",
        "x-google-credentials": incomplete,
      })
    ).toThrow(/missing client_email or private_key/);
  });

  it("parses oauth2 credentials from individual headers", () => {
    const result = parseCredentialsFromHeaders({
      "x-google-auth-type": "oauth2",
      "x-google-client-id": "client-123",
      "x-google-client-secret": "secret-456",
      "x-google-refresh-token": "refresh-789",
    });

    expect(result.type).toBe("oauth2");
    if (result.type === "oauth2") {
      expect(result.clientId).toBe("client-123");
      expect(result.clientSecret).toBe("secret-456");
      expect(result.refreshToken).toBe("refresh-789");
    }
  });

  it("throws when OAuth2 headers are missing", () => {
    expect(() =>
      parseCredentialsFromHeaders({
        "x-google-auth-type": "oauth2",
      })
    ).toThrow(/Missing required OAuth2 headers/);
  });

  it("throws on invalid auth type", () => {
    expect(() =>
      parseCredentialsFromHeaders({
        "x-google-auth-type": "magic",
      })
    ).toThrow(/Invalid X-Google-Auth-Type: "magic"/);
  });
});

describe("getCredentialFingerprint", () => {
  it("returns SHA-256 hash of client_email for service accounts", () => {
    const result = getCredentialFingerprint(MOCK_SA_CREDENTIALS);
    const expected = createHash("sha256").update("test@test.iam.gserviceaccount.com").digest("hex");
    expect(result).toBe(expected);
  });

  it("returns SHA-256 hash of clientId for OAuth2", () => {
    const result = getCredentialFingerprint(MOCK_OAUTH2_CREDENTIALS);
    const expected = createHash("sha256").update("client-123").digest("hex");
    expect(result).toBe(expected);
  });
});
