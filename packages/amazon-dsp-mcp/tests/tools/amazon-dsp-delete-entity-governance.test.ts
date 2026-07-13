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
  deleteEntityResponseFormatter,
  DeleteEntityOutputSchema,
} from "../../src/mcp-server/tools/definitions/delete-entity.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

const baseInput = {
  entityType: "order",
  profileId: "1234567890",
  entityIds: ["ord_111111", "ord_222222"],
};

describe("amazon_dsp_delete_entity governance contract (effect class)", () => {
  let svc: { deleteEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      // first id succeeds, second throws -> partial success
      deleteEntity: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("archive failed")),
    };
    mockResolveSessionServices.mockReturnValue({
      amazonDspService: svc,
      boundProfileId: "1234567890",
    } as any);
    mockElicit.mockResolvedValue(true);
  });

  it("dry_run returns a symbolic effect preview, no confirmation or API call", async () => {
    const result = await deleteEntityLogic({ ...baseInput, dry_run: true } as any, ctx, sdk);
    expect(mockElicit).not.toHaveBeenCalled();
    expect(svc.deleteEntity).not.toHaveBeenCalled();
    expect(result.results).toEqual([]);
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "entities_deleted",
      summary: { entity_kind: "order", requested: 2 },
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
    expect(svc.deleteEntity).toHaveBeenCalledTimes(2);
    expect(result.effect).toEqual({
      effectKind: "entities_deleted",
      summary: {
        entity_kind: "order",
        requested: 2,
        succeeded: 1,
        failed: 1,
        partial_success: true,
      },
    });
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(() => DeleteEntityOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
  });

  it("declined confirmation reports the capability, no effect", async () => {
    mockElicit.mockResolvedValue(false);
    const result = await deleteEntityLogic({ ...baseInput } as any, ctx, sdk);
    expect(svc.deleteEntity).not.toHaveBeenCalled();
    expect(result.confirmed).toBe(false);
    expect(result.effect).toBeUndefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = deleteEntityResponseFormatter({
      confirmed: true,
      entityType: "order",
      totalRequested: 0,
      totalSucceeded: 0,
      totalFailed: 0,
      results: [],
      timestamp: "2026-06-04T00:00:00.000Z",
      dispatchedCapability: { operation: "bulk_job", canonicalEntityKind: null },
      dryRun: {
        wouldSucceed: true,
        validationErrors: [],
        validationSource: "symbolic",
        expectedEffectSource: "symbolic",
        expectedEffect: {
          effectKind: "entities_deleted",
          summary: { entity_kind: "order", requested: 2 },
        },
      },
    } as any);
    expect(content[0].text).toContain("Dry run: bulk-archiving 2 order(s) would succeed");
    expect(content[0].text).not.toContain("deletions:");
  });
});
