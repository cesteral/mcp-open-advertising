/**
 * Fleet review 2026-09, sa360-mcp findings fixed in the #237 triage.
 *
 * Field names cite the Search Ads 360 Reporting API v0 Discovery document,
 * revision 20260820 (https://searchads360.googleapis.com/$discovery/rest?version=v0).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";
import { allTools } from "../../src/mcp-server/tools/definitions/index.js";
import { SA360SearchInputSchema } from "../../src/mcp-server/tools/definitions/gaql-search.tool.js";
import { getPacingStatusTool } from "../../src/mcp-server/tools/definitions/get-pacing-status.tool.js";
import { SA360ReportingService } from "../../src/services/sa360-v2/reporting-service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("sa360 review #14: path-interpolated ids cannot leave their path segment", () => {
  it("sa360_gaql_search requires a numeric customerId, like its siblings", () => {
    expect(
      SA360SearchInputSchema.safeParse({ customerId: "123", query: "SELECT x FROM y" }).success
    ).toBe(true);
    for (const customerId of ["123/../../v23/customers/9", "123#", "123-456-7890"]) {
      expect(
        SA360SearchInputSchema.safeParse({ customerId, query: "SELECT x FROM y" }).success,
        customerId
      ).toBe(false);
    }
  });

  it("check_report_status encodes the caller's reportId", async () => {
    const fetch = vi.fn().mockResolvedValue({ id: "x", isReportReady: false });
    const service = new SA360ReportingService(
      { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      { consume: vi.fn().mockResolvedValue(undefined) } as any,
      { fetch } as any,
      {} as any
    );
    await service.getReportStatus("../conversion#x");
    expect(fetch.mock.calls[0][0]).toBe("/reports/..%2Fconversion%23x");
  });
});

describe("sa360 review #19: pacing points at a budget amount that exists", () => {
  it("names campaign_budget.amount_micros (a v0 CampaignBudget field) rather than get_entity", () => {
    expect(getPacingStatusTool.description).toContain("campaign_budget.amount_micros");
    expect(getPacingStatusTool.description).not.toMatch(
      /populate budget and flight dates, first call `sa360_get_entity`/
    );
  });
});

describe("sa360 review #22: every tool that calls the SA360 API is open-world", () => {
  // The two client-side tools never leave the process.
  const CLIENT_SIDE = new Set(["sa360_get_pacing_status", "sa360_validate_conversion"]);

  it.each(allTools.filter((t) => !CLIENT_SIDE.has(t.name)).map((t) => [t.name, t] as const))(
    "%s",
    (_name, tool) => {
      expect(tool.annotations?.openWorldHint).toBe(true);
    }
  );
});

describe("sa360 review #23: registry documentation_url is Discovery's documentationLink", () => {
  it("points at the Reporting API docs root", () => {
    const registry = JSON.parse(
      readFileSync(resolve(__dirname, "../../../../registry.json"), "utf8")
    ) as { servers: Array<{ package: string; documentation_url: string }> };
    const entry = registry.servers.find((s) => s.package === "sa360-mcp")!;
    expect(entry.documentation_url).toBe("https://developers.google.com/search-ads/reporting");
  });
});
