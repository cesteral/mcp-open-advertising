import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices, mockBulkMutate } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockBulkMutate: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import { bulkCreateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";

/**
 * Builds a partialFailureError body that maps operation indices to error messages.
 */
function makePartialFailureError(indexToError: Record<number, string>) {
  return {
    details: [
      {
        errors: Object.entries(indexToError).map(([index, message]) => ({
          location: {
            fieldPathElements: [{ fieldName: "operations", index: Number(index) }],
          },
          message,
        })),
      },
    ],
  };
}

describe("gads_bulk_create_entities — partial failure parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSessionServices.mockReturnValue({
      gadsService: { bulkMutate: mockBulkMutate },
    });
  });

  it("all succeed — successCount matches item count", async () => {
    mockBulkMutate.mockResolvedValue({
      results: [
        { resourceName: "customers/123/campaigns/100" },
        { resourceName: "customers/123/campaigns/200" },
      ],
    });

    const result = await bulkCreateEntitiesLogic(
      { entityType: "campaign", customerId: "1234567890", items: [{ name: "A" }, { name: "B" }] },
      {} as any,
      { sessionId: "test-session" } as any
    );

    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(true);
  });

  it("all fail — all results have success=false with correct messages", async () => {
    mockBulkMutate.mockResolvedValue({
      results: [{}, {}],
      partialFailureError: makePartialFailureError({
        0: "Budget required",
        1: "Name missing",
      }),
    });

    const result = await bulkCreateEntitiesLogic(
      {
        entityType: "campaign",
        customerId: "1234567890",
        items: [{ name: "Campaign A" }, { name: "Campaign B" }],
      },
      {} as any,
      { sessionId: "test-session" } as any
    );

    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(2);
    expect(result.results[0]).toMatchObject({ success: false, error: "Budget required" });
    expect(result.results[1]).toMatchObject({ success: false, error: "Name missing" });
  });

  it("first item fails, rest succeed", async () => {
    mockBulkMutate.mockResolvedValue({
      results: [
        {},
        { resourceName: "customers/123/campaigns/456" },
        { resourceName: "customers/123/campaigns/789" },
      ],
      partialFailureError: makePartialFailureError({ 0: "Invalid campaign type" }),
    });

    const result = await bulkCreateEntitiesLogic(
      {
        entityType: "campaign",
        customerId: "1234567890",
        items: [{ name: "Bad" }, { name: "Good B" }, { name: "Good C" }],
      },
      {} as any,
      { sessionId: "test-session" } as any
    );

    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(result.results[0]).toMatchObject({ success: false, error: "Invalid campaign type" });
    expect(result.results[1].success).toBe(true);
    expect((result.results[1] as any).entity?.resourceName).toBe("customers/123/campaigns/456");
    expect(result.results[2].success).toBe(true);
  });

  it("last item fails, rest succeed", async () => {
    mockBulkMutate.mockResolvedValue({
      results: [
        { resourceName: "customers/123/campaigns/100" },
        { resourceName: "customers/123/campaigns/200" },
        {},
      ],
      partialFailureError: makePartialFailureError({ 2: "Status conflict" }),
    });

    const result = await bulkCreateEntitiesLogic(
      {
        entityType: "campaign",
        customerId: "1234567890",
        items: [{ name: "A" }, { name: "B" }, { name: "C" }],
      },
      {} as any,
      { sessionId: "test-session" } as any
    );

    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(true);
    expect(result.results[2]).toMatchObject({ success: false, error: "Status conflict" });
  });
});
