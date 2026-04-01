import { describe, it, expect, vi } from "vitest";
import {
  TtdDirectTokenAuthAdapter,
  parseTtdDirectTokenFromHeaders,
  getTtdDirectTokenFingerprint,
} from "../../src/auth/ttd-auth-adapter.js";

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
  return { ...actual, extractHeader };
});

describe("TtdDirectTokenAuthAdapter", () => {
  it("returns the provided token", async () => {
    const adapter = new TtdDirectTokenAuthAdapter("direct-token-123");
    await expect(adapter.getAccessToken()).resolves.toBe("direct-token-123");
  });

  it("validates without network exchange", async () => {
    const adapter = new TtdDirectTokenAuthAdapter("direct-token-123");
    await expect(adapter.validate()).resolves.toBeUndefined();
  });

  it("defaults partnerId to direct-token", () => {
    const adapter = new TtdDirectTokenAuthAdapter("direct-token-123");
    expect(adapter.partnerId).toBe("direct-token");
  });
});

describe("parseTtdDirectTokenFromHeaders", () => {
  it("parses token from ttd-auth header", () => {
    const result = parseTtdDirectTokenFromHeaders({
      "ttd-auth": "direct-token-123",
    });
    expect(result.token).toBe("direct-token-123");
  });

  it("handles case-insensitive header names", () => {
    const result = parseTtdDirectTokenFromHeaders({
      "TTD-Auth": "direct-token-123",
    });
    expect(result.token).toBe("direct-token-123");
  });

  it("throws when TTD-Auth is missing", () => {
    expect(() => parseTtdDirectTokenFromHeaders({})).toThrow(
      "Missing required header: TTD-Auth"
    );
  });
});

describe("getTtdDirectTokenFingerprint", () => {
  it("returns deterministic hashes for the same token", () => {
    const fingerprint1 = getTtdDirectTokenFingerprint({ token: "token-1" });
    const fingerprint2 = getTtdDirectTokenFingerprint({ token: "token-1" });
    expect(fingerprint1).toBe(fingerprint2);
  });

  it("returns different hashes for different tokens", () => {
    const fingerprint1 = getTtdDirectTokenFingerprint({ token: "token-1" });
    const fingerprint2 = getTtdDirectTokenFingerprint({ token: "token-2" });
    expect(fingerprint1).not.toBe(fingerprint2);
  });
});
