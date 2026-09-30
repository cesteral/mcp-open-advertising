// Fleet review 2026-09 (#237), pinterest-mcp findings fixed in the triage pass.
// Spec references are to Pinterest's OpenAPI description v5.28.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";

const { mockResolveSessionServices, mockElicitDelete, mockElicitStatus, mockElicitBids } =
  vi.hoisted(() => ({
    mockResolveSessionServices: vi.fn(),
    mockElicitDelete: vi.fn(),
    mockElicitStatus: vi.fn(),
    mockElicitBids: vi.fn(),
  }));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    elicitBulkDeleteConfirmation: mockElicitDelete,
    elicitBulkStatusChangeConfirmation: mockElicitStatus,
    elicitBidChangeConfirmation: mockElicitBids,
  };
});

import { deleteEntityLogic } from "../../src/mcp-server/tools/definitions/delete-entity.tool.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { adjustBidsLogic } from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";
import { ListAdvertisersInputSchema } from "../../src/mcp-server/tools/definitions/list-ad-accounts.tool.js";
import {
  GetPacingStatusInputSchema,
  getPacingStatusLogic,
  getPacingStatusResponseFormatter,
} from "../../src/mcp-server/tools/definitions/get-pacing-status.tool.js";
import { buildReportRequestBody } from "../../src/services/pinterest/pinterest-reporting-service.js";
import { PinterestService } from "../../src/services/pinterest/pinterest-service.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

describe("#24 account scope is checked before the user is asked to confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Session bound to a different ad account than the one the call names.
    mockResolveSessionServices.mockReturnValue({
      boundAdAccountId: "999",
      pinterestService: {},
    });
    mockElicitDelete.mockResolvedValue(true);
    mockElicitStatus.mockResolvedValue(true);
    mockElicitBids.mockResolvedValue(true);
  });

  it("delete_entity", async () => {
    await expect(
      deleteEntityLogic(
        { entityType: "campaign", adAccountId: "123", entityIds: ["1"] } as any,
        ctx,
        sdk
      )
    ).rejects.toThrow();
    expect(mockElicitDelete).not.toHaveBeenCalled();
  });

  it("bulk_update_status", async () => {
    await expect(
      bulkUpdateStatusLogic(
        {
          entityType: "campaign",
          adAccountId: "123",
          entityIds: ["1"],
          operationStatus: "PAUSED",
        } as any,
        ctx,
        sdk
      )
    ).rejects.toThrow();
    expect(mockElicitStatus).not.toHaveBeenCalled();
  });

  it("adjust_bids", async () => {
    await expect(
      adjustBidsLogic(
        { adAccountId: "123", adjustments: [{ adGroupId: "1", bidPrice: 1.5 }] } as any,
        ctx,
        sdk
      )
    ).rejects.toThrow();
    expect(mockElicitBids).not.toHaveBeenCalled();
  });
});

describe("#20 an empty-string bookmark ends list_entities pagination", () => {
  it("normalizes '' to null (bookmark is a nullable string; '' is the last page)", async () => {
    const httpClient = { get: vi.fn().mockResolvedValue({ items: [{ id: "1" }], bookmark: "" }) };
    const rateLimiter = { consume: vi.fn().mockResolvedValue(undefined) };
    const service = new PinterestService(
      rateLimiter as any,
      httpClient as any,
      pino({ level: "silent" })
    );
    const { pageInfo } = await service.listEntities("campaign", { adAccountId: "123" });
    expect(pageInfo.bookmark).toBeNull();
  });
});

describe("#21 list_ad_accounts page size follows the spec (max 250)", () => {
  it("accepts 250 and rejects 251", () => {
    expect(ListAdvertisersInputSchema.safeParse({ pageSize: 250 }).success).toBe(true);
    expect(ListAdvertisersInputSchema.safeParse({ pageSize: 251 }).success).toBe(false);
  });
});

describe("#22 report date ranges (analytics/create_report limits)", () => {
  const base = { columns: ["SPEND_IN_DOLLAR"], type: "CAMPAIGN" as const };

  it("allows 186 days at DAY granularity and refuses 187", () => {
    expect(() =>
      buildReportRequestBody({ ...base, start_date: "2026-01-01", end_date: "2026-07-06" })
    ).not.toThrow();
    expect(() =>
      buildReportRequestBody({ ...base, start_date: "2026-01-01", end_date: "2026-07-07" })
    ).toThrow(/at most 186 days/);
  });

  it("allows 3 days at HOUR granularity and refuses 4", () => {
    expect(() =>
      buildReportRequestBody({
        ...base,
        start_date: "2026-09-01",
        end_date: "2026-09-04",
        granularity: "HOUR",
      })
    ).not.toThrow();
    expect(() =>
      buildReportRequestBody({
        ...base,
        start_date: "2026-09-01",
        end_date: "2026-09-05",
        granularity: "HOUR",
      })
    ).toThrow(/at most 3 days/);
  });

  it("refuses an end date before the start date", () => {
    expect(() =>
      buildReportRequestBody({ ...base, start_date: "2026-09-10", end_date: "2026-09-01" })
    ).toThrow(/before start_date/);
  });
});

describe("#26 pacing formatter prints the requested currency", () => {
  it("does not print $ for a EUR campaign", async () => {
    const input = GetPacingStatusInputSchema.parse({
      adAccountId: "1",
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
});
