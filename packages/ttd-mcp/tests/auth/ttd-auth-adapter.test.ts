import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TtdDirectTokenAuthAdapter,
  parseTtdDirectTokenFromHeaders,
  getTtdDirectTokenFingerprint,
} from "../../src/auth/ttd-auth-adapter.js";

const fetchWithTimeoutMock = vi.fn();

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  const extractHeader = (
    headers: Record<string, string | string[] | undefined>,
    name: string
  ): string | undefined => {
    const key = Object.keys(headers).find(
      (candidate) => candidate.toLowerCase() === name.toLowerCase()
    );
    const value = key ? headers[key] : undefined;
    return Array.isArray(value) ? value[0] : value;
  };
  return {
    ...actual,
    extractHeader,
    fetchWithTimeout: (...args: unknown[]) => fetchWithTimeoutMock(...args),
  };
});

const TEST_GRAPHQL_URL = "https://desk.thetradedesk.com/graphql";

function okResponse(body: unknown = { data: { __typename: "Query" } }): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function errorResponse(status: number, statusText: string, body = ""): Response {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({}),
    text: async () => body,
  } as unknown as Response;
}

describe("TtdDirectTokenAuthAdapter", () => {
  beforeEach(() => {
    fetchWithTimeoutMock.mockReset();
  });

  it("returns the provided token", async () => {
    const adapter = new TtdDirectTokenAuthAdapter("direct-token-123", "direct-token", TEST_GRAPHQL_URL);
    await expect(adapter.getAccessToken()).resolves.toBe("direct-token-123");
  });

  it("defaults partnerId to direct-token", () => {
    const adapter = new TtdDirectTokenAuthAdapter("direct-token-123");
    expect(adapter.partnerId).toBe("direct-token");
  });

  it("validates by issuing a GraphQL query and memoizes the result", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(okResponse());
    const adapter = new TtdDirectTokenAuthAdapter("direct-token-123", "direct-token", TEST_GRAPHQL_URL);

    await adapter.validate();
    await adapter.validate();

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
    const [url, , , init] = fetchWithTimeoutMock.mock.calls[0];
    expect(url).toBe(TEST_GRAPHQL_URL);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["TTD-Auth"]).toBe("direct-token-123");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("rejects empty tokens before issuing the network call", async () => {
    const adapter = new TtdDirectTokenAuthAdapter("", "direct-token", TEST_GRAPHQL_URL);
    await expect(adapter.validate()).rejects.toThrow(/empty/);
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
  });

  it("rejects tokens containing whitespace before issuing the network call", async () => {
    const adapter = new TtdDirectTokenAuthAdapter("bad token", "direct-token", TEST_GRAPHQL_URL);
    await expect(adapter.validate()).rejects.toThrow(/whitespace/);
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
  });

  it("throws Unauthorized McpError on HTTP 401", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(errorResponse(401, "Unauthorized", "bad token"));
    const adapter = new TtdDirectTokenAuthAdapter("invalid", "direct-token", TEST_GRAPHQL_URL);

    await expect(adapter.validate()).rejects.toMatchObject({
      code: -32006,
      message: expect.stringContaining("401"),
    });
  });

  it("throws Unauthorized McpError on GraphQL UNAUTHENTICATED error", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(
      okResponse({ errors: [{ message: "not authenticated", extensions: { code: "UNAUTHENTICATED" } }] })
    );
    const adapter = new TtdDirectTokenAuthAdapter("invalid", "direct-token", TEST_GRAPHQL_URL);

    await expect(adapter.validate()).rejects.toMatchObject({ code: -32006 });
  });

  it("throws InternalError McpError on non-auth HTTP failures", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(errorResponse(500, "Server Error"));
    const adapter = new TtdDirectTokenAuthAdapter("token", "direct-token", TEST_GRAPHQL_URL);

    await expect(adapter.validate()).rejects.toMatchObject({ code: -32603 });
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
    expect(() => parseTtdDirectTokenFromHeaders({})).toThrow("Missing required header: TTD-Auth");
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
