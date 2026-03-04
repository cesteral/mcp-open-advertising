import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetchWithTimeout from shared
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);

import { LinkedInHttpClient } from "../../src/services/linkedin/linkedin-http-client.js";
import type { LinkedInAuthAdapter } from "../../src/auth/linkedin-auth-adapter.js";

const mockAuthAdapter: LinkedInAuthAdapter = {
  getAccessToken: vi.fn().mockResolvedValue("test-access-token"),
  validate: vi.fn().mockResolvedValue(undefined),
  personId: "test-person",
};

const mockLogger: any = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
};
mockLogger.child.mockReturnValue(mockLogger);

describe("LinkedInHttpClient", () => {
  let client: LinkedInHttpClient;

  beforeEach(() => {
    client = new LinkedInHttpClient(
      mockAuthAdapter,
      "https://api.linkedin.com",
      "202409",
      mockLogger
    );
    mockFetchWithTimeout.mockReset();
    vi.mocked(mockAuthAdapter.getAccessToken).mockResolvedValue("test-access-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockOkResponse(body: unknown = { elements: [], paging: { total: 0, count: 0, start: 0 } }) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => body,
      headers: new Headers(),
    } as unknown as Response);
  }

  function mockErrorResponse(
    status: number,
    errorBody?: { serviceErrorCode?: number; message?: string; status?: number }
  ) {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status,
      text: async () => errorBody ? JSON.stringify(errorBody) : "error",
      headers: new Headers(),
    } as unknown as Response);
  }

  describe("GET requests", () => {
    it("injects Authorization header with Bearer token", async () => {
      mockOkResponse({ elements: [{ id: 1 }] });

      await client.get("/v2/adAccounts", { q: "search" });

      const callOptions = mockFetchWithTimeout.mock.calls[0][3];
      const headers = callOptions?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer test-access-token");
    });

    it("injects LinkedIn-Version header", async () => {
      mockOkResponse();

      await client.get("/v2/adAccounts");

      const callOptions = mockFetchWithTimeout.mock.calls[0][3];
      const headers = callOptions?.headers as Record<string, string>;
      expect(headers["LinkedIn-Version"]).toBe("202409");
    });

    it("injects X-Restli-Protocol-Version header", async () => {
      mockOkResponse();

      await client.get("/v2/adAccounts");

      const callOptions = mockFetchWithTimeout.mock.calls[0][3];
      const headers = callOptions?.headers as Record<string, string>;
      expect(headers["X-Restli-Protocol-Version"]).toBe("2.0.0");
    });

    it("builds URL correctly with query params", async () => {
      mockOkResponse();

      await client.get("/v2/adCampaigns", { q: "search", "accounts[0]": "urn:li:sponsoredAccount:123" });

      const calledUrl = mockFetchWithTimeout.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/v2/adCampaigns");
      expect(calledUrl).toContain("q=search");
    });

    it("returns parsed JSON response", async () => {
      mockOkResponse({ elements: [{ id: 1, name: "Test Account" }] });

      const result = await client.get("/v2/adAccounts") as Record<string, unknown>;
      expect(result.elements).toEqual([{ id: 1, name: "Test Account" }]);
    });
  });

  describe("POST requests", () => {
    it("sends JSON body with Content-Type header", async () => {
      mockOkResponse({ id: "new-entity-123" });

      await client.post("/v2/adCampaignGroups", {
        name: "Test Group",
        account: "urn:li:sponsoredAccount:123",
        status: "DRAFT",
      });

      const callOptions = mockFetchWithTimeout.mock.calls[0][3];
      expect(callOptions?.method).toBe("POST");
      const headers = callOptions?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
      expect(callOptions?.body).toContain("Test Group");
    });
  });

  describe("PATCH requests", () => {
    it("sends PARTIAL_UPDATE method header", async () => {
      mockOkResponse({});

      await client.patch("/v2/adCampaigns/urn%3Ali%3AsponssoredCampaign%3A123", {
        status: "PAUSED",
      });

      const callOptions = mockFetchWithTimeout.mock.calls[0][3];
      const headers = callOptions?.headers as Record<string, string>;
      expect(headers["X-Restli-Method"]).toBe("PARTIAL_UPDATE");
      expect(callOptions?.body).toContain("$set");
      expect(callOptions?.body).toContain("PAUSED");
    });
  });

  describe("DELETE requests", () => {
    it("sends DELETE method", async () => {
      mockOkResponse({});

      await client.delete("/v2/adCampaigns/urn%3Ali%3AsponssoredCampaign%3A123");

      const callOptions = mockFetchWithTimeout.mock.calls[0][3];
      expect(callOptions?.method).toBe("DELETE");
    });
  });

  describe("204 No Content responses", () => {
    it("returns empty object for 204", async () => {
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
      } as unknown as Response);

      const result = await client.delete("/v2/adCampaigns/123");
      expect(result).toEqual({});
    });
  });

  describe("retry behavior", () => {
    it("retries on 429 Too Many Requests", async () => {
      mockErrorResponse(429, { serviceErrorCode: 429, message: "Rate limit exceeded", status: 429 });
      mockOkResponse({ retried: true });

      const result = await client.get("/v2/adAccounts") as Record<string, unknown>;
      expect(result.retried).toBe(true);
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("retries on 500 server error", async () => {
      mockErrorResponse(500, { message: "Internal Server Error", status: 500 });
      mockOkResponse({ retried: true });

      const result = await client.get("/v2/adAccounts") as Record<string, unknown>;
      expect(result.retried).toBe(true);
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
    });

    it("does NOT retry on 400 Bad Request", async () => {
      mockErrorResponse(400, { serviceErrorCode: 100, message: "Bad request", status: 400 });

      await expect(client.get("/v2/adAccounts")).rejects.toThrow();
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry on 401 Unauthorized", async () => {
      mockErrorResponse(401, { message: "Unauthorized", status: 401 });

      await expect(client.get("/v2/adAccounts")).rejects.toThrow();
      expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe("encodeUrn()", () => {
    it("encodes a LinkedIn URN for URL path usage", () => {
      const urn = "urn:li:sponsoredAccount:123456789";
      const encoded = LinkedInHttpClient.encodeUrn(urn);
      expect(encoded).toBe(encodeURIComponent(urn));
      expect(encoded).toContain("%3A");
    });
  });
});
