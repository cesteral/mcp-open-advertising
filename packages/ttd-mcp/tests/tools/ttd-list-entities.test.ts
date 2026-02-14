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
  getEntityTypeEnum: vi.fn().mockReturnValue(["advertiser", "campaign", "adGroup", "ad"]),
}));

import {
  listEntitiesLogic,
  listEntitiesResponseFormatter,
} from "../../src/mcp-server/tools/definitions/list-entities.tool.js";

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

describe("listEntitiesLogic", () => {
  let mockTtdService: { listEntities: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockTtdService = {
      listEntities: vi.fn().mockResolvedValue({
        entities: [
          { CampaignId: "c1", CampaignName: "Campaign 1" },
          { CampaignId: "c2", CampaignName: "Campaign 2" },
        ],
        nextPageToken: undefined,
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      ttdService: mockTtdService,
    });
  });

  it("returns entity list with correct structure", async () => {
    const result = await listEntitiesLogic(
      { entityType: "campaign" as any },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.entities).toHaveLength(2);
    expect(result.entities[0]).toEqual({ CampaignId: "c1", CampaignName: "Campaign 1" });
    expect(result.entities[1]).toEqual({ CampaignId: "c2", CampaignName: "Campaign 2" });
    expect(result.totalCount).toBe(2);
    expect(result.timestamp).toBeDefined();
    expect(result.nextPageToken).toBeUndefined();
  });

  it("includes advertiserId in filters when provided", async () => {
    await listEntitiesLogic(
      { entityType: "campaign" as any, advertiserId: "adv-001" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockTtdService.listEntities).toHaveBeenCalledOnce();
    const [_entityType, filters] = mockTtdService.listEntities.mock.calls[0];
    expect(filters.AdvertiserId).toBe("adv-001");
  });

  it("includes campaignId in filters when provided", async () => {
    await listEntitiesLogic(
      { entityType: "adGroup" as any, advertiserId: "adv-001", campaignId: "camp-001" },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockTtdService.listEntities).toHaveBeenCalledOnce();
    const [_entityType, filters] = mockTtdService.listEntities.mock.calls[0];
    expect(filters.CampaignId).toBe("camp-001");
  });

  it("merges additional filter fields", async () => {
    await listEntitiesLogic(
      {
        entityType: "campaign" as any,
        advertiserId: "adv-001",
        filter: { CampaignName: "Test", Status: "Active" },
      },
      createMockContext(),
      createMockSdkContext()
    );

    const [_entityType, filters] = mockTtdService.listEntities.mock.calls[0];
    expect(filters.AdvertiserId).toBe("adv-001");
    expect(filters.CampaignName).toBe("Test");
    expect(filters.Status).toBe("Active");
  });

  it("throws when resolveSessionServices fails (no session)", async () => {
    mockResolveSessionServices.mockImplementation(() => {
      throw new Error("No session ID available.");
    });

    await expect(
      listEntitiesLogic(
        { entityType: "campaign" as any },
        createMockContext(),
        undefined
      )
    ).rejects.toThrow("No session ID available.");
  });

  it("passes pageToken and pageSize to service", async () => {
    await listEntitiesLogic(
      { entityType: "campaign" as any, pageToken: "25", pageSize: 50 },
      createMockContext(),
      createMockSdkContext()
    );

    const [_entityType, _filters, pageToken, pageSize] =
      mockTtdService.listEntities.mock.calls[0];
    expect(pageToken).toBe("25");
    expect(pageSize).toBe(50);
  });
});

describe("listEntitiesResponseFormatter", () => {
  it("shows entity count", () => {
    const result = {
      entities: [
        { CampaignId: "c1" },
        { CampaignId: "c2" },
      ],
      totalCount: 2,
      timestamp: new Date().toISOString(),
    };

    const content = listEntitiesResponseFormatter(result);

    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");
    expect(content[0].text).toContain("Found 2 entities");
  });

  it("shows pagination info when nextPageToken is present", () => {
    const result = {
      entities: [{ CampaignId: "c1" }],
      nextPageToken: "25",
      totalCount: 1,
      timestamp: new Date().toISOString(),
    };

    const content = listEntitiesResponseFormatter(result);

    expect(content[0].text).toContain("More results available");
    expect(content[0].text).toContain("pageToken: 25");
  });

  it("does not show pagination info when no nextPageToken", () => {
    const result = {
      entities: [{ CampaignId: "c1" }],
      totalCount: 1,
      timestamp: new Date().toISOString(),
    };

    const content = listEntitiesResponseFormatter(result);

    expect(content[0].text).not.toContain("More results available");
    expect(content[0].text).not.toContain("pageToken");
  });

  it("shows 'No entities found' when totalCount is 0", () => {
    const result = {
      entities: [],
      totalCount: 0,
      timestamp: new Date().toISOString(),
    };

    const content = listEntitiesResponseFormatter(result);

    expect(content[0].text).toContain("No entities found");
  });
});
