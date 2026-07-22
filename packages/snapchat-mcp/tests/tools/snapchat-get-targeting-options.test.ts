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

import { getTargetingOptionsLogic } from "../../src/mcp-server/tools/definitions/get-targeting-options.tool.js";

const mockGetTargetingOptions = vi.fn();

beforeEach(() => {
  mockGetTargetingOptions.mockReset();
  mockResolveSession.mockReturnValue({
    snapchatService: { getTargetingOptions: mockGetTargetingOptions },
  } as any);
});

const ctx = { requestId: "req" } as any;
const sdk = { sessionId: "s" } as any;

describe("snapchat_get_targeting_options pagination", () => {
  it("threads the cursor through to the service and emits a canonical cursor", async () => {
    mockGetTargetingOptions.mockResolvedValue({
      results: [{ id: "SLC_1", name: "Adventure Seekers" }],
      nextCursor: "https://adsapi.snapchat.com/next?cursor=2",
    });

    const result = await getTargetingOptionsLogic(
      {
        targetingType: "interests_slc",
        countryCode: "us",
        limit: 50,
        cursor: "https://prev?cursor=1",
      },
      ctx,
      sdk
    );

    expect(mockGetTargetingOptions).toHaveBeenCalledWith(
      "interests_slc",
      "us",
      50,
      "https://prev?cursor=1",
      ctx
    );
    expect(result.options).toEqual({ results: [{ id: "SLC_1", name: "Adventure Seekers" }] });
    expect(result.pagination.pageSize).toBe(1);
    expect(result.pagination.nextCursor).toBe("https://adsapi.snapchat.com/next?cursor=2");
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextPageInputKey).toBe("cursor");
    expect(result.timestamp).toBeDefined();
  });

  it("reports exhausted pagination when the service returns no cursor", async () => {
    mockGetTargetingOptions.mockResolvedValue({
      results: [{ id: "SLC_1" }],
    });

    const result = await getTargetingOptionsLogic(
      { targetingType: "interests_slc", countryCode: "us", limit: 50 },
      ctx,
      sdk
    );

    expect(result.pagination.nextCursor).toBeNull();
    expect(result.pagination.hasMore).toBe(false);
  });
});
