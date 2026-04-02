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
    amazonDspService: {
      createEntity: mockCreateEntity,
    },
  } as any);
});

describe("amazonDsp_create_entity tool", () => {
  const baseContext = { requestId: "test-req" } as any;
  const baseSdkContext = { sessionId: "test-session" } as any;

  describe("createEntityLogic()", () => {
    it("creates an order successfully", async () => {
      const mockEntity = {
        orderId: "ord_999888777",
        name: "Test Order",
      };
      mockCreateEntity.mockResolvedValueOnce({ orders: [mockEntity] });

      const result = await createEntityLogic(
        {
          entityType: "campaign",
          profileId: "1234567890",
          data: {
            name: "Test Order",
            advertiserId: "adv_123",
            startDateTime: "2026-07-01T00:00:00Z",
            endDateTime: "2026-07-31T23:59:59Z",
          },
        },
        baseContext,
        baseSdkContext
      );

      expect(result.entityType).toBe("campaign");
      expect(result.timestamp).toBeDefined();
      expect(mockCreateEntity).toHaveBeenCalledWith(
        "campaign",
        {
          name: "Test Order",
          advertiserId: "adv_123",
          startDateTime: "2026-07-01T00:00:00Z",
          endDateTime: "2026-07-31T23:59:59Z",
        },
        baseContext
      );
    });

    it("creates a line item successfully", async () => {
      const mockEntity = { lineItemId: "li_999888777" };
      mockCreateEntity.mockResolvedValueOnce({ lineItems: [mockEntity] });

      const result = await createEntityLogic(
        {
          entityType: "adGroup",
          profileId: "1234567890",
          data: {
            name: "Test Line Item",
            orderId: "ord_123456789",
            advertiserId: "adv_123",
            budget: { budgetType: "DAILY", budget: 2000 },
          },
        },
        baseContext,
        baseSdkContext
      );

      expect(result.entityType).toBe("adGroup");
    });

    it("propagates errors from the service", async () => {
      mockCreateEntity.mockRejectedValueOnce(new Error("Amazon DSP API error: budget too low"));

      await expect(
        createEntityLogic(
          {
            entityType: "order",
            profileId: "1234567890",
            data: { name: "Bad Order", advertiserId: "adv_123" },
          },
          baseContext,
          baseSdkContext
        )
      ).rejects.toThrow("Amazon DSP API error: budget too low");
    });
  });

  describe("createEntityResponseFormatter()", () => {
    it("formats create result with entity type", () => {
      const result = {
        entity: { orderId: "ord_999888777", name: "Test" },
        entityType: "order",
        timestamp: "2026-03-04T00:00:00.000Z",
      };

      const formatted = createEntityResponseFormatter(result);
      expect(formatted).toHaveLength(1);
      expect((formatted[0] as any).type).toBe("text");
      expect((formatted[0] as any).text).toContain("order created successfully");
    });
  });

  describe("input schema validation", () => {
    it("accepts valid order creation payload", () => {
      const result = CreateEntityInputSchema.safeParse({
        entityType: "campaign",
        profileId: "1234567890",
        data: {
          name: "Test",
          advertiserId: "adv_123",
          startDateTime: "2026-07-01T00:00:00Z",
          endDateTime: "2026-07-31T23:59:59Z",
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty data object type", () => {
      const result = CreateEntityInputSchema.safeParse({
        entityType: "order",
        profileId: "1234567890",
        data: "not-an-object",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid entity type", () => {
      const result = CreateEntityInputSchema.safeParse({
        entityType: "invalidType",
        profileId: "1234567890",
        data: {},
      });
      expect(result.success).toBe(false);
    });
  });
});
