import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));

import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
const mockResolveSessionServices = vi.mocked(resolveSessionServices);

import {
  RemoveEntityInputSchema,
  removeEntityLogic,
  removeEntityResponseFormatter,
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
  let svc: {
    getEntity: ReturnType<typeof vi.fn>;
    removeEntity: ReturnType<typeof vi.fn>;
    validateEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      getEntity: vi
        .fn()
        .mockResolvedValue({ status: "PAUSED", resourceName: "customers/1/campaigns/456" }),
      removeEntity: vi
        .fn()
        .mockResolvedValue({ results: [{ resourceName: "customers/1/campaigns/456" }] }),
      validateEntity: vi.fn().mockResolvedValue({ valid: true }),
    };
    mockResolveSessionServices.mockReturnValue({ gadsService: svc } as any);
  });

  it("dry_run uses native validateOnly, returns a deleted expected post-state, does not remove", async () => {
    const result = await removeEntityLogic(
      { entityType: "campaign", customerId: "1", entityId: "456", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(svc.removeEntity).not.toHaveBeenCalled();
    // Native validate-only remove was invoked.
    expect(svc.validateEntity).toHaveBeenCalledWith(
      "campaign",
      "1",
      {},
      "remove",
      "456",
      undefined,
      expect.anything()
    );
    expect(result.dryRun?.validationSource).toBe("native_validator");
    expect(result.dryRun?.wouldSucceed).toBe(true);
    expect(result.dryRun?.expectedPostState?.status.canonical).toBe("deleted");
    expect(result.dispatchedCapability).toEqual({
      operation: "delete",
      canonicalEntityKind: "campaign",
    });
  });

  it("dry_run surfaces a native validation rejection (wouldSucceed:false)", async () => {
    svc.validateEntity.mockResolvedValue({ valid: false, errors: ["cannot be removed"] });
    const result = await removeEntityLogic(
      { entityType: "campaign", customerId: "1", entityId: "456", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors[0].code).toBe("GOOGLE_ADS_VALIDATION");
    expect(svc.removeEntity).not.toHaveBeenCalled();
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

  it("formatter shows a dry-run message, not a false removal success", () => {
    const content = removeEntityResponseFormatter({
      confirmed: true,
      mutateResult: {},
      entityType: "campaign",
      entityId: "456",
      timestamp: new Date().toISOString(),
      dryRun: {
        wouldSucceed: true,
        validationErrors: [],
        validationSource: "native_validator",
        expectedStateSource: "server_symbolic_apply",
      },
      dispatchedCapability: { operation: "delete", canonicalEntityKind: "campaign" },
    } as any);
    expect((content[0] as any).text).toMatch(/dry-run/i);
    expect((content[0] as any).text).not.toMatch(/removed/i);
  });
});
