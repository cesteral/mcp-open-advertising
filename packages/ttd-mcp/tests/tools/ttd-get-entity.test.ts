import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  GetEntityInputSchema,
  getEntityLogic,
  getEntityResponseFormatter,
} from "../../src/mcp-server/tools/definitions/get-entity.tool.js";

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

describe("getEntityLogic", () => {
  let mockTtdService: { getEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTtdService = {
      getEntity: vi.fn().mockResolvedValue({
        CampaignId: "cmp-001",
        CampaignName: "Existing Campaign",
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      ttdService: mockTtdService,
    });
  });

  it("returns the retrieved entity", async () => {
    const result = await getEntityLogic(
      {
        entityType: "campaign" as any,
        entityId: "cmp-001",
        advertiserId: "adv-123",
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(result.entity).toEqual({
      CampaignId: "cmp-001",
      CampaignName: "Existing Campaign",
    });
    expect(mockTtdService.getEntity).toHaveBeenCalledWith(
      "campaign",
      "cmp-001",
      expect.any(Object)
    );
  });
});

describe("GetEntityInputSchema", () => {
  it("requires advertiserId for campaign lookups", () => {
    const parsed = GetEntityInputSchema.safeParse({
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

  it("requires adGroupId for ad lookups", () => {
    const parsed = GetEntityInputSchema.safeParse({
      entityType: "ad",
      entityId: "ad-001",
      advertiserId: "adv-123",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain(
        'Missing required parent identifier(s) for entity type "ad"'
      );
    }
  });
});

describe("getEntityResponseFormatter", () => {
  it("renders retrieved entity output", () => {
    const text = getEntityResponseFormatter({
      entity: { CampaignId: "cmp-001" },
      timestamp: new Date().toISOString(),
    })[0].text;

    expect(text).toContain("Entity retrieved");
    expect(text).toContain('"CampaignId": "cmp-001"');
  });
});
