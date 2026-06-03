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
  return { ...actual, elicitBulkMutationConfirmation: mockElicit };
});

import {
  bulkUpdateEntitiesLogic,
  bulkUpdateEntitiesResponseFormatter,
  BulkUpdateEntitiesOutputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

const baseInput = {
  entityType: "order",
  profileId: "1234567890",
  items: [
    { entityId: "ord_111111", data: { budget: 15000 } },
    { entityId: "ord_222222", data: { budget: 25000 } },
  ],
};

describe("amazon_dsp_bulk_update_entities governance contract (effect class)", () => {
  let svc: { bulkUpdateEntities: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      bulkUpdateEntities: vi.fn().mockResolvedValue({
        results: [
          { entityId: "ord_111111", success: true },
          { entityId: "ord_222222", success: false, error: "x" },
        ],
      }),
    };
    mockResolveSessionServices.mockReturnValue({ amazonDspService: svc });
    mockElicit.mockResolvedValue(true);
  });

  it("dry_run returns a symbolic effect preview, no confirmation or API call", async () => {
    const result = await bulkUpdateEntitiesLogic({ ...baseInput, dry_run: true } as any, ctx, sdk);
    expect(mockElicit).not.toHaveBeenCalled();
    expect(svc.bulkUpdateEntities).not.toHaveBeenCalled();
    expect(result.results).toEqual([]);
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "entities_updated",
      summary: { entity_kind: "order", requested: 2 },
    });
    expect(result.dispatchedCapability).toEqual({
      operation: "bulk_job",
      canonicalEntityKind: null,
    });
    expect(() => BulkUpdateEntitiesOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
  });

  it("dry_run flags an empty update payload", async () => {
    const result = await bulkUpdateEntitiesLogic(
      { ...baseInput, items: [{ entityId: "ord_1", data: {} }], dry_run: true } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors[0]?.code).toBe("EMPTY_UPDATE");
  });

  it("execute returns the batch effect identity + null-kind capability", async () => {
    const result = await bulkUpdateEntitiesLogic({ ...baseInput } as any, ctx, sdk);
    expect(svc.bulkUpdateEntities).toHaveBeenCalledOnce();
    expect(result.effect).toEqual({
      effectKind: "entities_updated",
      summary: {
        entity_kind: "order",
        requested: 2,
        succeeded: 1,
        failed: 1,
        partial_success: true,
      },
    });
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(() => BulkUpdateEntitiesOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
  });

  it("declined confirmation reports the capability, no effect", async () => {
    mockElicit.mockResolvedValue(false);
    const result = await bulkUpdateEntitiesLogic({ ...baseInput } as any, ctx, sdk);
    expect(svc.bulkUpdateEntities).not.toHaveBeenCalled();
    expect(result.confirmed).toBe(false);
    expect(result.effect).toBeUndefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = bulkUpdateEntitiesResponseFormatter({
      confirmed: true,
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
          summary: { entity_kind: "order", requested: 2 },
        },
      },
    } as any);
    expect(content[0].text).toContain("Dry run: bulk-updating 2 order(s) would succeed");
    expect(content[0].text).not.toContain("Bulk update:");
  });
});
