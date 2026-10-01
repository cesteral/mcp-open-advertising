/**
 * Fleet review 2026-09, gads-mcp findings fixed in the #237 triage.
 */
import { describe, it, expect, vi } from "vitest";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import { GAdsService } from "../../src/services/gads/gads-service.js";
import { getPacingStatusResponseFormatter } from "../../src/mcp-server/tools/definitions/get-pacing-status.tool.js";

const logger: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

function makeService(fetch: ReturnType<typeof vi.fn>) {
  const httpClient: any = { fetch, developerToken: "d", loginCustomerId: undefined };
  const rateLimiter: any = { consume: vi.fn().mockResolvedValue(undefined) };
  return new GAdsService(logger, rateLimiter, httpClient);
}

/** The McpError shape executeWithRetry throws for an upstream HTTP error. */
function upstreamError(httpStatus: number, message: string) {
  return new McpError(JsonRpcErrorCode.InvalidRequest, message, {
    httpStatus,
    errorBody: '{"error":{"code":' + httpStatus + ',"details":[…raw…]}}',
  });
}

describe("gads review #18: validateEntity reports only a 400 as an invalid payload", () => {
  it("returns the parsed summary for a 400", async () => {
    const svc = makeService(
      vi
        .fn()
        .mockRejectedValue(
          upstreamError(
            400,
            "Google Ads API request failed: 400 Bad Request — [fieldError=REQUIRED] The required field was not present."
          )
        )
    );
    const verdict = await svc.validateEntity("campaign", "123", { name: "x" }, "create");
    expect(verdict.valid).toBe(false);
    expect(verdict.errors).toEqual([
      "Google Ads API request failed: 400 Bad Request — [fieldError=REQUIRED] The required field was not present.",
    ]);
  });

  it.each([401, 403, 429, 500])(
    "rethrows a %s instead of calling the payload invalid",
    async (status) => {
      const svc = makeService(
        vi.fn().mockRejectedValue(upstreamError(status, `Google Ads API request failed: ${status}`))
      );
      await expect(svc.validateEntity("campaign", "123", { name: "x" }, "create")).rejects.toThrow(
        String(status)
      );
    }
  );
});

describe("gads review #17: adjust_bids never interpolates a non-numeric ad group id into GAQL", () => {
  it("fails the item without sending anything", async () => {
    const fetch = vi.fn().mockResolvedValue({ results: [] });
    const svc = makeService(fetch);
    const { results } = await svc.adjustBids("123", [
      { adGroupId: "1 OR ad_group.id > 0", cpcBidMicros: "1000000" },
    ]);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("numeric ad group ID");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("gads review #16: pacing prints the caller's currency, not a hard-coded $", () => {
  it("uses the ISO code", () => {
    const [block] = getPacingStatusResponseFormatter(
      {
        advertiserId: "1",
        campaignId: "2",
        budget: { total: 1000, spent: 400, remaining: 600, currency: "JPY" },
        flight: {
          startDate: "2026-02-01",
          endDate: "2026-02-28",
          daysElapsed: 10,
          daysRemaining: 18,
          totalDays: 28,
        },
        pacing: {
          expectedSpendPercent: 35.7,
          actualSpendPercent: 40,
          pacingRatio: 1.12,
          status: "AHEAD",
          projectedEndSpend: 1120,
        },
        timestamp: "2026-02-10T00:00:00.000Z",
      } as any,
      {} as any
    );
    expect(block.text).toContain("Total: 1,000 JPY");
    expect(block.text).not.toContain("$");
  });
});
