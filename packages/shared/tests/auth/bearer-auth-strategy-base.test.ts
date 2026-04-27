import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BearerAuthStrategyBase,
  type BearerAdapterResult,
} from "../../src/auth/bearer-auth-strategy-base.js";

// ---------------------------------------------------------------------------
// Minimal concrete subclass used throughout this test file
// ---------------------------------------------------------------------------

const REFRESH_FINGERPRINT = "refresh-fp-stable";
const TOKEN_FINGERPRINT = "token-fp-hash";

/**
 * TestBearerStrategy exposes control points so tests can drive branch selection
 * and inspect logger calls without any real adapters or network calls.
 */
class TestBearerStrategy extends BearerAuthStrategyBase {
  protected readonly authType = "test-bearer";
  protected readonly platformName = "Test";

  /** Set to a non-null value to make resolveRefreshBranch return that branch. */
  refreshResult: BearerAdapterResult | null = null;

  /** Always returned by resolveAccessBranch. */
  accessResult: BearerAdapterResult = {
    adapter: { validate: vi.fn() },
    fingerprint: TOKEN_FINGERPRINT,
    userId: "access-user-id",
    authFlow: "static-token",
  };

  /** Controls getRefreshFingerprint return value. */
  hasRefreshCreds = false;

  protected async resolveRefreshBranch(
    _headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult | null> {
    return this.refreshResult;
  }

  protected async resolveAccessBranch(
    _headers: Record<string, string | string[] | undefined>
  ): Promise<BearerAdapterResult> {
    return this.accessResult;
  }

  protected getRefreshFingerprint(
    _headers: Record<string, string | string[] | undefined>
  ): string | undefined {
    return this.hasRefreshCreds ? REFRESH_FINGERPRINT : undefined;
  }

  protected getTokenFingerprint(_headers: Record<string, string | string[] | undefined>): string {
    return TOKEN_FINGERPRINT;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BearerAuthStrategyBase", () => {
  let strategy: TestBearerStrategy;
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    strategy = new TestBearerStrategy(mockLogger as any);
    // Reset to defaults
    strategy.refreshResult = null;
    strategy.hasRefreshCreds = false;
    strategy.accessResult = {
      adapter: { validate: vi.fn() },
      fingerprint: TOKEN_FINGERPRINT,
      userId: "access-user-id",
      authFlow: "static-token",
    };
  });

  // ── verify(): branch selection ──────────────────────────────────────────

  describe("verify() branch selection", () => {
    it("uses the refresh branch when resolveRefreshBranch returns non-null", async () => {
      strategy.refreshResult = {
        adapter: { validate: vi.fn() },
        fingerprint: REFRESH_FINGERPRINT,
        userId: "refresh-user-id",
        authFlow: "refresh-token",
      };

      const result = await strategy.verify({});

      expect(result.authInfo.clientId).toBe("refresh-user-id");
      expect(result.credentialFingerprint).toBe(REFRESH_FINGERPRINT);
    });

    it("falls back to access branch when resolveRefreshBranch returns null", async () => {
      strategy.refreshResult = null;

      const result = await strategy.verify({});

      expect(result.authInfo.clientId).toBe("access-user-id");
      expect(result.credentialFingerprint).toBe(TOKEN_FINGERPRINT);
    });

    it("does not call resolveAccessBranch when refresh branch succeeds", async () => {
      const resolveAccessSpy = vi.spyOn(strategy as any, "resolveAccessBranch");
      strategy.refreshResult = {
        adapter: { validate: vi.fn() },
        fingerprint: REFRESH_FINGERPRINT,
        userId: "refresh-user-id",
        authFlow: "refresh-token",
      };

      await strategy.verify({});

      expect(resolveAccessSpy).not.toHaveBeenCalled();
    });
  });

  // ── verify(): AuthResult shape ───────────────────────────────────────────

  describe("verify() AuthResult shape", () => {
    it("returns correct authInfo fields from access branch", async () => {
      const result = await strategy.verify({});

      expect(result.authInfo).toEqual({
        clientId: "access-user-id",
        subject: "access-user-id",
        authType: "test-bearer",
      });
    });

    it("returns correct authInfo fields from refresh branch", async () => {
      strategy.refreshResult = {
        adapter: { validate: vi.fn() },
        fingerprint: REFRESH_FINGERPRINT,
        userId: "refresh-user-id",
        authFlow: "refresh-token",
      };

      const result = await strategy.verify({});

      expect(result.authInfo).toEqual({
        clientId: "refresh-user-id",
        subject: "refresh-user-id",
        authType: "test-bearer",
      });
    });

    it("sets platformAuthAdapter from the branch adapter", async () => {
      const adapterObject = { validate: vi.fn(), someMethod: vi.fn() };
      strategy.accessResult = {
        adapter: adapterObject,
        fingerprint: TOKEN_FINGERPRINT,
        userId: "user-1",
        authFlow: "static-token",
      };

      const result = await strategy.verify({});

      expect(result.platformAuthAdapter).toBe(adapterObject);
    });

    it("sets credentialFingerprint from the branch fingerprint", async () => {
      strategy.accessResult = {
        adapter: { validate: vi.fn() },
        fingerprint: "specific-fingerprint-value",
        userId: "user-1",
        authFlow: "static-token",
      };

      const result = await strategy.verify({});

      expect(result.credentialFingerprint).toBe("specific-fingerprint-value");
    });

    it("sets googleAuthAdapter to undefined (not set by bearer strategy)", async () => {
      const result = await strategy.verify({});
      expect(result.googleAuthAdapter).toBeUndefined();
    });
  });

  // ── verify(): logging ────────────────────────────────────────────────────

  describe("verify() logging", () => {
    it("calls logger.debug with userId, authFlow, and platform name", async () => {
      await strategy.verify({});

      expect(mockLogger.debug).toHaveBeenCalledOnce();
      const [logObj, message] = mockLogger.debug.mock.calls[0];
      expect(logObj).toMatchObject({ userId: "access-user-id", authFlow: "static-token" });
      expect(message).toContain("Test");
      expect(message).toContain("static-token");
    });

    it("includes logContext fields in the debug log when provided", async () => {
      strategy.accessResult = {
        adapter: { validate: vi.fn() },
        fingerprint: TOKEN_FINGERPRINT,
        userId: "user-with-context",
        authFlow: "static-token",
        logContext: { advertiserId: "adv-123" },
      };

      await strategy.verify({});

      const [logObj] = mockLogger.debug.mock.calls[0];
      expect(logObj).toMatchObject({ advertiserId: "adv-123" });
    });

    it("does not throw when no logger is provided", async () => {
      const strategyNoLogger = new TestBearerStrategy(undefined);
      await expect(strategyNoLogger.verify({})).resolves.toBeDefined();
    });
  });

  // ── getCredentialFingerprint() ────────────────────────────────────────────

  describe("getCredentialFingerprint()", () => {
    it("returns refresh fingerprint when getRefreshFingerprint returns a value", async () => {
      strategy.hasRefreshCreds = true;

      const fp = await strategy.getCredentialFingerprint({});

      expect(fp).toBe(REFRESH_FINGERPRINT);
    });

    it("returns token fingerprint when getRefreshFingerprint returns undefined", async () => {
      strategy.hasRefreshCreds = false;

      const fp = await strategy.getCredentialFingerprint({});

      expect(fp).toBe(TOKEN_FINGERPRINT);
    });

    it("does not call resolveRefreshBranch or resolveAccessBranch (no network calls)", async () => {
      const resolveRefreshSpy = vi.spyOn(strategy as any, "resolveRefreshBranch");
      const resolveAccessSpy = vi.spyOn(strategy as any, "resolveAccessBranch");

      await strategy.getCredentialFingerprint({});

      expect(resolveRefreshSpy).not.toHaveBeenCalled();
      expect(resolveAccessSpy).not.toHaveBeenCalled();
    });
  });
});
