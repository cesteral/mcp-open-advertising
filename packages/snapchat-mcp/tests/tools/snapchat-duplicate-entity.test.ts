import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/session-services.js", () => ({
  sessionServiceStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAuthContext: vi.fn(),
  },
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
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

const mockDuplicateEntity = vi.fn();
const mockGetEntity = vi.fn();

beforeEach(() => {
  mockDuplicateEntity.mockReset();
  mockGetEntity.mockReset();
  mockResolveSession.mockReturnValue({
    snapchatService: {
      duplicateEntity: mockDuplicateEntity,
      getEntity: mockGetEntity,
    },
  } as any);
});

const ctx = { requestId: "req" } as any;
const sdk = { sessionId: "s" } as any;

describe("snapchat_duplicate_entity", () => {
  it("clones a campaign via the service and normalizes the new entity into `after`", async () => {
    mockDuplicateEntity.mockResolvedValue({ id: "new-1", name: "Copy", status: "PAUSED" });

    const result = await duplicateEntityLogic(
      { entityType: "campaign", adAccountId: "acct-1", entityId: "src-1" } as any,
      ctx,
      sdk
    );

    expect(mockDuplicateEntity).toHaveBeenCalledWith(
      "campaign",
      { adAccountId: "acct-1" },
      "src-1",
      undefined,
      ctx
    );
    expect(result.newEntity).toEqual({ id: "new-1", name: "Copy", status: "PAUSED" });
    expect(result.sourceEntityId).toBe("src-1");
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: "campaign",
    });
    expect(result.after?.platformEntityId).toBe("new-1");
    expect((result as any).before).toBeUndefined();
  });

  it("dry_run reads the source and projects the copy without creating it", async () => {
    mockGetEntity.mockResolvedValue({ id: "src-1", name: "Summer", status: "ACTIVE" });

    const result = await duplicateEntityLogic(
      {
        entityType: "campaign",
        adAccountId: "acct-1",
        entityId: "src-1",
        options: { name: "Copy of Summer" },
        dry_run: true,
      } as any,
      ctx,
      sdk
    );

    expect(mockDuplicateEntity).not.toHaveBeenCalled();
    expect(mockGetEntity).toHaveBeenCalledWith("campaign", "src-1", ctx);
    expect(result.dryRun).toBeDefined();
    expect(result.dryRun?.wouldSucceed).toBe(true);
    expect(result.dispatchedCapability.canonicalEntityKind).toBe("campaign");
  });

  it("only allows duplicable entity types in the input schema", () => {
    expect(
      DuplicateEntityInputSchema.safeParse({
        entityType: "campaign",
        adAccountId: "a",
        entityId: "e",
      }).success
    ).toBe(true);
    expect(
      DuplicateEntityInputSchema.safeParse({
        entityType: "ad",
        adAccountId: "a",
        entityId: "e",
      }).success
    ).toBe(false);
  });
});
