import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

const { mockElicit } = vi.hoisted(() => ({ mockElicit: vi.fn() }));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, elicitBidChangeConfirmation: mockElicit };
});

import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";
import {
  adjustBidsLogic,
  AdjustBidsOutputSchema,
} from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("gads_adjust_bids governance contract (effect class)", () => {
  let svc: { adjustBids: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      adjustBids: vi.fn().mockResolvedValue({ results: [{ adGroupId: "ag-1", success: true }] }),
    };
    mockResolveSessionServices.mockReturnValue({ gadsService: svc });
    mockElicit.mockResolvedValue(true);
  });

  it("dry_run returns a symbolic effect preview, no API call or confirmation", async () => {
    const result = await adjustBidsLogic(
      {
        customerId: "1",
        adjustments: [{ adGroupId: "ag-1", cpcBidMicros: "1500000" }],
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(mockElicit).not.toHaveBeenCalled();
    expect(svc.adjustBids).not.toHaveBeenCalled();
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "bids_adjusted",
      summary: { entity_label: "ad_group", requested: 1 },
    });
    expect(result.dispatchedCapability).toEqual({
      operation: "adjust_bids",
      canonicalEntityKind: null,
    });
    expect(() => AdjustBidsOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
  });

  it("dry_run rejects micros strings that are not valid positive int64 micros", async () => {
    // The execute path forwards the string verbatim to :mutate, which requires
    // an int64 micros value — so "1.5", "1e6", "-1", "0" must all be rejected.
    for (const bad of ["0", "1.5", "1e6", "-1", "abc", "00"]) {
      const result = await adjustBidsLogic(
        {
          customerId: "1",
          adjustments: [{ adGroupId: "ag-1", cpcBidMicros: bad }],
          dry_run: true,
        } as any,
        ctx,
        sdk
      );
      expect(result.dryRun?.wouldSucceed, `expected ${bad} to be rejected`).toBe(false);
      expect(result.dryRun?.validationErrors[0].code).toBe("INVALID_BID_MICROS");
    }
  });

  it("dry_run accepts a valid positive int64 micros string", async () => {
    const result = await adjustBidsLogic(
      {
        customerId: "1",
        adjustments: [{ adGroupId: "ag-1", cpcBidMicros: "1500000" }],
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(true);
    expect(result.dryRun?.validationErrors).toHaveLength(0);
  });

  it("execute returns the effect identity + null-kind capability", async () => {
    const result = await adjustBidsLogic(
      { customerId: "1", adjustments: [{ adGroupId: "ag-1", cpcBidMicros: "1500000" }] } as any,
      ctx,
      sdk
    );
    expect(svc.adjustBids).toHaveBeenCalledOnce();
    expect(result.effect).toEqual({
      effectKind: "bids_adjusted",
      summary: { entity_label: "ad_group", requested: 1, succeeded: 1, failed: 0 },
    });
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
  });

  it("declined confirmation reports the capability, no effect", async () => {
    mockElicit.mockResolvedValue(false);
    const result = await adjustBidsLogic(
      { customerId: "1", adjustments: [{ adGroupId: "ag-1", cpcBidMicros: "1500000" }] } as any,
      ctx,
      sdk
    );
    expect(svc.adjustBids).not.toHaveBeenCalled();
    expect(result.effect).toBeUndefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
  });
});
