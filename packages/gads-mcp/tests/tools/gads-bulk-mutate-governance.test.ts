import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  bulkMutateLogic,
  bulkMutateResponseFormatter,
  BulkMutateOutputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-mutate.tool.js";
import { EffectResultSchema, EffectDryRunResultSchema } from "@cesteral/shared";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

const baseInput = {
  entityType: "campaign",
  customerId: "1234567890",
  operations: [
    {
      update: { resourceName: "customers/1234567890/campaigns/111", name: "A" },
      updateMask: "name",
    },
    { remove: "customers/1234567890/campaigns/222" },
  ],
  partialFailure: true,
};

describe("gads_bulk_mutate governance contract (effect class)", () => {
  let svc: { bulkMutate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: one op applied, one failed (partial) — Google Ads returns 200
    // with an empty result entry + a partialFailureError for the failed op.
    svc = {
      bulkMutate: vi.fn().mockResolvedValue({
        results: [{ resourceName: "customers/1234567890/campaigns/111" }, {}],
        partialFailureError: {
          code: 3,
          message: "partial failure",
          details: [
            {
              errors: [
                { location: { fieldPathElements: [{ fieldName: "operations", index: 1 }] } },
              ],
            },
          ],
        },
      }),
    };
    mockResolveSessionServices.mockReturnValue({ gadsService: svc });
  });

  it("dry_run returns a symbolic effect preview, no API call", async () => {
    const result = await bulkMutateLogic({ ...baseInput, dry_run: true } as any, ctx, sdk);
    expect(svc.bulkMutate).not.toHaveBeenCalled();
    expect(result.operationCount).toBe(0);
    expect(result.dryRun?.expectedEffect).toEqual({
      effectKind: "bulk_mutation",
      summary: { entity_kind: "campaign", requested: 2, partial_failure: true },
    });
    expect(result.dispatchedCapability).toEqual({
      operation: "bulk_job",
      canonicalEntityKind: null,
    });
    expect(() => BulkMutateOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectDryRunResultSchema.parse(result.dryRun)).not.toThrow();
  });

  it("dry_run flags an operation with no verb", async () => {
    const result = await bulkMutateLogic(
      { ...baseInput, operations: [{ foo: 1 }], dry_run: true } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.wouldSucceed).toBe(false);
    expect(result.dryRun?.validationErrors[0]?.code).toBe("INVALID_OPERATION");
  });

  it("execute parses partial failures into real applied/failed counts", async () => {
    const result = await bulkMutateLogic({ ...baseInput } as any, ctx, sdk);
    expect(svc.bulkMutate).toHaveBeenCalledOnce();
    expect(result.effect).toEqual({
      effectKind: "bulk_mutation",
      summary: {
        entity_kind: "campaign",
        requested: 2,
        succeeded: 1,
        failed: 1,
        partial_success: true,
        partial_failure: true,
      },
    });
    expect(result.dispatchedCapability.canonicalEntityKind).toBeNull();
    expect(() => BulkMutateOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
  });

  it("execute records an all-failed batch as 0 applied (not a completed mutation)", async () => {
    svc.bulkMutate.mockResolvedValueOnce({
      results: [{}, {}],
      partialFailureError: {
        code: 3,
        message: "all failed",
        details: [
          {
            errors: [
              { location: { fieldPathElements: [{ fieldName: "operations", index: 0 }] } },
              { location: { fieldPathElements: [{ fieldName: "operations", index: 1 }] } },
            ],
          },
        ],
      },
    });
    const result = await bulkMutateLogic({ ...baseInput } as any, ctx, sdk);
    expect(result.effect?.summary).toEqual({
      entity_kind: "campaign",
      requested: 2,
      succeeded: 0,
      failed: 2,
      partial_success: false,
      partial_failure: true,
    });
  });

  it("execute records an all-applied atomic batch with no partialFailureError", async () => {
    svc.bulkMutate.mockResolvedValueOnce({
      results: [
        { resourceName: "customers/1234567890/campaigns/111" },
        { resourceName: "customers/1234567890/campaigns/222" },
      ],
    });
    const result = await bulkMutateLogic({ ...baseInput, partialFailure: false } as any, ctx, sdk);
    expect(result.effect?.summary).toEqual({
      entity_kind: "campaign",
      requested: 2,
      succeeded: 2,
      failed: 0,
      partial_success: false,
      partial_failure: false,
    });
  });

  it("execute falls back to partialFailureError indices when no results array", async () => {
    svc.bulkMutate.mockResolvedValueOnce({
      partialFailureError: {
        details: [
          {
            errors: [{ location: { fieldPathElements: [{ fieldName: "operations", index: 1 }] } }],
          },
        ],
      },
    });
    const result = await bulkMutateLogic({ ...baseInput } as any, ctx, sdk);
    expect(result.effect?.summary).toMatchObject({ requested: 2, succeeded: 1, failed: 1 });
  });

  it("formatter renders a dry-run message without a false success", () => {
    const content = bulkMutateResponseFormatter({
      mutateResult: {},
      operationCount: 0,
      timestamp: "2026-06-03T00:00:00.000Z",
      dispatchedCapability: { operation: "bulk_job", canonicalEntityKind: null },
      dryRun: {
        wouldSucceed: true,
        validationErrors: [],
        validationSource: "symbolic",
        expectedEffectSource: "symbolic",
        expectedEffect: {
          effectKind: "bulk_mutation",
          summary: { entity_kind: "campaign", requested: 2, partial_failure: true },
        },
      },
    } as any);
    expect(content[0].text).toContain(
      "Dry run: bulk mutation of 2 campaign operation(s) would succeed"
    );
    expect(content[0].text).not.toContain("Bulk mutate completed");
  });
});
