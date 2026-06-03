import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  bulkCreateEntitiesLogic,
  bulkCreateEntitiesResponseFormatter,
  BulkCreateEntitiesOutputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

const baseInput = {
  entityType: "adGroup",
  items: [
    { Name: "A", CampaignId: 123 },
    { Name: "B", CampaignId: 123 },
  ],
};

describe("msads_bulk_create_entities governance contract (effect class)", () => {
  let svc: { bulkCreateEntities: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      bulkCreateEntities: vi.fn().mockResolvedValue([{ Id: 1 }, { Id: 2 }]),
    };
    mockResolveSessionServices.mockReturnValue({ msadsService: svc });
  });

  it("dry_run returns a symbolic effect preview, no API call", async () => {
    const result = await bulkCreateEntitiesLogic({ ...baseInput, dry_run: true } as any, ctx, sdk);
    expect(svc.bulkCreateEntities).not.toHaveBeenCalled();
    expect(result.results).toEqual([]);
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "entities_created",
      summary: { entity_kind: "adGroup", requested: 2 },
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
      { ...baseInput, items: [{ Name: "A" }, {}], dry_run: true } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors[0]?.code).toBe("EMPTY_ITEM");
  });

  it("execute returns the batch effect identity + null-kind capability", async () => {
    const result = await bulkCreateEntitiesLogic({ ...baseInput } as any, ctx, sdk);
    expect(svc.bulkCreateEntities).toHaveBeenCalledOnce();
    expect(result.totalItems).toBe(2);
    expect(result.effect).toEqual({
      effectKind: "entities_created",
      summary: { entity_kind: "adGroup", requested: 2 },
    });
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(() => BulkCreateEntitiesOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = bulkCreateEntitiesResponseFormatter({
      results: [],
      entityType: "adGroup",
      totalItems: 0,
      timestamp: "2026-06-03T00:00:00.000Z",
      dispatchedCapability: { operation: "bulk_job", canonicalEntityKind: null },
      dryRun: {
        wouldSucceed: true,
        validationErrors: [],
        validationSource: "symbolic",
        expectedEffectSource: "symbolic",
        expectedEffect: {
          effectKind: "entities_created",
          summary: { entity_kind: "adGroup", requested: 2 },
        },
      },
    } as any);
    expect(content[0].text).toContain("Dry run: bulk-creating 2 adGroup(s) would succeed");
    expect(content[0].text).not.toContain("Bulk created");
  });
});
