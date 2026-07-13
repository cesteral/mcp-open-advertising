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

import { listAdAccountsLogic } from "../../src/mcp-server/tools/definitions/list-ad-accounts.tool.js";

const mockListAdAccounts = vi.fn();

beforeEach(() => {
  mockListAdAccounts.mockReset();
  mockResolveSession.mockReturnValue({
    pinterestService: { listAdAccounts: mockListAdAccounts },
  } as any);
});

const ctx = { requestId: "req" } as any;
const sdk = { sessionId: "s" } as any;

describe("pinterest_list_ad_accounts pagination", () => {
  it("passes bookmark and pageSize to the service and emits a bookmark cursor", async () => {
    mockListAdAccounts.mockResolvedValue({ entities: [{ id: "a1" }], nextCursor: "BM2" });

    const result = await listAdAccountsLogic({ bookmark: "BM1", pageSize: 10 }, ctx, sdk);

    expect(mockListAdAccounts).toHaveBeenCalledWith({ bookmark: "BM1", pageSize: 10 }, ctx);
    expect(result.count).toBe(1);
    expect(result.pagination.nextCursor).toBe("BM2");
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextPageInputKey).toBe("bookmark");
  });

  it("reports exhausted pagination when the service returns no cursor", async () => {
    mockListAdAccounts.mockResolvedValue({ entities: [{ id: "a1" }] });

    const result = await listAdAccountsLogic({}, ctx, sdk);

    expect(result.pagination.nextCursor).toBeNull();
    expect(result.pagination.hasMore).toBe(false);
  });
});
