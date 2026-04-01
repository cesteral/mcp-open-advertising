import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  UpdateEntityInputSchema,
  updateEntityLogic,
  updateEntityResponseFormatter,
} from "../../src/mcp-server/tools/definitions/update-entity.tool.js";

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

describe("updateEntityLogic", () => {
  let mockTtdService: { updateEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTtdService = {
      updateEntity: vi.fn().mockResolvedValue({
        CampaignId: "cmp-001",
        CampaignName: "Updated Campaign",
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      ttdService: mockTtdService,
    });
  });

  it("merges parent IDs into update payload", async () => {
    await updateEntityLogic(
      {
        entityType: "adGroup" as any,
        entityId: "ag-001",
        advertiserId: "adv-123",
        campaignId: "cmp-001",
        data: { AdGroupName: "Updated Ad Group" },
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockTtdService.updateEntity).toHaveBeenCalledWith(
      "adGroup",
      "ag-001",
      {
        AdGroupName: "Updated Ad Group",
        AdvertiserId: "adv-123",
        CampaignId: "cmp-001",
      },
      expect.any(Object)
    );
  });
});

describe("UpdateEntityInputSchema", () => {
  it("requires campaignId for adGroup updates", () => {
    const parsed = UpdateEntityInputSchema.safeParse({
      entityType: "adGroup",
      entityId: "ag-001",
      advertiserId: "adv-123",
      data: { AdGroupName: "Updated Ad Group" },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain(
        'Missing required parent identifier(s) for entity type "adGroup"'
      );
    }
  });

});

describe("updateEntityResponseFormatter", () => {
  it("renders update response", () => {
    const text = updateEntityResponseFormatter({
      entity: { CampaignId: "cmp-001" },
      timestamp: new Date().toISOString(),
    })[0].text;

    expect(text).toContain("Entity updated successfully");
    expect(text).toContain('"CampaignId": "cmp-001"');
  });
});
