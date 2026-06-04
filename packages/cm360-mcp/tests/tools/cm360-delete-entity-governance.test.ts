import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices, mockElicitDelete } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockElicitDelete: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, elicitDeleteConfirmation: mockElicitDelete };
});

import {
  deleteEntityLogic,
  deleteEntityResponseFormatter,
  DeleteEntityOutputSchema,
} from "../../src/mcp-server/tools/definitions/delete-entity.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;
const baseInput = { profileId: "123456", entityType: "floodlightActivity", entityId: "345678" };

describe("cm360_delete_entity governance contract (effect class)", () => {
  let cm360Service: { deleteEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    cm360Service = { deleteEntity: vi.fn().mockResolvedValue(undefined) };
    mockResolveSessionServices.mockReturnValue({ cm360Service });
    mockElicitDelete.mockResolvedValue(true);
  });

  it("dry_run returns a symbolic effect preview, no confirmation or API call", async () => {
    const result = await deleteEntityLogic({ ...baseInput, dry_run: true } as any, ctx, sdk);
    expect(mockElicitDelete).not.toHaveBeenCalled();
    expect(cm360Service.deleteEntity).not.toHaveBeenCalled();
    expect(result.deleted).toBe(false);
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "entity_deleted",
      summary: { entity_kind: "floodlightActivity", entity_id: "345678" },
    });
    expect(result.dispatchedCapability).toEqual({ operation: "manage", canonicalEntityKind: null });
    expect(() => DeleteEntityOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
  });

  it("execute emits the effect identity + null-kind capability", async () => {
    const result = await deleteEntityLogic({ ...baseInput } as any, ctx, sdk);
    expect(cm360Service.deleteEntity).toHaveBeenCalledOnce();
    expect(result.deleted).toBe(true);
    expect(result.effect).toEqual({
      effectKind: "entity_deleted",
      summary: { entity_kind: "floodlightActivity", entity_id: "345678" },
    });
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(() => DeleteEntityOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
  });

  it("declined confirmation reports the capability, no effect", async () => {
    mockElicitDelete.mockResolvedValue(false);
    const result = await deleteEntityLogic({ ...baseInput } as any, ctx, sdk);
    expect(cm360Service.deleteEntity).not.toHaveBeenCalled();
    expect(result.confirmed).toBe(false);
    expect(result.effect).toBeUndefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = deleteEntityResponseFormatter({
      confirmed: true,
      deleted: false,
      entityType: "floodlightActivity",
      entityId: "345678",
      timestamp: "2026-06-04T00:00:00.000Z",
      dispatchedCapability: { operation: "manage", canonicalEntityKind: null },
      dryRun: {
        wouldSucceed: true,
        validationErrors: [],
        validationSource: "symbolic",
        expectedEffectSource: "symbolic",
        expectedEffect: {
          effectKind: "entity_deleted",
          summary: { entity_kind: "floodlightActivity", entity_id: "345678" },
        },
      },
    } as any);
    expect(content[0].text).toContain("Dry run: deleting floodlightActivity 345678 would succeed");
    expect(content[0].text).not.toContain("deleted successfully");
  });
});
