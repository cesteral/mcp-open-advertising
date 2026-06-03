import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/session-services.js", () => ({
  sessionServiceStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAuthContext: vi.fn(),
  },
}));

const { mockElicit } = vi.hoisted(() => ({ mockElicit: vi.fn() }));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    resolveSessionServicesFromStore: vi.fn(),
    elicitBidChangeConfirmation: mockElicit,
  };
});

import { resolveSessionServicesFromStore } from "@cesteral/shared";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";
const mockResolveSession = vi.mocked(resolveSessionServicesFromStore);

import {
  adjustBidsLogic,
  AdjustBidsOutputSchema,
} from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("amazon_dsp_adjust_bids governance contract (effect class)", () => {
  let svc: { adjustBids: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      adjustBids: vi.fn().mockResolvedValue({
        results: [{ lineItemId: "li-1", success: true, previousBid: 1, newBid: 1.5 }],
      }),
    };
    mockResolveSession.mockReturnValue({ amazonDspService: svc } as any);
    mockElicit.mockResolvedValue(true);
  });

  it("dry_run returns a symbolic effect preview, no API call or confirmation", async () => {
    const result = await adjustBidsLogic(
      {
        profileId: "1",
        adjustments: [{ lineItemId: "li-1", bidAmount: 1.5 }],
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(mockElicit).not.toHaveBeenCalled();
    expect(svc.adjustBids).not.toHaveBeenCalled();
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "bids_adjusted",
      summary: { entity_label: "line_item", requested: 1 },
    });
    expect(result.dryRun?.validationSource).toBe("symbolic");
    expect(result.dispatchedCapability).toEqual({
      operation: "adjust_bids",
      canonicalEntityKind: null,
    });
    expect(() => AdjustBidsOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
  });

  it("execute returns the effect identity + null-kind capability", async () => {
    const result = await adjustBidsLogic(
      { profileId: "1", adjustments: [{ lineItemId: "li-1", bidAmount: 1.5 }] } as any,
      ctx,
      sdk
    );
    expect(svc.adjustBids).toHaveBeenCalledOnce();
    expect(result.effect).toEqual({
      effectKind: "bids_adjusted",
      summary: { entity_label: "line_item", requested: 1, succeeded: 1, failed: 0 },
    });
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(() => AdjustBidsOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
  });

  it("declined confirmation reports the capability, no effect", async () => {
    mockElicit.mockResolvedValue(false);
    const result = await adjustBidsLogic(
      { profileId: "1", adjustments: [{ lineItemId: "li-1", bidAmount: 1.5 }] } as any,
      ctx,
      sdk
    );
    expect(svc.adjustBids).not.toHaveBeenCalled();
    expect(result.effect).toBeUndefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
  });
});
