import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual("@cesteral/shared");
  return {
    ...actual,
    resolveSessionServicesFromStore: vi.fn(),
  };
});

import { resolveSessionServicesFromStore } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import {
  duplicateEntityLogic,
  DuplicateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/duplicate-entity.tool.js";
import type { SessionServices } from "../../src/services/session-services.js";

const mockDuplicateEntity = vi.fn();
const mockGetEntity = vi.fn();

function services(): SessionServices {
  return {
    msadsService: {
      duplicateEntity: mockDuplicateEntity,
      getEntity: mockGetEntity,
    } as any,
    msadsReportingService: {} as any,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveSession.mockReturnValue(services());
});

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("msads_duplicate_entity", () => {
  it("clones a campaign and normalizes the submitted copy into `after`", async () => {
    mockDuplicateEntity.mockResolvedValue({
      result: { CampaignIds: [555] },
      item: { Name: "Copy", Status: "Paused" },
    });

    const result = await duplicateEntityLogic(
      { entityType: "campaign", accountId: "100", entityId: "src-1" } as any,
      ctx,
      sdk
    );

    expect(mockDuplicateEntity).toHaveBeenCalledWith("campaign", "100", "src-1", undefined, ctx);
    expect((result.result as any).CampaignIds).toEqual([555]);
    expect(result.sourceEntityId).toBe("src-1");
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: "campaign",
    });
    expect(result.after?.platformEntityId).toBe("555");
    expect((result as any).before).toBeUndefined();
  });

  it("dry_run reads the source and projects the copy without creating it", async () => {
    mockGetEntity.mockResolvedValue({ entities: [{ Id: 1, Name: "Summer", Status: "Active" }] });

    const result = await duplicateEntityLogic(
      {
        entityType: "campaign",
        accountId: "100",
        entityId: "src-1",
        options: { Name: "Copy of Summer" },
        dry_run: true,
      } as any,
      ctx,
      sdk
    );

    expect(mockDuplicateEntity).not.toHaveBeenCalled();
    expect(mockGetEntity).toHaveBeenCalledWith("campaign", ["src-1"], { AccountId: 100 }, ctx);
    expect(result.dryRun).toBeDefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBe("campaign");
  });

  it("restricts the input schema to duplicable entity types", () => {
    expect(
      DuplicateEntityInputSchema.safeParse({
        entityType: "campaign",
        accountId: "a",
        entityId: "e",
      }).success
    ).toBe(true);
    expect(
      DuplicateEntityInputSchema.safeParse({ entityType: "ad", accountId: "a", entityId: "e" })
        .success
    ).toBe(false);
  });
});
