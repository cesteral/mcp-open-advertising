import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TtdTokenAuthStrategy } from "../../src/auth/ttd-auth-strategy.js";

vi.mock("../../src/auth/ttd-auth-adapter.js", () => ({
  TtdDirectTokenAuthAdapter: vi.fn(),
  parseTtdDirectTokenFromHeaders: vi.fn(),
  getTtdDirectTokenFingerprint: vi.fn(),
}));

import {
  TtdDirectTokenAuthAdapter,
  parseTtdDirectTokenFromHeaders,
  getTtdDirectTokenFingerprint,
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

describe("TtdTokenAuthStrategy", () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockAdapterInstance: { validate: ReturnType<typeof vi.fn>; partnerId: string };

  beforeEach(() => {
    mockLogger = createMockLogger();

    mockAdapterInstance = {
      validate: vi.fn().mockResolvedValue(undefined),
      partnerId: "direct-token",
    };

    (TtdDirectTokenAuthAdapter as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => mockAdapterInstance
    );

    (parseTtdDirectTokenFromHeaders as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      token: "direct-token-123",
    });

    (getTtdDirectTokenFingerprint as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      "1234567890abcdef"
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses TTD-Auth from request headers", async () => {
    const strategy = new TtdTokenAuthStrategy(mockLogger);
    const headers = { "ttd-auth": "direct-token-123" };

    await strategy.verify(headers);

    expect(parseTtdDirectTokenFromHeaders).toHaveBeenCalledWith(headers);
  });

  it("creates a direct-token adapter and validates it", async () => {
    const strategy = new TtdTokenAuthStrategy(mockLogger);

    const result = await strategy.verify({ "ttd-auth": "direct-token-123" });

    expect(TtdDirectTokenAuthAdapter).toHaveBeenCalledWith("direct-token-123");
    expect(mockAdapterInstance.validate).toHaveBeenCalledTimes(1);
    expect(result.authInfo).toMatchObject({
      clientId: "ttd-direct-token",
      authType: "ttd-token",
    });
    expect(result.platformAuthAdapter).toBe(mockAdapterInstance);
    expect(result.credentialFingerprint).toBe("1234567890abcdef");
  });

  it("returns the direct-token fingerprint for session reuse checks", async () => {
    const strategy = new TtdTokenAuthStrategy(mockLogger);

    const fingerprint = await strategy.getCredentialFingerprint({
      "ttd-auth": "direct-token-123",
    });

    expect(fingerprint).toBe("1234567890abcdef");
    expect(getTtdDirectTokenFingerprint).toHaveBeenCalledWith({
      token: "direct-token-123",
    });
  });

  it("throws when TTD-Auth is missing", async () => {
    (parseTtdDirectTokenFromHeaders as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw new Error("Missing required header: TTD-Auth");
      }
    );

    const strategy = new TtdTokenAuthStrategy(mockLogger);

    await expect(strategy.verify({})).rejects.toThrow("Missing required header: TTD-Auth");
  });
});
