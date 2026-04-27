import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────
const { mockResolveSessionServices, mockEnsureRequiredFieldValue } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockEnsureRequiredFieldValue: vi.fn(),
}));

vi.mock("../../../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("../../../../src/mcp-server/tools/utils/elicitation.js", () => ({
  ensureRequiredFieldValue: mockEnsureRequiredFieldValue,
}));

// ── Import AFTER mocks ─────────────────────────────────────────────────
import {
  createCustomBiddingAlgorithmLogic,
  createCustomBiddingAlgorithmResponseFormatter,
  CreateCustomBiddingAlgorithmInputSchema,
} from "../../../../src/mcp-server/tools/definitions/create-custom-bidding-algorithm.tool.js";

// ── Helpers ─────────────────────────────────────────────────────────────
function createMockContext() {
  return {
    requestId: "req-cb-1",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

// ── Tests ───────────────────────────────────────────────────────────────
describe("dv360_create_custom_bidding_algorithm", () => {
  let mockDv360Service: {
    createEntity: ReturnType<typeof vi.fn>;
    uploadCustomBiddingScript: ReturnType<typeof vi.fn>;
    createCustomBiddingScript: ReturnType<typeof vi.fn>;
    uploadCustomBiddingRules: ReturnType<typeof vi.fn>;
    createCustomBiddingRules: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDv360Service = {
      createEntity: vi.fn().mockResolvedValue({
        customBiddingAlgorithmId: "algo-123",
        displayName: "Test Algorithm",
        customBiddingAlgorithmType: "SCRIPT_BASED",
        entityStatus: "ENTITY_STATUS_ACTIVE",
        advertiserId: "adv-1",
      }),
      uploadCustomBiddingScript: vi.fn().mockResolvedValue({
        resourceName: "scripts/upload-456",
      }),
      createCustomBiddingScript: vi.fn().mockResolvedValue({
        customBiddingScriptId: "script-789",
        state: "PENDING",
      }),
      uploadCustomBiddingRules: vi.fn().mockResolvedValue({
        resourceName: "rules/upload-456",
      }),
      createCustomBiddingRules: vi.fn().mockResolvedValue({
        customBiddingAlgorithmRulesId: "rules-789",
        state: "ACCEPTED",
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      dv360Service: mockDv360Service,
    });

    // By default, ensureRequiredFieldValue returns the currentValue
    mockEnsureRequiredFieldValue.mockImplementation(({ currentValue }: { currentValue?: string }) =>
      Promise.resolve(currentValue)
    );
  });

  describe("createCustomBiddingAlgorithmLogic", () => {
    it("creates an advertiser-owned algorithm with valid params", async () => {
      const result = await createCustomBiddingAlgorithmLogic(
        {
          displayName: "Test Algorithm",
          algorithmType: "SCRIPT_BASED",
          ownerType: "advertiser",
          ownerId: "adv-1",
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.algorithm.customBiddingAlgorithmId).toBe("algo-123");
      expect(result.algorithm.displayName).toBe("Test Algorithm");
      expect(result.algorithm.customBiddingAlgorithmType).toBe("SCRIPT_BASED");
      expect(result.algorithm.entityStatus).toBe("ENTITY_STATUS_ACTIVE");
      expect(result.algorithm.advertiserId).toBe("adv-1");
      expect(result.timestamp).toBeDefined();

      expect(mockDv360Service.createEntity).toHaveBeenCalledWith(
        "customBiddingAlgorithm",
        {},
        expect.objectContaining({
          displayName: "Test Algorithm",
          customBiddingAlgorithmType: "SCRIPT_BASED",
          entityStatus: "ENTITY_STATUS_ACTIVE",
          advertiserId: "adv-1",
        }),
        expect.any(Object)
      );
    });

    it("creates a partner-owned algorithm with shared advertisers", async () => {
      mockDv360Service.createEntity.mockResolvedValueOnce({
        customBiddingAlgorithmId: "algo-partner-1",
        displayName: "Partner Algorithm",
        customBiddingAlgorithmType: "SCRIPT_BASED",
        entityStatus: "ENTITY_STATUS_ACTIVE",
        partnerId: "partner-1",
        sharedAdvertiserIds: ["adv-1", "adv-2"],
      });

      const result = await createCustomBiddingAlgorithmLogic(
        {
          displayName: "Partner Algorithm",
          algorithmType: "SCRIPT_BASED",
          ownerType: "partner",
          ownerId: "partner-1",
          sharedAdvertiserIds: ["adv-1", "adv-2"],
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.algorithm.partnerId).toBe("partner-1");
      expect(result.algorithm.sharedAdvertiserIds).toEqual(["adv-1", "adv-2"]);
      expect(result.algorithm.advertiserId).toBeUndefined();

      expect(mockDv360Service.createEntity).toHaveBeenCalledWith(
        "customBiddingAlgorithm",
        {},
        expect.objectContaining({
          partnerId: "partner-1",
          sharedAdvertiserIds: ["adv-1", "adv-2"],
        }),
        expect.any(Object)
      );
    });

    it("uploads initial script for SCRIPT_BASED algorithm", async () => {
      const result = await createCustomBiddingAlgorithmLogic(
        {
          displayName: "Script Algorithm",
          algorithmType: "SCRIPT_BASED",
          ownerType: "advertiser",
          ownerId: "adv-1",
          initialScript: "function bid(request) { return 1.0; }",
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.uploadCustomBiddingScript).toHaveBeenCalledWith(
        "algo-123",
        "function bid(request) { return 1.0; }",
        expect.any(Object)
      );
      expect(mockDv360Service.createCustomBiddingScript).toHaveBeenCalledWith(
        "algo-123",
        "scripts/upload-456",
        expect.any(Object)
      );
      expect(result.scriptUpload).toEqual({
        success: true,
        scriptId: "script-789",
        state: "PENDING",
      });
    });

    it("uploads initial rules for RULE_BASED algorithm", async () => {
      mockDv360Service.createEntity.mockResolvedValueOnce({
        customBiddingAlgorithmId: "algo-rules-1",
        displayName: "Rules Algorithm",
        customBiddingAlgorithmType: "RULE_BASED",
        entityStatus: "ENTITY_STATUS_ACTIVE",
        advertiserId: "adv-1",
      });

      const result = await createCustomBiddingAlgorithmLogic(
        {
          displayName: "Rules Algorithm",
          algorithmType: "RULE_BASED",
          ownerType: "advertiser",
          ownerId: "adv-1",
          initialRules: '{"rules": []}',
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.uploadCustomBiddingRules).toHaveBeenCalledWith(
        "algo-rules-1",
        '{"rules": []}',
        expect.any(Object)
      );
      expect(mockDv360Service.createCustomBiddingRules).toHaveBeenCalledWith(
        "algo-rules-1",
        "rules/upload-456",
        expect.any(Object)
      );
      expect(result.rulesUpload).toEqual({
        success: true,
        rulesId: "rules-789",
        state: "ACCEPTED",
      });
    });

    it("does not upload script for RULE_BASED algorithm even if initialScript provided", async () => {
      await createCustomBiddingAlgorithmLogic(
        {
          displayName: "Rules Algorithm",
          algorithmType: "RULE_BASED",
          ownerType: "advertiser",
          ownerId: "adv-1",
          initialScript: "function bid() { return 1; }",
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.uploadCustomBiddingScript).not.toHaveBeenCalled();
    });

    it("does not upload rules for SCRIPT_BASED algorithm even if initialRules provided", async () => {
      await createCustomBiddingAlgorithmLogic(
        {
          displayName: "Script Algorithm",
          algorithmType: "SCRIPT_BASED",
          ownerType: "advertiser",
          ownerId: "adv-1",
          initialRules: '{"rules": []}',
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.uploadCustomBiddingRules).not.toHaveBeenCalled();
    });

    it("handles script upload failure gracefully", async () => {
      mockDv360Service.uploadCustomBiddingScript.mockRejectedValueOnce(
        new Error("Upload quota exceeded")
      );

      const result = await createCustomBiddingAlgorithmLogic(
        {
          displayName: "Script Algorithm",
          algorithmType: "SCRIPT_BASED",
          ownerType: "advertiser",
          ownerId: "adv-1",
          initialScript: "function bid() { return 1; }",
        },
        createMockContext(),
        createMockSdkContext()
      );

      // Algorithm should still be created
      expect(result.algorithm.customBiddingAlgorithmId).toBe("algo-123");
      expect(result.scriptUpload).toEqual({
        success: false,
        error: "Upload quota exceeded",
      });
    });

    it("handles rules upload failure gracefully", async () => {
      mockDv360Service.createEntity.mockResolvedValueOnce({
        customBiddingAlgorithmId: "algo-rules-2",
        displayName: "Rules Alg",
        customBiddingAlgorithmType: "RULE_BASED",
        entityStatus: "ENTITY_STATUS_ACTIVE",
        advertiserId: "adv-1",
      });
      mockDv360Service.uploadCustomBiddingRules.mockRejectedValueOnce(
        new Error("Invalid rules format")
      );

      const result = await createCustomBiddingAlgorithmLogic(
        {
          displayName: "Rules Alg",
          algorithmType: "RULE_BASED",
          ownerType: "advertiser",
          ownerId: "adv-1",
          initialRules: "bad-content",
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.algorithm.customBiddingAlgorithmId).toBe("algo-rules-2");
      expect(result.rulesUpload).toEqual({
        success: false,
        error: "Invalid rules format",
      });
    });

    it("propagates error from createEntity", async () => {
      mockDv360Service.createEntity.mockRejectedValueOnce(new Error("Permission denied"));

      await expect(
        createCustomBiddingAlgorithmLogic(
          {
            displayName: "Test",
            algorithmType: "SCRIPT_BASED",
            ownerType: "advertiser",
            ownerId: "adv-1",
          },
          createMockContext(),
          createMockSdkContext()
        )
      ).rejects.toThrow("Permission denied");
    });

    it("throws when session services cannot be resolved", async () => {
      mockResolveSessionServices.mockImplementation(() => {
        throw new Error("No session found for sessionId: gone");
      });

      await expect(
        createCustomBiddingAlgorithmLogic(
          {
            displayName: "Test",
            algorithmType: "SCRIPT_BASED",
            ownerType: "advertiser",
            ownerId: "adv-1",
          },
          createMockContext(),
          createMockSdkContext("gone")
        )
      ).rejects.toThrow("No session found");
    });

    it("elicits displayName when not provided", async () => {
      mockEnsureRequiredFieldValue.mockImplementation(
        ({ fieldName, currentValue }: { fieldName: string; currentValue?: string }) => {
          if (fieldName === "displayName" && !currentValue) {
            return Promise.resolve("Elicited Name");
          }
          return Promise.resolve(currentValue);
        }
      );

      await createCustomBiddingAlgorithmLogic(
        {
          algorithmType: "SCRIPT_BASED",
          ownerType: "advertiser",
          ownerId: "adv-1",
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.createEntity).toHaveBeenCalledWith(
        "customBiddingAlgorithm",
        {},
        expect.objectContaining({ displayName: "Elicited Name" }),
        expect.any(Object)
      );
    });

    it("elicits ownerType and ownerId when not provided", async () => {
      mockEnsureRequiredFieldValue.mockImplementation(
        ({ fieldName, currentValue }: { fieldName: string; currentValue?: string }) => {
          if (fieldName === "ownerType" && !currentValue) {
            return Promise.resolve("advertiser");
          }
          if (fieldName === "advertiserId" && !currentValue) {
            return Promise.resolve("elicited-adv-1");
          }
          return Promise.resolve(currentValue);
        }
      );

      await createCustomBiddingAlgorithmLogic(
        {
          displayName: "Test",
          algorithmType: "SCRIPT_BASED",
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(mockDv360Service.createEntity).toHaveBeenCalledWith(
        "customBiddingAlgorithm",
        {},
        expect.objectContaining({ advertiserId: "elicited-adv-1" }),
        expect.any(Object)
      );
    });
  });

  describe("createCustomBiddingAlgorithmResponseFormatter", () => {
    it("formats advertiser-owned algorithm response", () => {
      const result = createCustomBiddingAlgorithmResponseFormatter({
        algorithm: {
          customBiddingAlgorithmId: "algo-123",
          displayName: "My Algorithm",
          customBiddingAlgorithmType: "SCRIPT_BASED",
          entityStatus: "ENTITY_STATUS_ACTIVE",
          advertiserId: "adv-1",
        },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("text");
      expect(result[0].text).toContain("algo-123");
      expect(result[0].text).toContain("My Algorithm");
      expect(result[0].text).toContain("SCRIPT_BASED");
      expect(result[0].text).toContain("Advertiser adv-1");
    });

    it("formats partner-owned algorithm with shared advertisers", () => {
      const result = createCustomBiddingAlgorithmResponseFormatter({
        algorithm: {
          customBiddingAlgorithmId: "algo-456",
          displayName: "Partner Algo",
          customBiddingAlgorithmType: "SCRIPT_BASED",
          entityStatus: "ENTITY_STATUS_ACTIVE",
          partnerId: "partner-1",
          sharedAdvertiserIds: ["adv-1", "adv-2"],
        },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("Partner partner-1");
      expect(result[0].text).toContain("adv-1, adv-2");
    });

    it("formats response with successful script upload", () => {
      const result = createCustomBiddingAlgorithmResponseFormatter({
        algorithm: {
          customBiddingAlgorithmId: "algo-123",
          displayName: "Test",
          customBiddingAlgorithmType: "SCRIPT_BASED",
          entityStatus: "ENTITY_STATUS_ACTIVE",
        },
        scriptUpload: {
          success: true,
          scriptId: "script-1",
          state: "PENDING",
        },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("Script Upload");
      expect(result[0].text).toContain("script-1");
      expect(result[0].text).toContain("PENDING");
      expect(result[0].text).toContain("being processed");
    });

    it("formats response with failed script upload", () => {
      const result = createCustomBiddingAlgorithmResponseFormatter({
        algorithm: {
          customBiddingAlgorithmId: "algo-123",
          displayName: "Test",
          customBiddingAlgorithmType: "SCRIPT_BASED",
          entityStatus: "ENTITY_STATUS_ACTIVE",
        },
        scriptUpload: {
          success: false,
          error: "Upload failed",
        },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("Failed: Upload failed");
    });

    it("formats response with successful rules upload", () => {
      const result = createCustomBiddingAlgorithmResponseFormatter({
        algorithm: {
          customBiddingAlgorithmId: "algo-123",
          displayName: "Test",
          customBiddingAlgorithmType: "RULE_BASED",
          entityStatus: "ENTITY_STATUS_ACTIVE",
        },
        rulesUpload: {
          success: true,
          rulesId: "rules-1",
          state: "ACCEPTED",
        },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("Rules Upload");
      expect(result[0].text).toContain("rules-1");
      expect(result[0].text).toContain("ACCEPTED");
    });
  });

  describe("CreateCustomBiddingAlgorithmInputSchema", () => {
    it("accepts valid input with all fields", () => {
      const parsed = CreateCustomBiddingAlgorithmInputSchema.safeParse({
        displayName: "Test Algo",
        algorithmType: "SCRIPT_BASED",
        ownerType: "advertiser",
        ownerId: "adv-1",
      });
      expect(parsed.success).toBe(true);
    });

    it("accepts minimal input (only algorithmType required)", () => {
      const parsed = CreateCustomBiddingAlgorithmInputSchema.safeParse({
        algorithmType: "RULE_BASED",
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects invalid algorithmType", () => {
      const parsed = CreateCustomBiddingAlgorithmInputSchema.safeParse({
        algorithmType: "INVALID_TYPE",
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects invalid ownerType", () => {
      const parsed = CreateCustomBiddingAlgorithmInputSchema.safeParse({
        algorithmType: "SCRIPT_BASED",
        ownerType: "invalid",
      });
      expect(parsed.success).toBe(false);
    });

    it("accepts input with initialScript", () => {
      const parsed = CreateCustomBiddingAlgorithmInputSchema.safeParse({
        algorithmType: "SCRIPT_BASED",
        initialScript: "function bid() { return 1; }",
      });
      expect(parsed.success).toBe(true);
    });

    it("accepts input with sharedAdvertiserIds", () => {
      const parsed = CreateCustomBiddingAlgorithmInputSchema.safeParse({
        algorithmType: "SCRIPT_BASED",
        ownerType: "partner",
        ownerId: "partner-1",
        sharedAdvertiserIds: ["adv-1", "adv-2"],
      });
      expect(parsed.success).toBe(true);
    });
  });
});
