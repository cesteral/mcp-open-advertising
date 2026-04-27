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
    snapchatService: {
      createEntity: mockCreateEntity,
    },
  } as any);
});

describe("snapchat_create_entity tool", () => {
  const baseContext = { requestId: "test-req" } as any;
  const baseSdkContext = { sessionId: "test-session" } as any;

  describe("createEntityLogic()", () => {
    it("creates a campaign successfully", async () => {
      const mockEntity = {
        id: "1800999888777",
        name: "Test Campaign",
      };
      mockCreateEntity.mockResolvedValueOnce(mockEntity);

      const result = await createEntityLogic(
        {
          entityType: "campaign",
          adAccountId: "1234567890",
          data: {
            name: "Test Campaign",
            objective: "WEB_CONVERSION",
            status: "ACTIVE",
            daily_budget_micro: 100000000,
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
        { adAccountId: "1234567890" },
        {
          name: "Test Campaign",
          objective: "WEB_CONVERSION",
          status: "ACTIVE",
          daily_budget_micro: 100000000,
        },
        baseContext
      );
    });

    it("creates an ad group successfully", async () => {
      const mockEntity = { id: "1700999888777" };
      mockCreateEntity.mockResolvedValueOnce(mockEntity);

      const result = await createEntityLogic(
        {
          entityType: "adGroup",
          adAccountId: "1234567890",
          campaignId: "1800123456789",
          data: {
            name: "Test Ad Group",
            type: "SNAP_ADS",
            placement: "CONTENT",
            daily_budget_micro: 50000000,
            status: "ACTIVE",
            optimization_goal: "IMPRESSIONS",
            targeting: { geos: [{ country_code: "us" }] },
          },
        },
        baseContext,
        baseSdkContext
      );

      expect(result.entity).toEqual(mockEntity);
      expect(result.entityType).toBe("adGroup");
    });

    it("propagates errors from the service", async () => {
      mockCreateEntity.mockRejectedValueOnce(new Error("Snapchat API error: budget too low"));

      await expect(
        createEntityLogic(
          {
            entityType: "campaign",
            adAccountId: "1234567890",
            data: { name: "Bad Campaign", status: "ACTIVE" },
          },
          baseContext,
          baseSdkContext
        )
      ).rejects.toThrow("Snapchat API error: budget too low");
    });
  });

  describe("createEntityResponseFormatter()", () => {
    it("formats create result with entity type", () => {
      const result = {
        entity: { id: "1800999888777", name: "Test" },
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
        adAccountId: "1234567890",
        data: {
          name: "Test",
          status: "ACTIVE",
          daily_budget_micro: 100000000,
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty data object", () => {
      const result = CreateEntityInputSchema.safeParse({
        entityType: "campaign",
        adAccountId: "1234567890",
        data: "not-an-object",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid entity type", () => {
      const result = CreateEntityInputSchema.safeParse({
        entityType: "invalidType",
        adAccountId: "1234567890",
        data: {},
      });
      expect(result.success).toBe(false);
    });
  });
});
