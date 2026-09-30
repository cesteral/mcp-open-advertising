import { describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  capturedBuildConfig: undefined as undefined | ((config: unknown, logger: unknown) => any),
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    fetchWithTimeout: hoisted.mockFetch,
    createTransportEntrypoints: vi.fn((build: (config: unknown, logger: unknown) => any) => {
      hoisted.capturedBuildConfig = build;
      return { createMcpHttpServer: vi.fn(), startHttpServer: vi.fn() };
    }),
  };
});

import "../../src/mcp-server/transports/streamable-http-transport.js";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
} as any;
logger.child.mockReturnValue(logger);

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("jwt/none static-token session (AMAZON_DSP_ACCESS_TOKEN)", () => {
  it("carries AMAZON_DSP_CLIENT_ID into the session adapter", async () => {
    hoisted.mockFetch.mockReset();
    hoisted.mockFetch.mockResolvedValue(
      okJson({ response: [{ advertiserId: "adv_1" }], totalResults: 1 })
    );

    const appConfig = {
      mcpAuthMode: "none",
      amazonDspApiBaseUrl: "https://advertising-api.amazon.com",
      amazonDspAccessToken: "Atza|static",
      amazonDspProfileId: "profile_1",
      amazonDspClientId: "amzn1.application-oa2-client.static",
      amazonDspReportPollIntervalMs: 1,
      amazonDspReportMaxPollAttempts: 1,
    } as any;

    expect(hoisted.capturedBuildConfig).toBeDefined();
    const platformConfig = hoisted.capturedBuildConfig!(appConfig, logger);
    const result = await platformConfig.createSessionForAuth(
      { credentialFingerprint: "fp" },
      "session-static",
      appConfig,
      logger
    );
    expect(result.services).toBeTruthy();

    // validate() on session establishment
    const validateHeaders = hoisted.mockFetch.mock.calls[0][3].headers;
    expect(validateHeaders["Amazon-Advertising-API-ClientId"]).toBe(
      "amzn1.application-oa2-client.static"
    );

    // …and every tool call made through the session's HTTP client
    hoisted.mockFetch.mockResolvedValueOnce(okJson({ response: [], totalResults: 0 }));
    await result.services.amazonDspService.listAdvertisers(0, 1);
    const callHeaders = hoisted.mockFetch.mock.calls.at(-1)![3].headers;
    expect(callHeaders["Amazon-Advertising-API-ClientId"]).toBe(
      "amzn1.application-oa2-client.static"
    );
  });
});
