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
  manageCustomBiddingScriptLogic,
  manageCustomBiddingScriptResponseFormatter,
  ManageCustomBiddingScriptInputSchema,
} from "../../../../src/mcp-server/tools/definitions/manage-custom-bidding-script.tool.js";

// ── Helpers ─────────────────────────────────────────────────────────────
function createMockContext() {
  return {
    requestId: "req-script-1",
    timestamp: new Date().toISOString(),
    operation: "test",
  } as any;
}

function createMockSdkContext(sessionId = "session-123") {
  return { sessionId } as any;
}

// ── Tests ───────────────────────────────────────────────────────────────
describe("dv360_manage_custom_bidding_script", () => {
  let mockDv360Service: {
    uploadCustomBiddingScript: ReturnType<typeof vi.fn>;
    createCustomBiddingScript: ReturnType<typeof vi.fn>;
    listCustomBiddingScripts: ReturnType<typeof vi.fn>;
    getCustomBiddingScript: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDv360Service = {
      uploadCustomBiddingScript: vi.fn().mockResolvedValue({
        resourceName: "scripts/upload-1",
      }),
      createCustomBiddingScript: vi.fn().mockResolvedValue({
        customBiddingScriptId: "script-1",
        createTime: "2025-01-01T00:00:00Z",
        active: true,
        state: "PENDING",
      }),
      listCustomBiddingScripts: vi.fn().mockResolvedValue({
        scripts: [
          {
            customBiddingScriptId: "script-1",
            createTime: "2025-01-01T00:00:00Z",
            active: true,
            state: "ACCEPTED",
          },
          {
            customBiddingScriptId: "script-2",
            createTime: "2024-12-01T00:00:00Z",
            active: false,
            state: "ACCEPTED",
          },
        ],
      }),
      getCustomBiddingScript: vi.fn().mockResolvedValue({
        customBiddingScriptId: "script-1",
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

  describe("manageCustomBiddingScriptLogic", () => {
    describe("upload action", () => {
      it("uploads script content and creates script resource", async () => {
        const result = await manageCustomBiddingScriptLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "upload",
            scriptContent: "function bid() { return 1; }",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(mockDv360Service.uploadCustomBiddingScript).toHaveBeenCalledWith(
          "algo-1",
          "function bid() { return 1; }",
          expect.any(Object)
        );
        expect(mockDv360Service.createCustomBiddingScript).toHaveBeenCalledWith(
          "algo-1",
          "scripts/upload-1",
          expect.any(Object)
        );
        expect(result.action).toBe("upload");
        expect(result.customBiddingAlgorithmId).toBe("algo-1");
        expect(result.script).toEqual(
          expect.objectContaining({
            customBiddingScriptId: "script-1",
            state: "PENDING",
            active: true,
          })
        );
      });

      it("throws when scriptContent is missing for upload", async () => {
        await expect(
          manageCustomBiddingScriptLogic(
            {
              customBiddingAlgorithmId: "algo-1",
              action: "upload",
            },
            createMockContext(),
            createMockSdkContext()
          )
        ).rejects.toThrow("scriptContent is required for upload action");
      });

      it("includes script errors in result when present", async () => {
        mockDv360Service.createCustomBiddingScript.mockResolvedValueOnce({
          customBiddingScriptId: "script-err",
          createTime: "2025-01-01T00:00:00Z",
          active: false,
          state: "REJECTED",
          errors: [
            {
              errorCode: "SYNTAX_ERROR",
              line: "5",
              column: "10",
              errorMessage: "Unexpected token",
            },
          ],
        });

        const result = await manageCustomBiddingScriptLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "upload",
            scriptContent: "bad script {",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(result.script!.state).toBe("REJECTED");
        expect(result.script!.errors).toHaveLength(1);
        expect(result.script!.errors![0].errorCode).toBe("SYNTAX_ERROR");
      });

      it("propagates upload error", async () => {
        mockDv360Service.uploadCustomBiddingScript.mockRejectedValueOnce(
          new Error("Upload failed")
        );

        await expect(
          manageCustomBiddingScriptLogic(
            {
              customBiddingAlgorithmId: "algo-1",
              action: "upload",
              scriptContent: "function bid() {}",
            },
            createMockContext(),
            createMockSdkContext()
          )
        ).rejects.toThrow("Upload failed");
      });
    });

    describe("list action", () => {
      it("lists all scripts for an algorithm", async () => {
        const result = await manageCustomBiddingScriptLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "list",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(mockDv360Service.listCustomBiddingScripts).toHaveBeenCalledWith(
          "algo-1",
          undefined,
          undefined,
          expect.any(Object)
        );
        expect(result.action).toBe("list");
        expect(result.scripts).toHaveLength(2);
        expect(result.scripts![0].customBiddingScriptId).toBe("script-1");
        expect(result.scripts![1].customBiddingScriptId).toBe("script-2");
      });

      it("handles empty script list", async () => {
        mockDv360Service.listCustomBiddingScripts.mockResolvedValueOnce({
          scripts: [],
        });

        const result = await manageCustomBiddingScriptLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "list",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(result.scripts).toHaveLength(0);
      });
    });

    describe("get action", () => {
      it("gets a specific script by ID", async () => {
        const result = await manageCustomBiddingScriptLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "get",
            customBiddingScriptId: "script-1",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(mockDv360Service.getCustomBiddingScript).toHaveBeenCalledWith(
          "algo-1",
          "script-1",
          expect.any(Object)
        );
        expect(result.script).toEqual(
          expect.objectContaining({
            customBiddingScriptId: "script-1",
            state: "ACCEPTED",
          })
        );
      });

      it("elicits script ID when not provided", async () => {
        mockEnsureRequiredFieldValue.mockImplementation(
          ({ fieldName, currentValue }: { fieldName: string; currentValue?: string }) => {
            if (fieldName === "customBiddingScriptId" && !currentValue) {
              return Promise.resolve("elicited-script-id");
            }
            return Promise.resolve(currentValue);
          }
        );

        await manageCustomBiddingScriptLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "get",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(mockDv360Service.getCustomBiddingScript).toHaveBeenCalledWith(
          "algo-1",
          "elicited-script-id",
          expect.any(Object)
        );
      });
    });

    describe("getActive action", () => {
      it("finds the active script from the list", async () => {
        const result = await manageCustomBiddingScriptLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "getActive",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(mockDv360Service.listCustomBiddingScripts).toHaveBeenCalled();
        expect(result.script).toEqual(
          expect.objectContaining({
            customBiddingScriptId: "script-1",
            active: true,
          })
        );
      });

      it("returns no script when none is active", async () => {
        mockDv360Service.listCustomBiddingScripts.mockResolvedValueOnce({
          scripts: [
            {
              customBiddingScriptId: "script-old",
              createTime: "2024-01-01T00:00:00Z",
              active: false,
              state: "ACCEPTED",
            },
          ],
        });

        const result = await manageCustomBiddingScriptLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "getActive",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(result.script).toBeUndefined();
      });

      it("returns no script when list is empty", async () => {
        mockDv360Service.listCustomBiddingScripts.mockResolvedValueOnce({
          scripts: [],
        });

        const result = await manageCustomBiddingScriptLogic(
          {
            customBiddingAlgorithmId: "algo-1",
            action: "getActive",
          },
          createMockContext(),
          createMockSdkContext()
        );

        expect(result.script).toBeUndefined();
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

      const result = await manageCustomBiddingScriptLogic(
        {
          action: "list",
        },
        createMockContext(),
        createMockSdkContext()
      );

      expect(result.customBiddingAlgorithmId).toBe("elicited-algo-id");
      expect(mockDv360Service.listCustomBiddingScripts).toHaveBeenCalledWith(
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
        manageCustomBiddingScriptLogic(
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

  describe("manageCustomBiddingScriptResponseFormatter", () => {
    it("formats upload result with script details", () => {
      const result = manageCustomBiddingScriptResponseFormatter({
        action: "upload",
        customBiddingAlgorithmId: "algo-1",
        script: {
          customBiddingScriptId: "script-1",
          createTime: "2025-01-01T00:00:00Z",
          active: true,
          state: "PENDING",
        },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("text");
      expect(result[0].text).toContain("upload");
      expect(result[0].text).toContain("script-1");
      expect(result[0].text).toContain("PENDING");
      expect(result[0].text).toContain("being processed");
    });

    it("formats rejected script with errors", () => {
      const result = manageCustomBiddingScriptResponseFormatter({
        action: "get",
        customBiddingAlgorithmId: "algo-1",
        script: {
          customBiddingScriptId: "script-err",
          createTime: "2025-01-01T00:00:00Z",
          active: false,
          state: "REJECTED",
          errors: [
            {
              errorCode: "SYNTAX_ERROR",
              line: "5",
              column: "10",
              errorMessage: "Unexpected token",
            },
          ],
        },
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("REJECTED");
      expect(result[0].text).toContain("SYNTAX_ERROR");
      expect(result[0].text).toContain("Unexpected token");
    });

    it("formats list result with multiple scripts", () => {
      const result = manageCustomBiddingScriptResponseFormatter({
        action: "list",
        customBiddingAlgorithmId: "algo-1",
        scripts: [
          {
            customBiddingScriptId: "script-1",
            createTime: "2025-01-01T00:00:00Z",
            active: true,
            state: "ACCEPTED",
          },
          {
            customBiddingScriptId: "script-2",
            createTime: "2024-12-01T00:00:00Z",
            active: false,
            state: "ACCEPTED",
          },
        ],
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("Scripts (2)");
      expect(result[0].text).toContain("script-1");
      expect(result[0].text).toContain("[ACTIVE]");
      expect(result[0].text).toContain("script-2");
    });

    it("formats empty list result", () => {
      const result = manageCustomBiddingScriptResponseFormatter({
        action: "list",
        customBiddingAlgorithmId: "algo-1",
        scripts: [],
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("No scripts found");
    });

    it("formats getActive with no active script", () => {
      const result = manageCustomBiddingScriptResponseFormatter({
        action: "getActive",
        customBiddingAlgorithmId: "algo-1",
        timestamp: "2025-01-01T00:00:00.000Z",
      });

      expect(result[0].text).toContain("No active script found");
    });
  });

  describe("ManageCustomBiddingScriptInputSchema", () => {
    it("accepts valid upload input", () => {
      const parsed = ManageCustomBiddingScriptInputSchema.safeParse({
        customBiddingAlgorithmId: "algo-1",
        action: "upload",
        scriptContent: "function bid() {}",
      });
      expect(parsed.success).toBe(true);
    });

    it("accepts list action without optional fields", () => {
      const parsed = ManageCustomBiddingScriptInputSchema.safeParse({
        action: "list",
      });
      expect(parsed.success).toBe(true);
    });

    it("accepts get action with script ID", () => {
      const parsed = ManageCustomBiddingScriptInputSchema.safeParse({
        customBiddingAlgorithmId: "algo-1",
        action: "get",
        customBiddingScriptId: "script-1",
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects invalid action", () => {
      const parsed = ManageCustomBiddingScriptInputSchema.safeParse({
        customBiddingAlgorithmId: "algo-1",
        action: "delete",
      });
      expect(parsed.success).toBe(false);
    });
  });
});
