import { describe, it, expect, vi, beforeEach } from "vitest";
import { MsAdsBearerAuthStrategy } from "../../src/auth/msads-auth-strategy.js";

vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual("@cesteral/shared");
  return {
    ...actual,
    fetchWithTimeout: vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ UserId: 12345, UserName: "testuser" }),
    }),
  };
});

describe("MsAdsBearerAuthStrategy", () => {
  let strategy: MsAdsBearerAuthStrategy;

  beforeEach(() => {
    vi.clearAllMocks();
    strategy = new MsAdsBearerAuthStrategy();
  });

  it("extracts credentials from headers and returns AuthResult", async () => {
    const headers = {
      authorization: "Bearer test-token-123",
      "x-msads-developer-token": "dev-token-456",
      "x-msads-customer-id": "cust-789",
      "x-msads-account-id": "acct-012",
    };

    const result = await strategy.verify(headers);

    expect(result.authInfo.authType).toBe("msads-bearer");
    expect(result.platformAuthAdapter).toBeDefined();
    expect(result.credentialFingerprint).toBeDefined();
    expect(result.credentialFingerprint!.length).toBe(32);
  });

  it("throws when Authorization header is missing", async () => {
    const headers = {
      "x-msads-developer-token": "dev-token",
      "x-msads-customer-id": "cust-id",
      "x-msads-account-id": "acct-id",
    };

    await expect(strategy.verify(headers)).rejects.toThrow("Authorization");
  });

  it("throws when developer token is missing", async () => {
    const headers = {
      authorization: "Bearer test-token",
      "x-msads-customer-id": "cust-id",
      "x-msads-account-id": "acct-id",
    };

    await expect(strategy.verify(headers)).rejects.toThrow("Developer-Token");
  });

  it("generates consistent fingerprints for same credentials", async () => {
    const headers = {
      authorization: "Bearer test-token",
      "x-msads-developer-token": "dev-token",
      "x-msads-customer-id": "cust-id",
      "x-msads-account-id": "acct-id",
    };

    const fp1 = await strategy.getCredentialFingerprint(headers);
    const fp2 = await strategy.getCredentialFingerprint(headers);
    expect(fp1).toBe(fp2);
  });
});
