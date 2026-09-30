import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MsAdsHttpClient,
  msadsThrottleDelayMs,
} from "../../src/services/msads/msads-http-client.js";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import type { MsAdsAuthAdapter } from "../../src/auth/msads-auth-adapter.js";

vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual("@cesteral/shared");
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetch = vi.mocked(fetchWithTimeout);

function createMockAdapter(): MsAdsAuthAdapter {
  return {
    getAccessToken: vi.fn().mockResolvedValue("test-token"),
    validate: vi.fn().mockResolvedValue(undefined),
    developerToken: "dev-token",
    customerId: "cust-123",
    accountId: "acct-456",
    userId: "user-789",
  };
}

const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};
mockLogger.child.mockReturnValue(mockLogger);

describe("MsAdsHttpClient", () => {
  let client: MsAdsHttpClient;
  let adapter: MsAdsAuthAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockAdapter();
    client = new MsAdsHttpClient(
      adapter,
      "https://campaign.api.bingads.microsoft.com/CampaignManagement/v13",
      mockLogger
    );
  });

  it("sends POST with all required auth headers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ CampaignIds: [111] }),
    } as Response);

    await client.post("/Campaigns", { Campaigns: [{ Name: "Test" }] });

    const [, , , opts] = mockFetch.mock.calls[0]!;
    const headers = opts?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(headers.DeveloperToken).toBe("dev-token");
    expect(headers.CustomerId).toBe("cust-123");
    expect(headers.CustomerAccountId).toBe("acct-456");
  });

  it("sends GET requests with query params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ Campaigns: [] }),
    } as Response);

    await client.get("/Campaigns/QueryByAccountId", { AccountId: "acct-456" });

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("AccountId=acct-456");
  });

  it("retries on 429 and 5xx", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: async () => "rate limited",
        headers: new Headers(),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "ok" }),
      } as Response);

    const result = await client.post("/Campaigns", {});
    expect(result).toEqual({ result: "ok" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws McpError on non-retryable errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => "invalid params",
      headers: new Headers(),
    } as unknown as Response);

    await expect(client.post("/Campaigns", {})).rejects.toThrow("Microsoft Ads API");
  });

  // MicrosoftDocs/Advertising services-protocol.md: error 117 CallRateExceeded
  // means "resubmit ... after waiting 60 seconds". It arrives in the JSON body,
  // not as a 429, and used to surface as a generic InvalidRequest.
  it("surfaces error 117 CallRateExceeded as RateLimited with a 60s retryAfterMs, without re-sending", async () => {
    const body = JSON.stringify({
      ApplicationFault: {
        Type: "ApiFaultDetail",
        OperationErrors: [{ Code: 117, ErrorCode: "CallRateExceeded", Message: "too many calls" }],
      },
    });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => body,
      headers: new Headers(),
    } as unknown as Response);

    const error = await client.post("/Campaigns/QueryByAccountId", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
    expect((error as McpError).data?.retryAfterMs).toBe(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("maps the documented throttle codes to their waits", () => {
    expect(msadsThrottleDelayMs(400, JSON.stringify({ Errors: [{ Code: 117 }] }))).toBe(60_000);
    expect(
      msadsThrottleDelayMs(400, JSON.stringify({ Errors: [{ ErrorCode: "CallRateExceeded" }] }))
    ).toBe(60_000);
    expect(msadsThrottleDelayMs(400, JSON.stringify({ Errors: [{ Code: 4204 }] }))).toBe(900_000);
    expect(msadsThrottleDelayMs(400, JSON.stringify({ Errors: [{ Code: 1234 }] }))).toBeUndefined();
    expect(msadsThrottleDelayMs(400, "not json")).toBeUndefined();
  });
});
