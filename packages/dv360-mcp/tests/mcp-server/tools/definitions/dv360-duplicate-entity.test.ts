import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  duplicateEntityLogic,
  duplicateEntityResponseFormatter,
} from "../../../../src/mcp-server/tools/definitions/duplicate-entity.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("dv360_duplicate_entity governance contract", () => {
  let svc: {
    duplicateEntity: ReturnType<typeof vi.fn>;
    getEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      duplicateEntity: vi.fn().mockResolvedValue({
        insertionOrderId: "io-COPY-1",
        displayName: "Source IO - Copy",
        entityStatus: "ENTITY_STATUS_PAUSED",
      }),
      getEntity: vi.fn(),
    };
    mockResolveSessionServices.mockReturnValue({ dv360Service: svc });
  });

  it("dry_run reads the source and projects the PAUSED copy, no API call", async () => {
    svc.getEntity.mockResolvedValue({
      insertionOrderId: "io-SRC-1",
      displayName: "Source IO",
      entityStatus: "ENTITY_STATUS_ACTIVE",
    });

    const result = await duplicateEntityLogic(
      {
        entityType: "insertionOrder",
        advertiserId: "adv-1",
        insertionOrderId: "io-SRC-1",
        dry_run: true,
      } as any,
      ctx,
      sdk
    );

    expect(svc.duplicateEntity).not.toHaveBeenCalled();
    expect(svc.getEntity).toHaveBeenCalledWith(
      "insertionOrder",
      { advertiserId: "adv-1", insertionOrderId: "io-SRC-1" },
      ctx
    );
    expect(result.dryRun?.expectedPostState?.status.canonical).toBe("paused");
    // The copy has no entity ID yet pre-duplicate.
    expect(result.dryRun?.expectedPostState?.platformEntityId).toBe("");
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: "insertion_order",
    });
  });

  it("dry_run projects a DRAFT copy for line items (DV360 forces DRAFT)", async () => {
    svc.getEntity.mockResolvedValue({
      lineItemId: "li-SRC-1",
      displayName: "Source LI",
      entityStatus: "ENTITY_STATUS_ACTIVE",
    });

    const result = await duplicateEntityLogic(
      {
        entityType: "lineItem",
        advertiserId: "adv-1",
        lineItemId: "li-SRC-1",
        dry_run: true,
      } as any,
      ctx,
      sdk
    );

    expect(svc.getEntity).toHaveBeenCalledWith(
      "lineItem",
      { advertiserId: "adv-1", lineItemId: "li-SRC-1" },
      ctx
    );
    // ENTITY_STATUS_DRAFT canonicalizes to "unknown".
    expect(result.dryRun?.expectedPostState?.status).toEqual({
      canonical: "unknown",
      platformRaw: "ENTITY_STATUS_DRAFT",
    });
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: "line_item",
    });
  });

  it("execute re-reads the created copy by its new ID into after (no before)", async () => {
    const result = await duplicateEntityLogic(
      { entityType: "insertionOrder", advertiserId: "adv-1", insertionOrderId: "io-SRC-1" } as any,
      ctx,
      sdk
    );
    expect(svc.duplicateEntity).toHaveBeenCalledOnce();
    expect(result.after?.status.canonical).toBe("paused");
    expect(result.after?.platformEntityId).toBe("io-COPY-1");
    expect((result as any).before).toBeUndefined();
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = duplicateEntityResponseFormatter({
      duplicatedEntity: {},
      sourceEntityId: "io-SRC-1",
      entityType: "insertionOrder",
      timestamp: "2026-06-02T00:00:00.000Z",
      dispatchedCapability: { operation: "duplicate", canonicalEntityKind: "insertion_order" },
      dryRun: {
        wouldSucceed: true,
        validationErrors: [],
        validationSource: "symbolic",
        expectedStateSource: "server_symbolic_apply",
      } as any,
    });
    expect(content[0].text).toContain("Dry run: duplicating insertionOrder would succeed");
    expect(content[0].text).not.toContain("duplicated successfully");
  });
});
