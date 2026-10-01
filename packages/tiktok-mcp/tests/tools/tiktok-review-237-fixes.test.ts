// Fleet review 2026-09 (#237), tiktok-mcp findings fixed in the triage pass.
// Basis: TikTok's official tiktok-business-api-sdk (f809c39), unless stated.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveSessionServices } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

import {
  GetTargetingOptionsInputSchema,
  getTargetingOptionsLogic,
} from "../../src/mcp-server/tools/definitions/get-targeting-options.tool.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import {
  GetPacingStatusInputSchema,
  getPacingStatusLogic,
  getPacingStatusResponseFormatter,
  getPacingStatusTool,
} from "../../src/mcp-server/tools/definitions/get-pacing-status.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("#24 get_targeting_options sends the parameters each endpoint names", () => {
  let svc: { getTargetingOptions: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    svc = { getTargetingOptions: vi.fn().mockResolvedValue({}) };
    mockResolveSessionServices.mockReturnValue({
      boundAdvertiserId: "123",
      tiktokService: svc,
    });
  });

  it("LOCATION sends promotion_target_type (python_sdk ToolApi.tool_region all_params)", async () => {
    await getTargetingOptionsLogic(
      GetTargetingOptionsInputSchema.parse({
        advertiserId: "123",
        optionType: "LOCATION",
        placements: ["PLACEMENT_TIKTOK"],
        objectiveType: "TRAFFIC",
        promotionType: "WEBSITE",
      }),
      ctx,
      sdk
    );
    const [, params] = svc.getTargetingOptions.mock.calls[0]!;
    expect(params).toMatchObject({ promotion_target_type: "WEBSITE" });
    expect(params).not.toHaveProperty("promotion_type");
  });

  it("INTEREST_KEYWORD without a keyword fails before any request (keyword is required)", async () => {
    await expect(
      getTargetingOptionsLogic(
        GetTargetingOptionsInputSchema.parse({
          advertiserId: "123",
          optionType: "INTEREST_KEYWORD",
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/require `keyword`/);
    expect(svc.getTargetingOptions).not.toHaveBeenCalled();
  });
});

describe("#28 bulk_update_status dry_run reports the batch size", () => {
  it("totalRequested equals the number of entity ids", async () => {
    mockResolveSessionServices.mockReturnValue({ boundAdvertiserId: "123", tiktokService: {} });
    const result = await bulkUpdateStatusLogic(
      {
        entityType: "campaign",
        advertiserId: "123",
        entityIds: ["1", "2", "3"],
        operationStatus: "DISABLE",
        dry_run: true,
      } as any,
      ctx,
      sdk
    );
    expect(result.totalRequested).toBe(3);
  });
});

describe("#30 get_pacing_status", () => {
  it("labels amounts with the requested currency, not $", async () => {
    const input = GetPacingStatusInputSchema.parse({
      advertiserId: "123",
      campaignId: "c",
      spendToDate: 2500,
      budgetTotal: 10000,
      flightStartDate: "2026-09-01",
      flightEndDate: "2026-10-31",
      currency: "EUR",
    });
    const result = await getPacingStatusLogic(input, ctx);
    const text = getPacingStatusResponseFormatter(result, input)[0].text;
    expect(text).not.toContain("$");
    expect(text).toContain(`Total: ${(10000).toLocaleString()} EUR`);
  });

  it("points at the ad groups for flight dates (AdgroupCreateBody has schedule_*; CampaignCreateBody does not)", () => {
    expect(getPacingStatusTool.description).toMatch(/ad groups/);
    expect(getPacingStatusTool.description).toMatch(/schedule_start_time/);
  });
});
