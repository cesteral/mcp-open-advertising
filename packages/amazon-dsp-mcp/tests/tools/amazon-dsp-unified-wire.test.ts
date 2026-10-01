// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-request assertions for every amazon-dsp-mcp entity read and write on
 * the Unified API (#234). Each test calls the REAL tool logic over REAL
 * session services (AmazonDspService, AmazonDspHttpClient, the LwA
 * refresh-token adapter and the package's real `RateLimiter`), with only
 * `globalThis.fetch` stubbed, and asserts the full request: HTTP method, URL,
 * headers and the exact JSON body.
 *
 * Expected shapes come from Amazon's machine-readable Unified DSP spec:
 *   amzn/ads-advanced-tools-docs @ e25aace0ec07997c113dac48f333298472243558
 *   unified-campaign-management-migration-skills/api-specs/unified-api-dsp.json
 *   (OpenAPI 3.0.1, "Amazon Ads API DSP Merged" 3.0; servers include
 *   https://advertising-api.amazon.com)
 * and the DSP migration guide beside it,
 *   unified-campaign-management-migration-skills/skills/unified-dsp-cm-migration/SKILL.md.
 * Every `// basis:` names the spec operationId; the file and commit are the
 * ones above unless stated. Every DSP entity operation declares exactly two
 * header parameters — `AccountIdHeader` (`Amazon-Ads-AccountId`, required) and
 * `ClientIdHeader` (`Amazon-Ads-ClientId`, required) — and a JSON body.
 *
 * Nothing here has been exercised against Amazon; this proves the code sends
 * what the spec describes, not that Amazon accepts it.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mcpConfig } from "../../src/config/index.js";
import { rateLimiter } from "../../src/utils/platform.js";
import {
  listEntitiesLogic,
  ListEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/list-entities.tool.js";
import {
  getEntityLogic,
  GetEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/get-entity.tool.js";
import {
  createEntityLogic,
  CreateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/create-entity.tool.js";
import {
  updateEntityLogic,
  UpdateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/update-entity.tool.js";
import {
  deleteEntityLogic,
  DeleteEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/delete-entity.tool.js";
import {
  bulkUpdateStatusLogic,
  BulkUpdateStatusInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import {
  bulkCreateEntitiesLogic,
  BulkCreateEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import {
  bulkUpdateEntitiesLogic,
  BulkUpdateEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import {
  duplicateEntityLogic,
  DuplicateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/duplicate-entity.tool.js";
import {
  adjustBidsLogic,
  AdjustBidsInputSchema,
} from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  unifiedResponder,
  ADS_HOST,
  TEST_ACCESS_TOKEN,
  TEST_ACCOUNT_ID,
  TEST_CREDENTIALS,
  TEST_PROFILE_ID,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/unified-wire.js";

/** unified-api-dsp.json `servers[0].url` (NA) — also this package's configured default. */
const API = "https://advertising-api.amazon.com";
const ctx = { requestId: "unified-wire-req" } as any;
const PROFILE = TEST_PROFILE_ID;
const ACCOUNT = TEST_ACCOUNT_ID;

let stub: FetchStub;
let session: WireSession;
let sdk: ReturnType<typeof acceptingSdkContext>;

beforeEach(() => {
  stub = installFetchStub();
  session = createWireSession();
  sdk = acceptingSdkContext(session.sessionId);
});

afterEach(() => {
  session.dispose();
  stub.restore();
});

/** Every request to the Amazon Ads API host (LwA token exchange excluded). */
function apiRequests(): WireRequest[] {
  return stub.api();
}

/**
 * The headers every Unified DSP entity operation declares (AccountIdHeader,
 * ClientIdHeader) plus the bearer token and JSON content type. The scope
 * header is absent — no DSP operation declares it and the migration guide §2
 * lists `Amazon-Advertising-API-Scope` as "Not used".
 */
function expectUnifiedHeaders(req: WireRequest): void {
  expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  expect(req.headers["amazon-ads-clientid"]).toBe(TEST_CREDENTIALS.appId);
  expect(req.headers["amazon-ads-accountid"]).toBe(ACCOUNT);
  expect(req.headers["content-type"]).toBe("application/json");
  expect(req.headers["accept"]).toBe("application/json");
  expect(req.headers["amazon-advertising-api-scope"]).toBeUndefined();
  expect(req.headers["amazon-advertising-api-clientid"]).toBeUndefined();
}

function expectUnifiedPost(req: WireRequest, path: string, body: unknown): void {
  expect(req.method).toBe("POST");
  expect(req.url).toBe(`${API}${path}`);
  expect(req.body).toEqual(body);
  expectUnifiedHeaders(req);
}

const AMAZON_DSP = { include: ["AMAZON_DSP"] };

function monetaryBudget(value: number, recurrenceTimePeriod: string) {
  return {
    budgetType: "MONETARY",
    budgetValue: { monetaryBudgetValue: { monetaryBudget: { value } } },
    recurrenceTimePeriod,
  };
}

it("targets the NA host the spec lists first", () => {
  // basis: unified-api-dsp.json servers[] — "Production server for NA"
  // https://advertising-api.amazon.com (EU/FE hosts also listed; not wired here).
  expect(mcpConfig.amazonDspApiBaseUrl).toBe(API);
  expect(new URL(API).host).toBe(ADS_HOST);
});

describe("reads — POST /adsApi/v1/query/{resource}", () => {
  it.each([
    // basis: DSPQueryCampaign — DSPQueryCampaignRequest { adProductFilter (required), campaignIdFilter, stateFilter, maxResults 1..100, nextToken }
    [
      "order",
      { state: "ENABLED,PAUSED" },
      "/adsApi/v1/query/campaigns",
      {
        adProductFilter: AMAZON_DSP,
        stateFilter: { include: ["ENABLED", "PAUSED"] },
        maxResults: 25,
        nextToken: "tok-1",
      },
    ],
    // basis: DSPQueryAdGroup — DSPQueryAdGroupRequest { adProductFilter, adGroupIdFilter, campaignIdFilter, stateFilter, maxResults, nextToken }
    [
      "lineItem",
      { campaignId: "581234567890123" },
      "/adsApi/v1/query/adGroups",
      {
        adProductFilter: AMAZON_DSP,
        campaignIdFilter: { include: ["581234567890123"] },
        maxResults: 25,
        nextToken: "tok-1",
      },
    ],
    // basis: DSPQueryAd — DSPQueryAdRequest { adProductFilter, adIdFilter, maxResults, nextToken }
    [
      "creative",
      { adId: "614567890123456" },
      "/adsApi/v1/query/ads",
      {
        adProductFilter: AMAZON_DSP,
        adIdFilter: { include: ["614567890123456"] },
        maxResults: 25,
        nextToken: "tok-1",
      },
    ],
    // basis: DSPQueryTarget — DSPQueryTargetRequest { adProductFilter, adGroupIdFilter, stateFilter, targetTypeFilter, …, maxResults 1..5000, nextToken }
    [
      "target",
      { lineItemId: "592345678901234", targetType: "AUDIENCE" },
      "/adsApi/v1/query/targets",
      {
        adProductFilter: AMAZON_DSP,
        adGroupIdFilter: { include: ["592345678901234"] },
        targetTypeFilter: { include: ["AUDIENCE"] },
        maxResults: 25,
        nextToken: "tok-1",
      },
    ],
    // basis: DSPQueryAdAssociation — DSPQueryAdAssociationRequest has NO adProductFilter { adAssociationIdFilter, adGroupIdFilter, adIdFilter, maxResults, nextToken }
    [
      "creativeAssociation",
      { adGroupId: "592345678901234" },
      "/adsApi/v1/query/adAssociations",
      {
        adGroupIdFilter: { include: ["592345678901234"] },
        maxResults: 25,
        nextToken: "tok-1",
      },
    ],
  ])("list_entities %s", async (entityType, filters, path, body) => {
    stub.route({
      method: "POST",
      host: ADS_HOST,
      path,
      response: { [path.split("/").pop()!]: [{ name: "row" }], nextToken: "tok-2" },
    });
    const input = ListEntitiesInputSchema.parse({
      entityType,
      profileId: PROFILE,
      accountId: ACCOUNT,
      filters,
      nextToken: "tok-1",
    });
    const result = await listEntitiesLogic(input, ctx, sdk as any);

    const reqs = apiRequests();
    expect(reqs).toHaveLength(1);
    expectUnifiedPost(reqs[0], path, body);
    // DSP<Entity>SuccessResponse.nextToken → the tool's cursor.
    expect(result.pagination.nextCursor).toBe("tok-2");
    expect(result.entities).toEqual([{ name: "row" }]);
  });

  it.each([
    // basis: DSPQueryCampaign campaignIdFilter
    ["order", "581234567890123", "/adsApi/v1/query/campaigns", "campaignIdFilter", true],
    // basis: DSPQueryAdGroup adGroupIdFilter
    ["lineItem", "592345678901234", "/adsApi/v1/query/adGroups", "adGroupIdFilter", true],
    // basis: DSPQueryAd adIdFilter
    ["creative", "614567890123456", "/adsApi/v1/query/ads", "adIdFilter", true],
    // basis: DSPQueryAdAssociation adAssociationIdFilter (no adProductFilter)
    [
      "creativeAssociation",
      "625678901234567",
      "/adsApi/v1/query/adAssociations",
      "adAssociationIdFilter",
      false,
    ],
  ] as const)("get_entity %s", async (entityType, entityId, path, idFilter, adProduct) => {
    const input = GetEntityInputSchema.parse({
      entityType,
      profileId: PROFILE,
      accountId: ACCOUNT,
      entityId,
    });
    const result = await getEntityLogic(input, ctx, sdk as any);

    const reqs = apiRequests();
    expect(reqs).toHaveLength(1);
    expectUnifiedPost(reqs[0], path, {
      ...(adProduct ? { adProductFilter: AMAZON_DSP } : {}),
      [idFilter]: { include: [entityId] },
      maxResults: 1,
    });
    expect(Object.values(result.entity)).toContain(entityId);
  });

  it("get_entity refuses target at the schema (DSPQueryTargetRequest has no targetId filter)", () => {
    expect(
      GetEntityInputSchema.safeParse({
        entityType: "target",
        profileId: PROFILE,
        accountId: ACCOUNT,
        entityId: "t1",
      }).success
    ).toBe(false);
  });
});

describe("create — POST /adsApi/v1/create/{resource}", () => {
  const flight = {
    startDateTime: "2026-07-01T00:00:00Z",
    endDateTime: "2026-07-31T23:59:59Z",
    budget: {
      budgetType: "MONETARY",
      budgetValue: { monetaryBudgetValue: { monetaryBudget: { value: 50000 } } },
    },
  };

  it("order: DSPCreateCampaign with adProduct and state PAUSED added", async () => {
    // basis: DSPCreateCampaign — DSPCreateCampaignRequest { campaigns: DSPCampaignCreate[1..5] };
    // DSPCampaignCreate.required [adProduct, flights, name, optimizations, state];
    // DSPCreateState: "For ADSP, campaign and ad group resources can only be created in the PAUSED state".
    const input = CreateEntityInputSchema.parse({
      entityType: "order",
      profileId: PROFILE,
      accountId: ACCOUNT,
      data: {
        name: "Q3 Brand",
        country: "US", // legacy string → countries[] (migration guide §4)
        flights: [flight],
        optimizations: { bidSettings: { bidStrategy: "SPEND_BUDGET_IN_FULL" } },
      },
    });
    const result = await createEntityLogic(input, ctx, sdk as any);

    const reqs = apiRequests();
    expect(reqs).toHaveLength(1);
    expectUnifiedPost(reqs[0], "/adsApi/v1/create/campaigns", {
      campaigns: [
        {
          name: "Q3 Brand",
          flights: [flight],
          optimizations: { bidSettings: { bidStrategy: "SPEND_BUDGET_IN_FULL" } },
          countries: ["US"],
          adProduct: "AMAZON_DSP",
          state: "PAUSED",
        },
      ],
    });
    // DSPCampaignMultiStatusSuccess.campaign → the created entity; after snapshot from it.
    expect(result.entity.campaignId).toBe("new-campaigns-1");
    expect(result.after?.platformEntityId).toBe("new-campaigns-1");
    expect(result.after?.schedule).toEqual({
      startAt: "2026-07-01T00:00:00Z",
      endAt: "2026-07-31T23:59:59Z",
    });
  });

  it("lineItem: DSPCreateAdGroup, legacy orderId → campaignId, legacy DAILY budget → budgets[]", async () => {
    // basis: DSPCreateAdGroup — DSPCreateAdGroupRequest { adGroups: DSPAdGroupCreate[1..20] };
    // DSPAdGroupCreate.campaignId, .budgets (DSPCreateBudget { budgetType MONETARY, budgetValue, recurrenceTimePeriod }).
    const input = CreateEntityInputSchema.parse({
      entityType: "lineItem",
      profileId: PROFILE,
      accountId: ACCOUNT,
      data: {
        name: "Display",
        orderId: "581234567890123",
        advertiserId: ACCOUNT, // legacy; dropped — the advertiser is the header (guide §4)
        budget: { budgetType: "DAILY", budget: 250 },
        bid: { baseBid: 3.5 },
      },
    });
    await createEntityLogic(input, ctx, sdk as any);

    expectUnifiedPost(apiRequests()[0], "/adsApi/v1/create/adGroups", {
      adGroups: [
        {
          name: "Display",
          bid: { baseBid: 3.5 },
          campaignId: "581234567890123",
          budgets: [monetaryBudget(250, "DAILY")],
          adProduct: "AMAZON_DSP",
          state: "PAUSED",
        },
      ],
    });
  });

  it("creative: DSPCreateAd (creatable since #234)", async () => {
    // basis: DSPCreateAd — DSPCreateAdRequest { ads: DSPAdCreate[1..10] };
    // DSPAdCreate.required [adProduct, adType, creative, name, state]; migration guide §7 example.
    const creative = {
      componentCreative: {
        responsiveEcommerceSettings: {
          language: "EN",
          inventoryTypes: ["DISPLAY"],
          products: [{ productId: "B0EXAMPLE", productIdType: "ASIN" }],
        },
      },
    };
    const input = CreateEntityInputSchema.parse({
      entityType: "creative",
      profileId: PROFILE,
      accountId: ACCOUNT,
      data: { name: "Responsive Ad", adType: "COMPONENT", state: "PAUSED", creative },
    });
    await createEntityLogic(input, ctx, sdk as any);

    expectUnifiedPost(apiRequests()[0], "/adsApi/v1/create/ads", {
      ads: [
        {
          name: "Responsive Ad",
          adType: "COMPONENT",
          state: "PAUSED",
          creative,
          adProduct: "AMAZON_DSP",
        },
      ],
    });
  });

  it("target: DSPCreateTarget, legacy lineItemId → adGroupId", async () => {
    // basis: DSPCreateTarget — DSPCreateTargetRequest { targets: DSPTargetCreate[1..1000] };
    // DSPTargetCreate.required [adGroupId, adProduct, negative, state, targetDetails, targetType];
    // migration guide §6 audienceTarget example.
    const targetDetails = {
      audienceTarget: { audienceId: { defaultValue: "AUD456" }, groupId: "1" },
    };
    const input = CreateEntityInputSchema.parse({
      entityType: "target",
      profileId: PROFILE,
      accountId: ACCOUNT,
      data: {
        lineItemId: "592345678901234",
        negative: false,
        state: "ENABLED",
        targetType: "AUDIENCE",
        targetDetails,
      },
    });
    await createEntityLogic(input, ctx, sdk as any);

    expectUnifiedPost(apiRequests()[0], "/adsApi/v1/create/targets", {
      targets: [
        {
          negative: false,
          state: "ENABLED",
          targetType: "AUDIENCE",
          targetDetails,
          adGroupId: "592345678901234",
          adProduct: "AMAZON_DSP",
        },
      ],
    });
  });

  it("creativeAssociation: DSPCreateAdAssociation, no adProduct", async () => {
    // basis: DSPCreateAdAssociation — DSPCreateAdAssociationRequest { adAssociations: DSPAdAssociationCreate[1..20] };
    // DSPAdAssociationCreate.required [adGroupId, adId, state] — no adProduct property.
    const input = CreateEntityInputSchema.parse({
      entityType: "creativeAssociation",
      profileId: PROFILE,
      accountId: ACCOUNT,
      data: { adGroupId: "592345678901234", adId: "614567890123456", state: "ENABLED" },
    });
    await createEntityLogic(input, ctx, sdk as any);

    expectUnifiedPost(apiRequests()[0], "/adsApi/v1/create/adAssociations", {
      adAssociations: [{ adGroupId: "592345678901234", adId: "614567890123456", state: "ENABLED" }],
    });
  });

  it("surfaces a 207 error[] entry as a tool error with Amazon's code", async () => {
    // basis: DSPCampaignMultiStatusResponse.error: ErrorsIndex[] { index, errors: Error[] { code, message, fieldLocation } }
    stub.route({
      method: "POST",
      host: ADS_HOST,
      path: "/adsApi/v1/create/campaigns",
      status: 207,
      response: {
        success: [],
        error: [
          {
            index: 0,
            errors: [
              {
                code: "DATE_CANNOT_BE_IN_PAST",
                message: "start date is in the past",
                fieldLocation: "campaigns[0].flights[0].startDateTime",
              },
            ],
          },
        ],
      },
    });
    const input = CreateEntityInputSchema.parse({
      entityType: "order",
      profileId: PROFILE,
      accountId: ACCOUNT,
      data: { name: "Late", flights: [flight], optimizations: {} },
    });
    await expect(createEntityLogic(input, ctx, sdk as any)).rejects.toThrow(
      /\[DATE_CANNOT_BE_IN_PAST\] start date is in the past \(at campaigns\[0\]\.flights\[0\]\.startDateTime\)/
    );
  });
});

describe("update — POST /adsApi/v1/update/{resource}", () => {
  it("order: read partner query, then DSPUpdateCampaign with [{ campaignId, ...patch }]", async () => {
    // basis: DSPQueryCampaign (before snapshot), DSPUpdateCampaign — DSPUpdateCampaignRequest
    // { campaigns: DSPCampaignUpdate[1..5] }; DSPCampaignUpdate.required [campaignId]; .budgets, .state (DSPUpdateState).
    stub.route({
      method: "POST",
      host: ADS_HOST,
      path: /^\/adsApi\/v1\//,
      response: unifiedResponder({
        name: "Old",
        state: "ENABLED",
        budgets: [
          {
            budgetType: "MONETARY",
            budgetValue: {
              monetaryBudgetValue: { monetaryBudget: { value: 100, currencyCode: "EUR" } },
            },
            recurrenceTimePeriod: "DAILY",
          },
        ],
      }),
    });
    const input = UpdateEntityInputSchema.parse({
      entityType: "order",
      profileId: PROFILE,
      accountId: ACCOUNT,
      entityId: "581234567890123",
      data: { name: "New", state: "PAUSED", budgets: [monetaryBudget(200, "DAILY")] },
    });
    const result = await updateEntityLogic(input, ctx, sdk as any);

    const reqs = apiRequests();
    expect(reqs).toHaveLength(2);
    expectUnifiedPost(reqs[0], "/adsApi/v1/query/campaigns", {
      adProductFilter: AMAZON_DSP,
      campaignIdFilter: { include: ["581234567890123"] },
      maxResults: 1,
    });
    expectUnifiedPost(reqs[1], "/adsApi/v1/update/campaigns", {
      campaigns: [
        {
          campaignId: "581234567890123",
          name: "New",
          state: "PAUSED",
          budgets: [monetaryBudget(200, "DAILY")],
        },
      ],
    });
    expect(result.before?.budget.daily).toEqual({ amountMinor: 10_000, currency: "EUR" });
    expect(result.after?.status.platformRaw).toBe("PAUSED");
    expect(result.dispatchedCapability.operation).toBe("pause");
  });

  it.each([
    // basis: DSPUpdateAdGroup — { adGroups: DSPAdGroupUpdate[1..20] }, DSPAdGroupUpdate.required [adGroupId]
    ["lineItem", "/adsApi/v1/update/adGroups", "adGroups", "adGroupId", { bid: { baseBid: 2 } }, 3],
    // basis: DSPUpdateAd — { ads: DSPAdUpdate[1..10] }, DSPAdUpdate.required [adId]
    ["creative", "/adsApi/v1/update/ads", "ads", "adId", { name: "Renamed ad" }, 1],
    // basis: DSPUpdateAdAssociation — { adAssociations: DSPAdAssociationUpdate[1..20] }, .required [adAssociationId]
    [
      "creativeAssociation",
      "/adsApi/v1/update/adAssociations",
      "adAssociations",
      "adAssociationId",
      { weight: 50 },
      1,
    ],
  ] as const)("%s", async (entityType, path, key, idField, data, expectedCalls) => {
    const input = UpdateEntityInputSchema.parse({
      entityType,
      profileId: PROFILE,
      accountId: ACCOUNT,
      entityId: "e-1",
      data,
    });
    await updateEntityLogic(input, ctx, sdk as any);

    const reqs = apiRequests();
    // lineItem is a governed kind: its before snapshot reads first, and — the
    // 207 echo here carrying no state/name/budgets — the after snapshot
    // re-reads. creative / creativeAssociation are out of snapshot scope and
    // send only the update.
    expect(reqs).toHaveLength(expectedCalls);
    const update = reqs.find((r) => r.path === path)!;
    expectUnifiedPost(update, path, { [key]: [{ [idField]: "e-1", ...data }] });
    for (const r of reqs.filter((x) => x !== update)) {
      expect(r.path).toBe("/adsApi/v1/query/adGroups");
    }
  });

  it("refuses state ARCHIVED before any request (DSPUpdateState is ENABLED | PAUSED)", async () => {
    const input = UpdateEntityInputSchema.parse({
      entityType: "lineItem",
      profileId: PROFILE,
      accountId: ACCOUNT,
      entityId: "e-1",
      data: { state: "ARCHIVED" },
    });
    await expect(updateEntityLogic(input, ctx, sdk as any)).rejects.toThrow(/not an update state/);
    expect(apiRequests()).toHaveLength(0);
  });

  it("refuses target at the schema (no update operation for targets in the DSP spec)", () => {
    expect(
      UpdateEntityInputSchema.safeParse({
        entityType: "target",
        profileId: PROFILE,
        accountId: ACCOUNT,
        entityId: "t1",
        data: { state: "PAUSED" },
      }).success
    ).toBe(false);
  });
});

describe("delete", () => {
  it("target → POST /adsApi/v1/delete/targets { targetIds }", async () => {
    // basis: DSPDeleteTarget — DSPDeleteTargetRequest { targetIds: string[1..1000] } → 207 DSPTargetMultiStatusResponse
    const input = DeleteEntityInputSchema.parse({
      entityType: "target",
      profileId: PROFILE,
      accountId: ACCOUNT,
      entityIds: ["603456789012345"],
    });
    const result = await deleteEntityLogic(input, ctx, sdk as any);

    const reqs = apiRequests();
    expect(reqs).toHaveLength(1);
    expectUnifiedPost(reqs[0], "/adsApi/v1/delete/targets", { targetIds: ["603456789012345"] });
    expect(result.results).toEqual([
      { entityId: "603456789012345", success: true, mode: "unified_delete" },
    ]);
  });

  it("creativeAssociation → POST /adsApi/v1/delete/adAssociations { adAssociationIds }", async () => {
    // basis: DSPDeleteAdAssociation — DSPDeleteAdAssociationRequest { adAssociationIds: string[1..20] }
    const input = DeleteEntityInputSchema.parse({
      entityType: "creativeAssociation",
      profileId: PROFILE,
      accountId: ACCOUNT,
      entityIds: ["625678901234567"],
    });
    await deleteEntityLogic(input, ctx, sdk as any);

    expectUnifiedPost(apiRequests()[0], "/adsApi/v1/delete/adAssociations", {
      adAssociationIds: ["625678901234567"],
    });
  });

  it.each([
    ["order", "/dsp/orders/581234567890123", "application/vnd.dsporders.v2.2+json"],
    ["lineItem", "/dsp/lineItems/581234567890123", "application/vnd.dsplineitems.v3.1+json"],
  ])("%s → LEGACY PUT (no Unified equivalent)", async (entityType, path, mediaType) => {
    // basis: NONE in the Unified spec — unified-api-dsp.json declares delete only for targets
    // and adAssociations, and DSPUpdateState is [ENABLED, PAUSED] (no ARCHIVED). This asserts the
    // pre-#234 legacy archive call is still what is sent (code-only basis; never verified live).
    const input = DeleteEntityInputSchema.parse({
      entityType,
      profileId: PROFILE,
      accountId: ACCOUNT,
      entityIds: ["581234567890123"],
    });
    const result = await deleteEntityLogic(input, ctx, sdk as any);

    const reqs = apiRequests();
    expect(reqs).toHaveLength(1);
    expect(reqs[0].method).toBe("PUT");
    expect(reqs[0].url).toBe(`${API}${path}`);
    expect(reqs[0].body).toEqual({ state: "ARCHIVED" });
    expect(reqs[0].headers["content-type"]).toBe(mediaType);
    expect(reqs[0].headers["amazon-advertising-api-scope"]).toBe(PROFILE);
    expect(reqs[0].headers["amazon-advertising-api-clientid"]).toBe(TEST_CREDENTIALS.appId);
    expect(reqs[0].headers["amazon-ads-accountid"]).toBeUndefined();
    expect(result.results[0].mode).toBe("legacy_archive");
  });

  it("refuses creative at the schema (no delete/ads in the DSP spec)", () => {
    expect(
      DeleteEntityInputSchema.safeParse({
        entityType: "creative",
        profileId: PROFILE,
        accountId: ACCOUNT,
        entityIds: ["ad-1"],
      }).success
    ).toBe(false);
  });
});

describe("bulk tools", () => {
  it("bulk_update_status → DSPUpdateAdGroup [{ adGroupId, state }]", async () => {
    // basis: DSPUpdateAdGroup — DSPAdGroupUpdate { adGroupId, state: DSPUpdateState }
    const input = BulkUpdateStatusInputSchema.parse({
      entityType: "lineItem",
      profileId: PROFILE,
      accountId: ACCOUNT,
      entityIds: ["592345678901234"],
      operationStatus: "ENABLED",
    });
    const result = await bulkUpdateStatusLogic(input, ctx, sdk as any);

    const reqs = apiRequests();
    expect(reqs).toHaveLength(1);
    expectUnifiedPost(reqs[0], "/adsApi/v1/update/adGroups", {
      adGroups: [{ adGroupId: "592345678901234", state: "ENABLED" }],
    });
    expect(result.successCount).toBe(1);
  });

  it("bulk_update_status rejects ARCHIVED at the schema", () => {
    expect(
      BulkUpdateStatusInputSchema.safeParse({
        entityType: "order",
        profileId: PROFILE,
        accountId: ACCOUNT,
        entityIds: ["c1"],
        operationStatus: "ARCHIVED",
      }).success
    ).toBe(false);
  });

  it("bulk_create_entities → one DSPCreateAdAssociation per item", async () => {
    // basis: DSPCreateAdAssociation (one item per request; the batch accepts 1..20)
    const input = BulkCreateEntitiesInputSchema.parse({
      entityType: "creativeAssociation",
      profileId: PROFILE,
      accountId: ACCOUNT,
      items: [{ adGroupId: "ag-1", adId: "ad-1", state: "ENABLED" }],
    });
    const result = await bulkCreateEntitiesLogic(input, ctx, sdk as any);

    expectUnifiedPost(apiRequests()[0], "/adsApi/v1/create/adAssociations", {
      adAssociations: [{ adGroupId: "ag-1", adId: "ad-1", state: "ENABLED" }],
    });
    expect(result.results[0].entity).toEqual({
      adAssociationId: "new-adAssociations-1",
      adGroupId: "ag-1",
      adId: "ad-1",
      state: "ENABLED",
    });
  });

  it("bulk_update_entities → one DSPUpdateCampaign per item", async () => {
    // basis: DSPUpdateCampaign — DSPCampaignUpdate { campaignId, name }
    const input = BulkUpdateEntitiesInputSchema.parse({
      entityType: "order",
      profileId: PROFILE,
      accountId: ACCOUNT,
      items: [{ entityId: "c-1", data: { name: "Renamed" } }],
    });
    await bulkUpdateEntitiesLogic(input, ctx, sdk as any);

    expectUnifiedPost(apiRequests()[0], "/adsApi/v1/update/campaigns", {
      campaigns: [{ campaignId: "c-1", name: "Renamed" }],
    });
  });

  it("adjust_bids → DSPQueryAdGroup then DSPUpdateAdGroup with bid.baseBid", async () => {
    // basis: DSPQueryAdGroup (adGroupIdFilter); DSPUpdateAdGroup — DSPUpdateAdGroupBid { baseBid, maxAverageBid }
    // (DSPAdGroupBid.currencyCode is read-only: absent from DSPUpdateAdGroupBid).
    stub.route({
      method: "POST",
      host: ADS_HOST,
      path: /^\/adsApi\/v1\//,
      response: unifiedResponder({ bid: { baseBid: 1.25, maxAverageBid: 4, currencyCode: "USD" } }),
    });
    const input = AdjustBidsInputSchema.parse({
      profileId: PROFILE,
      accountId: ACCOUNT,
      adjustments: [{ lineItemId: "592345678901234", bidAmount: 2.5 }],
    });
    const result = await adjustBidsLogic(input, ctx, sdk as any);

    const reqs = apiRequests();
    expect(reqs).toHaveLength(2);
    expectUnifiedPost(reqs[0], "/adsApi/v1/query/adGroups", {
      adProductFilter: AMAZON_DSP,
      adGroupIdFilter: { include: ["592345678901234"] },
      maxResults: 1,
    });
    expectUnifiedPost(reqs[1], "/adsApi/v1/update/adGroups", {
      adGroups: [{ adGroupId: "592345678901234", bid: { baseBid: 2.5, maxAverageBid: 4 } }],
    });
    expect(result.results[0]).toMatchObject({ success: true, previousBid: 1.25, newBid: 2.5 });
  });
});

describe("duplicate_entity", () => {
  it("lineItem → DSPQueryAdGroup, then DSPCreateAdGroup with read-only fields stripped, PAUSED", async () => {
    // basis: DSPQueryAdGroup; DSPCreateAdGroup. Stripped paths are the spec diff DSPAdGroup vs
    // DSPAdGroupCreate: adGroupId, creationDateTime, lastUpdatedDateTime, status, bid.currencyCode,
    // budgets[].budgetValue.monetaryBudgetValue.monetaryBudget.currencyCode.
    stub.route({
      method: "POST",
      host: ADS_HOST,
      path: "/adsApi/v1/query/adGroups",
      response: {
        adGroups: [
          {
            adGroupId: "592345678901234",
            adProduct: "AMAZON_DSP",
            campaignId: "581234567890123",
            name: "Source AG",
            state: "ENABLED",
            status: { deliveryStatus: "DELIVERING" },
            creationDateTime: "2026-01-01T00:00:00Z",
            lastUpdatedDateTime: "2026-01-02T00:00:00Z",
            inventoryType: "DISPLAY",
            bid: { baseBid: 1.5, currencyCode: "USD" },
            budgets: [
              {
                budgetType: "MONETARY",
                budgetValue: {
                  monetaryBudgetValue: { monetaryBudget: { value: 20, currencyCode: "USD" } },
                },
                recurrenceTimePeriod: "DAILY",
              },
            ],
            startDateTime: "2026-07-01T00:00:00Z",
            endDateTime: "2026-07-31T00:00:00Z",
          },
        ],
      },
    });
    const input = DuplicateEntityInputSchema.parse({
      entityType: "lineItem",
      profileId: PROFILE,
      accountId: ACCOUNT,
      entityId: "592345678901234",
      options: { name: "Copy AG" },
    });
    const result = await duplicateEntityLogic(input, ctx, sdk as any);

    const reqs = apiRequests();
    expect(reqs).toHaveLength(2);
    expectUnifiedPost(reqs[1], "/adsApi/v1/create/adGroups", {
      adGroups: [
        {
          adProduct: "AMAZON_DSP",
          bid: { baseBid: 1.5 },
          budgets: [monetaryBudget(20, "DAILY")],
          campaignId: "581234567890123",
          endDateTime: "2026-07-31T00:00:00Z",
          inventoryType: "DISPLAY",
          name: "Copy AG",
          startDateTime: "2026-07-01T00:00:00Z",
          state: "PAUSED",
        },
      ],
    });
    expect(result.after?.platformEntityId).toBe("new-adGroups-1");
    expect(result.after?.status.platformRaw).toBe("PAUSED");
  });
});

/**
 * The no-op paths, ported from the pre-#234 `/dsp/*` wire test (#236): a
 * declined confirmation and a `dry_run` must send no write — on the Unified
 * surface (`create|update|delete/{resource}`) or the legacy archive PUT. A
 * dry run may still read pre-state through `query/{resource}`.
 */
describe("no-op paths send no write", () => {
  const isWrite = (req: WireRequest) =>
    req.method !== "GET" && !/^\/adsApi\/v1\/query\//.test(req.path);
  const writesSent = () => apiRequests().filter(isWrite);
  const base = { profileId: PROFILE, accountId: ACCOUNT };

  beforeEach(() => {
    stub.route({
      method: "POST",
      host: ADS_HOST,
      path: /^\/adsApi\/v1\/query\//,
      response: unifiedResponder({ name: "Existing", state: "ENABLED", bid: { baseBid: 1 } }),
    });
  });

  it.each([
    [
      "delete_entity",
      () =>
        deleteEntityLogic(
          DeleteEntityInputSchema.parse({ ...base, entityType: "target", entityIds: ["t-1"] }),
          ctx,
          sdk as any
        ),
    ],
    [
      "delete_entity (legacy archive)",
      () =>
        deleteEntityLogic(
          DeleteEntityInputSchema.parse({ ...base, entityType: "order", entityIds: ["c-1"] }),
          ctx,
          sdk as any
        ),
    ],
    [
      "bulk_update_status",
      () =>
        bulkUpdateStatusLogic(
          BulkUpdateStatusInputSchema.parse({
            ...base,
            entityType: "lineItem",
            entityIds: ["ag-1"],
            operationStatus: "PAUSED",
          }),
          ctx,
          sdk as any
        ),
    ],
    [
      "bulk_update_entities",
      () =>
        bulkUpdateEntitiesLogic(
          BulkUpdateEntitiesInputSchema.parse({
            ...base,
            entityType: "order",
            // A budget is a sensitive field, so even one item prompts.
            items: [{ entityId: "c-1", data: { budgets: [monetaryBudget(7000, "DAILY")] } }],
          }),
          ctx,
          sdk as any
        ),
    ],
    [
      "adjust_bids",
      () =>
        adjustBidsLogic(
          AdjustBidsInputSchema.parse({
            ...base,
            adjustments: [{ lineItemId: "ag-1", bidAmount: 2 }],
          }),
          ctx,
          sdk as any
        ),
    ],
  ])("%s: a declined confirmation sends no write", async (_name, run) => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await run().catch(() => undefined);
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(writesSent()).toEqual([]);
  });

  it.each([
    [
      "create_entity",
      () =>
        createEntityLogic(
          CreateEntityInputSchema.parse({
            ...base,
            entityType: "creativeAssociation",
            data: { adGroupId: "ag-1", adId: "ad-1", state: "ENABLED" },
            dry_run: true,
          }),
          ctx,
          sdk as any
        ),
    ],
    [
      "update_entity",
      () =>
        updateEntityLogic(
          UpdateEntityInputSchema.parse({
            ...base,
            entityType: "order",
            entityId: "c-1",
            data: { name: "Renamed" },
            dry_run: true,
          }),
          ctx,
          sdk as any
        ),
    ],
    [
      "delete_entity",
      () =>
        deleteEntityLogic(
          DeleteEntityInputSchema.parse({
            ...base,
            entityType: "target",
            entityIds: ["t-1"],
            dry_run: true,
          }),
          ctx,
          sdk as any
        ),
    ],
    [
      "bulk_update_status",
      () =>
        bulkUpdateStatusLogic(
          BulkUpdateStatusInputSchema.parse({
            ...base,
            entityType: "lineItem",
            entityIds: ["ag-1"],
            operationStatus: "PAUSED",
            dry_run: true,
          }),
          ctx,
          sdk as any
        ),
    ],
    [
      "bulk_create_entities",
      () =>
        bulkCreateEntitiesLogic(
          BulkCreateEntitiesInputSchema.parse({
            ...base,
            entityType: "creativeAssociation",
            items: [{ adGroupId: "ag-1", adId: "ad-1", state: "ENABLED" }],
            dry_run: true,
          }),
          ctx,
          sdk as any
        ),
    ],
    [
      "bulk_update_entities",
      () =>
        bulkUpdateEntitiesLogic(
          BulkUpdateEntitiesInputSchema.parse({
            ...base,
            entityType: "order",
            items: [{ entityId: "c-1", data: { name: "Renamed" } }],
            dry_run: true,
          }),
          ctx,
          sdk as any
        ),
    ],
    [
      "adjust_bids",
      () =>
        adjustBidsLogic(
          AdjustBidsInputSchema.parse({
            ...base,
            adjustments: [{ lineItemId: "ag-1", bidAmount: 2 }],
            dry_run: true,
          }),
          ctx,
          sdk as any
        ),
    ],
    [
      "duplicate_entity",
      () =>
        duplicateEntityLogic(
          DuplicateEntityInputSchema.parse({
            ...base,
            entityType: "lineItem",
            entityId: "ag-1",
            dry_run: true,
          }),
          ctx,
          sdk as any
        ),
    ],
  ])("%s: dry_run sends no write and does not prompt", async (_name, run) => {
    await run();
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(writesSent()).toEqual([]);
  });
});

describe("metering", () => {
  it("a Unified write draws 3 from amazon_dsp:write; its pre-state query draws 1 from amazon_dsp:read", async () => {
    stub.route({
      method: "POST",
      host: ADS_HOST,
      path: /^\/adsApi\/v1\//,
      response: unifiedResponder({ bid: { baseBid: 1 } }),
    });
    const LIMIT = mcpConfig.amazonDspRateLimitPerMinute;
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        profileId: PROFILE,
        accountId: ACCOUNT,
        adjustments: [{ lineItemId: "ag-1", bidAmount: 2 }],
      }),
      ctx,
      sdk as any
    );
    expect(apiRequests().map((r) => r.path)).toEqual([
      "/adsApi/v1/query/adGroups",
      "/adsApi/v1/update/adGroups",
    ]);
    expect(rateLimiter.getRemainingTokens("amazon_dsp:read")).toBe(LIMIT - 1);
    expect(rateLimiter.getRemainingTokens("amazon_dsp:write")).toBe(LIMIT - 3);
  });
});
