/**
 * Fleet review 2026-09, dbm-mcp findings fixed in the #237 triage.
 *
 * Report types cite the Bid Manager v2 Discovery document, revision 20260923
 * (https://doubleclickbidmanager.googleapis.com/$discovery/rest?version=v2).
 * Metric and filter names are checked against the package's own catalogue
 * (data/bid-manager-reference.json), the same one strict validation enforces.
 */
import { describe, it, expect, vi } from "vitest";
import { QUERY_EXAMPLES } from "../../src/mcp-server/resources/definitions/query-examples.resource.js";
import { reportTypesResource } from "../../src/mcp-server/resources/definitions/report-types.resource.js";
import { getPacingPerformanceAnalysisMessage } from "../../src/mcp-server/prompts/definitions/pacing-performance-analysis.prompt.js";
import { validateQueryParams } from "../../src/mcp-server/tools/utils/query-validation.js";
import { RunCustomQueryInputSchema } from "../../src/mcp-server/tools/definitions/run-custom-query.tool.js";
import { GetCampaignDeliveryInputSchema } from "../../src/mcp-server/tools/definitions/get-campaign-delivery.tool.js";
import { GetHistoricalMetricsInputSchema } from "../../src/mcp-server/tools/definitions/get-historical-metrics.tool.js";
import { GetPerformanceMetricsInputSchema } from "../../src/mcp-server/tools/definitions/get-performance-metrics.tool.js";
import {
  GetPacingStatusInputSchema,
  getPacingStatusTool,
  getPacingStatusResponseFormatter,
} from "../../src/mcp-server/tools/definitions/get-pacing-status.tool.js";
import { BidManagerService } from "../../src/services/bid-manager/BidManagerService.js";

describe("dbm review #7: shipped examples pass the server's own strict validation", () => {
  it.each(Object.entries(QUERY_EXAMPLES))("query-examples %s", (_key, example) => {
    const { params, metadata } = example.querySpec as {
      params: {
        type: string;
        groupBys: string[];
        metrics: string[];
        filters?: Array<{ type: string; value: string }>;
      };
      metadata: { dataRange: { range: string } };
    };
    const result = validateQueryParams(
      {
        reportType: params.type,
        groupBys: params.groupBys,
        metrics: params.metrics,
        filters: params.filters,
        dateRange: { preset: metadata.dataRange.range },
      },
      true
    );
    expect(result.errors.map((e) => e.value)).toEqual([]);
  });

  it("the report-types resource names only catalogue metrics and filters", () => {
    const text = reportTypesResource.getContent();
    const tokens = [...text.matchAll(/"((?:METRIC|FILTER)_[A-Z0-9_]+)"/g)].map((m) => m[1]);
    const result = validateQueryParams(
      {
        reportType: "STANDARD",
        groupBys: tokens.filter((t) => t.startsWith("FILTER_")),
        metrics: tokens.filter((t) => t.startsWith("METRIC_")),
        dateRange: { preset: "LAST_7_DAYS" },
      },
      true
    );
    expect(result.errors.map((e) => e.value)).toEqual([]);
  });

  it("the pacing prompt's custom query is a valid dbm_run_custom_query call", () => {
    const text = getPacingPerformanceAnalysisMessage({ advertiserId: "123", campaignId: "456" });
    const block = [...text.matchAll(/```json\n([\s\S]*?)```/g)]
      .map((m) => JSON.parse(m[1]))
      .find((b) => b.tool === "dbm_run_custom_query");
    expect(block).toBeDefined();
    const parsed = RunCustomQueryInputSchema.safeParse(block.params);
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    expect(JSON.stringify(block)).not.toContain("FILTER_CAMPAIGN");
  });
});

describe("dbm review #8: INVENTORY_AVAILABILITY (v2 Discovery, not deprecated) is a valid report type", () => {
  it("passes strict validation", () => {
    const result = validateQueryParams(
      {
        reportType: "INVENTORY_AVAILABILITY",
        groupBys: ["FILTER_DATE"],
        metrics: ["METRIC_IMPRESSIONS"],
        dateRange: { preset: "LAST_7_DAYS" },
      },
      true
    );
    expect(result.errors).toEqual([]);
  });
});

describe("dbm review #13: reversed date ranges are rejected before any query", () => {
  const base = { advertiserId: "1", campaignId: "2" };

  it.each([
    [
      "delivery",
      GetCampaignDeliveryInputSchema,
      { ...base, startDate: "2026-02-10", endDate: "2026-02-01" },
    ],
    [
      "historical",
      GetHistoricalMetricsInputSchema,
      { ...base, startDate: "2026-02-10", endDate: "2026-02-01", granularity: "daily" },
    ],
    [
      "performance",
      GetPerformanceMetricsInputSchema,
      { ...base, startDate: "2026-02-10", endDate: "2026-02-01" },
    ],
    [
      "pacing",
      GetPacingStatusInputSchema,
      { ...base, budgetTotal: 1, flightStartDate: "2026-02-10", flightEndDate: "2026-02-01" },
    ],
    [
      "custom query",
      RunCustomQueryInputSchema,
      {
        groupBys: ["FILTER_DATE"],
        metrics: ["METRIC_IMPRESSIONS"],
        dateRange: { startDate: "2026-02-10", endDate: "2026-02-01" },
      },
    ],
  ] as const)("%s", (_name, schema, input) => {
    const result = (schema as any).safeParse(input);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error.issues)).toContain("is before");
  });

  it("pacing refuses a flight that has not started without creating a query", async () => {
    const client = {
      queries: { create: vi.fn(), run: vi.fn(), delete: vi.fn(), reports: { get: vi.fn() } },
    };
    const logger: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const service = new BidManagerService({} as any, logger, client as any);
    await expect(
      service.getPacingStatus({
        advertiserId: "1",
        campaignId: "2",
        budgetTotal: 100,
        flightStartDate: "2999-01-01",
        flightEndDate: "2999-01-31",
      })
    ).rejects.toThrow(/no delivery to pace yet/);
    expect(client.queries.create).not.toHaveBeenCalled();
  });
});

describe("dbm review #15: pacing is not real-time and not always in dollars", () => {
  it("the description does not claim real-time pacing", () => {
    expect(getPacingStatusTool.description).not.toMatch(/real-time/i);
  });

  it("prints amounts with the caller's currency code", () => {
    const [block] = getPacingStatusResponseFormatter(
      {
        advertiserId: "1",
        campaignId: "2",
        budget: { total: 1000, spent: 400, remaining: 600, currency: "GBP" },
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
      },
      {} as any
    );
    expect(block.text).toContain("Total: 1,000 GBP");
    expect(block.text).toContain("Projected End Spend: 1120.00 GBP");
    expect(block.text).not.toContain("$");
  });
});
