import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  manageSeedLogic,
  ManageSeedInputSchema,
} from "../../src/mcp-server/tools/definitions/seed.tool.js";

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

describe("ttd_manage_seed tool", () => {
  let mockTtdService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTtdService = {
      graphqlQuery: vi.fn(),
    };

    mockResolveSessionServices.mockReturnValue({
      ttdService: mockTtdService,
    });
  });

  // ── create ──

  describe("create operation", () => {
    it("calls graphqlQuery with SeedCreate mutation and returns seed id", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          seedCreate: {
            data: { id: "seed123", name: "My Seed", status: "Active", quality: "High" },
            userErrors: [],
          },
        },
      });

      const result = await manageSeedLogic(
        {
          operation: "create",
          advertiserId: "adv456",
          data: { name: "My Seed", description: "Test seed" },
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.operation).toBe("create");
      expect(result.seedId).toBe("seed123");
      expect(result.result).toMatchObject({ id: "seed123", name: "My Seed" });
      expect(result.timestamp).toBeDefined();

      expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
        expect.stringContaining("SeedCreate"),
        {
          input: {
            advertiserId: "adv456",
            name: "My Seed",
            description: "Test seed",
          },
        },
        expect.any(Object)
      );
    });
  });

  // ── update ──

  describe("update operation", () => {
    it("calls graphqlQuery with SeedUpdate mutation", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          seedUpdate: {
            data: { id: "seed123", name: "Updated Seed", status: "Active" },
            userErrors: [],
          },
        },
      });

      const result = await manageSeedLogic(
        {
          operation: "update",
          seedId: "seed123",
          data: { name: "Updated Seed" },
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.operation).toBe("update");
      expect(result.seedId).toBe("seed123");
      expect(result.result).toMatchObject({ id: "seed123", name: "Updated Seed" });

      expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
        expect.stringContaining("SeedUpdate"),
        {
          input: {
            id: "seed123",
            name: "Updated Seed",
          },
        },
        expect.any(Object)
      );
    });
  });

  // ── get ──

  describe("get operation", () => {
    it("calls graphqlQuery with GetSeed query and returns seed data", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          seed: {
            id: "seed123",
            name: "My Seed",
            status: "Active",
            quality: "High",
            activeSeedIdCount: 50000,
          },
        },
      });

      const result = await manageSeedLogic(
        {
          operation: "get",
          seedId: "seed123",
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.operation).toBe("get");
      expect(result.seedId).toBe("seed123");
      expect(result.result).toMatchObject({ id: "seed123", activeSeedIdCount: 50000 });

      expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
        expect.stringContaining("GetSeed"),
        { id: "seed123" },
        expect.any(Object)
      );
    });
  });

  // ── set_default_advertiser ──

  describe("set_default_advertiser operation", () => {
    it("calls graphqlQuery with AdvertiserSetDefaultSeed mutation", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          advertiserSetDefaultSeed: {
            data: { id: "adv456" },
            userErrors: [],
          },
        },
      });

      const result = await manageSeedLogic(
        {
          operation: "set_default_advertiser",
          advertiserId: "adv456",
          seedId: "seed123",
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.operation).toBe("set_default_advertiser");
      expect(result.result).toMatchObject({ id: "adv456" });

      expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
        expect.stringContaining("AdvertiserSetDefaultSeed"),
        {
          input: {
            advertiserId: "adv456",
            seedId: "seed123",
          },
        },
        expect.any(Object)
      );
    });
  });

  // ── attach_to_campaign ──

  describe("attach_to_campaign operation", () => {
    it("calls graphqlQuery with CampaignUpdateSeed mutation", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          campaignUpdateSeed: {
            data: { id: "camp789" },
            userErrors: [],
          },
        },
      });

      const result = await manageSeedLogic(
        {
          operation: "attach_to_campaign",
          campaignId: "camp789",
          seedId: "seed123",
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.operation).toBe("attach_to_campaign");
      expect(result.result).toMatchObject({ id: "camp789" });

      expect(mockTtdService.graphqlQuery).toHaveBeenCalledWith(
        expect.stringContaining("CampaignUpdateSeed"),
        {
          input: {
            campaignId: "camp789",
            seedId: "seed123",
          },
        },
        expect.any(Object)
      );
    });
  });

  // ── Zod validation ──

  describe("input schema validation", () => {
    it("fails validation when create is missing advertiserId", () => {
      const result = ManageSeedInputSchema.safeParse({
        operation: "create",
        data: { name: "Seed" },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes("advertiserId"));
        expect(issue).toBeDefined();
      }
    });

    it("fails validation when update is missing seedId", () => {
      const result = ManageSeedInputSchema.safeParse({
        operation: "update",
        data: { name: "Updated" },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes("seedId"));
        expect(issue).toBeDefined();
      }
    });

    it("fails validation when get is missing seedId", () => {
      const result = ManageSeedInputSchema.safeParse({
        operation: "get",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes("seedId"));
        expect(issue).toBeDefined();
      }
    });
  });

  // ── Error handling ──

  describe("error handling", () => {
    it("throws when top-level GraphQL errors are returned", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        errors: [
          {
            message: "AUTHENTICATION_FAILURE",
            extensions: { code: "AUTHENTICATION_FAILURE" },
          },
        ],
      });

      await expect(
        manageSeedLogic(
          {
            operation: "get",
            seedId: "seed123",
          },
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow();
    });

    it("throws when mutation userErrors is non-empty", async () => {
      mockTtdService.graphqlQuery.mockResolvedValueOnce({
        data: {
          seedCreate: {
            data: null,
            userErrors: [{ field: "name", message: "Name is required" }],
          },
        },
      });

      await expect(
        manageSeedLogic(
          {
            operation: "create",
            advertiserId: "adv456",
            data: { name: "" },
          },
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow("Name is required");
    });
  });

  // ── Session resolution ──

  describe("session resolution", () => {
    it("throws when resolveSessionServices fails", async () => {
      mockResolveSessionServices.mockImplementation(() => {
        throw new Error("No session ID available");
      });

      await expect(
        manageSeedLogic(
          {
            operation: "get",
            seedId: "seed123",
          },
          createMockContext()
        )
      ).rejects.toThrow("No session ID available");
    });
  });
});
