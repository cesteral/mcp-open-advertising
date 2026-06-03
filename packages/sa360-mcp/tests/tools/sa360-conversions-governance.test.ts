import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices, mockElicitConversion } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockElicitConversion: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, elicitConversionUploadConfirmation: mockElicitConversion };
});

import {
  insertConversionsLogic,
  insertConversionsResponseFormatter,
  InsertConversionsOutputSchema,
} from "../../src/mcp-server/tools/definitions/insert-conversions.tool.js";
import {
  updateConversionsLogic,
  UpdateConversionsOutputSchema,
} from "../../src/mcp-server/tools/definitions/update-conversions.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

// SA360 v2 /conversion echoes back the accepted rows; a SUCCESS status (or no
// status) means accepted.
const acceptedRows = (n: number) => ({
  conversion: Array.from({ length: n }, (_, i) => ({ conversionId: `c${i}`, status: "SUCCESS" })),
});

describe("sa360 conversions governance contract (effect class)", () => {
  let conversionService: {
    insertConversions: ReturnType<typeof vi.fn>;
    updateConversions: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    conversionService = {
      insertConversions: vi.fn().mockResolvedValue(acceptedRows(1)),
      updateConversions: vi.fn().mockResolvedValue(acceptedRows(1)),
    };
    mockResolveSessionServices.mockReturnValue({ conversionService });
    mockElicitConversion.mockResolvedValue(true);
  });

  describe("sa360_insert_conversions", () => {
    const input = {
      agencyId: "12345",
      advertiserId: "67890",
      conversions: [
        {
          gclid: "EAIaIQ...",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
          floodlightActivityId: "11111",
        },
      ],
    };

    it("dry_run returns a scalar, non-PII effect preview without confirmation or API call", async () => {
      const result = await insertConversionsLogic({ ...input, dry_run: true } as any, ctx, sdk);
      expect(mockElicitConversion).not.toHaveBeenCalled();
      expect(conversionService.insertConversions).not.toHaveBeenCalled();
      expect(result.dryRun?.wouldSucceed).toBe(true);
      expect(result.dryRun?.expectedEffect).toEqual({
        effectKind: "conversions_inserted",
        summary: {
          agency_id: "12345",
          advertiser_id: "67890",
          requested_count: 1,
          succeeded_count: 1,
          failed_count: 0,
          operation: "insert",
        },
      });
      // No gclid/clickId/revenue/raw payloads leaked into the summary.
      expect(JSON.stringify(result.dryRun?.expectedEffect?.summary)).not.toContain("EAIaIQ");
      expect(result.dispatchedCapability).toEqual({
        operation: "upload_conversions",
        canonicalEntityKind: null,
      });
      expect(() => InsertConversionsOutputSchema.parse(result)).not.toThrow();
      expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
    });

    it("dry_run flags a row missing a click identifier", async () => {
      const result = await insertConversionsLogic(
        {
          ...input,
          conversions: [
            {
              conversionTimestamp: "1700000000000",
              segmentationType: "FLOODLIGHT",
              floodlightActivityId: "11111",
            },
          ],
          dry_run: true,
        } as any,
        ctx,
        sdk
      );
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors[0]?.code).toBe("MISSING_CLICK_ID");
    });

    it("dry_run reuses the canonical validator (rejects a missing Floodlight id)", async () => {
      const result = await insertConversionsLogic(
        {
          ...input,
          conversions: [
            { gclid: "g-1", conversionTimestamp: "1700000000000", segmentationType: "FLOODLIGHT" },
          ],
          dry_run: true,
        } as any,
        ctx,
        sdk
      );
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors.map((e) => e.code)).toContain("MISSING_FLOODLIGHT_ID");
    });

    it("dry_run flags a non-numeric timestamp", async () => {
      const result = await insertConversionsLogic(
        {
          ...input,
          conversions: [
            {
              gclid: "g-1",
              conversionTimestamp: "not-a-number",
              segmentationType: "FLOODLIGHT",
              floodlightActivityId: "11111",
            },
          ],
          dry_run: true,
        } as any,
        ctx,
        sdk
      );
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors.map((e) => e.code)).toContain("INVALID_TIMESTAMP");
    });

    it("execute emits the scalar effect identity when SA360 accepts all rows", async () => {
      const result = await insertConversionsLogic({ ...input } as any, ctx, sdk);
      expect(conversionService.insertConversions).toHaveBeenCalledOnce();
      expect(result.confirmed).toBe(true);
      expect(result.requestedCount).toBe(1);
      expect(result.insertedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.effect).toEqual({
        effectKind: "conversions_inserted",
        summary: {
          agency_id: "12345",
          advertiser_id: "67890",
          requested_count: 1,
          succeeded_count: 1,
          failed_count: 0,
          operation: "insert",
        },
      });
      expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
      expect(() => InsertConversionsOutputSchema.parse(result)).not.toThrow();
      expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
    });

    it("execute on a PARTIAL acceptance emits an effect with honest counts", async () => {
      const twoRows = {
        ...input,
        conversions: [
          { ...input.conversions[0], gclid: "g-1" },
          { ...input.conversions[0], gclid: "g-2" },
        ],
      };
      conversionService.insertConversions.mockResolvedValueOnce({
        conversion: [
          { conversionId: "c0", status: "SUCCESS" },
          { conversionId: "c1", status: "FAILED" },
        ],
      });
      const result = await insertConversionsLogic({ ...twoRows } as any, ctx, sdk);
      expect(result.requestedCount).toBe(2);
      expect(result.insertedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.effect?.summary).toEqual({
        agency_id: "12345",
        advertiser_id: "67890",
        requested_count: 2,
        succeeded_count: 1,
        failed_count: 1,
        operation: "insert",
      });
    });

    it("execute omits the effect when SA360 accepts NO rows", async () => {
      conversionService.insertConversions.mockResolvedValueOnce({
        conversion: [{ conversionId: "c0", status: "FAILED" }],
      });
      const result = await insertConversionsLogic({ ...input } as any, ctx, sdk);
      expect(conversionService.insertConversions).toHaveBeenCalledOnce();
      expect(result.insertedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.effect).toBeUndefined();
      expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    });

    it("declined confirmation reports the capability, no effect", async () => {
      mockElicitConversion.mockResolvedValue(false);
      const result = await insertConversionsLogic({ ...input } as any, ctx, sdk);
      expect(conversionService.insertConversions).not.toHaveBeenCalled();
      expect(result.confirmed).toBe(false);
      expect(result.effect).toBeUndefined();
      expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    });

    it("formatter renders a dry-run message without a false success", () => {
      const content = insertConversionsResponseFormatter({
        confirmed: true,
        result: {},
        requestedCount: 0,
        insertedCount: 0,
        failedCount: 0,
        timestamp: "2026-06-03T00:00:00.000Z",
        dispatchedCapability: { operation: "upload_conversions", canonicalEntityKind: null },
        dryRun: {
          wouldSucceed: true,
          validationErrors: [],
          validationSource: "symbolic",
          expectedEffectSource: "symbolic",
          expectedEffect: {
            effectKind: "conversions_inserted",
            summary: {
              agency_id: "12345",
              advertiser_id: "67890",
              requested_count: 1,
              succeeded_count: 1,
              failed_count: 0,
              operation: "insert",
            },
          },
        },
      } as any);
      expect(content[0].text).toContain("Dry run: inserting 1 conversion(s) would succeed");
      expect(content[0].text).not.toContain("Accepted 1");
    });
  });

  describe("sa360_update_conversions", () => {
    const input = {
      agencyId: "12345",
      advertiserId: "67890",
      conversions: [
        {
          gclid: "EAIaIQ...",
          conversionId: "conv-1",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
          floodlightActivityId: "11111",
        },
      ],
    };

    it("dry_run returns a scalar effect preview without confirmation or API call", async () => {
      const result = await updateConversionsLogic({ ...input, dry_run: true } as any, ctx, sdk);
      expect(mockElicitConversion).not.toHaveBeenCalled();
      expect(conversionService.updateConversions).not.toHaveBeenCalled();
      expect(result.dryRun?.wouldSucceed).toBe(true);
      expect(result.dryRun?.expectedEffect).toEqual({
        effectKind: "conversions_updated",
        summary: {
          agency_id: "12345",
          advertiser_id: "67890",
          requested_count: 1,
          succeeded_count: 1,
          failed_count: 0,
          operation: "update",
        },
      });
      expect(result.dispatchedCapability).toEqual({
        operation: "upload_conversions",
        canonicalEntityKind: null,
      });
      expect(() => UpdateConversionsOutputSchema.parse(result)).not.toThrow();
      expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
    });

    it("dry_run flags an empty conversionId via the canonical validator", async () => {
      const result = await updateConversionsLogic(
        {
          ...input,
          conversions: [
            {
              conversionId: "",
              conversionTimestamp: "1700000000000",
              segmentationType: "FLOODLIGHT",
              floodlightActivityId: "11111",
            },
          ],
          dry_run: true,
        } as any,
        ctx,
        sdk
      );
      expect(result.dryRun?.wouldSucceed).toBe(false);
      expect(result.dryRun?.validationErrors.map((e) => e.code)).toContain("MISSING_CONVERSION_ID");
    });

    it("execute emits the scalar effect identity when SA360 accepts all rows", async () => {
      const result = await updateConversionsLogic({ ...input } as any, ctx, sdk);
      expect(conversionService.updateConversions).toHaveBeenCalledOnce();
      expect(result.updatedCount).toBe(1);
      expect(result.effect).toEqual({
        effectKind: "conversions_updated",
        summary: {
          agency_id: "12345",
          advertiser_id: "67890",
          requested_count: 1,
          succeeded_count: 1,
          failed_count: 0,
          operation: "update",
        },
      });
      expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
      expect(() => UpdateConversionsOutputSchema.parse(result)).not.toThrow();
      expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
    });

    it("execute omits the effect when SA360 accepts NO rows", async () => {
      conversionService.updateConversions.mockResolvedValueOnce({
        conversion: [{ conversionId: "conv-1", status: "FAILED" }],
      });
      const result = await updateConversionsLogic({ ...input } as any, ctx, sdk);
      expect(result.updatedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.effect).toBeUndefined();
    });

    it("declined confirmation reports the capability, no effect", async () => {
      mockElicitConversion.mockResolvedValue(false);
      const result = await updateConversionsLogic({ ...input } as any, ctx, sdk);
      expect(conversionService.updateConversions).not.toHaveBeenCalled();
      expect(result.confirmed).toBe(false);
      expect(result.effect).toBeUndefined();
      expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    });
  });
});
