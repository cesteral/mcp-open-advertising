import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("../../src/mcp-server/tools/utils/entity-mapping.js", () => ({
  getDuplicateEntityTypeEnum: vi.fn().mockReturnValue(["campaign", "adSet", "ad"]),
}));

import {
  duplicateEntityLogic,
  duplicateEntityResponseFormatter,
} from "../../src/mcp-server/tools/definitions/duplicate-entity.tool.js";

function ctx() {
  return { requestId: "req-1" } as any;
}
function sdk() {
  return { sessionId: "s-1" } as any;
}

describe("meta_duplicate_entity governance contract", () => {
  let svc: {
    duplicateEntity: ReturnType<typeof vi.fn>;
    getEntity: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      duplicateEntity: vi.fn().mockResolvedValue({ copied_campaign_id: "camp-COPY-1" }),
      getEntity: vi.fn(),
    };
    mockResolveSessionServices.mockReturnValue({ metaService: svc });
  });

  it("dry_run reads the source and projects the copy (lands PAUSED), no API call", async () => {
    svc.getEntity.mockResolvedValue({
      name: "Source Campaign",
      status: "ACTIVE",
      account_id: "act-1",
    });

    const result = await duplicateEntityLogic(
      { entityType: "campaign", entityId: "camp-SRC-1", dry_run: true } as any,
      ctx(),
      sdk()
    );

    expect(svc.duplicateEntity).not.toHaveBeenCalled();
    expect(result.dryRun?.expectedPostState?.status.canonical).toBe("paused");
    // The copy has no ID yet pre-duplicate.
    expect(result.dryRun?.expectedPostState?.platformEntityId).toBe("");
    expect(result.dryRun?.expectedPostState?.displayName).toBe("Source Campaign");
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: "campaign",
    });
  });

  it("dry_run with statusOption ACTIVE projects an active copy", async () => {
    svc.getEntity.mockResolvedValue({ name: "Src", status: "ACTIVE", account_id: "act-1" });
    const result = await duplicateEntityLogic(
      {
        entityType: "campaign",
        entityId: "camp-SRC-1",
        statusOption: "ACTIVE",
        dry_run: true,
      } as any,
      ctx(),
      sdk()
    );
    expect(result.dryRun?.expectedPostState?.status.canonical).toBe("active");
  });

  it("dry_run applies renameOptions (prefix/suffix) to the projected copy name", async () => {
    svc.getEntity.mockResolvedValue({ name: "Summer Sale", status: "ACTIVE", account_id: "act-1" });
    const result = await duplicateEntityLogic(
      {
        entityType: "campaign",
        entityId: "camp-SRC-1",
        renameOptions: { prefix: "Copy of ", suffix: " (v2)" },
        dry_run: true,
      } as any,
      ctx(),
      sdk()
    );
    // execute sends rename_options to /copies → the copy is renamed; the
    // dry-run must predict the same display name.
    expect(result.dryRun?.expectedPostState?.displayName).toBe("Copy of Summer Sale (v2)");
  });

  it("execute re-reads the created copy by its new ID into the after snapshot (no before)", async () => {
    // First getEntity call is the copy re-read (capture-snapshot).
    svc.getEntity.mockResolvedValue({
      id: "camp-COPY-1",
      name: "Source Campaign - Copy",
      status: "PAUSED",
      account_id: "act-1",
    });

    const result = await duplicateEntityLogic(
      { entityType: "campaign", entityId: "camp-SRC-1" } as any,
      ctx(),
      sdk()
    );

    expect(svc.duplicateEntity).toHaveBeenCalledOnce();
    expect(svc.getEntity).toHaveBeenCalledWith(
      "campaign",
      "camp-COPY-1",
      undefined,
      expect.any(Object)
    );
    expect(result.after?.status.canonical).toBe("paused");
    expect(result.after?.platformEntityId).toBe("camp-COPY-1");
    expect((result as any).before).toBeUndefined();
  });

  it("out-of-scope kind resolves canonicalEntityKind:null and skips snapshots", async () => {
    svc.duplicateEntity.mockResolvedValue({ id: "cr-COPY-1" });
    const result = await duplicateEntityLogic(
      { entityType: "adCreative", entityId: "cr-SRC-1" } as any,
      ctx(),
      sdk()
    );
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: null,
    });
    expect(result.after).toBeUndefined();
  });

  it("out-of-scope dry_run does not throw and emits no snapshot", async () => {
    const result = await duplicateEntityLogic(
      { entityType: "adCreative", entityId: "cr-SRC-1", dry_run: true } as any,
      ctx(),
      sdk()
    );
    expect(svc.duplicateEntity).not.toHaveBeenCalled();
    expect(result.dispatchedCapability).toEqual({
      operation: "duplicate",
      canonicalEntityKind: null,
    });
    expect(result.dryRun).toBeDefined();
    expect(result.dryRun?.expectedPostState).toBeUndefined();
    expect(result.dryRun?.expectedStateSource).toBe("none");
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = duplicateEntityResponseFormatter({
      result: {},
      entityType: "campaign",
      timestamp: "2026-06-02T00:00:00.000Z",
      dispatchedCapability: { operation: "duplicate", canonicalEntityKind: "campaign" },
      dryRun: {
        wouldSucceed: true,
        validationErrors: [],
        validationSource: "symbolic",
        expectedStateSource: "server_symbolic_apply",
      } as any,
    });
    expect(content[0].text).toContain("Dry run: duplicating campaign would succeed");
    expect(content[0].text).not.toContain("duplicated successfully");
  });
});
