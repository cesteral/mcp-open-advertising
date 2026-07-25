import { beforeEach, describe, expect, it, vi, beforeAll, afterAll } from "vitest";

// These cases exercise service wiring and the governance snapshot contract on
// destructive paths, driving them with no elicitation-capable client. Since
// sweep 2026-07-25 (05-F2) the shared confirmation helper DENIES an
// irreversible delete/archive when the client advertises no elicitation
// capability, instead of allowing it unconfirmed — so they take the documented
// operator opt-out to reach the service call. The gate itself is covered by
// `@cesteral/shared`'s elicitation-helpers tests.
const __priorElicitEnv = process.env.MCP_ELICIT_DESTRUCTIVE;
beforeAll(() => {
  process.env.MCP_ELICIT_DESTRUCTIVE = "skip";
});
afterAll(() => {
  if (__priorElicitEnv === undefined) delete process.env.MCP_ELICIT_DESTRUCTIVE;
  else process.env.MCP_ELICIT_DESTRUCTIVE = __priorElicitEnv;
});

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  DeleteEntityInputSchema,
  deleteEntityLogic,
  deleteEntityResponseFormatter,
} from "../../src/mcp-server/tools/definitions/delete-entity.tool.js";

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

describe("deleteEntityLogic", () => {
  let mockTtdService: { deleteEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTtdService = {
      deleteEntity: vi.fn().mockResolvedValue(undefined),
    };

    mockResolveSessionServices.mockReturnValue({
      ttdService: mockTtdService,
    });
  });

  it("deletes an entity and returns success metadata", async () => {
    const result = await deleteEntityLogic(
      {
        entityType: "campaign" as any,
        entityId: "cmp-001",
        advertiserId: "adv-123",
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.success).toBe(true);
    expect(result.entityType).toBe("campaign");
    expect(result.entityId).toBe("cmp-001");
    expect(mockTtdService.deleteEntity).toHaveBeenCalledWith(
      "campaign",
      "cmp-001",
      expect.any(Object)
    );
  });
});

describe("DeleteEntityInputSchema", () => {
  it("requires advertiserId for campaign deletes", () => {
    const parsed = DeleteEntityInputSchema.safeParse({
      entityType: "campaign",
      entityId: "cmp-001",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain(
        'Missing required parent identifier(s) for entity type "campaign"'
      );
    }
  });
});

describe("deleteEntityResponseFormatter", () => {
  it("renders delete confirmation", () => {
    const text = deleteEntityResponseFormatter({
      confirmed: true,
      success: true,
      entityType: "campaign",
      entityId: "cmp-001",
      timestamp: new Date().toISOString(),
    })[0].text;

    expect(text).toContain("Entity deleted: campaign cmp-001");
  });
});
