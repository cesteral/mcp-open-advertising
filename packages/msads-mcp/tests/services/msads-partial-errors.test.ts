import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import type { RateLimiter } from "@cesteral/shared";
import { MsAdsService } from "../../src/services/msads/msads-service.js";
import type { MsAdsHttpClient } from "../../src/services/msads/msads-http-client.js";
import {
  collectMsAdsBatchErrors,
  mapMsAdsItemOutcomes,
  assertMsAdsWriteSucceeded,
} from "../../src/services/msads/partial-errors.js";

/**
 * Microsoft Ads Add/Update/Delete return HTTP 200 with rejected items listed in
 * `PartialErrors` (BatchError[] — Index/Code/ErrorCode/Message) and, for Add, a
 * null id at the rejected index (campaign-management-service/batcherror.md,
 * addcampaigns.md, guides/handle-service-errors-exceptions.md). Every write
 * path must surface that instead of reporting success on the 200.
 */

const logger = pino({ level: "silent" });

function batchError(index: number, message = "Invalid bid", errorCode = "InvalidBid", code = 1001) {
  return {
    Code: code,
    Details: "",
    ErrorCode: errorCode,
    FieldPath: null,
    ForwardCompatibilityMap: null,
    Index: index,
    Message: message,
    Type: "BatchError",
  };
}

function createMockHttpClient() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  };
}

describe("partial-errors helpers", () => {
  it("collects PartialErrors and NestedPartialErrors (BatchErrorCollection)", () => {
    const errors = collectMsAdsBatchErrors({
      PartialErrors: [batchError(2)],
      NestedPartialErrors: [
        {
          BatchErrors: [batchError(0, "Nested detail", "NestedCode")],
          Code: null,
          ErrorCode: null,
          Index: 1,
          Message: null,
        },
      ],
    });
    expect(errors).toHaveLength(2);
    expect(errors[1]).toMatchObject({
      Index: 1,
      ErrorCode: "NestedCode",
      Message: "Nested detail",
    });
  });

  it("treats null/empty PartialErrors as no errors", () => {
    expect(collectMsAdsBatchErrors({ PartialErrors: null })).toEqual([]);
    expect(collectMsAdsBatchErrors({ PartialErrors: [] })).toEqual([]);
    expect(collectMsAdsBatchErrors(undefined)).toEqual([]);
  });

  it("maps BatchError.Index and null Add ids to per-item outcomes", () => {
    const outcomes = mapMsAdsItemOutcomes(
      { CampaignIds: [11, null, null], PartialErrors: [batchError(1)] },
      3,
      { idsField: "CampaignIds" }
    );
    expect(outcomes[0]).toEqual({ index: 0, success: true });
    expect(outcomes[1]).toMatchObject({ index: 1, success: false, errorCode: "InvalidBid" });
    expect(outcomes[1]?.error).toContain("Invalid bid");
    // Null id with no BatchError still counts as not added.
    expect(outcomes[2]).toMatchObject({ index: 2, success: false });
  });

  it("never reports success for a multi-item batch holding an unindexed error", () => {
    const outcomes = mapMsAdsItemOutcomes({ PartialErrors: [{ Message: "boom" }] }, 2);
    expect(outcomes.every((o) => !o.success)).toBe(true);
    expect(outcomes[0]?.error).toMatch(/Outcome unknown/);
  });

  it("assertMsAdsWriteSucceeded throws an McpError carrying the upstream message", () => {
    let thrown: unknown;
    try {
      assertMsAdsWriteSucceeded(
        { PartialErrors: [batchError(0, "Campaign name already exists", "DuplicateCampaignName")] },
        { operation: "update", entityLabel: "Campaign", requested: 1 }
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(McpError);
    expect((thrown as McpError).code).toBe(JsonRpcErrorCode.InvalidRequest);
    expect((thrown as McpError).message).toContain("DuplicateCampaignName");
    expect((thrown as McpError).message).toContain("Campaign name already exists");
    expect((thrown as McpError).data).toMatchObject({ platform: "msads", failedIndices: [0] });
  });
});

describe("MsAdsService — PartialErrors on HTTP 200", () => {
  let http: ReturnType<typeof createMockHttpClient>;
  let service: MsAdsService;

  beforeEach(() => {
    http = createMockHttpClient();
    const rateLimiter = {
      consume: vi.fn().mockResolvedValue(undefined),
    } as unknown as RateLimiter;
    service = new MsAdsService(rateLimiter, http as unknown as MsAdsHttpClient, logger, {
      userId: "u1",
      customerId: "c1",
    });
  });

  it("createEntity throws when the Add rejected the item", async () => {
    http.post.mockResolvedValueOnce({
      CampaignIds: [null],
      PartialErrors: [batchError(0, "The budget is below the minimum", "BudgetBelowMinimum")],
    });
    await expect(
      service.createEntity("campaign", { AccountId: 1, Campaigns: [{ Name: "X" }] })
    ).rejects.toThrow(/BudgetBelowMinimum.*The budget is below the minimum/);
  });

  it("createEntity throws on a null Add id even without PartialErrors", async () => {
    http.post.mockResolvedValueOnce({ CampaignIds: [null], PartialErrors: [] });
    await expect(
      service.createEntity("campaign", { AccountId: 1, Campaigns: [{ Name: "X" }] })
    ).rejects.toBeInstanceOf(McpError);
  });

  it("createEntity resolves when the Add succeeded", async () => {
    http.post.mockResolvedValueOnce({ CampaignIds: [555], PartialErrors: null });
    await expect(
      service.createEntity("campaign", { AccountId: 1, Campaigns: [{ Name: "X" }] })
    ).resolves.toEqual({ CampaignIds: [555], PartialErrors: null });
  });

  it("updateEntity throws when the Update rejected the item", async () => {
    http.put.mockResolvedValueOnce({
      PartialErrors: [batchError(0, "Campaign status is invalid", "CampaignInvalidStatus")],
    });
    await expect(
      service.updateEntity("campaign", { AccountId: 5, Campaigns: [{ Id: 1, Status: "Bogus" }] })
    ).rejects.toThrow(/CampaignInvalidStatus/);
  });

  it("bulkCreateEntities maps batch-relative Index and null ids to input items", async () => {
    // ad batchLimit = 50 → 52 items = two batches (50 + 2).
    const items = Array.from({ length: 52 }, (_, i) => ({ Type: "ResponsiveSearch", n: i }));
    const firstIds = Array.from({ length: 50 }, (_, i) => (i === 3 ? null : 1000 + i));
    http.post
      .mockResolvedValueOnce({ AdIds: firstIds, PartialErrors: [batchError(3)] })
      .mockResolvedValueOnce({
        AdIds: [null, 2001],
        PartialErrors: [batchError(0, "Ad text too long", "AdTextTooLong")],
      });

    const results = await service.bulkCreateEntities("ad", items, undefined, "77");

    expect(results).toHaveLength(52);
    expect(results[0]).toEqual({ index: 0, entityId: "1000", success: true });
    expect(results[3]).toMatchObject({ index: 3, success: false, errorCode: "InvalidBid" });
    expect(results[3]?.entityId).toBeUndefined();
    // Second batch Index 0 → caller item 50.
    expect(results[50]).toMatchObject({ index: 50, success: false, errorCode: "AdTextTooLong" });
    expect(results[51]).toEqual({ index: 51, entityId: "2001", success: true });
    expect(results.filter((r) => !r.success)).toHaveLength(2);
  });

  it("bulkUpdateEntities reports every item failed when the 200 rejected them all", async () => {
    http.put.mockResolvedValueOnce({
      PartialErrors: [batchError(0, "Not found", "CampaignIdInvalid"), batchError(1, "Not found")],
    });
    const results = await service.bulkUpdateEntities(
      "campaign",
      [
        { Id: 10, Name: "a" },
        { Id: 20, Name: "b" },
      ],
      undefined,
      "5"
    );
    expect(results).toEqual([
      expect.objectContaining({ index: 0, entityId: "10", success: false }),
      expect.objectContaining({ index: 1, entityId: "20", success: false }),
    ]);
  });

  it("bulkUpdateStatus marks an entity failed when its PUT returned PartialErrors", async () => {
    http.put.mockResolvedValueOnce({ PartialErrors: null }).mockResolvedValueOnce({
      PartialErrors: [batchError(0, "Cannot change status", "InvalidStatusChange")],
    });
    const { results } = await service.bulkUpdateStatus(
      "campaign",
      ["1", "2"],
      "Paused",
      undefined,
      "5"
    );
    expect(results[0]).toEqual({ entityId: "1", success: true });
    expect(results[1]).toMatchObject({ entityId: "2", success: false });
    expect(results[1]?.error).toContain("Cannot change status");
  });

  it("adjustBids maps PartialErrors.Index through the submitted list (skipping not-found)", async () => {
    // Entity "2" is missing on read, so only "1" and "3" are submitted.
    // PartialErrors Index 1 therefore refers to "3", not "2".
    http.post.mockResolvedValueOnce({
      Keywords: [
        { Id: 1, Bid: { Amount: 1 } },
        { Id: 3, Bid: { Amount: 1 } },
      ],
    });
    http.put.mockResolvedValueOnce({
      PartialErrors: [batchError(1, "Bid exceeds maximum", "BidAmountsGreaterThanCeilingPrice")],
    });

    const { results } = await service.adjustBids(
      "keyword",
      [
        { entityId: "1", bidField: "Bid", newBid: 2 },
        { entityId: "2", bidField: "Bid", newBid: 2 },
        { entityId: "3", bidField: "Bid", newBid: 2 },
      ],
      { AdGroupId: 9 }
    );

    expect(results[0]).toEqual({ entityId: "1", success: true });
    expect(results[1]).toMatchObject({ entityId: "2", success: false });
    expect(results[1]?.error).toMatch(/not found/);
    expect(results[2]).toMatchObject({
      entityId: "3",
      success: false,
      errorCode: "BidAmountsGreaterThanCeilingPrice",
    });
  });
});

describe("MsAdsService.duplicateEntity — copy lands non-running", () => {
  let http: ReturnType<typeof createMockHttpClient>;
  let service: MsAdsService;

  beforeEach(() => {
    http = createMockHttpClient();
    const rateLimiter = {
      consume: vi.fn().mockResolvedValue(undefined),
    } as unknown as RateLimiter;
    service = new MsAdsService(rateLimiter, http as unknown as MsAdsHttpClient, logger, {
      userId: "u1",
      customerId: "c1",
    });
  });

  it("forces Status Paused on a copy of an Active campaign", async () => {
    http.post
      .mockResolvedValueOnce({ Campaigns: [{ Id: 7, Name: "Summer", Status: "Active" }] })
      .mockResolvedValueOnce({ CampaignIds: [8], PartialErrors: null });

    const { item } = await service.duplicateEntity("campaign", "100", "7");

    const addBody = http.post.mock.calls[1]![1] as { Campaigns: Array<Record<string, unknown>> };
    expect(addBody.Campaigns[0]!.Status).toBe("Paused");
    expect(addBody.Campaigns[0]!.Id).toBeUndefined();
    expect(item.Status).toBe("Paused");
  });

  it("ignores a Status override in options (copy is always Paused)", async () => {
    http.post
      .mockResolvedValueOnce({ Campaigns: [{ Id: 7, Name: "Summer", Status: "Paused" }] })
      .mockResolvedValueOnce({ CampaignIds: [8] });

    await service.duplicateEntity("campaign", "100", "7", { Name: "Copy", Status: "Active" });

    const addBody = http.post.mock.calls[1]![1] as { Campaigns: Array<Record<string, unknown>> };
    expect(addBody.Campaigns[0]).toMatchObject({ Name: "Copy", Status: "Paused" });
  });

  it("replaces a read-only system status (BudgetPaused) with Paused", async () => {
    http.post
      .mockResolvedValueOnce({ Campaigns: [{ Id: 7, Status: "BudgetPaused" }] })
      .mockResolvedValueOnce({ CampaignIds: [8] });

    await service.duplicateEntity("campaign", "100", "7");

    const addBody = http.post.mock.calls[1]![1] as { Campaigns: Array<Record<string, unknown>> };
    expect(addBody.Campaigns[0]!.Status).toBe("Paused");
  });

  it("throws when the Add of the copy was rejected", async () => {
    http.post
      .mockResolvedValueOnce({ Campaigns: [{ Id: 7, Name: "Summer", Status: "Active" }] })
      .mockResolvedValueOnce({
        CampaignIds: [null],
        PartialErrors: [batchError(0, "Duplicate name", "DuplicateCampaignName")],
      });

    await expect(service.duplicateEntity("campaign", "100", "7")).rejects.toThrow(
      /DuplicateCampaignName/
    );
  });
});
