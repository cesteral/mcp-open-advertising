import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices, mockElicitDelete } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockElicitDelete: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, elicitDeleteConfirmation: mockElicitDelete };
});

import {
  deleteEntityLogic,
  DeleteEntityOutputSchema,
} from "../../src/mcp-server/tools/definitions/delete-entity.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

const campaignEntity = {
  CampaignName: "Retired Campaign",
  AdvertiserId: "adv-1",
  Availability: "Available",
  Budget: { Amount: 50000, CurrencyCode: "USD" },
  DailyBudget: { Amount: 500, CurrencyCode: "USD" },
};

describe("ttd_delete_entity governance contract (entity class)", () => {
  let ttdService: {
    getEntity: ReturnType<typeof vi.fn>;
    deleteEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    ttdService = {
      getEntity: vi.fn().mockResolvedValue(campaignEntity),
      deleteEntity: vi.fn().mockResolvedValue(undefined),
    };
    mockResolveSessionServices.mockReturnValue({ ttdService });
    mockElicitDelete.mockResolvedValue(true);
  });

  it("dry_run (in-scope campaign) projects an archived post-state, no delete", async () => {
    const result = await deleteEntityLogic(
      { entityType: "campaign", entityId: "camp-1", advertiserId: "adv-1", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(ttdService.deleteEntity).not.toHaveBeenCalled();
    expect(mockElicitDelete).not.toHaveBeenCalled();
    expect(result.dryRun?.wouldSucceed).toBe(true);
    expect(result.dryRun?.expectedStateSource).toBe("server_symbolic_apply");
    expect(result.dryRun?.expectedPostState?.status).toEqual({
      canonical: "archived",
      platformRaw: "Archived",
    });
    expect(result.dispatchedCapability).toEqual({
      operation: "delete",
      canonicalEntityKind: "campaign",
    });
    expect(() => DeleteEntityOutputSchema.parse(result)).not.toThrow();
  });

  it("dry_run (out-of-scope creative) is token-gated with a null kind and no snapshot", async () => {
    const result = await deleteEntityLogic(
      { entityType: "creative", entityId: "cre-1", advertiserId: "adv-1", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(result.dispatchedCapability).toEqual({ operation: "delete", canonicalEntityKind: null });
    expect(result.dryRun?.expectedStateSource).toBe("none");
    expect(result.dryRun?.wouldSucceed).toBe(true);
    expect(result.before).toBeUndefined();
    expect(() => DeleteEntityOutputSchema.parse(result)).not.toThrow();
  });

  it("execute captures before/after snapshots around the archive", async () => {
    const result = await deleteEntityLogic(
      { entityType: "campaign", entityId: "camp-1", advertiserId: "adv-1" } as any,
      ctx,
      sdk
    );
    expect(ttdService.deleteEntity).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    expect(result.before?.status).toEqual({ canonical: "active", platformRaw: "Available" });
    expect(result.after?.status).toEqual({ canonical: "archived", platformRaw: "Archived" });
    expect(result.dispatchedCapability).toEqual({
      operation: "delete",
      canonicalEntityKind: "campaign",
    });
    expect(() => DeleteEntityOutputSchema.parse(result)).not.toThrow();
  });

  it("declined confirmation reports the capability, no delete, no snapshots", async () => {
    mockElicitDelete.mockResolvedValue(false);
    const result = await deleteEntityLogic(
      { entityType: "campaign", entityId: "camp-1", advertiserId: "adv-1" } as any,
      ctx,
      sdk
    );
    expect(ttdService.deleteEntity).not.toHaveBeenCalled();
    expect(result.confirmed).toBe(false);
    expect(result.success).toBe(false);
    expect(result.before).toBeUndefined();
    expect(result.after).toBeUndefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBe("campaign");
  });
});
