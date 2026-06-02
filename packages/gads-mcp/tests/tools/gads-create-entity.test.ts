import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(),
}));
import { resolveSessionServices } from "../../src/mcp-server/tools/utils/resolve-session.js";
const mockResolveSessionServices = vi.mocked(resolveSessionServices);

import {
  CreateEntityInputSchema,
  createEntityLogic,
} from "../../src/mcp-server/tools/definitions/create-entity.tool.js";

const ctx = { requestId: "r", timestamp: new Date().toISOString(), operation: "t" } as any;
const sdk = { sessionId: "s" } as any;

describe("CreateEntityInputSchema", () => {
  it("accepts valid campaign creation input", () => {
    const result = CreateEntityInputSchema.safeParse({
      entityType: "campaign",
      customerId: "1234567890",
      data: { name: "My Campaign" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid adGroup creation input", () => {
    const result = CreateEntityInputSchema.safeParse({
      entityType: "adGroup",
      customerId: "1234567890",
      data: { name: "My Ad Group" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid entity type", () => {
    const result = CreateEntityInputSchema.safeParse({
      entityType: "invalidType",
      customerId: "1234567890",
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing customerId", () => {
    const result = CreateEntityInputSchema.safeParse({
      entityType: "campaign",
      data: { name: "Test" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts all supported entity types", () => {
    const entityTypes = ["campaign", "adGroup", "ad", "keyword", "campaignBudget", "asset"];
    for (const entityType of entityTypes) {
      const result = CreateEntityInputSchema.safeParse({
        entityType,
        customerId: "123",
        data: {},
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("createEntityLogic governance contract", () => {
  let svc: {
    createEntity: ReturnType<typeof vi.fn>;
    validateEntity: ReturnType<typeof vi.fn>;
    getEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      createEntity: vi
        .fn()
        .mockResolvedValue({ results: [{ resourceName: "customers/1/campaigns/456" }] }),
      validateEntity: vi.fn().mockResolvedValue({ valid: true }),
      getEntity: vi
        .fn()
        .mockResolvedValue({ status: "PAUSED", resourceName: "customers/1/campaigns/456" }),
    };
    mockResolveSessionServices.mockReturnValue({ gadsService: svc } as any);
  });

  it("dry_run uses native validateOnly create, returns symbolic post-state, does not create", async () => {
    const result = await createEntityLogic(
      {
        entityType: "campaign",
        customerId: "1",
        data: { name: "New", status: "PAUSED" },
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(svc.createEntity).not.toHaveBeenCalled();
    expect(svc.validateEntity).toHaveBeenCalledWith(
      "campaign",
      "1",
      expect.any(Object),
      "create",
      undefined,
      undefined,
      expect.anything()
    );
    expect(result.dryRun?.validationSource).toBe("native_validator");
    expect(result.dryRun?.expectedPostState?.status.canonical).toBe("paused");
    expect(result.dispatchedCapability).toEqual({
      operation: "create",
      canonicalEntityKind: "campaign",
    });
  });

  it("execute re-reads the created entity by the new ID for the after snapshot", async () => {
    const result = await createEntityLogic(
      { entityType: "campaign", customerId: "1", data: { name: "New", status: "PAUSED" } } as any,
      ctx,
      sdk
    );
    expect(svc.createEntity).toHaveBeenCalledOnce();
    expect(svc.getEntity).toHaveBeenCalledWith("campaign", "1", "456", expect.anything());
    expect(result.after?.status.canonical).toBe("paused");
    expect((result as any).before).toBeUndefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBe("campaign");
  });

  it("out-of-scope kind resolves canonicalEntityKind:null", async () => {
    const result = await createEntityLogic(
      { entityType: "ad", customerId: "1", data: { name: "A" } } as any,
      ctx,
      sdk
    );
    expect(result.dispatchedCapability).toEqual({ operation: "create", canonicalEntityKind: null });
    expect(result.after).toBeUndefined();
  });
});
