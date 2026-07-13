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

import { listAdvertisersLogic } from "../../src/mcp-server/tools/definitions/list-advertisers.tool.js";

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
  it("passes startIndex/pageSize and emits an offset cursor when more remain", async () => {
    mockListAdvertisers.mockResolvedValue({
      entities: [{ advertiserId: "1" }, { advertiserId: "2" }],
      pageInfo: { startIndex: 0, count: 2, totalResults: 5 },
    });

    const result = await listAdvertisersLogic({ startIndex: 0, pageSize: 2 }, ctx, sdk);

    expect(mockListAdvertisers).toHaveBeenCalledWith(0, 2, ctx);
    expect(result.count).toBe(2);
    expect(result.pagination.nextCursor).toBe("2");
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.totalCount).toBe(5);
    expect(result.pagination.nextPageInputKey).toBe("startIndex");
  });

  it("reports exhausted pagination on the last page", async () => {
    mockListAdvertisers.mockResolvedValue({
      entities: [{ advertiserId: "5" }],
      pageInfo: { startIndex: 4, count: 25, totalResults: 5 },
    });

    const result = await listAdvertisersLogic({ startIndex: 4 }, ctx, sdk);

    expect(mockListAdvertisers).toHaveBeenCalledWith(4, 25, ctx);
    expect(result.pagination.nextCursor).toBeNull();
    expect(result.pagination.hasMore).toBe(false);
  });
});
