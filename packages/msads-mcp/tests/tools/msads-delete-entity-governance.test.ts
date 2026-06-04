import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices, mockElicit } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockElicit: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, elicitBulkDeleteConfirmation: mockElicit };
});

import {
  deleteEntityLogic,
  DeleteEntityOutputSchema,
} from "../../src/mcp-server/tools/definitions/delete-entity.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;
const baseInput = { entityType: "campaign", entityIds: ["123456", "789012"] };

describe("msads_delete_entity governance contract (effect class)", () => {
  let svc: { deleteEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = { deleteEntity: vi.fn().mockResolvedValue({ ok: true }) };
    mockResolveSessionServices.mockReturnValue({ msadsService: svc });
    mockElicit.mockResolvedValue(true);
  });

  it("dry_run returns a symbolic effect preview, no confirmation or API call", async () => {
    const result = await deleteEntityLogic({ ...baseInput, dry_run: true } as any, ctx, sdk);
    expect(mockElicit).not.toHaveBeenCalled();
    expect(svc.deleteEntity).not.toHaveBeenCalled();
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "entities_deleted",
      summary: { entity_kind: "campaign", requested: 2 },
    });
    expect(result.dispatchedCapability).toEqual({
      operation: "bulk_job",
      canonicalEntityKind: null,
    });
    expect(() => DeleteEntityOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
  });

  it("dry_run flags an empty entity id", async () => {
    const result = await deleteEntityLogic(
      { ...baseInput, entityIds: ["  "], dry_run: true } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors[0]?.code).toBe("INVALID_ENTITY_ID");
  });

  it("execute returns the batch effect identity + null-kind capability", async () => {
    const result = await deleteEntityLogic({ ...baseInput } as any, ctx, sdk);
    expect(svc.deleteEntity).toHaveBeenCalledOnce();
    expect(result.deletedCount).toBe(2);
    expect(result.effect).toEqual({
      effectKind: "entities_deleted",
      summary: {
        entity_kind: "campaign",
        requested: 2,
        succeeded: 2,
        failed: 0,
        partial_success: false,
      },
    });
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(result.failedCount).toBe(0);
    expect(() => DeleteEntityOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
  });

  it("parses Microsoft Ads PartialErrors into honest succeeded/failed counts", async () => {
    // HTTP 200 with a per-item failure: item at Index 1 was rejected.
    svc.deleteEntity.mockResolvedValueOnce({
      PartialErrors: [{ Index: 1, Code: 1100, Message: "EntityNotExist" }],
    });
    const result = await deleteEntityLogic({ ...baseInput } as any, ctx, sdk);
    expect(result.deletedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.effect?.summary).toEqual({
      entity_kind: "campaign",
      requested: 2,
      succeeded: 1,
      failed: 1,
      partial_success: true,
    });
    expect(() => DeleteEntityOutputSchema.parse(result)).not.toThrow();
  });

  it("declined confirmation reports the capability, no effect", async () => {
    mockElicit.mockResolvedValue(false);
    const result = await deleteEntityLogic({ ...baseInput } as any, ctx, sdk);
    expect(svc.deleteEntity).not.toHaveBeenCalled();
    expect(result.confirmed).toBe(false);
    expect(result.effect).toBeUndefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
  });
});
