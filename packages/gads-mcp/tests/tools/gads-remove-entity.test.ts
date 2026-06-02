import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
const mockResolveSessionServices = vi.mocked(resolveSessionServices);

import {
  RemoveEntityInputSchema,
  removeEntityLogic,
} from "../../src/mcp-server/tools/definitions/remove-entity.tool.js";

const ctx = { requestId: "r", timestamp: new Date().toISOString(), operation: "t" } as any;
const sdk = { sessionId: "s" } as any;

describe("RemoveEntityInputSchema", () => {
  it("accepts valid remove input", () => {
    const result = RemoveEntityInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      entityId: "456",
    });
    expect(result.success).toBe(true);
  });

  it("requires entityId", () => {
    const result = RemoveEntityInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty entityId", () => {
    const result = RemoveEntityInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      entityId: "",
    });
    expect(result.success).toBe(false);
  });

  it("validates entity type enum", () => {
    const result = RemoveEntityInputSchema.safeParse({
      entityType: "unknown",
      customerId: "1234567890",
      entityId: "456",
    });
    expect(result.success).toBe(false);
  });

  it("rejects ad entity with simple entityId (requires composite)", () => {
    const result = RemoveEntityInputSchema.safeParse({
      entityType: "ad",
      customerId: "1234567890",
      entityId: "456",
    });
    expect(result.success).toBe(false);
  });

  it("accepts ad entity with composite entityId", () => {
    const result = RemoveEntityInputSchema.safeParse({
      entityType: "ad",
      customerId: "1234567890",
      entityId: "789~456",
    });
    expect(result.success).toBe(true);
  });

  it("rejects ad entity with malformed composite IDs", () => {
    const malformed = ["~", "123~", "~456", "1~2~3", "abc~def"];
    for (const id of malformed) {
      const result = RemoveEntityInputSchema.safeParse({
        entityType: "ad",
        customerId: "1234567890",
        entityId: id,
      });
      expect(result.success, `expected "${id}" to be rejected`).toBe(false);
    }
  });
});

describe("removeEntityLogic governance contract", () => {
  let svc: { getEntity: ReturnType<typeof vi.fn>; removeEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      getEntity: vi
        .fn()
        .mockResolvedValue({ status: "PAUSED", resourceName: "customers/1/campaigns/456" }),
      removeEntity: vi
        .fn()
        .mockResolvedValue({ results: [{ resourceName: "customers/1/campaigns/456" }] }),
    };
    mockResolveSessionServices.mockReturnValue({ gadsService: svc } as any);
  });

  it("dry_run returns a deleted expected post-state and does not remove", async () => {
    const result = await removeEntityLogic(
      { entityType: "campaign", customerId: "1", entityId: "456", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(svc.removeEntity).not.toHaveBeenCalled();
    expect(result.dryRun?.expectedPostState?.status.canonical).toBe("deleted");
    expect(result.dispatchedCapability).toEqual({
      operation: "delete",
      canonicalEntityKind: "campaign",
    });
  });

  it("execute captures before (live) and after (REMOVED→deleted) snapshots", async () => {
    svc.getEntity
      .mockResolvedValueOnce({ status: "PAUSED", resourceName: "customers/1/campaigns/456" })
      .mockResolvedValueOnce({ status: "REMOVED", resourceName: "customers/1/campaigns/456" });
    const result = await removeEntityLogic(
      { entityType: "campaign", customerId: "1", entityId: "456" } as any,
      ctx,
      sdk
    );
    expect(svc.removeEntity).toHaveBeenCalledOnce();
    expect(result.before?.status.canonical).toBe("paused");
    expect(result.after?.status.canonical).toBe("deleted");
    expect(result.dispatchedCapability.canonicalEntityKind).toBe("campaign");
  });

  it("out-of-scope kind (ad) resolves canonicalEntityKind:null", async () => {
    const result = await removeEntityLogic(
      { entityType: "ad", customerId: "1", entityId: "789~456" } as any,
      ctx,
      sdk
    );
    expect(result.dispatchedCapability).toEqual({ operation: "delete", canonicalEntityKind: null });
    expect(result.before).toBeUndefined();
    expect(result.after).toBeUndefined();
    expect(svc.removeEntity).toHaveBeenCalledOnce();
  });
});
