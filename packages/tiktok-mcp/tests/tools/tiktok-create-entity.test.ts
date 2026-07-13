import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/session-services.js", () => ({
  sessionServiceStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAuthContext: vi.fn(),
  },
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
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
  CreateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/create-entity.tool.js";

const mockCreateEntity = vi.fn();

beforeEach(() => {
  mockCreateEntity.mockReset();
  mockResolveSession.mockReturnValue({
    tiktokService: {
      createEntity: mockCreateEntity,
    },
    boundAdvertiserId: "1234567890",
  } as any);
});

describe("tiktok_create_entity tool", () => {
  const baseContext = { requestId: "test-req" } as any;
  const baseSdkContext = { sessionId: "test-session" } as any;

  describe("createEntityLogic()", () => {
    it("creates a campaign successfully", async () => {
      const mockEntity = {
        campaign_id: "1800999888777",
        campaign_name: "Test Campaign",
      };
      mockCreateEntity.mockResolvedValueOnce(mockEntity);

      const result = await createEntityLogic(
        {
          entityType: "campaign",
          advertiserId: "1234567890",
          data: {
            campaign_name: "Test Campaign",
            objective_type: "TRAFFIC",
            budget_mode: "BUDGET_MODE_DAY",
            budget: 100,
          },
        },
        baseContext,
        baseSdkContext
      );

      expect(result.entity).toEqual(mockEntity);
      expect(result.entityType).toBe("campaign");
      expect(result.timestamp).toBeDefined();
      expect(mockCreateEntity).toHaveBeenCalledWith(
        "campaign",
        {
          campaign_name: "Test Campaign",
          objective_type: "TRAFFIC",
          budget_mode: "BUDGET_MODE_DAY",
          budget: 100,
        },
        baseContext
      );
    });

    it("creates an ad group successfully", async () => {
      const mockEntity = { adgroup_id: "1700999888777" };
      mockCreateEntity.mockResolvedValueOnce(mockEntity);

      const result = await createEntityLogic(
        {
          entityType: "adGroup",
          advertiserId: "1234567890",
          data: {
            campaign_id: "1800123456789",
            adgroup_name: "Test Ad Group",
            placement_type: "PLACEMENT_TYPE_NORMAL",
            budget_mode: "BUDGET_MODE_DAY",
            budget: 50,
            schedule_type: "SCHEDULE_ALWAYS",
            optimize_goal: "CLICK",
          },
        },
        baseContext,
        baseSdkContext
      );

      expect(result.entity).toEqual(mockEntity);
      expect(result.entityType).toBe("adGroup");
    });

    it("propagates errors from the service", async () => {
      mockCreateEntity.mockRejectedValueOnce(new Error("TikTok API error: budget too low"));

      await expect(
        createEntityLogic(
          {
            entityType: "campaign",
            advertiserId: "1234567890",
            data: { campaign_name: "Bad Campaign", objective_type: "TRAFFIC" },
          },
          baseContext,
          baseSdkContext
        )
      ).rejects.toThrow("TikTok API error: budget too low");
    });
  });

  describe("createEntityResponseFormatter()", () => {
    it("formats create result with entity type", () => {
      const result = {
        entity: { campaign_id: "1800999888777", campaign_name: "Test" },
        entityType: "campaign",
        timestamp: "2026-03-04T00:00:00.000Z",
      };

      const formatted = createEntityResponseFormatter(result);
      expect(formatted).toHaveLength(1);
      expect((formatted[0] as any).type).toBe("text");
      expect((formatted[0] as any).text).toContain("campaign created successfully");
      expect((formatted[0] as any).text).toContain("1800999888777");
    });
  });

  describe("input schema validation", () => {
    it("accepts valid campaign creation payload", () => {
      const result = CreateEntityInputSchema.safeParse({
        entityType: "campaign",
        advertiserId: "1234567890",
        data: {
          campaign_name: "Test",
          objective_type: "TRAFFIC",
          budget_mode: "BUDGET_MODE_DAY",
          budget: 100,
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty data object", () => {
      const result = CreateEntityInputSchema.safeParse({
        entityType: "campaign",
        advertiserId: "1234567890",
        data: "not-an-object",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid entity type", () => {
      const result = CreateEntityInputSchema.safeParse({
        entityType: "invalidType",
        advertiserId: "1234567890",
        data: {},
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("tiktok_create_entity governance contract", () => {
  const baseContext = { requestId: "r" } as any;
  const baseSdk = { sessionId: "s" } as any;

  beforeEach(() => {
    mockCreateEntity.mockReset().mockResolvedValue({
      campaign_id: "c-999",
      campaign_name: "New Campaign",
      status: "CAMPAIGN_STATUS_ENABLE",
    });
    mockResolveSession.mockReturnValue({
      tiktokService: { createEntity: mockCreateEntity },
      boundAdvertiserId: "1",
    } as any);
  });

  it("dry_run returns a symbolic post-state and does not create", async () => {
    const result = await createEntityLogic(
      {
        entityType: "campaign",
        advertiserId: "1",
        data: { campaign_name: "New Campaign", budget_mode: "BUDGET_MODE_DAY", budget: 100 },
        dry_run: true,
      } as any,
      baseContext,
      baseSdk
    );
    expect(mockCreateEntity).not.toHaveBeenCalled();
    expect(result.dryRun?.expectedStateSource).toBe("server_symbolic_apply");
    expect(result.dispatchedCapability).toEqual({
      operation: "create",
      canonicalEntityKind: "campaign",
    });
  });

  it("execute normalizes the created entity into the after snapshot (no before)", async () => {
    const result = await createEntityLogic(
      { entityType: "campaign", advertiserId: "1", data: { campaign_name: "New Campaign" } } as any,
      baseContext,
      baseSdk
    );
    expect(mockCreateEntity).toHaveBeenCalledOnce();
    expect(result.after?.status.canonical).toBe("active");
    expect((result as any).before).toBeUndefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBe("campaign");
  });

  it("out-of-scope kind resolves canonicalEntityKind:null", async () => {
    mockCreateEntity.mockResolvedValue({ id: "x" });
    const result = await createEntityLogic(
      { entityType: "creative", advertiserId: "1", data: {} } as any,
      baseContext,
      baseSdk
    );
    expect(result.dispatchedCapability).toEqual({ operation: "create", canonicalEntityKind: null });
    expect(result.after).toBeUndefined();
  });

  it("out-of-scope dry_run does not throw and emits no snapshot", async () => {
    mockCreateEntity.mockClear();
    const result = await createEntityLogic(
      { entityType: "creative", advertiserId: "1", data: {}, dry_run: true } as any,
      baseContext,
      baseSdk
    );
    expect(mockCreateEntity).not.toHaveBeenCalled();
    expect(result.dispatchedCapability).toEqual({ operation: "create", canonicalEntityKind: null });
    expect(result.dryRun).toBeDefined();
    expect(result.dryRun?.expectedPostState).toBeUndefined();
    expect(result.dryRun?.expectedStateSource).toBe("none");
  });
});
