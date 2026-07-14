import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  bulkCreateEntitiesLogic,
  bulkCreateEntitiesResponseFormatter,
  BulkCreateEntitiesOutputSchema,
} from "../../../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

const baseInput = {
  entityType: "lineItem",
  advertiserId: "1234567",
  items: [{ displayName: "A" }, { displayName: "B" }],
};

describe("dv360_bulk_create_entities governance contract (effect class)", () => {
  let svc: { bulkCreateEntities: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      bulkCreateEntities: vi.fn().mockResolvedValue([
        { success: true, entity: {} },
        { success: true, entity: {} },
      ]),
    };
    mockResolveSessionServices.mockReturnValue({ dv360Service: svc });
  });

  it("dry_run returns a symbolic effect preview, no API call", async () => {
    const result = await bulkCreateEntitiesLogic({ ...baseInput, dry_run: true } as any, ctx, sdk);
    expect(svc.bulkCreateEntities).not.toHaveBeenCalled();
    expect(result.results).toEqual([]);
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "entities_created",
      summary: { entity_kind: "lineItem", requested: 2 },
    });
    expect(result.dispatchedCapability).toEqual({
      operation: "bulk_job",
      canonicalEntityKind: null,
    });
    expect(() => BulkCreateEntitiesOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
  });

  it("dry_run flags an empty item object", async () => {
    const result = await bulkCreateEntitiesLogic(
      { ...baseInput, items: [{ displayName: "A" }, {}], dry_run: true } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    // The empty item surfaces an explicit EMPTY_ITEM error (finding M5 also adds
    // per-entity create-schema validation, so incomplete items report Zod issues
    // too — the empty-object error must still be present and actionable).
    expect(result.dryRun?.validationErrors.some((e) => e.code === "EMPTY_ITEM")).toBe(true);
  });

  it("dry_run flags items that violate the per-entity create schema (M5)", async () => {
    // Stub payloads that are non-empty but miss required create fields must now
    // be reported as "would FAIL" — the dry-run applies the same per-entity
    // schema dv360_create_entity documents, so preview matches what the API
    // would reject.
    const result = await bulkCreateEntitiesLogic(
      { ...baseInput, items: [{ displayName: "A" }], dry_run: true } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors.length).toBeGreaterThan(0);
    expect(result.dryRun?.validationErrors.every((e) => e.field?.startsWith("items.0"))).toBe(true);
  });

  it("execute rejects an empty item before any API call (M4 regression)", async () => {
    await expect(
      bulkCreateEntitiesLogic({ ...baseInput, items: [{ name: "A" }, {}] } as any, ctx, sdk)
    ).rejects.toThrow(/Invalid bulk create payload/);
  });

  it("execute returns the batch effect identity + null-kind capability", async () => {
    // Execute mirrors create_entity: the API validates items (partial success),
    // so the batch is still dispatched even though the stub payloads are thin.
    const result = await bulkCreateEntitiesLogic({ ...baseInput } as any, ctx, sdk);
    expect(svc.bulkCreateEntities).toHaveBeenCalledOnce();
    expect(result.successCount).toBe(2);
    expect(result.effect).toEqual({
      effectKind: "entities_created",
      summary: {
        entity_kind: "lineItem",
        requested: 2,
        succeeded: 2,
        failed: 0,
        partial_success: false,
      },
    });
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(() => BulkCreateEntitiesOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = bulkCreateEntitiesResponseFormatter({
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
          effectKind: "entities_created",
          summary: { entity_kind: "lineItem", requested: 2 },
        },
      },
    } as any);
    expect(content[0].text).toContain("Dry run: bulk-creating 2 lineItem(s) would succeed");
    expect(content[0].text).not.toContain("Bulk create lineItem:");
  });
});
