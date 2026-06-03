import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices, mockElicit } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockElicit: vi.fn(),
}));

vi.mock("../../../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, elicitBulkMutationConfirmation: mockElicit };
});

import {
  bulkUpdateEntitiesLogic,
  bulkUpdateEntitiesResponseFormatter,
  BulkUpdateEntitiesOutputSchema,
} from "../../../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

const baseInput = {
  entityType: "lineItem",
  advertiserId: "1234567",
  items: [
    { entityId: "1", data: { displayName: "A" }, updateMask: "displayName" },
    { entityId: "2", data: { displayName: "B" }, updateMask: "displayName" },
  ],
};

describe("dv360_bulk_update_entities governance contract (effect class)", () => {
  let svc: { updateEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = { updateEntity: vi.fn().mockResolvedValue({}) };
    mockResolveSessionServices.mockReturnValue({ dv360Service: svc });
    mockElicit.mockResolvedValue(true);
  });

  it("dry_run returns a symbolic effect preview, no confirmation or API call", async () => {
    const result = await bulkUpdateEntitiesLogic({ ...baseInput, dry_run: true } as any, ctx, sdk);
    expect(mockElicit).not.toHaveBeenCalled();
    expect(svc.updateEntity).not.toHaveBeenCalled();
    expect(result.results).toEqual([]);
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "entities_updated",
      summary: { entity_kind: "lineItem", requested: 2 },
    });
    expect(result.dispatchedCapability).toEqual({
      operation: "bulk_job",
      canonicalEntityKind: null,
    });
    expect(() => BulkUpdateEntitiesOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
  });

  it("dry_run flags an empty updateMask", async () => {
    const result = await bulkUpdateEntitiesLogic(
      {
        ...baseInput,
        items: [{ entityId: "1", data: { displayName: "A" }, updateMask: "   " }],
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors[0]?.code).toBe("EMPTY_UPDATE_MASK");
  });

  it("execute returns the batch effect identity + null-kind capability", async () => {
    const result = await bulkUpdateEntitiesLogic({ ...baseInput } as any, ctx, sdk);
    expect(svc.updateEntity).toHaveBeenCalledTimes(2);
    expect(result.effect).toEqual({
      effectKind: "entities_updated",
      summary: {
        entity_kind: "lineItem",
        requested: 2,
        succeeded: 2,
        failed: 0,
        partial_success: false,
      },
    });
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(() => BulkUpdateEntitiesOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
  });

  it("declined confirmation reports the capability, no effect", async () => {
    mockElicit.mockResolvedValue(false);
    const result = await bulkUpdateEntitiesLogic({ ...baseInput } as any, ctx, sdk);
    expect(svc.updateEntity).not.toHaveBeenCalled();
    expect(result.confirmed).toBe(false);
    expect(result.effect).toBeUndefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = bulkUpdateEntitiesResponseFormatter({
      confirmed: true,
      entityType: "lineItem",
      totalRequested: 0,
      successCount: 0,
      failureCount: 0,
      results: [],
      timestamp: "2026-06-03T00:00:00.000Z",
      dispatchedCapability: { operation: "bulk_job", canonicalEntityKind: null },
      dryRun: {
        wouldSucceed: true,
        validationErrors: [],
        validationSource: "symbolic",
        expectedEffectSource: "symbolic",
        expectedEffect: {
          effectKind: "entities_updated",
          summary: { entity_kind: "lineItem", requested: 2 },
        },
      },
    } as any);
    expect(content[0].text).toContain("Dry run: bulk-updating 2 lineItem(s) would succeed");
    expect(content[0].text).not.toContain("Bulk update lineItem:");
  });
});
