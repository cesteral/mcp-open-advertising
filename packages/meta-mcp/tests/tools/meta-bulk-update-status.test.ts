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
  bulkUpdateStatusLogic,
  bulkUpdateStatusResponseFormatter,
  BulkUpdateStatusInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";

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

describe("bulkUpdateStatusLogic", () => {
  let mockMetaService: { bulkUpdateStatus: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaService = {
      bulkUpdateStatus: vi.fn().mockResolvedValue({
        results: [
          { entityId: "1", success: true },
          { entityId: "2", success: true },
        ],
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      metaService: mockMetaService,
    });
  });

  it("updates status in bulk and returns result", async () => {
    const result = await bulkUpdateStatusLogic(
      {
        entityType: "campaign" as any,
        entityIds: ["1", "2"],
        status: "PAUSED",
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.results).toHaveLength(2);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.timestamp).toBeDefined();
  });

  it("returns correct counts with partial failures", async () => {
    mockMetaService.bulkUpdateStatus.mockResolvedValue({
      results: [
        { entityId: "1", success: true },
        { entityId: "2", success: false, error: "Cannot archive" },
      ],
    });

    const result = await bulkUpdateStatusLogic(
      {
        entityType: "campaign" as any,
        entityIds: ["1", "2"],
        status: "ARCHIVED",
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
  });

  it("passes entityIds and status to service", async () => {
    await bulkUpdateStatusLogic(
      {
        entityType: "adSet" as any,
        entityIds: ["a1", "a2", "a3"],
        status: "ACTIVE",
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockMetaService.bulkUpdateStatus).toHaveBeenCalledOnce();
    const [entityIds, status] = mockMetaService.bulkUpdateStatus.mock.calls[0];
    expect(entityIds).toEqual(["a1", "a2", "a3"]);
    expect(status).toBe("ACTIVE");
  });

  it("throws when resolveSessionServices fails (no session)", async () => {
    mockResolveSessionServices.mockImplementation(() => {
      throw new Error("No session ID available.");
    });

    await expect(
      bulkUpdateStatusLogic(
        {
          entityType: "campaign" as any,
          entityIds: ["1"],
          status: "PAUSED",
        },
        createMockContext(),
        undefined
      )
    ).rejects.toThrow("No session ID available.");
  });
});

describe("bulkUpdateStatusResponseFormatter", () => {
  it("shows success and failure counts", () => {
    const result = {
      results: [
        { entityId: "1", success: true },
        { entityId: "2", success: false, error: "Failed" },
      ],
      successCount: 1,
      failureCount: 1,
      timestamp: new Date().toISOString(),
    };

    const content = bulkUpdateStatusResponseFormatter(result);

    expect(content).toHaveLength(1);
    expect((content[0] as any).type).toBe("text");
    expect((content[0] as any).text).toContain("1 succeeded");
    expect((content[0] as any).text).toContain("1 failed");
  });

  it("shows all successes when no failures", () => {
    const result = {
      results: [
        { entityId: "1", success: true },
        { entityId: "2", success: true },
      ],
      successCount: 2,
      failureCount: 0,
      timestamp: new Date().toISOString(),
    };

    const content = bulkUpdateStatusResponseFormatter(result);

    expect((content[0] as any).text).toContain("2 succeeded");
    expect((content[0] as any).text).toContain("0 failed");
  });
});

describe("BulkUpdateStatusInputSchema validation", () => {
  it("requires entityIds array", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "campaign",
      status: "PAUSED",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("entityIds"))).toBe(true);
    }
  });

  it("requires at least 1 entityId", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "campaign",
      entityIds: [],
      status: "PAUSED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 50 entityIds", () => {
    const entityIds = Array.from({ length: 51 }, (_, i) => `id-${i}`);
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "campaign",
      entityIds,
      status: "PAUSED",
    });
    expect(result.success).toBe(false);
  });

  it("requires status enum value", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "campaign",
      entityIds: ["1"],
      status: "INVALID_STATUS",
    });
    expect(result.success).toBe(false);
  });

  it("accepts ACTIVE status", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "campaign",
      entityIds: ["1", "2"],
      status: "ACTIVE",
    });
    expect(result.success).toBe(true);
  });

  it("accepts PAUSED status", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "adSet",
      entityIds: ["1"],
      status: "PAUSED",
    });
    expect(result.success).toBe(true);
  });

  it("accepts ARCHIVED status", () => {
    const result = BulkUpdateStatusInputSchema.safeParse({
      entityType: "ad",
      entityIds: ["1"],
      status: "ARCHIVED",
    });
    expect(result.success).toBe(true);
  });
});
