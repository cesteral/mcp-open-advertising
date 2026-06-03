import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices, mockEnsureRequiredFieldValue, mockElicit } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockEnsureRequiredFieldValue: vi.fn(),
  mockElicit: vi.fn(),
}));

vi.mock("../../../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("../../../../src/mcp-server/tools/utils/elicitation.js", () => ({
  ensureRequiredFieldValue: mockEnsureRequiredFieldValue,
}));

vi.mock("../../../../src/mcp-server/tools/utils/entity-examples.js", () => ({
  getEntityExamplesByCategory: vi.fn().mockReturnValue([]),
  getEntityTypesWithExamples: vi.fn().mockReturnValue([]),
  getEntityExamples: vi.fn().mockReturnValue([]),
  findMatchingExample: vi.fn().mockReturnValue(null),
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, elicitBidChangeConfirmation: mockElicit };
});

import {
  adjustLineItemBidsLogic,
  adjustLineItemBidsResponseFormatter,
  AdjustLineItemBidsOutputSchema,
} from "../../../../src/mcp-server/tools/definitions/adjust-line-item-bids.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("dv360_adjust_line_item_bids governance contract (effect class)", () => {
  let svc: { getEntity: ReturnType<typeof vi.fn>; updateEntity: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = {
      getEntity: vi.fn().mockResolvedValue({
        displayName: "LI 1",
        bidStrategy: { fixedBid: { bidAmountMicros: 3000000 } },
      }),
      updateEntity: vi.fn().mockResolvedValue({}),
    };
    mockResolveSessionServices.mockReturnValue({ dv360Service: svc });
    mockEnsureRequiredFieldValue.mockImplementation(({ currentValue }: { currentValue?: string }) =>
      Promise.resolve(currentValue)
    );
    mockElicit.mockResolvedValue(true);
  });

  it("dry_run returns a symbolic effect preview, no API call or confirmation", async () => {
    const result = await adjustLineItemBidsLogic(
      {
        adjustments: [{ advertiserId: "adv-1", lineItemId: "li-1", newBidMicros: 5000000 }],
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(mockElicit).not.toHaveBeenCalled();
    expect(svc.updateEntity).not.toHaveBeenCalled();
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "bids_adjusted",
      summary: { entity_label: "line_item", requested: 1 },
    });
    expect(result.dryRun?.validationSource).toBe("symbolic");
    expect(result.dispatchedCapability).toEqual({
      operation: "adjust_bids",
      canonicalEntityKind: null,
    });
    expect(() => AdjustLineItemBidsOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
  });

  it("execute returns the effect identity + null-kind capability", async () => {
    const result = await adjustLineItemBidsLogic(
      {
        adjustments: [{ advertiserId: "adv-1", lineItemId: "li-1", newBidMicros: 5000000 }],
      } as any,
      ctx,
      sdk
    );
    expect(svc.updateEntity).toHaveBeenCalledOnce();
    expect(result.effect).toEqual({
      effectKind: "bids_adjusted",
      summary: { entity_label: "line_item", requested: 1, succeeded: 1, failed: 0 },
    });
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(() => AdjustLineItemBidsOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
  });

  it("declined confirmation reports the capability, no effect", async () => {
    mockElicit.mockResolvedValue(false);
    const result = await adjustLineItemBidsLogic(
      {
        adjustments: [{ advertiserId: "adv-1", lineItemId: "li-1", newBidMicros: 5000000 }],
      } as any,
      ctx,
      sdk
    );
    expect(svc.updateEntity).not.toHaveBeenCalled();
    expect(result.confirmed).toBe(false);
    expect(result.effect).toBeUndefined();
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = adjustLineItemBidsResponseFormatter({
      confirmed: true,
      successful: [],
      failed: [],
      totalRequested: 1,
      totalSuccessful: 0,
      totalFailed: 0,
      timestamp: "2026-06-02T00:00:00.000Z",
      dispatchedCapability: { operation: "adjust_bids", canonicalEntityKind: null },
      dryRun: {
        wouldSucceed: true,
        validationErrors: [],
        validationSource: "symbolic",
        expectedEffectSource: "symbolic",
        expectedEffect: {
          effectKind: "bids_adjusted",
          summary: { entity_label: "line_item", requested: 1 },
        },
      },
    } as any);
    expect(content[0].text).toContain("Dry run: adjusting bids on 1 line item(s) would succeed");
    expect(content[0].text).not.toContain("Batch bid adjustment completed");
  });
});
