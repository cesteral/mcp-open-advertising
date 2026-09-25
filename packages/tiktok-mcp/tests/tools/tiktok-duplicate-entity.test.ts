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
  duplicateEntityLogic,
  duplicateEntityResponseFormatter,
} from "../../src/mcp-server/tools/definitions/duplicate-entity.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("tiktok_duplicate_entity (no TikTok copy endpoint)", () => {
  let svc: {
    duplicateEntity: ReturnType<typeof vi.fn>;
    getEntity: ReturnType<typeof vi.fn>;
    createEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      duplicateEntity: vi.fn(),
      getEntity: vi.fn(),
      createEntity: vi.fn(),
    };
    mockResolveSession.mockReturnValue({ tiktokService: svc, boundAdvertiserId: "adv-1" } as any);
  });

  // TikTok's official v1.3 SDK defines no campaign/adgroup/ad copy endpoint;
  // the tool used to POST to a derived `/{entity}/copy/` path.
  it("execute refuses with InvalidRequest and calls nothing upstream", async () => {
    await expect(
      duplicateEntityLogic(
        { entityType: "campaign", advertiserId: "adv-1", entityId: "camp-SRC-1" } as any,
        ctx,
        sdk
      )
    ).rejects.toMatchObject({
      code: -32600,
      message: expect.stringContaining("no copy/duplicate endpoint"),
    });
    expect(svc.duplicateEntity).not.toHaveBeenCalled();
    expect(svc.getEntity).not.toHaveBeenCalled();
    expect(svc.createEntity).not.toHaveBeenCalled();
  });

  it("dry_run also refuses rather than predicting a success that cannot happen", async () => {
    await expect(
      duplicateEntityLogic(
        {
          entityType: "adGroup",
          advertiserId: "adv-1",
          entityId: "ag-SRC-1",
          dry_run: true,
        } as any,
        ctx,
        sdk
      )
    ).rejects.toMatchObject({ code: -32600 });
    expect(svc.getEntity).not.toHaveBeenCalled();
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = duplicateEntityResponseFormatter({
      newEntity: {},
      sourceEntityId: "camp-SRC-1",
      entityType: "campaign",
      timestamp: "2026-06-02T00:00:00.000Z",
      dispatchedCapability: { operation: "duplicate", canonicalEntityKind: "campaign" },
      dryRun: {
        wouldSucceed: true,
        validationErrors: [],
        validationSource: "symbolic",
        expectedStateSource: "server_symbolic_apply",
      } as any,
    });
    expect(content[0].text).toContain("Dry run: duplicating campaign would succeed");
    expect(content[0].text).not.toContain("duplicated successfully");
  });
});
