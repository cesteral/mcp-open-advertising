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

import {
  adjustBidsLogic,
  adjustBidsResponseFormatter,
  AdjustBidsOutputSchema,
} from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("meta_adjust_bids governance contract (effect class)", () => {
  let svc: { getEntity: ReturnType<typeof vi.fn>; updateEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      getEntity: vi.fn().mockResolvedValue({ id: "as-1", name: "Ad Set 1", bid_amount: 100 }),
      updateEntity: vi.fn().mockResolvedValue({}),
    };
    mockResolveSessionServices.mockReturnValue({ metaService: svc });
    mockElicit.mockResolvedValue(true);
  });

  it("dry_run returns a symbolic effect preview, no API call or confirmation", async () => {
    const result = await adjustBidsLogic(
      { adjustments: [{ adSetId: "as-1", bidAmount: 250 }], dry_run: true } as any,
      ctx,
      sdk
    );

    expect(mockElicit).not.toHaveBeenCalled();
    expect(svc.updateEntity).not.toHaveBeenCalled();
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "bids_adjusted",
      summary: { entity_label: "ad_set", requested: 1 },
    });
    expect(result.dryRun?.validationSource).toBe("symbolic");
    expect(result.dryRun?.expectedEffectSource).toBe("symbolic");
    expect(result.dryRun?.wouldSucceed).toBe(true);
    expect(result.dispatchedCapability).toEqual({
      operation: "adjust_bids",
      canonicalEntityKind: null,
    });
  });

  it("execute returns the effect identity (scalar audit summary) + null-kind capability", async () => {
    const result = await adjustBidsLogic(
      {
        adjustments: [
          { adSetId: "as-1", bidAmount: 250 },
          { adSetId: "as-2", bidAmount: 300 },
        ],
      } as any,
      ctx,
      sdk
    );

    expect(svc.updateEntity).toHaveBeenCalledTimes(2);
    expect(result.effect).toEqual({
      effectKind: "bids_adjusted",
      summary: { entity_label: "ad_set", requested: 2, succeeded: 2, failed: 0 },
    });
    expect(result.dispatchedCapability).toEqual({
      operation: "adjust_bids",
      canonicalEntityKind: null,
    });
  });

  it("declined confirmation still reports the dispatchedCapability, no effect", async () => {
    mockElicit.mockResolvedValue(false);
    const result = await adjustBidsLogic(
      { adjustments: [{ adSetId: "as-1", bidAmount: 250 }] } as any,
      ctx,
      sdk
    );
    expect(svc.updateEntity).not.toHaveBeenCalled();
    expect(result.confirmed).toBe(false);
    expect(result.effect).toBeUndefined();
    expect(result.dispatchedCapability).toEqual({
      operation: "adjust_bids",
      canonicalEntityKind: null,
    });
  });

  it("dry-run and execute outputs parse cleanly through the declared schemas", async () => {
    // Dry-run output → AdjustBidsOutputSchema + the effect dry-run shape.
    const dry = await adjustBidsLogic(
      { adjustments: [{ adSetId: "as-1", bidAmount: 250 }], dry_run: true } as any,
      ctx,
      sdk
    );
    expect(() => AdjustBidsOutputSchema.parse(dry)).not.toThrow();
    expect(() => EffectDryRunResultSchema.parse(dry.dryRun)).not.toThrow();
    // expectedEffect is an EffectResult.
    expect(() => EffectResultSchema.parse(dry.dryRun!.expectedEffect)).not.toThrow();

    // Execute output → AdjustBidsOutputSchema + the effect identity.
    const exec = await adjustBidsLogic(
      { adjustments: [{ adSetId: "as-1", bidAmount: 250 }] } as any,
      ctx,
      sdk
    );
    expect(() => AdjustBidsOutputSchema.parse(exec)).not.toThrow();
    expect(() => EffectResultSchema.parse(exec.effect)).not.toThrow();
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = adjustBidsResponseFormatter({
      confirmed: true,
      totalRequested: 1,
      totalSucceeded: 0,
      totalFailed: 0,
      results: [],
      timestamp: "2026-06-02T00:00:00.000Z",
      dispatchedCapability: { operation: "adjust_bids", canonicalEntityKind: null },
      dryRun: {
        wouldSucceed: true,
        validationErrors: [],
        validationSource: "symbolic",
        expectedEffectSource: "symbolic",
        expectedEffect: {
          effectKind: "bids_adjusted",
          summary: { entity_label: "ad_set", requested: 1 },
        },
      },
    } as any);
    expect(content[0].text).toContain("Dry run: adjusting bids on 1 ad set(s) would succeed");
    expect(content[0].text).not.toContain("succeeded,");
  });
});
