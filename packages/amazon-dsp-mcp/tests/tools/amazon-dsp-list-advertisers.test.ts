import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/session-services.js", () => ({
  sessionServiceStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAuthContext: vi.fn(),
  },
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    resolveSessionServicesFromStore: vi.fn(),
  };
});

import { resolveSessionServicesFromStore } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import {
  listAdvertisersLogic,
  listAdvertisersResponseFormatter,
} from "../../src/mcp-server/tools/definitions/list-advertisers.tool.js";

const mockListAdvertisers = vi.fn();

beforeEach(() => {
  mockListAdvertisers.mockReset();
  mockResolveSession.mockReturnValue({
    amazonDspService: { listAdvertisers: mockListAdvertisers },
  } as any);
});

const ctx = { requestId: "req" } as any;
const sdk = { sessionId: "s" } as any;

describe("amazon_dsp_list_advertisers pagination", () => {
  it("passes filter/pageSize/nextToken through and emits Amazon's cursor when more remain", async () => {
    mockListAdvertisers.mockResolvedValue({
      accounts: [{ advertiserAccountId: "a1" }, { advertiserAccountId: "a2" }],
      nextToken: "tok-2",
    });

    const result = await listAdvertisersLogic(
      { isGlobalAccount: false, pageSize: 10, nextToken: "tok-1" },
      ctx,
      sdk
    );

    expect(mockListAdvertisers).toHaveBeenCalledWith(
      { isGlobalAccount: false, maxResults: 10, nextToken: "tok-1" },
      ctx
    );
    expect(result.count).toBe(2);
    expect(result.pagination.nextCursor).toBe("tok-2");
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextPageInputKey).toBe("nextToken");
  });

  it("reports exhausted pagination when Amazon sends no nextToken", async () => {
    mockListAdvertisers.mockResolvedValue({
      accounts: [{ advertiserAccountId: "a5" }],
      nextToken: undefined,
    });

    const result = await listAdvertisersLogic({}, ctx, sdk);

    expect(mockListAdvertisers).toHaveBeenCalledWith(
      { isGlobalAccount: undefined, maxResults: undefined, nextToken: undefined },
      ctx
    );
    expect(result.pagination.nextCursor).toBeNull();
    expect(result.pagination.hasMore).toBe(false);
  });

  it("keeps paginating through an empty page that carries a nextToken", async () => {
    // Amazon: "The API may return advertiserAccounts: [] with a valid nextToken."
    mockListAdvertisers.mockResolvedValue({ accounts: [], nextToken: "tok-empty" });

    const result = await listAdvertisersLogic({}, ctx, sdk);

    expect(result.count).toBe(0);
    expect(result.pagination.nextCursor).toBe("tok-empty");
    expect(result.pagination.hasMore).toBe(true);
  });
});

describe("amazon_dsp_list_advertisers formatter", () => {
  it("lists every dspAdvertiserId so the model can pass one as accountId", () => {
    const text = listAdvertisersResponseFormatter({
      advertiserAccounts: [
        {
          advertiserAccountId: "amzn1.ads-account.g.abc",
          displayName: "My Global Account",
          alternateIds: [
            { dspAdvertiserId: "581500279506501055", region: "NA" },
            { countryCode: "US", entityId: "ENTITYTEST123", profileId: "1034391974246256" },
          ],
        },
      ],
      count: 1,
      pagination: { nextCursor: null, hasMore: false, pageSize: 1, nextPageInputKey: "nextToken" },
      timestamp: "2026-11-13T00:00:00.000Z",
    })[0].text;

    expect(text).toContain(
      "accountId 581500279506501055 (region NA, amzn1.ads-account.g.abc) — My Global Account"
    );
    expect(text).not.toContain("accountId ENTITYTEST123");
  });
});
