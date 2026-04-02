import { describe, it, expect, vi, beforeEach } from "vitest";
import { MsAdsAccessTokenAdapter } from "../../src/auth/msads-auth-adapter.js";

// Mock fetchWithTimeout
vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual("@cesteral/shared");
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

import { fetchWithTimeout } from "@cesteral/shared";
const mockFetch = vi.mocked(fetchWithTimeout);

describe("MsAdsAccessTokenAdapter", () => {
  let adapter: MsAdsAccessTokenAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new MsAdsAccessTokenAdapter(
      "test-access-token",
      "test-dev-token",
      "test-customer-id",
      "test-account-id"
    );
  });

  it("returns the access token", async () => {
    expect(await adapter.getAccessToken()).toBe("test-access-token");
  });

  it("returns the developer token", () => {
    expect(adapter.developerToken).toBe("test-dev-token");
  });

  it("returns customer and account IDs", () => {
    expect(adapter.customerId).toBe("test-customer-id");
    expect(adapter.accountId).toBe("test-account-id");
  });

  it("validates token via the user query endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ UserId: 12345, UserName: "testuser" }),
    } as Response);

    await adapter.validate();
    expect(adapter.userId).toBe("12345");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, , , options] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/User/Query");
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer test-access-token");
  });

  it("throws on validation failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Invalid token",
    } as unknown as Response);

    await expect(adapter.validate()).rejects.toThrow("Microsoft Ads token validation");
  });
});
