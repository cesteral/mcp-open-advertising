// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * AmazonDspService over the Unified API (#234), against a mocked HTTP client.
 * Full wire requests (URL, headers, exact body) are asserted in
 * tests/tools/amazon-dsp-unified-wire.test.ts; this file covers the service's
 * own decisions: which path, which body, which refusals.
 *
 * basis: amzn/ads-advanced-tools-docs @ e25aace0ec07997c113dac48f333298472243558,
 * unified-campaign-management-migration-skills/api-specs/unified-api-dsp.json
 * (operationIds cited per test).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpError, JsonRpcErrorCode } from "@cesteral/shared";
import { AmazonDspService } from "../../src/services/amazon-dsp/amazon-dsp-service.js";

const mockHttpClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

const mockRateLimiter = {
  consume: vi.fn().mockResolvedValue(undefined),
};

const ACCOUNT = "5550001112223";
const V1_ARGS = [undefined, "application/json", undefined, { "Amazon-Ads-AccountId": ACCOUNT }];

describe("AmazonDspService (Unified API)", () => {
  let service: AmazonDspService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AmazonDspService(mockRateLimiter as any, mockHttpClient as any);
  });

  describe("listEntities (DSPQuery<Entity>)", () => {
    it("queries campaigns with adProductFilter, maxResults and the account header", async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        campaigns: [{ campaignId: "c1" }],
        nextToken: "tok-2",
      });
      const page = await service.listEntities("order", ACCOUNT, {
        filters: { state: "ENABLED,PAUSED" },
        maxResults: 25,
      });
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        "/adsApi/v1/query/campaigns",
        {
          adProductFilter: { include: ["AMAZON_DSP"] },
          stateFilter: { include: ["ENABLED", "PAUSED"] },
          maxResults: 25,
        },
        ...V1_ARGS
      );
      expect(page).toEqual({ entities: [{ campaignId: "c1" }], nextToken: "tok-2" });
      expect(mockRateLimiter.consume).toHaveBeenCalledWith("amazon_dsp:read");
    });

    it("maps the legacy orderId filter onto the ad group campaignIdFilter and forwards nextToken", async () => {
      mockHttpClient.post.mockResolvedValueOnce({ adGroups: [] });
      const page = await service.listEntities("lineItem", ACCOUNT, {
        filters: { orderId: "c1" },
        nextToken: "tok-1",
      });
      expect(mockHttpClient.post.mock.calls[0][1]).toEqual({
        adProductFilter: { include: ["AMAZON_DSP"] },
        campaignIdFilter: { include: ["c1"] },
        nextToken: "tok-1",
      });
      expect(page.nextToken).toBeUndefined();
    });

    it("sends no adProductFilter on adAssociations (DSPQueryAdAssociationRequest has none)", async () => {
      mockHttpClient.post.mockResolvedValueOnce({ adAssociations: [] });
      await service.listEntities("creativeAssociation", ACCOUNT, {
        filters: { lineItemId: "ag1", creativeId: "ad1" },
      });
      expect(mockHttpClient.post.mock.calls[0][0]).toBe("/adsApi/v1/query/adAssociations");
      expect(mockHttpClient.post.mock.calls[0][1]).toEqual({
        adGroupIdFilter: { include: ["ag1"] },
        adIdFilter: { include: ["ad1"] },
      });
    });

    it("clamps maxResults to the resource maximum", async () => {
      mockHttpClient.post.mockResolvedValueOnce({ campaigns: [] });
      await service.listEntities("order", ACCOUNT, { maxResults: 5000 });
      expect(mockHttpClient.post.mock.calls[0][1].maxResults).toBe(100);
    });

    it("refuses a filter the Unified query does not have, before any call", async () => {
      await expect(
        service.listEntities("creative", ACCOUNT, { filters: { state: "ENABLED" } })
      ).rejects.toThrow(/not a Unified ads query filter/);
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it("accepts a legacy advertiserId filter only when it names the same account", async () => {
      mockHttpClient.post.mockResolvedValueOnce({ campaigns: [] });
      await service.listEntities("order", ACCOUNT, { filters: { advertiserId: ACCOUNT } });
      expect(mockHttpClient.post.mock.calls[0][1]).toEqual({
        adProductFilter: { include: ["AMAZON_DSP"] },
      });
      await expect(
        service.listEntities("order", ACCOUNT, { filters: { advertiserId: "other" } })
      ).rejects.toThrow(/different account/);
    });
  });

  describe("getEntity", () => {
    it("queries by id filter and returns the matching entity", async () => {
      mockHttpClient.post.mockResolvedValueOnce({ ads: [{ adId: "ad1", name: "A" }] });
      const ad = await service.getEntity("creative", ACCOUNT, "ad1");
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        "/adsApi/v1/query/ads",
        {
          adProductFilter: { include: ["AMAZON_DSP"] },
          adIdFilter: { include: ["ad1"] },
          maxResults: 1,
        },
        ...V1_ARGS
      );
      expect(ad).toEqual({ adId: "ad1", name: "A" });
    });

    it("throws NotFound when the query returns no match", async () => {
      mockHttpClient.post.mockResolvedValueOnce({ campaigns: [] });
      const err = (await service.getEntity("order", ACCOUNT, "c404").catch((e) => e)) as McpError;
      expect(err).toBeInstanceOf(McpError);
      expect(err.code).toBe(JsonRpcErrorCode.NotFound);
    });

    it("refuses a target by ID (DSPQueryTargetRequest has no targetId filter)", async () => {
      await expect(service.getEntity("target", ACCOUNT, "t1")).rejects.toThrow(/targetId filter/);
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });
  });

  describe("createEntity (DSPCreate<Entity>)", () => {
    it("wraps one item, adds adProduct and the PAUSED create state, maps legacy fields", async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        success: [{ index: 0, adGroup: { adGroupId: "ag1", state: "PAUSED" } }],
        error: [],
      });
      const created = await service.createEntity("lineItem", ACCOUNT, {
        name: "AG",
        orderId: "c1",
        advertiserId: ACCOUNT,
        budget: { budgetType: "DAILY", budget: 20 },
      });
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        "/adsApi/v1/create/adGroups",
        {
          adGroups: [
            {
              name: "AG",
              campaignId: "c1",
              budgets: [
                {
                  budgetType: "MONETARY",
                  budgetValue: { monetaryBudgetValue: { monetaryBudget: { value: 20 } } },
                  recurrenceTimePeriod: "DAILY",
                },
              ],
              adProduct: "AMAZON_DSP",
              state: "PAUSED",
            },
          ],
        },
        ...V1_ARGS
      );
      expect(created).toEqual({ adGroupId: "ag1", state: "PAUSED" });
      expect(mockRateLimiter.consume).toHaveBeenCalledWith("amazon_dsp:write", 3);
    });

    it("creates an ad association without adProduct (DSPAdAssociationCreate has none)", async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        success: [{ index: 0, adAssociation: { adAssociationId: "aa1" } }],
      });
      await service.createEntity("creativeAssociation", ACCOUNT, {
        lineItemId: "ag1",
        creativeId: "ad1",
        state: "ENABLED",
      });
      expect(mockHttpClient.post.mock.calls[0][1]).toEqual({
        adAssociations: [{ state: "ENABLED", adGroupId: "ag1", adId: "ad1" }],
      });
    });

    it("surfaces a 207 error entry with Amazon's code and field location", async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        success: [],
        error: [
          {
            index: 0,
            errors: [
              {
                code: "FIELD_VALUE_IS_INVALID",
                message: "bad bid",
                fieldLocation: "adGroups[0].bid",
              },
            ],
          },
        ],
      });
      const err = (await service
        .createEntity("lineItem", ACCOUNT, { name: "x" })
        .catch((e) => e)) as McpError;
      expect(err.code).toBe(JsonRpcErrorCode.InvalidParams);
      expect(err.message).toContain("[FIELD_VALUE_IS_INVALID] bad bid (at adGroups[0].bid)");
    });

    it("refuses a campaign created ENABLED before any call", async () => {
      await expect(
        service.createEntity("order", ACCOUNT, { name: "x", state: "ENABLED" })
      ).rejects.toThrow(/PAUSED/);
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });
  });

  describe("updateEntity (DSPUpdate<Entity>)", () => {
    it("sends [{ <idField>: id, ...patch }] to update/{resource}", async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        success: [{ index: 0, campaign: { campaignId: "c1", name: "N" } }],
      });
      await service.updateEntity("order", ACCOUNT, "c1", { name: "N" });
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        "/adsApi/v1/update/campaigns",
        { campaigns: [{ campaignId: "c1", name: "N" }] },
        ...V1_ARGS
      );
    });

    it("refuses ARCHIVED (DSPUpdateState is ENABLED | PAUSED)", async () => {
      await expect(service.updateEntityStatus("order", ACCOUNT, "c1", "ARCHIVED")).rejects.toThrow(
        /not an update state/
      );
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it("refuses a target update (no update/targets in the DSP spec)", async () => {
      await expect(
        service.updateEntity("target", ACCOUNT, "t1", { state: "PAUSED" })
      ).rejects.toThrow(/no update operation for targets/);
    });
  });

  describe("deleteEntity", () => {
    it("deletes a target via POST /adsApi/v1/delete/targets (DSPDeleteTarget)", async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        success: [{ index: 0, target: { targetId: "t1", state: "ARCHIVED" } }],
      });
      const res = await service.deleteEntity("target", ACCOUNT, "t1");
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        "/adsApi/v1/delete/targets",
        { targetIds: ["t1"] },
        ...V1_ARGS
      );
      expect(res.mode).toBe("unified_delete");
      expect(mockHttpClient.put).not.toHaveBeenCalled();
    });

    it("archives an order through the LEGACY PUT (no Unified delete for campaigns)", async () => {
      mockHttpClient.put.mockResolvedValueOnce({});
      const res = await service.deleteEntity("order", ACCOUNT, "c1");
      expect(mockHttpClient.put).toHaveBeenCalledWith(
        "/dsp/orders/c1",
        { state: "ARCHIVED" },
        undefined,
        "application/vnd.dsporders.v2.2+json"
      );
      expect(res.mode).toBe("legacy_archive");
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it("URI-encodes IDs in the legacy archive path", async () => {
      mockHttpClient.put.mockResolvedValueOnce({});
      await service.deleteEntity("lineItem", ACCOUNT, "../advertisers");
      expect(mockHttpClient.put.mock.calls[0][0]).toBe("/dsp/lineItems/..%2Fadvertisers");
    });

    it("refuses a creative (no delete/ads, no ARCHIVED update state)", async () => {
      await expect(service.deleteEntity("creative", ACCOUNT, "ad1")).rejects.toThrow(
        /no delete for ads/
      );
      expect(mockHttpClient.post).not.toHaveBeenCalled();
      expect(mockHttpClient.put).not.toHaveBeenCalled();
    });
  });

  describe("duplicateEntity", () => {
    it("projects the source onto the create schema and creates it PAUSED", async () => {
      mockHttpClient.post
        .mockResolvedValueOnce({
          campaigns: [
            {
              campaignId: "c1",
              adProduct: "AMAZON_DSP",
              name: "Src",
              state: "ENABLED",
              status: { deliveryStatus: "DELIVERING" },
              creationDateTime: "2026-01-01T00:00:00Z",
              lastUpdatedDateTime: "2026-01-01T00:00:00Z",
              startDateTime: "2026-01-01T00:00:00Z",
              endDateTime: "2026-02-01T00:00:00Z",
              targetsAmazonDeal: false,
              flights: [
                {
                  flightId: "f1",
                  startDateTime: "2026-01-01T00:00:00Z",
                  endDateTime: "2026-02-01T00:00:00Z",
                  budget: {
                    budgetType: "MONETARY",
                    budgetValue: {
                      monetaryBudgetValue: { monetaryBudget: { value: 5, currencyCode: "USD" } },
                    },
                  },
                },
              ],
              optimizations: { bidSettings: { bidStrategy: "SPEND_BUDGET_IN_FULL" } },
            },
          ],
        })
        .mockResolvedValueOnce({ success: [{ index: 0, campaign: { campaignId: "c2" } }] });

      const copy = await service.duplicateEntity("order", ACCOUNT, "c1", { name: "Copy" });
      expect(copy).toEqual({ campaignId: "c2" });
      expect(mockHttpClient.post.mock.calls[1][0]).toBe("/adsApi/v1/create/campaigns");
      expect(mockHttpClient.post.mock.calls[1][1]).toEqual({
        campaigns: [
          {
            adProduct: "AMAZON_DSP",
            flights: [
              {
                startDateTime: "2026-01-01T00:00:00Z",
                endDateTime: "2026-02-01T00:00:00Z",
                budget: {
                  budgetType: "MONETARY",
                  budgetValue: { monetaryBudgetValue: { monetaryBudget: { value: 5 } } },
                },
              },
            ],
            name: "Copy",
            optimizations: { bidSettings: { bidStrategy: "SPEND_BUDGET_IN_FULL" } },
            state: "PAUSED",
          },
        ],
      });
    });
  });

  describe("adjustBids", () => {
    it("reads the ad group and sets bid.baseBid, keeping maxAverageBid", async () => {
      mockHttpClient.post
        .mockResolvedValueOnce({
          adGroups: [
            { adGroupId: "ag1", bid: { baseBid: 1.25, maxAverageBid: 4, currencyCode: "USD" } },
          ],
        })
        .mockResolvedValueOnce({ success: [{ index: 0, adGroup: { adGroupId: "ag1" } }] });

      const result = await service.adjustBids(ACCOUNT, [{ lineItemId: "ag1", bidAmount: 2.5 }]);

      expect(mockHttpClient.post.mock.calls[1]).toEqual([
        "/adsApi/v1/update/adGroups",
        { adGroups: [{ adGroupId: "ag1", bid: { baseBid: 2.5, maxAverageBid: 4 } }] },
        ...V1_ARGS,
      ]);
      expect(result.results).toEqual([
        { lineItemId: "ag1", success: true, previousBid: 1.25, newBid: 2.5 },
      ]);
    });
  });

  describe("legacy calls kept (no Unified equivalent)", () => {
    it("lists advertisers via GET /dsp/advertisers", async () => {
      mockHttpClient.get.mockResolvedValueOnce({ response: [{ advertiserId: "a1" }] });
      const r = await service.listAdvertisers(0, 25);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/dsp/advertisers",
        { startIndex: "0", count: "25" },
        undefined
      );
      expect(r.pageInfo.totalResults).toBeUndefined();
    });

    it("URI-encodes the creative ID in the preview path", async () => {
      mockHttpClient.get.mockResolvedValueOnce({});
      await service.getAdPreviews("../../dsp/advertisers?x=1");
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "/dsp/creatives/..%2F..%2Fdsp%2Fadvertisers%3Fx%3D1/preview",
        undefined,
        undefined
      );
    });
  });
});
