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

import {
  createEntityLogic,
  createEntityResponseFormatter,
} from "../../src/mcp-server/tools/definitions/create-entity.tool.js";
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
    expect(mockServices.msadsService.createEntity).toHaveBeenCalledWith("campaign", data, {
      requestId: "req-1",
    });
  });

  it("formats response correctly", () => {
    const output = {
      result: { CampaignIds: [111] },
      entityType: "campaign",
      timestamp: new Date().toISOString(),
      dispatchedCapability: { operation: "create", canonicalEntityKind: "campaign" },
    };

    const formatted = createEntityResponseFormatter(output);
    expect(formatted).toHaveLength(1);
    expect(formatted[0]!.text).toContain("Created campaign entity");
    expect(formatted[0]!.text).toContain("111");
  });
});

describe("msads_create_entity governance contract", () => {
  let mockServices: SessionServices;
  const ctx = { requestId: "r" } as any;
  const sdk = { sessionId: "s" } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServices = createMockServices();
    mockResolveSession.mockReturnValue(mockServices);
  });

  it("dry_run returns a symbolic post-state and does not create", async () => {
    const result = await createEntityLogic(
      {
        entityType: "campaign",
        data: {
          Campaigns: [
            {
              Name: "New Campaign",
              Status: "Paused",
              BudgetType: "DailyBudgetStandard",
              DailyBudget: 100,
            },
          ],
        },
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(mockServices.msadsService.createEntity).not.toHaveBeenCalled();
    expect(result.dryRun?.expectedPostState?.status.canonical).toBe("paused");
    expect(result.dryRun?.expectedPostState?.budget.daily?.amountMinor).toBe(10_000);
    expect(result.dispatchedCapability).toEqual({
      operation: "create",
      canonicalEntityKind: "campaign",
    });
  });

  it("execute normalizes the submitted payload into the after snapshot (no before)", async () => {
    const result = await createEntityLogic(
      {
        entityType: "campaign",
        data: {
          Campaigns: [{ Name: "New Campaign", Status: "Paused", AccountId: 789 }],
        },
      } as any,
      ctx,
      sdk
    );
    expect(mockServices.msadsService.createEntity).toHaveBeenCalledOnce();
    expect(result.after?.status.canonical).toBe("paused");
    expect(result.after?.platformEntityId).toBe("111");
    expect((result as any).before).toBeUndefined();
  });

  it("out-of-scope kind resolves canonicalEntityKind:null", async () => {
    (mockServices.msadsService.createEntity as any).mockResolvedValue({ KeywordIds: [9] });
    const result = await createEntityLogic(
      { entityType: "keyword", data: { Keywords: [{ Text: "shoes" }] } } as any,
      ctx,
      sdk
    );
    expect(result.dispatchedCapability).toEqual({ operation: "create", canonicalEntityKind: null });
    expect(result.after).toBeUndefined();
  });

  it("out-of-scope dry_run does not throw and emits no snapshot", async () => {
    (mockServices.msadsService.createEntity as any).mockClear();
    const result = await createEntityLogic(
      { entityType: "keyword", data: { Keywords: [{ Text: "shoes" }] }, dry_run: true } as any,
      ctx,
      sdk
    );
    expect(mockServices.msadsService.createEntity).not.toHaveBeenCalled();
    expect(result.dispatchedCapability).toEqual({ operation: "create", canonicalEntityKind: null });
    expect(result.dryRun).toBeDefined();
    expect(result.dryRun?.expectedPostState).toBeUndefined();
    expect(result.dryRun?.expectedStateSource).toBe("none");
  });
});
