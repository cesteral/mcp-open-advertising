import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@cesteral/shared", async () => {
  const actual = await vi.importActual("@cesteral/shared");
  return {
    ...actual,
    resolveSessionServicesFromStore: vi.fn(),
  };
});

import { resolveSessionServicesFromStore } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import { createEntityLogic, createEntityResponseFormatter } from "../../src/mcp-server/tools/definitions/create-entity.tool.js";
import type { SessionServices } from "../../src/services/session-services.js";

function createMockServices(): SessionServices {
  return {
    msadsService: {
      listEntities: vi.fn(),
      getEntity: vi.fn(),
      createEntity: vi.fn().mockResolvedValue({
        CampaignIds: [111, 222],
        PartialErrors: null,
      }),
      updateEntity: vi.fn(),
      deleteEntity: vi.fn(),
      bulkCreateEntities: vi.fn(),
      bulkUpdateEntities: vi.fn(),
      bulkUpdateStatus: vi.fn(),
      adjustBids: vi.fn(),
      executeOperation: vi.fn(),
    } as any,
    msadsReportingService: {} as any,
  };
}

describe("msads_create_entity", () => {
  let mockServices: SessionServices;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServices = createMockServices();
    mockResolveSession.mockReturnValue(mockServices);
  });

  it("creates an entity and returns result", async () => {
    const data = {
      Campaigns: [{ Name: "New Campaign", BudgetType: "DailyBudgetStandard" }],
    };

    const result = await createEntityLogic(
      { entityType: "campaign", data },
      { requestId: "req-1" }
    );

    expect(result.entityType).toBe("campaign");
    expect(result.result.CampaignIds).toEqual([111, 222]);
    expect(mockServices.msadsService.createEntity).toHaveBeenCalledWith(
      "campaign",
      data,
      { requestId: "req-1" }
    );
  });

  it("formats response correctly", () => {
    const output = {
      result: { CampaignIds: [111] },
      entityType: "campaign",
      timestamp: new Date().toISOString(),
    };

    const formatted = createEntityResponseFormatter(output);
    expect(formatted).toHaveLength(1);
    expect(formatted[0]!.text).toContain("Created campaign entity");
    expect(formatted[0]!.text).toContain("111");
  });
});
