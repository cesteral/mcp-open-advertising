import { describe, it, expect, vi } from "vitest";
import type { GoogleAuthAdapter } from "@cesteral/shared";
import { createGoogleAuthFromAdapter } from "../../src/services/bid-manager/auth-bridge.js";

function createMockAdapter(token = "test-access-token"): GoogleAuthAdapter {
  return {
    getAccessToken: vi.fn().mockResolvedValue(token),
    credentialType: "service_account",
    scopes: ["https://www.googleapis.com/auth/doubleclickbidmanager"],
  };
}

describe("createGoogleAuthFromAdapter", () => {
  it("provides Authorization headers via google-auth request flow", async () => {
    const adapter = createMockAdapter("bridge-token");
    const authClient = createGoogleAuthFromAdapter(adapter);

    const headers = await authClient.getRequestHeaders("https://doubleclickbidmanager.googleapis.com");
    const authorization =
      headers instanceof Headers
        ? headers.get("authorization") ?? headers.get("Authorization")
        : (headers as Record<string, string>).authorization ??
          (headers as Record<string, string>).Authorization;

    expect(authorization).toBe("Bearer bridge-token");
    expect(adapter.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it("supports direct access-token retrieval", async () => {
    const adapter = createMockAdapter("another-token");
    const authClient = createGoogleAuthFromAdapter(adapter);

    const tokenResponse = await authClient.getAccessToken();

    expect(tokenResponse?.token).toBe("another-token");
    expect(adapter.getAccessToken).toHaveBeenCalledTimes(1);
  });
});
