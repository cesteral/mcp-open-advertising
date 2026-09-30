/**
 * Fleet review 2026-09, cm360-mcp findings fixed in the #237 triage.
 *
 * Expected values cite the dfareporting v5 Discovery document, revision
 * 20260721 (https://dfareporting.googleapis.com/$discovery/rest?version=v5).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockState = vi.hoisted(() => ({
  cm360ReportingService: { runReport: vi.fn() },
  cm360Service: {},
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: vi.fn(() => mockState),
}));

import { getReportLogic } from "../../src/mcp-server/tools/definitions/get-report.tool.js";
import { getReportBreakdownsLogic } from "../../src/mcp-server/tools/definitions/get-report-breakdowns.tool.js";
import { validateEntityLogic } from "../../src/mcp-server/tools/definitions/validate-entity.tool.js";
import { reportingReferenceResource } from "../../src/mcp-server/resources/definitions/reporting-reference.resource.js";
import { getReportingWorkflowMessage } from "../../src/mcp-server/prompts/definitions/reporting-workflow.prompt.js";
import { CM360_REPORT_TYPE_VALUES } from "../../src/mcp-server/tools/utils/report-config.js";

const ctx = { requestId: "r" } as any;

/** `Creative.type` enum, v5 Discovery rev 20260721 (25 values). */
const V5_CREATIVE_TYPES = [
  "IMAGE",
  "DISPLAY_REDIRECT",
  "CUSTOM_DISPLAY",
  "INTERNAL_REDIRECT",
  "CUSTOM_DISPLAY_INTERSTITIAL",
  "INTERSTITIAL_INTERNAL_REDIRECT",
  "TRACKING_TEXT",
  "RICH_MEDIA_DISPLAY_BANNER",
  "RICH_MEDIA_INPAGE_FLOATING",
  "RICH_MEDIA_IM_EXPAND",
  "RICH_MEDIA_DISPLAY_EXPANDING",
  "RICH_MEDIA_DISPLAY_INTERSTITIAL",
  "RICH_MEDIA_DISPLAY_MULTI_FLOATING_INTERSTITIAL",
  "RICH_MEDIA_MOBILE_IN_APP",
  "FLASH_INPAGE",
  "INSTREAM_VIDEO",
  "VPAID_LINEAR_VIDEO",
  "VPAID_NON_LINEAR_VIDEO",
  "INSTREAM_VIDEO_REDIRECT",
  "RICH_MEDIA_PEEL_DOWN",
  "HTML5_BANNER",
  "DISPLAY",
  "DISPLAY_IMAGE_GALLERY",
  "BRAND_SAFE_DEFAULT_INSTREAM_VIDEO",
  "INSTREAM_AUDIO",
];

describe("cm360 review #4: the read-only report tools do not create scheduled or mailed reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.cm360ReportingService.runReport.mockResolvedValue({
      reportId: "r1",
      fileId: "f1",
      file: {},
    });
  });

  const base = {
    profileId: "123",
    name: "n",
    type: "STANDARD" as const,
    criteria: { dimensions: [{ name: "campaign" }], metricNames: ["impressions"] },
  };

  it.each([
    ["schedule", { schedule: { active: true, repeats: "DAILY", every: 1 } }],
    ["delivery", { delivery: { emailOwner: true, recipients: [{ email: "x@example.com" }] } }],
  ])("cm360_get_report refuses additionalConfig.%s", async (_field, additionalConfig) => {
    await expect(getReportLogic({ ...base, additionalConfig } as any, ctx)).rejects.toThrow(
      /cm360_create_report_schedule/
    );
    expect(mockState.cm360ReportingService.runReport).not.toHaveBeenCalled();
  });

  it("cm360_get_report_breakdowns refuses additionalConfig.schedule", async () => {
    await expect(
      getReportBreakdownsLogic(
        {
          ...base,
          breakdownDimensions: ["date"],
          additionalConfig: { schedule: { active: true } },
        } as any,
        ctx
      )
    ).rejects.toThrow(/cm360_create_report_schedule/);
    expect(mockState.cm360ReportingService.runReport).not.toHaveBeenCalled();
  });

  it("still passes other additionalConfig fields through", async () => {
    await getReportLogic({ ...base, additionalConfig: { format: "CSV" } } as any, ctx);
    const [, config] = mockState.cm360ReportingService.runReport.mock.calls[0];
    expect(config.format).toBe("CSV");
    expect(config.schedule).toBeUndefined();
  });
});

describe("cm360 review #7: creative type validation follows the v5 enum", () => {
  it.each(V5_CREATIVE_TYPES)("accepts %s", async (type) => {
    const result = await validateEntityLogic(
      { entityType: "creative", mode: "create", data: { name: "c", type } },
      ctx
    );
    expect(result.issues.filter((i) => i.field === "type")).toEqual([]);
  });

  it("rejects REDIRECT, which v5 does not have", async () => {
    const result = await validateEntityLogic(
      { entityType: "creative", mode: "create", data: { name: "c", type: "REDIRECT" } },
      ctx
    );
    expect(result.valid).toBe(false);
    expect(result.issues.find((i) => i.field === "type")?.code).toBe("invalidValue");
  });
});

describe("cm360 review #8: report types named in the resource and prompt are v5 values", () => {
  const typeRows = (text: string) =>
    [...text.matchAll(/^\| ([A-Z_]+) \|/gm)].map((m) => m[1]).filter((t) => t !== "Type");

  it("reporting-reference lists exactly the v5 Report.type values", () => {
    expect(typeRows(reportingReferenceResource.getContent()).sort()).toEqual(
      [...CM360_REPORT_TYPE_VALUES].sort()
    );
  });

  it("the reporting workflow prompt names no report type outside the v5 enum", () => {
    const text = getReportingWorkflowMessage({ profileId: "123" } as any);
    expect(text).not.toContain("CROSS_DIMENSION_REACH");
    expect(text).toContain("CROSS_MEDIA_REACH");
  });
});
