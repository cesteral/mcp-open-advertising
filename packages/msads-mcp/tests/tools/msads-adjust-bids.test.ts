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

describe("msads_adjust_bids governance contract (effect class)", () => {
  let svc: { adjustBids: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      adjustBids: vi.fn().mockResolvedValue({ PartialErrors: [] }),
    };
    mockResolveSessionServices.mockReturnValue({ msadsService: svc });
    mockElicit.mockResolvedValue(true);
  });

  it("dry_run returns a symbolic effect preview, no API call or confirmation", async () => {
    const result = await adjustBidsLogic(
      {
        entityType: "keyword",
        scope: { adGroupId: "333" },
        adjustments: [{ entityId: "111", bidField: "Bid", newBid: 1.5 }],
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(mockElicit).not.toHaveBeenCalled();
    expect(svc.adjustBids).not.toHaveBeenCalled();
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "bids_adjusted",
      summary: { entity_label: "keyword", requested: 1 },
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
      {
        entityType: "keyword",
        scope: { adGroupId: "333" },
        adjustments: [{ entityId: "111", bidField: "Bid", newBid: 1.5 }],
      } as any,
      ctx,
      sdk
    );
    expect(svc.adjustBids).toHaveBeenCalledOnce();
    expect(result.effect).toEqual({
      effectKind: "bids_adjusted",
      summary: { entity_label: "keyword", requested: 1 },
    });
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(() => AdjustBidsOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
  });

  it("declined confirmation reports the capability, no effect", async () => {
    mockElicit.mockResolvedValue(false);
    const result = await adjustBidsLogic(
      {
        entityType: "keyword",
        adjustments: [{ entityId: "111", bidField: "Bid", newBid: 1.5 }],
      } as any,
      ctx,
      sdk
    );
    expect(svc.adjustBids).not.toHaveBeenCalled();
    expect(result.confirmed).toBe(false);
    expect(result.effect).toBeUndefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = adjustBidsResponseFormatter({
      confirmed: true,
      result: {},
      entityType: "keyword",
      adjustmentCount: 1,
      timestamp: "2026-06-02T00:00:00.000Z",
      dispatchedCapability: { operation: "adjust_bids", canonicalEntityKind: null },
      dryRun: {
        wouldSucceed: true,
        validationErrors: [],
        validationSource: "symbolic",
        expectedEffectSource: "symbolic",
        expectedEffect: {
          effectKind: "bids_adjusted",
          summary: { entity_label: "keyword", requested: 1 },
        },
      },
    } as any);
    expect(content[0].text).toContain("Dry run: adjusting bids on 1 keyword(s) would succeed");
    expect(content[0].text).not.toContain("Adjusted");
  });
});
