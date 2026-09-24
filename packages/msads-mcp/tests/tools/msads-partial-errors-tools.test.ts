import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";

/**
 * Tool-level coverage for Microsoft Ads partial failures: the platform answers
 * HTTP 200 with rejected items in `PartialErrors`, so a write tool that keys on
 * the status code reports success for writes that never happened.
 *
 * Single-entity tools run against a REAL MsAdsService over a mocked HTTP
 * client so the whole handler → service → response path is exercised.
 */

const { mockResolveSessionServices, mockElicitBulk, mockElicitBid } = vi.hoisted(() => ({
  mockResolveSessionServices: vi.fn(),
  mockElicitBulk: vi.fn(),
  mockElicitBid: vi.fn(),
}));

vi.mock("../../src/mcp-server/tools/utils/resolve-session.js", () => ({
  resolveSessionServices: mockResolveSessionServices,
}));

vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return {
    ...actual,
    elicitBulkMutationConfirmation: mockElicitBulk,
    elicitBidChangeConfirmation: mockElicitBid,
  };
});

import { McpError, EffectResultSchema } from "@cesteral/shared";
import type { RateLimiter } from "@cesteral/shared";
import { MsAdsService } from "../../src/services/msads/msads-service.js";
import type { MsAdsHttpClient } from "../../src/services/msads/msads-http-client.js";
import { createEntityLogic } from "../../src/mcp-server/tools/definitions/create-entity.tool.js";
import { updateEntityLogic } from "../../src/mcp-server/tools/definitions/update-entity.tool.js";
import { duplicateEntityLogic } from "../../src/mcp-server/tools/definitions/duplicate-entity.tool.js";
import {
  bulkCreateEntitiesLogic,
  bulkCreateEntitiesResponseFormatter,
  BulkCreateEntitiesOutputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import {
  bulkUpdateEntitiesLogic,
  bulkUpdateEntitiesResponseFormatter,
  BulkUpdateEntitiesOutputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import {
  adjustBidsLogic,
  adjustBidsResponseFormatter,
  AdjustBidsOutputSchema,
} from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";

const ctx = { requestId: "r" } as any;
const sdk = { sessionId: "s" } as any;

function batchError(index: number, message: string, errorCode: string) {
  return {
    Code: 1,
    Details: "",
    ErrorCode: errorCode,
    FieldPath: null,
    Index: index,
    Message: message,
  };
}

let http: {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  http = {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  };
  const rateLimiter = { consume: vi.fn().mockResolvedValue(undefined) } as unknown as RateLimiter;
  const msadsService = new MsAdsService(
    rateLimiter,
    http as unknown as MsAdsHttpClient,
    pino({ level: "silent" })
  );
  mockResolveSessionServices.mockReturnValue({ msadsService });
  mockElicitBulk.mockResolvedValue(true);
  mockElicitBid.mockResolvedValue(true);
});

describe("single-entity writes throw on PartialErrors", () => {
  it("msads_create_entity throws the upstream error instead of reporting a create", async () => {
    http.post.mockResolvedValueOnce({
      CampaignIds: [null],
      PartialErrors: [batchError(0, "The campaign name is too long", "CampaignNameTooLong")],
    });

    const call = createEntityLogic(
      {
        entityType: "campaign",
        data: { AccountId: 1, Campaigns: [{ Name: "x".repeat(200), DailyBudget: 5 }] },
      } as any,
      ctx,
      sdk
    );
    await expect(call).rejects.toBeInstanceOf(McpError);
    await expect(call).rejects.toThrow(/CampaignNameTooLong \(1\): The campaign name is too long/);
  });

  it("msads_update_entity throws instead of returning updated: true", async () => {
    // before-snapshot read, then the rejected PUT.
    http.post.mockResolvedValue({ Campaigns: [{ Id: 1, Name: "C", Status: "Active" }] });
    http.put.mockResolvedValueOnce({
      PartialErrors: [
        batchError(0, "Budget amount is below minimum", "BudgetAmountIsBelowMinimum"),
      ],
    });

    await expect(
      updateEntityLogic(
        {
          entityType: "campaign",
          entityId: "1",
          accountId: "9",
          data: { DailyBudget: 0.01 },
        } as any,
        ctx,
        sdk
      )
    ).rejects.toThrow(/BudgetAmountIsBelowMinimum/);
  });

  it("msads_duplicate_entity creates the copy Paused and throws if the Add was rejected", async () => {
    http.post
      .mockResolvedValueOnce({ Campaigns: [{ Id: 7, Name: "Live", Status: "Active" }] })
      .mockResolvedValueOnce({ CampaignIds: [8], PartialErrors: null });

    const ok = await duplicateEntityLogic(
      { entityType: "campaign", accountId: "100", entityId: "7" } as any,
      ctx,
      sdk
    );
    const addBody = http.post.mock.calls[1]![1] as { Campaigns: Array<Record<string, unknown>> };
    expect(addBody.Campaigns[0]!.Status).toBe("Paused");
    expect(ok.after?.status.platformRaw).toBe("Paused");
    expect(ok.after?.status.canonical).not.toBe("active");

    http.post
      .mockResolvedValueOnce({ Campaigns: [{ Id: 7, Name: "Live", Status: "Active" }] })
      .mockResolvedValueOnce({
        CampaignIds: [null],
        PartialErrors: [batchError(0, "Duplicate name", "DuplicateCampaignName")],
      });
    await expect(
      duplicateEntityLogic(
        { entityType: "campaign", accountId: "100", entityId: "7" } as any,
        ctx,
        sdk
      )
    ).rejects.toThrow(/DuplicateCampaignName/);
  });

  it("msads_duplicate_entity dry_run projects the copy as Paused", async () => {
    http.post.mockResolvedValueOnce({ Campaigns: [{ Id: 7, Name: "Live", Status: "Active" }] });

    const result = await duplicateEntityLogic(
      { entityType: "campaign", accountId: "100", entityId: "7", dry_run: true } as any,
      ctx,
      sdk
    );
    expect(result.dryRun?.expectedPostState?.status.platformRaw).toBe("Paused");
  });
});

describe("bulk writes report per-item failures", () => {
  it("msads_bulk_create_entities maps PartialErrors/null ids to items and counts them", async () => {
    http.post.mockResolvedValueOnce({
      AdGroupIds: [101, null],
      PartialErrors: [batchError(1, "Ad group name already exists", "DuplicateAdGroupName")],
    });

    const result = await bulkCreateEntitiesLogic(
      {
        entityType: "adGroup",
        campaignId: "1",
        items: [{ Name: "A" }, { Name: "A" }],
      } as any,
      ctx,
      sdk
    );

    expect(result.results).toEqual([
      { index: 0, entityId: "101", success: true },
      expect.objectContaining({ index: 1, success: false, errorCode: "DuplicateAdGroupName" }),
    ]);
    expect(result.effect?.summary).toMatchObject({
      requested: 2,
      succeeded: 1,
      failed: 1,
      partial_success: true,
    });
    expect(() => BulkCreateEntitiesOutputSchema.parse(result)).not.toThrow();
    expect(() => EffectResultSchema.parse(result.effect)).not.toThrow();
    const text = bulkCreateEntitiesResponseFormatter(result)[0]!.text;
    expect(text).toContain("Bulk created 1/2 adGroup entities (1 rejected by Microsoft Ads)");
  });

  it("msads_bulk_update_entities reports 0 succeeded when every item was rejected", async () => {
    http.put.mockResolvedValueOnce({
      PartialErrors: [
        batchError(0, "Invalid campaign", "CampaignIdInvalid"),
        batchError(1, "Invalid campaign", "CampaignIdInvalid"),
      ],
    });

    const result = await bulkUpdateEntitiesLogic(
      {
        entityType: "campaign",
        accountId: "9",
        items: [
          { Id: 1, DailyBudget: 10 },
          { Id: 2, DailyBudget: 20 },
        ],
      } as any,
      ctx,
      sdk
    );

    expect(result.results.map((r) => r.success)).toEqual([false, false]);
    expect(result.results.map((r) => r.entityId)).toEqual(["1", "2"]);
    expect(result.effect?.summary).toMatchObject({ requested: 2, succeeded: 0, failed: 2 });
    expect(() => BulkUpdateEntitiesOutputSchema.parse(result)).not.toThrow();
    const text = bulkUpdateEntitiesResponseFormatter(result)[0]!.text;
    expect(text).toContain("Bulk updated 0/2 campaign entities (2 rejected by Microsoft Ads)");
  });

  it("msads_adjust_bids reports rejected adjustments per entity", async () => {
    http.post.mockResolvedValueOnce({
      Keywords: [
        { Id: 1, Bid: { Amount: 1 } },
        { Id: 2, Bid: { Amount: 1 } },
      ],
    });
    http.put.mockResolvedValueOnce({
      PartialErrors: [batchError(0, "Bid too high", "BidAmountsGreaterThanCeilingPrice")],
    });

    const result = await adjustBidsLogic(
      {
        entityType: "keyword",
        scope: { adGroupId: "9" },
        adjustments: [
          { entityId: "1", bidField: "Bid", newBid: 500 },
          { entityId: "2", bidField: "Bid", newBid: 2 },
        ],
      } as any,
      ctx,
      sdk
    );

    expect(result.result.adjustmentResults).toEqual([
      expect.objectContaining({ entityId: "1", success: false }),
      { entityId: "2", success: true },
    ]);
    expect(result.result.PartialErrors).toHaveLength(1);
    expect(result.effect?.summary).toMatchObject({
      requested: 2,
      succeeded: 1,
      failed: 1,
      partial_success: true,
    });
    expect(() => AdjustBidsOutputSchema.parse(result)).not.toThrow();
    const text = adjustBidsResponseFormatter(result)[0]!.text;
    expect(text).toContain("Adjusted 1/2 keyword bids");
    expect(text).toContain("1: BidAmountsGreaterThanCeilingPrice");
  });
});
