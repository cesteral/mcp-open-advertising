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

describe("amazon_dsp_duplicate_entity governance contract", () => {
  let svc: {
    duplicateEntity: ReturnType<typeof vi.fn>;
    getEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      duplicateEntity: vi.fn().mockResolvedValue({
        campaignId: "cmp-COPY-1",
        name: "Source Order (copy)",
        state: "PAUSED",
      }),
      getEntity: vi.fn(),
    };
    mockResolveSession.mockReturnValue({ amazonDspService: svc, boundProfileId: "1" } as any);
  });

  it("dry_run reads the source and projects the PAUSED copy, no API call", async () => {
    svc.getEntity.mockResolvedValue({
      campaignId: "cmp-SRC-1",
      name: "Source Order",
      state: "ENABLED",
      status: { deliveryStatus: "DELIVERING" },
    });

    const result = await duplicateEntityLogic(
      {
        entityType: "order",
        profileId: "1",
        accountId: "adv-1",
        entityId: "cmp-SRC-1",
        dry_run: true,
      } as any,
      ctx,
      sdk
    );

    expect(svc.duplicateEntity).not.toHaveBeenCalled();
    expect(result.dryRun?.expectedPostState?.status.canonical).toBe("paused");
    expect(result.dryRun?.expectedPostState?.displayName).toBe("Source Order");
    expect(result.dryRun?.expectedPostState?.platformEntityId).toBe("");
    expect(result.dryRun?.expectedPostState?.accountId).toBe("adv-1");
    expect(svc.getEntity).toHaveBeenCalledWith("order", "adv-1", "cmp-SRC-1", ctx);
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: "order",
    });
  });

  it("dry_run applies an options rename to the projected copy", async () => {
    svc.getEntity.mockResolvedValue({
      campaignId: "cmp-SRC-1",
      name: "Source Order",
      state: "ENABLED",
    });
    const result = await duplicateEntityLogic(
      {
        entityType: "order",
        profileId: "1",
        accountId: "adv-1",
        entityId: "cmp-SRC-1",
        options: { name: "Custom Copy" },
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(true);
    expect(result.dryRun?.expectedPostState?.displayName).toBe("Custom Copy");
    expect(result.dryRun?.expectedPostState?.status.canonical).toBe("paused");
  });

  it("dry_run reports an options.state other than PAUSED as a failure (DSPCreateState)", async () => {
    // basis: unified-api-dsp.json DSPCreateState — "For ADSP, campaign and ad
    // group resources can only be created in the PAUSED state"
    // (amzn/ads-advanced-tools-docs@e25aace0).
    svc.getEntity.mockResolvedValue({ campaignId: "cmp-SRC-1", name: "S", state: "ENABLED" });
    const result = await duplicateEntityLogic(
      {
        entityType: "order",
        profileId: "1",
        accountId: "adv-1",
        entityId: "cmp-SRC-1",
        options: { state: "ENABLED" },
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors[0].code).toBe("INVALID_STATE");
  });

  it("execute normalizes the returned new entity into after (no before)", async () => {
    const result = await duplicateEntityLogic(
      { entityType: "order", profileId: "1", accountId: "adv-1", entityId: "cmp-SRC-1" } as any,
      ctx,
      sdk
    );
    expect(svc.duplicateEntity).toHaveBeenCalledWith("order", "adv-1", "cmp-SRC-1", undefined, ctx);
    expect(result.after?.status.canonical).toBe("paused");
    expect(result.after?.platformEntityId).toBe("cmp-COPY-1");
    expect((result as any).before).toBeUndefined();
  });

  it("out-of-scope kind resolves canonicalEntityKind:null and skips snapshots", async () => {
    svc.duplicateEntity.mockResolvedValue({ adId: "ad-COPY-1" });
    const result = await duplicateEntityLogic(
      { entityType: "creative", profileId: "1", accountId: "adv-1", entityId: "ad-SRC-1" } as any,
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
      {
        entityType: "creative",
        profileId: "1",
        accountId: "adv-1",
        entityId: "ad-SRC-1",
        dry_run: true,
      } as any,
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
      sourceEntityId: "ord-SRC-1",
      entityType: "order",
      timestamp: "2026-06-02T00:00:00.000Z",
      dispatchedCapability: { operation: "duplicate", canonicalEntityKind: "order" },
      dryRun: {
        wouldSucceed: true,
        validationErrors: [],
        validationSource: "symbolic",
        expectedStateSource: "server_symbolic_apply",
      } as any,
    });
    expect(content[0].text).toContain("Dry run: duplicating order would succeed");
    expect(content[0].text).not.toContain("duplicated successfully");
  });
});
