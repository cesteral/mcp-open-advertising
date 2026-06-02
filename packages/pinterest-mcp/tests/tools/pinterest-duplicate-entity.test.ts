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

describe("pinterest_duplicate_entity governance contract", () => {
  let svc: {
    duplicateEntity: ReturnType<typeof vi.fn>;
    getEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      duplicateEntity: vi.fn().mockResolvedValue({
        id: "campaign-COPY-1",
        name: "Source Campaign (copy)",
        status: "PAUSED",
        ad_account_id: "act-1",
      }),
      getEntity: vi.fn(),
    };
    mockResolveSession.mockReturnValue({ pinterestService: svc } as any);
  });

  it("dry_run reads the source and projects the PAUSED copy, no API call", async () => {
    svc.getEntity.mockResolvedValue({
      id: "campaign-SRC-1",
      name: "Source Campaign",
      status: "ACTIVE",
      ad_account_id: "act-1",
    });

    const result = await duplicateEntityLogic(
      {
        entityType: "campaign",
        adAccountId: "act-1",
        entityId: "campaign-SRC-1",
        dry_run: true,
      } as any,
      ctx,
      sdk
    );

    expect(svc.duplicateEntity).not.toHaveBeenCalled();
    expect(svc.getEntity).toHaveBeenCalledWith(
      "campaign",
      { adAccountId: "act-1" },
      "campaign-SRC-1",
      expect.any(Object)
    );
    expect(result.dryRun?.expectedPostState?.status.canonical).toBe("paused");
    expect(result.dryRun?.expectedPostState?.platformEntityId).toBe("");
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: "campaign",
    });
  });

  it("execute normalizes the returned new entity into after (no before)", async () => {
    const result = await duplicateEntityLogic(
      { entityType: "campaign", adAccountId: "act-1", entityId: "campaign-SRC-1" } as any,
      ctx,
      sdk
    );
    expect(svc.duplicateEntity).toHaveBeenCalledOnce();
    expect(result.after?.status.canonical).toBe("paused");
    expect(result.after?.platformEntityId).toBe("campaign-COPY-1");
    expect((result as any).before).toBeUndefined();
  });

  it("out-of-scope kind resolves canonicalEntityKind:null and skips snapshots", async () => {
    svc.duplicateEntity.mockResolvedValue({ id: "cr-COPY-1" });
    const result = await duplicateEntityLogic(
      { entityType: "creative", adAccountId: "act-1", entityId: "cr-SRC-1" } as any,
      ctx,
      sdk
    );
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: null,
    });
    expect(result.after).toBeUndefined();
  });

  it("out-of-scope dry_run does not throw and emits no snapshot", async () => {
    const result = await duplicateEntityLogic(
      { entityType: "creative", adAccountId: "act-1", entityId: "cr-SRC-1", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(svc.duplicateEntity).not.toHaveBeenCalled();
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: null,
    });
    expect(result.dryRun?.expectedPostState).toBeUndefined();
    expect(result.dryRun?.expectedStateSource).toBe("none");
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = duplicateEntityResponseFormatter({
      newEntity: {},
      sourceEntityId: "campaign-SRC-1",
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
