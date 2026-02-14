import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TtdHeadersAuthStrategy } from "../../src/auth/ttd-auth-strategy.js";

vi.mock("../../src/auth/ttd-auth-adapter.js", () => ({
  TtdApiTokenAuthAdapter: vi.fn(),
  parseTtdCredentialsFromHeaders: vi.fn(),
  getTtdCredentialFingerprint: vi.fn(),
}));

import {
  TtdApiTokenAuthAdapter,
  parseTtdCredentialsFromHeaders,
  getTtdCredentialFingerprint,
} from "../../src/auth/ttd-auth-adapter.js";

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: "debug",
  } as any;
}

const MOCK_AUTH_URL = "https://auth.thetradedesk.com/oauth2/token";
const MOCK_CREDENTIALS = { partnerId: "test-partner", apiSecret: "test-secret" };

describe("TtdHeadersAuthStrategy", () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockAdapterInstance: { getAccessToken: ReturnType<typeof vi.fn>; partnerId: string };

  beforeEach(() => {
    mockLogger = createMockLogger();

    mockAdapterInstance = {
      getAccessToken: vi.fn().mockResolvedValue("ttd-test-token"),
      partnerId: "test-partner",
    };

    (TtdApiTokenAuthAdapter as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => mockAdapterInstance
    );

    (parseTtdCredentialsFromHeaders as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      MOCK_CREDENTIALS
    );

    (getTtdCredentialFingerprint as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      "abcdef0123456789"
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("verify", () => {
    it("parses TTD credentials from headers", async () => {
      const strategy = new TtdHeadersAuthStrategy(MOCK_AUTH_URL, mockLogger);
      const headers = { "x-ttd-partner-id": "test-partner", "x-ttd-api-secret": "test-secret" };

      await strategy.verify(headers);

      expect(parseTtdCredentialsFromHeaders).toHaveBeenCalledWith(headers);
    });

    it("creates TtdApiTokenAuthAdapter with parsed credentials", async () => {
      const strategy = new TtdHeadersAuthStrategy(MOCK_AUTH_URL, mockLogger);

      await strategy.verify({ "x-ttd-partner-id": "test-partner", "x-ttd-api-secret": "test-secret" });

      expect(TtdApiTokenAuthAdapter).toHaveBeenCalledWith(MOCK_CREDENTIALS, MOCK_AUTH_URL);
    });

    it("validates credentials by calling getAccessToken", async () => {
      const strategy = new TtdHeadersAuthStrategy(MOCK_AUTH_URL, mockLogger);

      await strategy.verify({ "x-ttd-partner-id": "test-partner", "x-ttd-api-secret": "test-secret" });

      expect(mockAdapterInstance.getAccessToken).toHaveBeenCalledTimes(1);
    });

    it("returns authInfo with clientId = partnerId", async () => {
      const strategy = new TtdHeadersAuthStrategy(MOCK_AUTH_URL, mockLogger);

      const result = await strategy.verify({
        "x-ttd-partner-id": "test-partner",
        "x-ttd-api-secret": "test-secret",
      });

      expect(result.authInfo.clientId).toBe("test-partner");
    });

    it('returns authType "ttd-headers"', async () => {
      const strategy = new TtdHeadersAuthStrategy(MOCK_AUTH_URL, mockLogger);

      const result = await strategy.verify({
        "x-ttd-partner-id": "test-partner",
        "x-ttd-api-secret": "test-secret",
      });

      expect(result.authInfo.authType).toBe("ttd-headers");
    });

    it("returns platformAuthAdapter (the adapter instance)", async () => {
      const strategy = new TtdHeadersAuthStrategy(MOCK_AUTH_URL, mockLogger);

      const result = await strategy.verify({
        "x-ttd-partner-id": "test-partner",
        "x-ttd-api-secret": "test-secret",
      });

      expect(result.platformAuthAdapter).toBe(mockAdapterInstance);
    });

    it("returns credentialFingerprint", async () => {
      const strategy = new TtdHeadersAuthStrategy(MOCK_AUTH_URL, mockLogger);

      const result = await strategy.verify({
        "x-ttd-partner-id": "test-partner",
        "x-ttd-api-secret": "test-secret",
      });

      expect(result.credentialFingerprint).toBe("abcdef0123456789");
      expect(getTtdCredentialFingerprint).toHaveBeenCalledWith(MOCK_CREDENTIALS);
    });

    it("throws when headers are missing (propagates parseTtdCredentialsFromHeaders error)", async () => {
      (parseTtdCredentialsFromHeaders as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error("Missing required header: X-TTD-Partner-Id");
        }
      );

      const strategy = new TtdHeadersAuthStrategy(MOCK_AUTH_URL, mockLogger);

      await expect(strategy.verify({})).rejects.toThrow(
        "Missing required header: X-TTD-Partner-Id"
      );
    });

    it("throws when token exchange fails", async () => {
      mockAdapterInstance.getAccessToken.mockRejectedValue(
        new Error("TTD token exchange failed: 401 Unauthorized.")
      );

      const strategy = new TtdHeadersAuthStrategy(MOCK_AUTH_URL, mockLogger);

      await expect(
        strategy.verify({
          "x-ttd-partner-id": "test-partner",
          "x-ttd-api-secret": "test-secret",
        })
      ).rejects.toThrow("TTD token exchange failed: 401 Unauthorized.");
    });

    it("logs debug message on success", async () => {
      const strategy = new TtdHeadersAuthStrategy(MOCK_AUTH_URL, mockLogger);

      await strategy.verify({
        "x-ttd-partner-id": "test-partner",
        "x-ttd-api-secret": "test-secret",
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        { partnerId: "test-partner" },
        "TTD credentials validated"
      );
    });
  });
});
