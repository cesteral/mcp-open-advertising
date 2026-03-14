import { describe, it, expect, vi, beforeEach } from "vitest";
import { MsAdsHttpClient } from "../../src/services/msads/msads-http-client.js";
import type { MsAdsAuthAdapter } from "../../src/auth/msads-auth-adapter.js";

vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual("@cesteral/shared");
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

vi.mock("../../src/utils/telemetry/tracing.js", () => ({
  withMsAdsApiSpan: (_name: string, _path: string, fn: (span: unknown) => unknown) =>
    fn({ setAttribute: vi.fn() }),
  setSpanAttribute: vi.fn(),
}));

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

describe("MsAdsHttpClient", () => {
  let client: MsAdsHttpClient;
  let adapter: MsAdsAuthAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockAdapter();
    client = new MsAdsHttpClient(adapter, "https://campaign.api.bingads.microsoft.com/CampaignManagement/v13");
  });

  it("sends POST with all required auth headers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ CampaignIds: [111] }),
    } as Response);

    await client.post("/Campaigns/Add", { Campaigns: [{ Name: "Test" }] });

    const [, , , opts] = mockFetch.mock.calls[0]!;
    const headers = opts?.headers as Record<string, string>;
    expect(headers.AuthenticationToken).toBe("test-token");
    expect(headers.DeveloperToken).toBe("dev-token");
    expect(headers.CustomerId).toBe("cust-123");
    expect(headers.CustomerAccountId).toBe("acct-456");
  });

  it("sends GET requests with query params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ Campaigns: [] }),
    } as Response);

    await client.get("/Campaigns/GetByAccountId", { AccountId: "acct-456" });

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

    const result = await client.post("/Campaigns/Add", {});
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

    await expect(client.post("/Campaigns/Add", {})).rejects.toThrow("Microsoft Ads API");
  });
});
