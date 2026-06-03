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
  return { ...actual, elicitBulkStatusChangeConfirmation: mockElicit };
});

import {
  bulkUpdateStatusLogic,
  bulkUpdateStatusResponseFormatter,
  BulkUpdateStatusOutputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

const baseInput = {
  entityType: "order",
  profileId: "1234567890",
  entityIds: ["ord_111111", "ord_222222"],
  operationStatus: "PAUSED",
};

describe("amazon_dsp_bulk_update_status governance contract (effect class)", () => {
  let svc: { bulkUpdateStatus: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      bulkUpdateStatus: vi.fn().mockResolvedValue({
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
    const result = await bulkUpdateStatusLogic({ ...baseInput, dry_run: true } as any, ctx, sdk);
    expect(mockElicit).not.toHaveBeenCalled();
    expect(svc.bulkUpdateStatus).not.toHaveBeenCalled();
    expect(result.results).toEqual([]);
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "entity_statuses_updated",
      summary: { entity_kind: "order", requested: 2, target_status: "PAUSED" },
    });
    expect(result.dispatchedCapability).toEqual({
      operation: "bulk_job",
      canonicalEntityKind: null,
    });
    expect(() => BulkUpdateStatusOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
  });

  it("dry_run flags an empty entity ID", async () => {
    const result = await bulkUpdateStatusLogic(
      { ...baseInput, entityIds: [" "], dry_run: true } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors[0]?.code).toBe("INVALID_ENTITY_ID");
  });

  it("execute returns the batch effect identity + null-kind capability", async () => {
    const result = await bulkUpdateStatusLogic({ ...baseInput } as any, ctx, sdk);
    expect(svc.bulkUpdateStatus).toHaveBeenCalledOnce();
    expect(result.effect).toEqual({
      effectKind: "entity_statuses_updated",
      summary: {
        entity_kind: "order",
        requested: 2,
        succeeded: 1,
        failed: 1,
        partial_success: true,
        target_status: "PAUSED",
      },
    });
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(() => BulkUpdateStatusOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
  });

  it("declined confirmation reports the capability, no effect", async () => {
    mockElicit.mockResolvedValue(false);
    const result = await bulkUpdateStatusLogic({ ...baseInput } as any, ctx, sdk);
    expect(svc.bulkUpdateStatus).not.toHaveBeenCalled();
    expect(result.confirmed).toBe(false);
    expect(result.effect).toBeUndefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = bulkUpdateStatusResponseFormatter({
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
          effectKind: "entity_statuses_updated",
          summary: { entity_kind: "order", requested: 2, target_status: "PAUSED" },
        },
      },
    } as any);
    expect(content[0].text).toContain(
      "Dry run: bulk status change of 2 entity(s) to PAUSED would succeed"
    );
    expect(content[0].text).not.toContain("Status updates:");
  });
});
