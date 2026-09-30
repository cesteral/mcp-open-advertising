// Bulk capacity pre-check: a batch the package's real limiter cannot admit
// within its queue budget is refused BEFORE the confirmation prompt and BEFORE
// any upstream call; the dry-run predicts the same refusal.
//
// Uses the package's own `rateLimiter` (default config: linkedin:* at 10/min,
// 120s queue budget) and a real LinkedInService / LinkedInReportingService over
// a fake HTTP client, so the token pattern under test is the one the services
// really consume. At 3 tokens per write, 9 writes fit in the budget (3 per
// window at t=0, 60s, 120s); a 10th would be admitted at 180s. At 1 token per
// analytics read, 30 pivots fit.

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
    elicitBulkMutationConfirmation: mockElicit,
  };
});

import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import { rateLimiter } from "../../src/utils/platform.js";
import { LinkedInService } from "../../src/services/linkedin/linkedin-service.js";
import { LinkedInReportingService } from "../../src/services/linkedin/linkedin-reporting-service.js";
import { adjustBidsLogic } from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { bulkUpdateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { bulkCreateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { getAnalyticsBreakdownsLogic } from "../../src/mcp-server/tools/definitions/get-analytics-breakdowns.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;
const ACCOUNT = "urn:li:sponsoredAccount:123";

const urns = (n: number) => Array.from({ length: n }, (_, i) => `urn:li:sponsoredCampaign:${i}`);

type Case = { tool: string; run: (n: number, dryRun?: boolean) => Promise<any> };

const cases: Case[] = [
  {
    tool: "linkedin_adjust_bids",
    run: (n, dry_run = false) =>
      adjustBidsLogic(
        {
          adjustments: urns(n).map((campaignUrn) => ({
            campaignUrn,
            amount: "10.00",
            currencyCode: "USD",
          })),
          dry_run,
        } as any,
        ctx,
        sdk
      ),
  },
  {
    tool: "linkedin_bulk_update_status",
    run: (n, dry_run = false) =>
      bulkUpdateStatusLogic(
        { entityType: "campaign", entityUrns: urns(n), status: "PAUSED", dry_run } as any,
        ctx,
        sdk
      ),
  },
  {
    tool: "linkedin_bulk_update_entities",
    run: (n, dry_run = false) =>
      bulkUpdateEntitiesLogic(
        {
          entityType: "campaign",
          items: urns(n).map((entityUrn) => ({ entityUrn, data: { name: "x" } })),
          dry_run,
        } as any,
        ctx,
        sdk
      ),
  },
  {
    tool: "linkedin_bulk_create_entities",
    run: (n, dry_run = false) =>
      bulkCreateEntitiesLogic(
        {
          entityType: "campaignGroup",
          items: urns(n).map((_, i) => ({ account: ACCOUNT, name: `g${i}` })),
          dry_run,
        } as any,
        ctx,
        sdk
      ),
  },
];

describe("LinkedIn bulk capacity pre-check", () => {
  let http: Record<"get" | "post" | "patch" | "delete", ReturnType<typeof vi.fn>>;
  const upstreamCalls = () => Object.values(http).reduce((n, fn) => n + fn.mock.calls.length, 0);

  function resetMocks() {
    vi.clearAllMocks();
    http = {
      get: vi.fn().mockResolvedValue({ elements: [] }),
      post: vi.fn().mockResolvedValue({}),
      patch: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    };
    mockResolveSessionServices.mockReturnValue({
      linkedInService: new LinkedInService(rateLimiter, http as any),
      linkedInReportingService: new LinkedInReportingService(rateLimiter, http as any),
    });
    mockElicit.mockResolvedValue(true);
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
      { pattern: "linkedin:*", limit: 10, windowMs: 60_000, maxWaitMs: 120_000 },
    ]);
  });

  describe.each(cases)("$tool", ({ tool, run }) => {
    it("refuses a batch that exceeds capacity with zero prompts and zero upstream calls", async () => {
      const err = (await run(10).catch((e: unknown) => e)) as McpError;
      expect(err).toBeInstanceOf(McpError);
      expect(err.code).toBe(JsonRpcErrorCode.RateLimited);
      expect(err.data).toMatchObject({
        reason: "bulk_exceeds_capacity",
        itemCount: 10,
        itemsThatFit: 9,
      });
      expect(err.message).toContain(tool);
      expect(mockElicit).not.toHaveBeenCalled();
      expect(upstreamCalls()).toBe(0);
      expect(rateLimiter.getRemainingTokens("linkedin:default")).toBe(10);
    });

    it("lets a batch that fits proceed", async () => {
      const result = await run(3);
      expect(upstreamCalls()).toBe(3);
      expect(result.dryRun).toBeUndefined();
    });

    it("refuses against the live window, not an empty one", async () => {
      await run(3); // 9 write tokens now held in the current window
      resetMocks();
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

  describe("linkedin_get_analytics_breakdowns", () => {
    const run = (pivots: number) =>
      getAnalyticsBreakdownsLogic(
        {
          adAccountUrn: ACCOUNT,
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          pivots: Array.from({ length: pivots }, (_, i) => `PIVOT_${i}`),
        } as any,
        ctx,
        sdk
      );

    it("refuses a pivot list that exceeds capacity with zero upstream calls", async () => {
      const err = (await run(31).catch((e: unknown) => e)) as McpError;
      expect(err).toBeInstanceOf(McpError);
      expect(err.code).toBe(JsonRpcErrorCode.RateLimited);
      expect(err.data).toMatchObject({
        reason: "bulk_exceeds_capacity",
        itemCount: 31,
        itemsThatFit: 30,
      });
      expect(upstreamCalls()).toBe(0);
    });

    it("lets a pivot list that fits proceed", async () => {
      const result = await run(3);
      expect(upstreamCalls()).toBe(3);
      expect(result.results).toHaveLength(3);
    });
  });
});
