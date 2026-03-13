import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetch = vi.mocked(fetchWithTimeout);

import { SnapchatHttpClient } from "../../src/services/snapchat/snapchat-http-client.js";
import type { SnapchatAuthAdapter } from "../../src/auth/snapchat-auth-adapter.js";

const mockAdapter: SnapchatAuthAdapter = {
  getAccessToken: vi.fn().mockResolvedValue("test_token"),
  validate: vi.fn().mockResolvedValue(undefined),
  userId: "user_1",
  adAccountId: "acct_123",
};

const mockLogger = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
};

describe("SnapchatHttpClient", () => {
  let client: SnapchatHttpClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new SnapchatHttpClient(
      mockAdapter as SnapchatAuthAdapter,
      "acct_123",
      "https://adsapi.snapchat.com",
      mockLogger as any
    );
  });

  it("GET request returns raw Snapchat envelope (no unwrapping)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        request_status: "SUCCESS",
        request_id: "req_1",
        campaigns: [{ sub_request_status: "SUCCESS", campaign: { id: "c1", name: "Test" } }],
      }),
    });
    const result = await client.get("/v1/adaccounts/acct_123/campaigns") as any;
    expect(result.request_status).toBe("SUCCESS");
    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0].campaign.id).toBe("c1");
  });

  it("throws on request_status FAILED", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        request_status: "FAILED",
        display_message: "Campaign not found",
        error_code: 404,
      }),
    });
    await expect(client.get("/v1/campaigns/bad_id")).rejects.toThrow("Campaign not found");
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      headers: { get: () => null },
      text: async () => "Unauthorized",
    });
    await expect(client.get("/v1/me")).rejects.toThrow("401");
  });

  it("PUT request sends correct method", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ request_status: "SUCCESS", campaigns: [] }),
    });
    await client.put("/v1/campaigns/c1", { name: "Updated" });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/campaigns/c1"),
      expect.any(Number),
      undefined,
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("DELETE request sends correct method with no body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ request_status: "SUCCESS" }),
    });
    await client.delete("/v1/campaigns/c1");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/campaigns/c1"),
      expect.any(Number),
      undefined,
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("sets Authorization: Bearer header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ request_status: "SUCCESS" }),
    });
    await client.get("/v1/me");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      undefined,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test_token" })
      })
    );
  });
});
