// Bulk capacity pre-check: a batch the package's real limiter cannot admit
// within its queue budget is refused BEFORE the confirmation prompt and BEFORE
// any upstream call; the dry-run predicts the same refusal.
//
// Uses the package's own `rateLimiter` (default config: amazon_dsp:* at
// 10/min, 120s queue budget) and a real AmazonDspService over a fake HTTP
// client, so the token pattern under test is the one the service really
// consumes. At 3 tokens per write, 9 writes fit in the budget (3 per window
// at t=0, 60s, 120s); a 10th would be admitted at 180s.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockResolveSessionServices, mockElicit } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockElicit: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    elicitBidChangeConfirmation: mockElicit,
    elicitBulkStatusChangeConfirmation: mockElicit,
    elicitBulkDeleteConfirmation: mockElicit,
    elicitBulkMutationConfirmation: mockElicit,
  };
});

import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import { rateLimiter } from "../../src/utils/platform.js";
import { AmazonDspService } from "../../src/services/amazon-dsp/amazon-dsp-service.js";
import { adjustBidsLogic } from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { deleteEntityLogic } from "../../src/mcp-server/tools/definitions/delete-entity.tool.js";
import { bulkUpdateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { bulkCreateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;
const PROFILE = "1234567890";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

type Case = {
  tool: string;
  run: (n: number, dryRun?: boolean) => Promise<any>;
};

const cases: Case[] = [
  {
    tool: "amazon_dsp_adjust_bids",
    run: (n, dry_run = false) =>
      adjustBidsLogic(
        {
          profileId: PROFILE,
          adjustments: ids(n).map((lineItemId) => ({ lineItemId, bidAmount: 1.5 })),
          dry_run,
        } as any,
        ctx,
        sdk
      ),
  },
  {
    tool: "amazon_dsp_bulk_update_status",
    run: (n, dry_run = false) =>
      bulkUpdateStatusLogic(
        {
          entityType: "order",
          profileId: PROFILE,
          entityIds: ids(n),
          operationStatus: "PAUSED",
          dry_run,
        } as any,
        ctx,
        sdk
      ),
  },
  {
    tool: "amazon_dsp_delete_entity",
    run: (n, dry_run = false) =>
      deleteEntityLogic(
        { entityType: "order", profileId: PROFILE, entityIds: ids(n), dry_run } as any,
        ctx,
        sdk
      ),
  },
  {
    tool: "amazon_dsp_bulk_update_entities",
    run: (n, dry_run = false) =>
      bulkUpdateEntitiesLogic(
        {
          entityType: "order",
          profileId: PROFILE,
          items: ids(n).map((entityId) => ({ entityId, data: { name: "x" } })),
          dry_run,
        } as any,
        ctx,
        sdk
      ),
  },
  {
    tool: "amazon_dsp_bulk_create_entities",
    run: (n, dry_run = false) =>
      bulkCreateEntitiesLogic(
        {
          entityType: "order",
          profileId: PROFILE,
          items: ids(n).map((name) => ({ name })),
          dry_run,
        } as any,
        ctx,
        sdk
      ),
  },
];

describe("Amazon DSP bulk capacity pre-check", () => {
  let http: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
  };
  const upstreamCalls = () =>
    http.get.mock.calls.length + http.post.mock.calls.length + http.put.mock.calls.length;

  beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter.clear();
    http = {
      get: vi.fn().mockResolvedValue({ bidding: { bidAmount: 1 } }),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue({}),
    };
    mockResolveSessionServices.mockReturnValue({
      amazonDspService: new AmazonDspService(rateLimiter, http as any),
      boundProfileId: PROFILE,
    });
    mockElicit.mockResolvedValue(true);
  });

  afterEach(() => {
    rateLimiter.clear();
  });

  it("runs against the package's real default limiter config", () => {
    expect(rateLimiter.describeLimits()).toEqual([
      { pattern: "amazon_dsp:*", limit: 10, windowMs: 60_000, maxWaitMs: 120_000 },
    ]);
  });

  describe.each(cases)("$tool", ({ tool, run }) => {
    it("refuses a batch that exceeds capacity with zero prompts and zero upstream calls", async () => {
      const err = await run(10).then(
        () => undefined,
        (e: unknown) => e
      );
      expect(err).toBeInstanceOf(McpError);
      expect((err as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
      expect((err as McpError).data).toMatchObject({
        reason: "bulk_exceeds_capacity",
        itemCount: 10,
        itemsThatFit: 9,
      });
      expect((err as McpError).message).toContain(tool);
      expect(mockElicit).not.toHaveBeenCalled();
      expect(upstreamCalls()).toBe(0);
      // Nothing was reserved: the full window is still available.
      expect(rateLimiter.getRemainingTokens("amazon_dsp:write")).toBe(10);
    });

    it("lets a batch that fits proceed", async () => {
      const result = await run(3);
      expect(upstreamCalls()).toBeGreaterThanOrEqual(3);
      expect(result.dryRun).toBeUndefined();
    });

    it("refuses against the live window, not an empty one", async () => {
      await run(3); // 9 write tokens now held in the current window
      vi.clearAllMocks();
      http.get.mockResolvedValue({ bidding: { bidAmount: 1 } });
      http.put.mockResolvedValue({});
      http.post.mockResolvedValue({});
      mockElicit.mockResolvedValue(true);

      const err = (await run(7).catch((e: unknown) => e)) as McpError;
      expect(err).toBeInstanceOf(McpError);
      expect(err.data).toMatchObject({ reason: "bulk_exceeds_capacity", itemsThatFit: 6 });
      expect(mockElicit).not.toHaveBeenCalled();
      expect(upstreamCalls()).toBe(0);
    });

    it("dry-run predicts the refusal with BULK_EXCEEDS_CAPACITY", async () => {
      const refused = await run(10, true);
      expect(refused.dryRun.wouldSucceed).toBe(false);
      const capacityError = refused.dryRun.validationErrors.find(
        (e: { code: string }) => e.code === "BULK_EXCEEDS_CAPACITY"
      );
      expect(capacityError?.message).toContain("9 item(s) fit");

      const fits = await run(3, true);
      expect(fits.dryRun.wouldSucceed).toBe(true);
      expect(fits.dryRun.validationErrors).toEqual([]);

      expect(mockElicit).not.toHaveBeenCalled();
      expect(upstreamCalls()).toBe(0);
    });
  });
});
