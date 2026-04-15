import { describe, it, expect, vi, beforeEach } from "vitest";
import { AmazonDspHttpClient } from "../../src/services/amazon-dsp/amazon-dsp-http-client.js";
import type { AmazonDspAuthAdapter } from "../../src/auth/amazon-dsp-auth-adapter.js";

const mockFetch = vi.hoisted(() => vi.fn());
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: mockFetch };
});

const mockAdapter = {
  getAccessToken: vi.fn().mockResolvedValue("test_token"),
  validate: vi.fn(),
  userId: "user_1",
  profileId: "profile_123",
  clientId: "client_abc",
} as unknown as AmazonDspAuthAdapter;

const mockLogger: any = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(),
};
mockLogger.child.mockReturnValue(mockLogger);

describe("AmazonDspHttpClient", () => {
  let client: AmazonDspHttpClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new AmazonDspHttpClient(
      mockAdapter,
      "profile_123",
      "https://advertising-api.amazon.com",
      mockLogger
    );
  });

  it("injects Amazon-Advertising-API-Scope header on GET", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ orders: [], totalResults: 0 }),
    });
    await client.get("/dsp/orders");
    const headers = mockFetch.mock.calls[0][3].headers;
    expect(headers["Amazon-Advertising-API-Scope"]).toBe("profile_123");
  });

  it("injects Amazon-Advertising-API-ClientId header when clientId is available", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ orders: [] }),
    });
    // Create client with adapter that has clientId
    const clientWithId = new AmazonDspHttpClient(mockAdapter, "profile_123", "https://advertising-api.amazon.com", mockLogger, "client_abc");
    await clientWithId.get("/dsp/orders");
    const headers = mockFetch.mock.calls[0][3].headers;
    expect(headers["Amazon-Advertising-API-ClientId"]).toBe("client_abc");
  });

  it("returns raw response body (no TikTok envelope unwrapping)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ orders: [{ orderId: "o1" }], totalResults: 1 }),
    });
    const result = await client.get("/dsp/orders") as any;
    expect(result.orders).toHaveLength(1);
    expect(result.totalResults).toBe(1);
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 400, statusText: "Bad Request",
      headers: { get: () => null },
      text: async () => "Bad request body",
    });
    await expect(client.get("/dsp/orders")).rejects.toThrow("400");
  });

  it("PUT request sends correct method", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ orderId: "o1", state: "PAUSED" }),
    });
    await client.put("/dsp/orders/o1", { state: "PAUSED" });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/dsp/orders/o1"),
      expect.any(Number),
      undefined,
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("sets vendor Accept header for DSP reporting v3 POST requests", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ reportId: "rpt-1", status: "PENDING" }),
    });

    await client.post(
      "/accounts/acct-1/dsp/reports",
      { name: "Test Report" },
      undefined,
      "application/vnd.dspcreatereports.v3+json"
    );

    const headers = mockFetch.mock.calls[0][3].headers;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Accept"]).toBe("application/vnd.dspcreatereports.v3+json");
  });

  it("sets vendor Accept header for DSP reporting v3 status GET requests", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ reportId: "rpt-1", status: "COMPLETED", url: "https://..." }),
    });

    await client.get(
      "/accounts/acct-1/dsp/reports/rpt-1",
      undefined,
      undefined,
      "application/vnd.dspgetreports.v3+json"
    );

    const headers = mockFetch.mock.calls[0][3].headers;
    expect(headers["Accept"]).toBe("application/vnd.dspgetreports.v3+json");
  });
});
