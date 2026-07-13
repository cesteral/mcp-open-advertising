import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  duplicateEntityLogic,
  DuplicateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/duplicate-entity.tool.js";

const mockDuplicateEntity = vi.fn();
const mockGetEntity = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveSessionServices.mockReturnValue({
    ttdService: { duplicateEntity: mockDuplicateEntity, getEntity: mockGetEntity },
  });
});

const ctx = { requestId: "req" } as any;
const sdk = { sessionId: "s" } as any;

describe("ttd_duplicate_entity", () => {
  it("clones a campaign and normalizes the new entity into `after`", async () => {
    mockDuplicateEntity.mockResolvedValue({
      CampaignId: "new-1",
      CampaignName: "Copy",
      Availability: { Availability: "Available" },
    });

    const result = await duplicateEntityLogic(
      { entityType: "campaign", entityId: "src-1" } as any,
      ctx,
      sdk
    );

    expect(mockDuplicateEntity).toHaveBeenCalledWith("campaign", "src-1", undefined, ctx);
    expect(result.newEntity.CampaignId).toBe("new-1");
    expect(result.sourceEntityId).toBe("src-1");
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: "campaign",
    });
    expect((result as any).before).toBeUndefined();
  });

  it("dry_run reads the source and projects the copy without creating it", async () => {
    mockGetEntity.mockResolvedValue({
      CampaignId: "src-1",
      CampaignName: "Summer",
      Availability: { Availability: "Available" },
    });

    const result = await duplicateEntityLogic(
      {
        entityType: "campaign",
        entityId: "src-1",
        options: { CampaignName: "Copy of Summer" },
        dry_run: true,
      } as any,
      ctx,
      sdk
    );

    expect(mockDuplicateEntity).not.toHaveBeenCalled();
    expect(mockGetEntity).toHaveBeenCalledWith("campaign", "src-1", ctx);
    expect(result.dryRun).toBeDefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBe("campaign");
  });

  it("restricts the input schema to duplicable entity types", () => {
    expect(
      DuplicateEntityInputSchema.safeParse({ entityType: "campaign", entityId: "e" }).success
    ).toBe(true);
    expect(
      DuplicateEntityInputSchema.safeParse({ entityType: "creative", entityId: "e" }).success
    ).toBe(false);
  });
});
