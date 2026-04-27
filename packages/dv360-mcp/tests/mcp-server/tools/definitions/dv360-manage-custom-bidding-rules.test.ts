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
  manageCustomBiddingRulesLogic,
  manageCustomBiddingRulesResponseFormatter,
  ManageCustomBiddingRulesInputSchema,
} from "../../../../src/mcp-server/tools/definitions/manage-custom-bidding-rules.tool.js";

// ── Helpers ─────────────────────────────────────────────────────────────
function createMockContext() {
  return {
    requestId: "req-rules-1",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

// ── Tests ───────────────────────────────────────────────────────────────
describe("dv360_manage_custom_bidding_rules", () => {
  let mockDv360Service: {
    uploadCustomBiddingRules: ReturnType<typeof vi.fn>;
    createCustomBiddingRules: ReturnType<typeof vi.fn>;
    listCustomBiddingRules: ReturnType<typeof vi.fn>;
    getCustomBiddingRules: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDv360Service = {
      uploadCustomBiddingRules: vi.fn().mockResolvedValue({
        resourceName: "rules/upload-1",
      }),
      createCustomBiddingRules: vi.fn().mockResolvedValue({
        customBiddingAlgorithmRulesId: "rules-1",
        createTime: "2025-01-01T00:00:00Z",
        active: true,
        state: "ACCEPTED",
      }),
      listCustomBiddingRules: vi.fn().mockResolvedValue({
        rules: [
          {
            customBiddingAlgorithmRulesId: "rules-1",
            createTime: "2025-01-01T00:00:00Z",
            active: true,
            state: "ACCEPTED",
          },
          {
            customBiddingAlgorithmRulesId: "rules-2",
            createTime: "2024-12-01T00:00:00Z",
            active: false,
            state: "ACCEPTED",
          },
        ],
      }),
      getCustomBiddingRules: vi.fn().mockResolvedValue({
        customBiddingAlgorithmRulesId: "rules-1",
        createTime: "2025-01-01T00:00:00Z",
        active: true,
        state: "ACCEPTED",
      }),
    };

    mockResolveSessionServices.mockReturnValue({
      dv360Service: mockDv360Service,
    });

    mockEnsureRequiredFieldValue.mockImplementation(({ currentValue }: { currentValue?: string }) =>
      Promise.resolve(currentValue)
    );
  });

  describe("manageCustomBiddingRulesLogic", () => {
    describe("upload action", () => {
      it("uploads rules content and creates rules resource", async () => {
        const result = await manageCustomBiddingRulesLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "upload",
            rulesContent: '{"rules": []}',
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(mockDv360Service.uploadCustomBiddingRules).toHaveBeenCalledWith(
          "algo-1",
          '{"rules": []}',
          expect.any(Object)
        );
        expect(mockDv360Service.createCustomBiddingRules).toHaveBeenCalledWith(
          "algo-1",
          "rules/upload-1",
          expect.any(Object)
        );
        expect(result.action).toBe("upload");
        expect(result.customBiddingAlgorithmId).toBe("algo-1");
        expect(result.rules).toEqual(
          expect.objectContaining({
            customBiddingAlgorithmRulesId: "rules-1",
            state: "ACCEPTED",
            active: true,
          })
        );
      });

      it("throws when rulesContent is missing for upload", async () => {
        await expect(
          manageCustomBiddingRulesLogic(
            {
              customBiddingAlgorithmId: "algo-1",
              action: "upload",
            },
            createMockContext(),
            createMockSdkContext()
          )
        ).rejects.toThrow("rulesContent is required for upload action");
      });

      it("includes error details for rejected rules", async () => {
        mockDv360Service.createCustomBiddingRules.mockResolvedValueOnce({
          customBiddingAlgorithmRulesId: "rules-err",
          createTime: "2025-01-01T00:00:00Z",
          active: false,
          state: "REJECTED",
          error: {
            errorCode: "INVALID_RULES",
            errorMessage: "Rules format is invalid",
          },
        });

        const result = await manageCustomBiddingRulesLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "upload",
            rulesContent: "bad rules",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(result.rules!.state).toBe("REJECTED");
        expect(result.rules!.error).toEqual({
          errorCode: "INVALID_RULES",
          errorMessage: "Rules format is invalid",
        });
      });

      it("propagates upload error", async () => {
        mockDv360Service.uploadCustomBiddingRules.mockRejectedValueOnce(new Error("Upload failed"));

        await expect(
          manageCustomBiddingRulesLogic(
            {
              customBiddingAlgorithmId: "algo-1",
              action: "upload",
              rulesContent: '{"rules": []}',
            },
            createMockContext(),
            createMockSdkContext()
          )
        ).rejects.toThrow("Upload failed");
      });
    });

    describe("list action", () => {
      it("lists all rules for an algorithm", async () => {
        const result = await manageCustomBiddingRulesLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "list",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(mockDv360Service.listCustomBiddingRules).toHaveBeenCalledWith(
          "algo-1",
          undefined,
          undefined,
          expect.any(Object)
        );
        expect(result.action).toBe("list");
        expect(result.rulesList).toHaveLength(2);
        expect(result.rulesList![0].customBiddingAlgorithmRulesId).toBe("rules-1");
        expect(result.rulesList![1].customBiddingAlgorithmRulesId).toBe("rules-2");
      });

      it("handles empty rules list", async () => {
        mockDv360Service.listCustomBiddingRules.mockResolvedValueOnce({
          rules: [],
        });

        const result = await manageCustomBiddingRulesLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "list",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(result.rulesList).toHaveLength(0);
      });
    });

    describe("get action", () => {
      it("gets specific rules by ID", async () => {
        const result = await manageCustomBiddingRulesLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "get",
            customBiddingAlgorithmRulesId: "rules-1",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(mockDv360Service.getCustomBiddingRules).toHaveBeenCalledWith(
          "algo-1",
          "rules-1",
          expect.any(Object)
        );
        expect(result.rules).toEqual(
          expect.objectContaining({
            customBiddingAlgorithmRulesId: "rules-1",
            state: "ACCEPTED",
          })
        );
      });

      it("elicits rules ID when not provided", async () => {
        mockEnsureRequiredFieldValue.mockImplementation(
          ({ fieldName, currentValue }: { fieldName: string; currentValue?: string }) => {
            if (fieldName === "customBiddingAlgorithmRulesId" && !currentValue) {
              return Promise.resolve("elicited-rules-id");
            }
            return Promise.resolve(currentValue);
          }
        );

        await manageCustomBiddingRulesLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "get",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(mockDv360Service.getCustomBiddingRules).toHaveBeenCalledWith(
          "algo-1",
          "elicited-rules-id",
          expect.any(Object)
        );
      });

      it("includes error details for rejected rules on get", async () => {
        mockDv360Service.getCustomBiddingRules.mockResolvedValueOnce({
          customBiddingAlgorithmRulesId: "rules-err",
          createTime: "2025-01-01T00:00:00Z",
          active: false,
          state: "REJECTED",
          error: {
            errorCode: "VALIDATION_ERROR",
            errorMessage: "Invalid condition",
          },
        });

        const result = await manageCustomBiddingRulesLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "get",
            customBiddingAlgorithmRulesId: "rules-err",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(result.rules!.error).toEqual({
          errorCode: "VALIDATION_ERROR",
          errorMessage: "Invalid condition",
        });
      });
    });

    describe("getActive action", () => {
      it("finds the active rules from the list", async () => {
        const result = await manageCustomBiddingRulesLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "getActive",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(mockDv360Service.listCustomBiddingRules).toHaveBeenCalled();
        expect(result.rules).toEqual(
          expect.objectContaining({
            customBiddingAlgorithmRulesId: "rules-1",
            active: true,
          })
        );
      });

      it("returns no rules when none is active", async () => {
        mockDv360Service.listCustomBiddingRules.mockResolvedValueOnce({
          rules: [
            {
              customBiddingAlgorithmRulesId: "rules-old",
              createTime: "2024-01-01T00:00:00Z",
              active: false,
              state: "ACCEPTED",
            },
          ],
        });

        const result = await manageCustomBiddingRulesLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "getActive",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(result.rules).toBeUndefined();
      });

      it("returns no rules when list is empty", async () => {
        mockDv360Service.listCustomBiddingRules.mockResolvedValueOnce({
          rules: [],
        });

        const result = await manageCustomBiddingRulesLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "getActive",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(result.rules).toBeUndefined();
      });

      it("includes error details for active rules that are rejected", async () => {
        mockDv360Service.listCustomBiddingRules.mockResolvedValueOnce({
          rules: [
            {
              customBiddingAlgorithmRulesId: "rules-active-err",
              createTime: "2025-01-01T00:00:00Z",
              active: true,
              state: "REJECTED",
              error: {
                errorCode: "RUNTIME_ERROR",
                errorMessage: "Evaluation failed",
              },
            },
          ],
        });

        const result = await manageCustomBiddingRulesLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "getActive",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(result.rules!.error).toEqual({
          errorCode: "RUNTIME_ERROR",
          errorMessage: "Evaluation failed",
        });
      });
    });

    it("elicits algorithm ID when not provided", async () => {
      mockEnsureRequiredFieldValue.mockImplementation(
        ({ fieldName, currentValue }: { fieldName: string; currentValue?: string }) => {
          if (fieldName === "customBiddingAlgorithmId" && !currentValue) {
            return Promise.resolve("elicited-algo-id");
          }
          return Promise.resolve(currentValue);
        }
      );

      const result = await manageCustomBiddingRulesLogic(
        {
          action: "list",
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.customBiddingAlgorithmId).toBe("elicited-algo-id");
      expect(mockDv360Service.listCustomBiddingRules).toHaveBeenCalledWith(
        "elicited-algo-id",
        undefined,
        undefined,
        expect.any(Object)
      );
    });

    it("throws when session services cannot be resolved", async () => {
      mockResolveSessionServices.mockImplementation(() => {
        throw new Error("No session found for sessionId: gone");
      });

      await expect(
        manageCustomBiddingRulesLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "list",
          },
          createMockContext(),
          createMockSdkContext("gone")
        )
      ).rejects.toThrow("No session found");
    });
  });

  describe("manageCustomBiddingRulesResponseFormatter", () => {
    it("formats upload result with rules details", () => {
      const result = manageCustomBiddingRulesResponseFormatter({
        action: "upload",
        customBiddingAlgorithmId: "algo-1",
        rules: {
          customBiddingAlgorithmRulesId: "rules-1",
          createTime: "2025-01-01T00:00:00Z",
          active: true,
          state: "ACCEPTED",
        },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("text");
      expect(result[0].text).toContain("upload");
      expect(result[0].text).toContain("rules-1");
      expect(result[0].text).toContain("ACCEPTED");
    });

    it("formats rejected rules with error details", () => {
      const result = manageCustomBiddingRulesResponseFormatter({
        action: "get",
        customBiddingAlgorithmId: "algo-1",
        rules: {
          customBiddingAlgorithmRulesId: "rules-err",
          createTime: "2025-01-01T00:00:00Z",
          active: false,
          state: "REJECTED",
          error: {
            errorCode: "INVALID_RULES",
            errorMessage: "Bad format",
          },
        },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("REJECTED");
      expect(result[0].text).toContain("INVALID_RULES");
      expect(result[0].text).toContain("Bad format");
    });

    it("formats list result with multiple rules", () => {
      const result = manageCustomBiddingRulesResponseFormatter({
        action: "list",
        customBiddingAlgorithmId: "algo-1",
        rulesList: [
          {
            customBiddingAlgorithmRulesId: "rules-1",
            createTime: "2025-01-01T00:00:00Z",
            active: true,
            state: "ACCEPTED",
          },
          {
            customBiddingAlgorithmRulesId: "rules-2",
            createTime: "2024-12-01T00:00:00Z",
            active: false,
            state: "ACCEPTED",
          },
        ],
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("Rules (2)");
      expect(result[0].text).toContain("rules-1");
      expect(result[0].text).toContain("[ACTIVE]");
    });

    it("formats empty rules list", () => {
      const result = manageCustomBiddingRulesResponseFormatter({
        action: "list",
        customBiddingAlgorithmId: "algo-1",
        rulesList: [],
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("No rules found");
    });

    it("formats getActive with no active rules", () => {
      const result = manageCustomBiddingRulesResponseFormatter({
        action: "getActive",
        customBiddingAlgorithmId: "algo-1",
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("No active rules found");
    });
  });

  describe("ManageCustomBiddingRulesInputSchema", () => {
    it("accepts valid upload input", () => {
      const parsed = ManageCustomBiddingRulesInputSchema.safeParse({
        customBiddingAlgorithmId: "algo-1",
        action: "upload",
        rulesContent: '{"rules": []}',
      });
      expect(parsed.success).toBe(true);
    });

    it("accepts list action without optional fields", () => {
      const parsed = ManageCustomBiddingRulesInputSchema.safeParse({
        action: "list",
      });
      expect(parsed.success).toBe(true);
    });

    it("accepts get action with rules ID", () => {
      const parsed = ManageCustomBiddingRulesInputSchema.safeParse({
        customBiddingAlgorithmId: "algo-1",
        action: "get",
        customBiddingAlgorithmRulesId: "rules-1",
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects invalid action", () => {
      const parsed = ManageCustomBiddingRulesInputSchema.safeParse({
        customBiddingAlgorithmId: "algo-1",
        action: "delete",
      });
      expect(parsed.success).toBe(false);
    });
  });
});
