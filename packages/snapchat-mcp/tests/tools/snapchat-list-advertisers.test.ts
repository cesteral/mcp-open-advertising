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

import { listAdAccountsLogic } from "../../src/mcp-server/tools/definitions/list-advertisers.tool.js";

const mockListAdAccounts = vi.fn();

beforeEach(() => {
  mockListAdAccounts.mockReset();
  mockResolveSession.mockReturnValue({
    snapchatService: { listAdAccounts: mockListAdAccounts },
  } as any);
});

const ctx = { requestId: "req" } as any;
const sdk = { sessionId: "s" } as any;

describe("snapchat_list_ad_accounts pagination", () => {
  it("passes cursor and limit to the service and emits a cursor", async () => {
    mockListAdAccounts.mockResolvedValue({
      entities: [{ id: "a1" }],
      nextCursor: "https://adsapi.snapchat.com/next?cursor=2",
    });

    const result = await listAdAccountsLogic(
      { cursor: "https://prev?cursor=1", limit: 20 },
      ctx,
      sdk
    );

    expect(mockListAdAccounts).toHaveBeenCalledWith(
      { cursor: "https://prev?cursor=1", limit: 20 },
      ctx
    );
    expect(result.count).toBe(1);
    expect(result.pagination.nextCursor).toBe("https://adsapi.snapchat.com/next?cursor=2");
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextPageInputKey).toBe("cursor");
  });

  it("reports exhausted pagination when the service returns no cursor", async () => {
    mockListAdAccounts.mockResolvedValue({ entities: [{ id: "a1" }] });

    const result = await listAdAccountsLogic({}, ctx, sdk);

    expect(result.pagination.nextCursor).toBeNull();
    expect(result.pagination.hasMore).toBe(false);
  });
});
