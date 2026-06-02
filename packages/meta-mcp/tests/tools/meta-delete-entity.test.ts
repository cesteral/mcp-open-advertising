import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted() ensures these are available when vi.mock factories run
// ---------------------------------------------------------------------------

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("../../src/mcp-server/tools/utils/entity-mapping.js", () => ({
  getEntityTypeEnum: vi
    .fn()
    .mockReturnValue(["campaign", "adSet", "ad", "adCreative", "customAudience"]),
}));

import {
  deleteEntityLogic,
  deleteEntityResponseFormatter,
  DeleteEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/delete-entity.tool.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContext() {
  return {
    requestId: "req-123",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("deleteEntityLogic", () => {
  let mockMetaService: { deleteEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaService = {
      deleteEntity: vi.fn().mockResolvedValue({ success: true }),
    };

    mockResolveSessionServices.mockReturnValue({
      metaService: mockMetaService,
    });
  });

  it("deletes entity and returns success metadata", async () => {
    const result = await deleteEntityLogic(
      { entityType: "adCreative" as any, entityId: "creative-001" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.success).toBe(true);
    expect(result.entityId).toBe("creative-001");
    expect(result.entityType).toBe("adCreative");
    expect(result.timestamp).toBeDefined();
  });

  it("passes entityId to service", async () => {
    await deleteEntityLogic(
      { entityType: "campaign" as any, entityId: "123" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockMetaService.deleteEntity).toHaveBeenCalledOnce();
    const [entityId] = mockMetaService.deleteEntity.mock.calls[0];
    expect(entityId).toBe("123");
  });

  it("returns success false when API response has no success flag", async () => {
    mockMetaService.deleteEntity.mockResolvedValue({ error: "not found" });

    const result = await deleteEntityLogic(
      { entityType: "campaign" as any, entityId: "123" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.success).toBe(false);
  });

  it("throws when resolveSessionServices fails (no session)", async () => {
    mockResolveSessionServices.mockImplementation(() => {
      throw new Error("No session ID available.");
    });

    await expect(
      deleteEntityLogic(
        { entityType: "campaign" as any, entityId: "123" },
        createMockContext(),
        undefined
      )
    ).rejects.toThrow("No session ID available.");
  });
});

describe("deleteEntityLogic governance contract", () => {
  const campaign = {
    id: "c-1",
    name: "Spring",
    status: "PAUSED",
    account_id: "act_9",
    currency: "USD",
  };
  let svc: { deleteEntity: ReturnType<typeof vi.fn>; getEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      deleteEntity: vi.fn().mockResolvedValue({ success: true }),
      getEntity: vi.fn().mockResolvedValue(campaign),
    };
    mockResolveSessionServices.mockReturnValue({ metaService: svc });
  });

  it("dry_run returns a DryRunResult with a deleted expected post-state and does not delete", async () => {
    const result = await deleteEntityLogic(
      { entityType: "campaign" as any, entityId: "c-1", dry_run: true },
      createMockContext(),
      createMockSdkContext()
    );
    expect(svc.deleteEntity).not.toHaveBeenCalled();
    expect(result.dryRun?.validationSource).toBe("symbolic");
    expect(result.dryRun?.expectedStateSource).toBe("server_symbolic_apply");
    expect(result.dryRun?.expectedPostState?.status.canonical).toBe("deleted");
    expect(result.dispatchedCapability).toEqual({
      operation: "delete",
      canonicalEntityKind: "campaign",
    });
  });

  it("dry_run on an ACTIVE entity reports wouldSucceed:false (Meta rejects ACTIVE deletes)", async () => {
    svc.getEntity.mockResolvedValue({ ...campaign, status: "ACTIVE" });
    const result = await deleteEntityLogic(
      { entityType: "campaign" as any, entityId: "c-1", dry_run: true },
      createMockContext(),
      createMockSdkContext()
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors.map((e) => e.code)).toContain("ACTIVE_NOT_DELETABLE");
    // Still simulates a post-state (requiresSimulation honored).
    expect(result.dryRun?.expectedStateSource).toBe("server_symbolic_apply");
    expect(svc.deleteEntity).not.toHaveBeenCalled();
  });

  it("out-of-scope entity kinds resolve to canonicalEntityKind: null (not a fake kind)", async () => {
    const result = await deleteEntityLogic(
      { entityType: "adCreative" as any, entityId: "cr-1" },
      createMockContext(),
      createMockSdkContext()
    );
    expect(result.dispatchedCapability).toEqual({ operation: "delete", canonicalEntityKind: null });
    // Non-canonical delete still executes (and is token-gated under enforce).
    expect(svc.deleteEntity).toHaveBeenCalledOnce();
    expect(result.before).toBeUndefined();
    expect(result.after).toBeUndefined();
  });

  it("execute captures before (live) and after (deleted) snapshots + dispatchedCapability", async () => {
    const result = await deleteEntityLogic(
      { entityType: "campaign" as any, entityId: "c-1" },
      createMockContext(),
      createMockSdkContext()
    );
    expect(svc.deleteEntity).toHaveBeenCalledOnce();
    expect(result.before?.status.canonical).toBe("paused");
    expect(result.after?.status.canonical).toBe("deleted");
    expect(result.dispatchedCapability.operation).toBe("delete");
    expect(result.dispatchedCapability.canonicalEntityKind).toBe("campaign");
  });

  it("dispatchedCapability is present even when the user declines", async () => {
    // No elicitInput → confirmation auto-passes; force a decline via a stubbed sdk.
    const declineSdk = {
      sessionId: "s",
      elicitInput: vi.fn().mockResolvedValue({ action: "decline" }),
    } as any;
    const result = await deleteEntityLogic(
      { entityType: "campaign" as any, entityId: "c-1" },
      createMockContext(),
      declineSdk
    );
    expect(result.confirmed).toBe(false);
    expect(result.success).toBe(false);
    expect(svc.deleteEntity).not.toHaveBeenCalled();
    expect(result.dispatchedCapability.operation).toBe("delete");
  });
});

describe("deleteEntityResponseFormatter", () => {
  it("shows success message", () => {
    const result = {
      confirmed: true,
      success: true,
      entityId: "123",
      entityType: "campaign",
      timestamp: new Date().toISOString(),
    };

    const content = deleteEntityResponseFormatter(result);

    expect(content).toHaveLength(1);
    expect((content[0] as any).type).toBe("text");
    expect((content[0] as any).text).toContain("campaign 123 deleted successfully");
  });

  it("shows unexpected response message on failure", () => {
    const result = {
      confirmed: true,
      success: false,
      entityId: "123",
      entityType: "campaign",
      timestamp: new Date().toISOString(),
    };

    const content = deleteEntityResponseFormatter(result);

    expect((content[0] as any).text).toContain("deletion returned unexpected response");
  });
});

describe("DeleteEntityInputSchema validation", () => {
  it("requires entityId", () => {
    const result = DeleteEntityInputSchema.safeParse({
      entityType: "campaign",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("entityId"))).toBe(true);
    }
  });

  it("requires entityType", () => {
    const result = DeleteEntityInputSchema.safeParse({
      entityId: "123",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid input", () => {
    const result = DeleteEntityInputSchema.safeParse({
      entityType: "adCreative",
      entityId: "123456789",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty entityId", () => {
    const result = DeleteEntityInputSchema.safeParse({
      entityType: "campaign",
      entityId: "",
    });
    expect(result.success).toBe(false);
  });
});
