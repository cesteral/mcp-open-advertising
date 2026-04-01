import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  CreateEntityInputSchema,
  createEntityLogic,
  createEntityResponseFormatter,
} from "../../src/mcp-server/tools/definitions/create-entity.tool.js";

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

describe("createEntityLogic", () => {
  let mockTtdService: { createEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTtdService = {
      createEntity: vi.fn().mockResolvedValue({
        CampaignId: "cmp-001",
        CampaignName: "Test Campaign",
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      ttdService: mockTtdService,
    });
  });

  it("passes merged parent IDs to the service", async () => {
    await createEntityLogic(
      {
        entityType: "campaign" as any,
        advertiserId: "adv-123",
        data: { CampaignName: "Test Campaign" },
      },
      createMockContext(),
      createMockSdkContext()
    );

    expect(mockTtdService.createEntity).toHaveBeenCalledWith(
      "campaign",
      {
        CampaignName: "Test Campaign",
        AdvertiserId: "adv-123",
      },
      expect.any(Object)
    );
  });

  it("throws when no session services are available", async () => {
    mockResolveSessionServices.mockImplementation(() => {
      throw new Error("No session ID available.");
    });

    await expect(
      createEntityLogic(
        {
          entityType: "campaign" as any,
          advertiserId: "adv-123",
          data: { CampaignName: "Test Campaign" },
        },
        createMockContext(),
        undefined
      )
    ).rejects.toThrow("No session ID available.");
  });
});

describe("CreateEntityInputSchema", () => {
  it("rejects advertiser creation when top-level partnerId is blank", () => {
    const parsed = CreateEntityInputSchema.safeParse({
      entityType: "advertiser",
      partnerId: "   ",
      data: { AdvertiserName: "Test Advertiser" },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.includes("partnerId"))).toBe(true);
    }
  });

  it("requires advertiserId for campaign", () => {
    const parsed = CreateEntityInputSchema.safeParse({
      entityType: "campaign",
      data: { CampaignName: "Test Campaign" },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain(
        'Missing required parent identifier(s) for entity type "campaign"'
      );
    }
  });

  it("requires campaignId for adGroup", () => {
    const parsed = CreateEntityInputSchema.safeParse({
      entityType: "adGroup",
      advertiserId: "adv-123",
      data: { AdGroupName: "Prospecting" },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain(
        'Missing required parent identifier(s) for entity type "adGroup"'
      );
    }
  });

  it("accepts adGroup input when all parent IDs are provided", () => {
    const parsed = CreateEntityInputSchema.parse({
      entityType: "adGroup",
      advertiserId: "adv-123",
      campaignId: "cmp-456",
      data: { AdGroupName: "Prospecting" },
    });

    expect(parsed.entityType).toBe("adGroup");
  });

  it("accepts advertiser creation when payload PartnerId is non-blank", () => {
    const parsed = CreateEntityInputSchema.safeParse({
      entityType: "advertiser",
      partnerId: "   ",
      data: { AdvertiserName: "Test Advertiser", PartnerId: "partner-123" },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("createEntityResponseFormatter", () => {
  it("renders created entity output", () => {
    const text = createEntityResponseFormatter({
      entity: { CampaignId: "cmp-001" },
      timestamp: new Date().toISOString(),
    })[0].text;

    expect(text).toContain("Entity created successfully");
    expect(text).toContain('"CampaignId": "cmp-001"');
  });
});
