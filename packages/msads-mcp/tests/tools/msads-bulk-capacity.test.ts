// Bulk capacity pre-check: a batch the package's real limiter cannot admit
// within its queue budget is refused BEFORE the confirmation prompt and BEFORE
// any upstream call; the dry-run predicts the same refusal.
//
// Uses the package's own `rateLimiter` (default config: msads:* at 10/min,
// 120s queue budget) and a real MsAdsService over a fake HTTP client, so the
// token pattern under test is the one the service really consumes:
//   - bulk create / update: one 3-token msads:write request per chunk of
//     `batchLimit` items → 9 requests fit (3 per window at t=0, 60s, 120s).
//     For `ad` (batchLimit 50) that is 450 items; 451 needs a 10th request.
//   - bulk status: one 1-token msads:write request per id → 30 fit.

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
    elicitBulkStatusChangeConfirmation: mockElicit,
    elicitBulkMutationConfirmation: mockElicit,
  };
});

import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import { rateLimiter } from "../../src/utils/platform.js";
import { MsAdsService } from "../../src/services/msads/msads-service.js";
import { bulkCreateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { bulkUpdateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;
const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

const createAds = (n: number, dry_run = false, entityType = "ad") =>
  bulkCreateEntitiesLogic(
    {
      entityType,
      adGroupId: "42",
      items: range(n).map((i) => ({ Title: `t${i}` })),
      dry_run,
    } as any,
    ctx,
    sdk
  );
const updateAds = (n: number, dry_run = false) =>
  bulkUpdateEntitiesLogic(
    {
      entityType: "ad",
      adGroupId: "42",
      items: range(n).map((Id) => ({ Id, Title: "x" })),
      dry_run,
    } as any,
    ctx,
    sdk
  );
const updateStatus = (n: number, dry_run = false) =>
  bulkUpdateStatusLogic(
    {
      entityType: "campaign",
      accountId: "789",
      entityIds: range(n).map(String),
      status: "Paused",
      dry_run,
    } as any,
    ctx,
    sdk
  );

describe("Microsoft Ads bulk capacity pre-check", () => {
  let http: Record<"post" | "put" | "delete" | "request", ReturnType<typeof vi.fn>>;
  const upstreamCalls = () => Object.values(http).reduce((n, fn) => n + fn.mock.calls.length, 0);

  function resetMocks() {
    vi.clearAllMocks();
    http = {
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      request: vi.fn().mockResolvedValue({}),
    };
    mockResolveSessionServices.mockReturnValue({
      msadsService: new MsAdsService(rateLimiter, http as any, logger),
    });
    mockElicit.mockResolvedValue(true);
  }

  async function refusal(p: Promise<unknown>): Promise<McpError> {
    const err = await p.then(
      () => undefined,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).code).toBe(JsonRpcErrorCode.RateLimited);
    return err as McpError;
  }

  beforeEach(() => {
    rateLimiter.clear();
    resetMocks();
  });

  afterEach(() => {
    rateLimiter.clear();
  });

  it("runs against the package's real default limiter config", () => {
    expect(rateLimiter.describeLimits()).toEqual([
      { pattern: "msads:*", limit: 10, windowMs: 60_000, maxWaitMs: 120_000 },
    ]);
  });

  describe.each([
    { tool: "msads_bulk_create_entities", run: createAds, verb: "post" as const },
    { tool: "msads_bulk_update_entities", run: updateAds, verb: "put" as const },
  ])("$tool (chunked: one request per batchLimit items)", ({ tool, run, verb }) => {
    it("refuses a batch whose chunks exceed capacity, reporting items (not chunks) that fit", async () => {
      const err = await refusal(run(451));
      expect(err.message).toContain(tool);
      expect(err.data).toMatchObject({
        reason: "bulk_exceeds_capacity",
        itemCount: 451,
        itemsThatFit: 450,
        chunkSize: 50,
        chunkCount: 10,
        chunksThatFit: 9,
      });
      expect(mockElicit).not.toHaveBeenCalled();
      expect(upstreamCalls()).toBe(0);
      expect(rateLimiter.getRemainingTokens("msads:write")).toBe(10);
    });

    it("lets a batch that fits proceed, one request per chunk", async () => {
      // 150 items = 3 requests = 9 tokens: admitted at once, no queueing.
      await run(150);
      expect(http[verb]).toHaveBeenCalledTimes(3);
    });

    it("refuses against the live window, not an empty one", async () => {
      await run(50); // one request = 3 tokens held
      resetMocks();
      const err = await refusal(run(401)); // 9 requests; only 8 fit now
      expect(err.data).toMatchObject({ chunksThatFit: 8, itemsThatFit: 400 });
      expect(mockElicit).not.toHaveBeenCalled();
      expect(upstreamCalls()).toBe(0);
    });

    it("dry-run predicts the refusal with BULK_EXCEEDS_CAPACITY", async () => {
      const refused: any = await run(451, true);
      expect(refused.dryRun.wouldSucceed).toBe(false);
      const capacityError = refused.dryRun.validationErrors.find(
        (e: { code: string }) => e.code === "BULK_EXCEEDS_CAPACITY"
      );
      expect(capacityError?.message).toContain("450 item(s)");

      const fits: any = await run(450, true);
      expect(fits.dryRun.wouldSucceed).toBe(true);
      expect(fits.dryRun.validationErrors).toEqual([]);
      expect(mockElicit).not.toHaveBeenCalled();
      expect(upstreamCalls()).toBe(0);
    });
  });

  it("models the chunk size per entity type (keyword batchLimit 1000: 451 items = one request)", async () => {
    await createAds(451, false, "keyword");
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  describe("msads_bulk_update_status (one 1-token request per id)", () => {
    it("refuses a batch that exceeds capacity with zero prompts and zero upstream calls", async () => {
      const err = await refusal(updateStatus(31));
      expect(err.message).toContain("msads_bulk_update_status");
      expect(err.data).toMatchObject({
        reason: "bulk_exceeds_capacity",
        itemCount: 31,
        itemsThatFit: 30,
      });
      expect(mockElicit).not.toHaveBeenCalled();
      expect(upstreamCalls()).toBe(0);
    });

    it("lets a batch that fits proceed", async () => {
      await updateStatus(3);
      expect(mockElicit).toHaveBeenCalledOnce();
      expect(http.put).toHaveBeenCalledTimes(3);
    });

    it("refuses against the live window, not an empty one", async () => {
      await updateStatus(3);
      resetMocks();
      const err = await refusal(updateStatus(28));
      expect(err.data).toMatchObject({ itemsThatFit: 27 });
      expect(mockElicit).not.toHaveBeenCalled();
      expect(upstreamCalls()).toBe(0);
    });

    it("dry-run predicts the refusal with BULK_EXCEEDS_CAPACITY", async () => {
      const refused: any = await updateStatus(31, true);
      expect(refused.dryRun.wouldSucceed).toBe(false);
      expect(
        refused.dryRun.validationErrors.some(
          (e: { code: string }) => e.code === "BULK_EXCEEDS_CAPACITY"
        )
      ).toBe(true);
      const fits: any = await updateStatus(30, true);
      expect(fits.dryRun.wouldSucceed).toBe(true);
      expect(upstreamCalls()).toBe(0);
    });
  });
});
