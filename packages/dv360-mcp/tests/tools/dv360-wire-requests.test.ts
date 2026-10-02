// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-request assertions for every dv360-mcp tool that issues a non-GET
 * upstream request (#236). Each test calls the REAL tool logic over REAL
 * session services (DV360Service, TargetingService, DV360HttpClient, the
 * Google OAuth2 refresh adapter and a real `RateLimiter`), with only
 * `globalThis.fetch` stubbed, and asserts the full request: HTTP method, URL
 * (+ query) and the exact body.
 *
 * Expected shapes come from Google's Discovery document, fetched 2026-09-30:
 *   https://displayvideo.googleapis.com/$discovery/rest?version=v4
 *   revision 20260928, rootUrl `https://displayvideo.googleapis.com/`,
 *   servicePath "" (method paths carry the `v4/` prefix — the version
 *   platform-facts.json `dv360.api_version` pins). `src/generated/schemas`
 *   vendors its schemas.
 * Method citations are `resources.<collection>.methods.<method>` (httpMethod,
 * flatPath, parameters, request $ref, mediaUpload); body citations are
 * `schemas.<Name>`. int64 fields are JSON strings per Discovery `format: int64`.
 *
 * The `Content-Type: application/json` header on JSON bodies is not described
 * by the Discovery document: `basis: unverified (code-only)`.
 *
 * Rate limiting: every advertiser-scoped call draws one token from
 * `dv360:{advertiserId}` (DV360Service / TargetingService). Custom-bidding
 * calls carry no advertiserId in their path ids and draw nothing — see the
 * note on that describe block.
 *
 * list/get/validate/preview/pacing/delivery-estimate tools send only GETs and
 * are out of scope here.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mcpConfig } from "../../src/config/index.js";
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
  adjustLineItemBidsLogic,
  AdjustLineItemBidsInputSchema,
} from "../../src/mcp-server/tools/definitions/adjust-line-item-bids.tool.js";
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
  createCustomBiddingAlgorithmLogic,
  CreateCustomBiddingAlgorithmInputSchema,
} from "../../src/mcp-server/tools/definitions/create-custom-bidding-algorithm.tool.js";
import {
  manageCustomBiddingScriptLogic,
  ManageCustomBiddingScriptInputSchema,
} from "../../src/mcp-server/tools/definitions/manage-custom-bidding-script.tool.js";
import {
  manageCustomBiddingRulesLogic,
  ManageCustomBiddingRulesInputSchema,
} from "../../src/mcp-server/tools/definitions/manage-custom-bidding-rules.tool.js";
import {
  createAssignedTargetingLogic,
  CreateAssignedTargetingInputSchema,
} from "../../src/mcp-server/tools/definitions/create-assigned-targeting.tool.js";
import {
  deleteAssignedTargetingLogic,
  DeleteAssignedTargetingInputSchema,
} from "../../src/mcp-server/tools/definitions/delete-assigned-targeting.tool.js";
import {
  uploadImageLogic,
  UploadImageInputSchema,
} from "../../src/mcp-server/tools/definitions/upload-image.tool.js";
import {
  uploadVideoLogic,
  UploadVideoInputSchema,
} from "../../src/mcp-server/tools/definitions/upload-video.tool.js";
import {
  duplicateEntityLogic,
  DuplicateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/duplicate-entity.tool.js";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  DV360_HOST,
  GOOGLE_TOKEN_URL,
  TEST_ACCESS_TOKEN,
  TEST_CREDENTIALS,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/wire.js";

/** Discovery rootUrl + method path prefix `v4/`. */
const API = "https://displayvideo.googleapis.com/v4";
/** Discovery `mediaUpload.protocols.simple.path` prefix for `advertisers.assets.upload`. */
const UPLOAD_API = "https://displayvideo.googleapis.com/upload/v4";
const ADV = "111";
const ctx = { requestId: "wire-req" } as any;

// ---------------------------------------------------------------------------
// Fixtures: platform resources as DV360 returns them (all pass the vendored
// generated schemas; int64 as strings per Discovery).
// ---------------------------------------------------------------------------

const CAMPAIGN = {
  name: `advertisers/${ADV}/campaigns/444`,
  advertiserId: ADV,
  campaignId: "444",
  displayName: "Autumn",
  entityStatus: "ENTITY_STATUS_ACTIVE",
  updateTime: "2026-09-01T00:00:00Z",
  campaignGoal: {
    campaignGoalType: "CAMPAIGN_GOAL_TYPE_BRAND_AWARENESS",
    performanceGoal: {
      performanceGoalType: "PERFORMANCE_GOAL_TYPE_CPM",
      performanceGoalAmountMicros: "1000000",
    },
  },
  campaignFlight: { plannedDates: { startDate: { year: 2026, month: 10, day: 1 } } },
  frequencyCap: { unlimited: true },
};

const INSERTION_ORDER = {
  name: `advertisers/${ADV}/insertionOrders/333`,
  advertiserId: ADV,
  campaignId: "444",
  insertionOrderId: "333",
  displayName: "IO Autumn",
  entityStatus: "ENTITY_STATUS_ACTIVE",
  updateTime: "2026-09-01T00:00:00Z",
  pacing: { pacingPeriod: "PACING_PERIOD_FLIGHT", pacingType: "PACING_TYPE_EVEN" },
  frequencyCap: { unlimited: true },
  kpi: { kpiType: "KPI_TYPE_CPM", kpiAmountMicros: "2000000" },
  budget: {
    budgetUnit: "BUDGET_UNIT_CURRENCY",
    automationType: "INSERTION_ORDER_AUTOMATION_TYPE_NONE",
    budgetSegments: [
      {
        budgetAmountMicros: "100000000",
        dateRange: {
          startDate: { year: 2026, month: 10, day: 1 },
          endDate: { year: 2026, month: 12, day: 31 },
        },
      },
    ],
  },
  bidStrategy: { fixedBid: { bidAmountMicros: "0" } },
  optimizationObjective: "NO_OBJECTIVE",
};

function lineItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    name: `advertisers/${ADV}/lineItems/${id}`,
    advertiserId: ADV,
    campaignId: "444",
    insertionOrderId: "333",
    lineItemId: id,
    displayName: `LI ${id}`,
    lineItemType: "LINE_ITEM_TYPE_DISPLAY_DEFAULT",
    entityStatus: "ENTITY_STATUS_ACTIVE",
    updateTime: "2026-09-01T00:00:00Z",
    flight: { flightDateType: "LINE_ITEM_FLIGHT_DATE_TYPE_INHERITED" },
    budget: {
      budgetAllocationType: "LINE_ITEM_BUDGET_ALLOCATION_TYPE_UNLIMITED",
      budgetUnit: "BUDGET_UNIT_CURRENCY",
    },
    pacing: { pacingPeriod: "PACING_PERIOD_FLIGHT", pacingType: "PACING_TYPE_ASAP" },
    frequencyCap: { unlimited: true },
    partnerRevenueModel: {
      markupType: "PARTNER_REVENUE_MODEL_MARKUP_TYPE_TOTAL_MEDIA_COST_MARKUP",
      markupAmount: "0",
    },
    bidStrategy: { fixedBid: { bidAmountMicros: "1500000" } },
    containsEuPoliticalAds: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    ...overrides,
  };
}

let stub: FetchStub;
let session: WireSession;
let sdk: ReturnType<typeof acceptingSdkContext>;

beforeEach(async () => {
  stub = installFetchStub();
  session = await createWireSession();
  sdk = acceptingSdkContext(session.sessionId);
});

afterEach(() => {
  session.dispose();
  stub.restore();
});

/** Every request to displayvideo (OAuth exchange and media downloads excluded). */
function apiRequests(): WireRequest[] {
  return stub.to(DV360_HOST);
}

function writes(): WireRequest[] {
  return apiRequests().filter((r) => r.method !== "GET");
}

function onlyWrite(): WireRequest {
  const w = writes();
  expect(w).toHaveLength(1);
  return w[0]!;
}

/** basis: the bearer from the refresh exchange; Content-Type — unverified (code-only). */
function expectJsonAuth(req: WireRequest) {
  expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  expect(req.headers["content-type"]).toBe("application/json");
}

/** Every displayvideo call drew exactly one token from the REAL `dv360:{advertiserId}` bucket. */
function expectOneTokenPerApiCall(advertiserId = ADV) {
  expect(session.rateLimiter.getRemainingTokens(`dv360:${advertiserId}`)).toBe(
    mcpConfig.dv360RateLimitPerMinute - apiRequests().length
  );
}

/**
 * Every displayvideo call drew exactly one token from the partner's REAL
 * `dv360:partner:{partnerId}` bucket (a call naming only a partner).
 */
function expectOneTokenPerApiCallOnPartner(partnerId: string) {
  expect(session.rateLimiter.getRemainingTokens(`dv360:partner:${partnerId}`)).toBe(
    mcpConfig.dv360RateLimitPerMinute - apiRequests().length
  );
}

/**
 * Tokens drawn from the limiter while `run` executes, read off `consume`
 * itself — so a call that bypasses the limiter shows up as missing tokens
 * whatever key it would have used.
 */
async function tokensSpentDuring(run: () => Promise<unknown>): Promise<number> {
  const consume = vi.spyOn(session.rateLimiter, "consume");
  consume.mockClear();
  try {
    await run();
    return consume.mock.calls.reduce(
      (sum, call) => sum + ((call[1] as number | undefined) ?? 1),
      0
    );
  } finally {
    consume.mockRestore();
  }
}

/** Echo a POST/PATCH body back as the created/updated resource, as DV360 does. */
function echo(extra: Record<string, unknown> = {}) {
  return (req: WireRequest) => ({ ...(req.body as Record<string, unknown>), ...extra });
}

describe("OAuth: the real Google refresh adapter exchanges on session creation", () => {
  it("POSTs grant_type=refresh_token to Google's token endpoint", () => {
    const token = stub.requests.find((r) => r.url === GOOGLE_TOKEN_URL);
    expect(token?.method).toBe("POST");
    // basis: Google OAuth 2.0 refresh flow (RFC 6749 §6 form parameters).
    const form = new URLSearchParams(String(token?.body));
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe(TEST_CREDENTIALS.refreshToken);
  });
});

describe("dv360_create_entity → advertisers.<collection>.create", () => {
  const data = {
    displayName: "Autumn",
    entityStatus: "ENTITY_STATUS_PAUSED",
    campaignGoal: CAMPAIGN.campaignGoal,
    campaignFlight: CAMPAIGN.campaignFlight,
    frequencyCap: { unlimited: true },
  };

  it("campaign → POST v4/advertisers/{advertiserId}/campaigns with the Campaign body", async () => {
    stub.route({
      method: "POST",
      path: `/v4/advertisers/${ADV}/campaigns`,
      response: echo({ campaignId: "901", name: `advertisers/${ADV}/campaigns/901` }),
    });

    const out = await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "campaign", advertiserId: ADV, data }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: `advertisers.campaigns.create` — httpMethod POST, flatPath
    // `v4/advertisers/{advertisersId}/campaigns`, no query parameters, request
    // $ref Campaign. `schemas.Campaign`: displayName, entityStatus, campaignGoal,
    // campaignFlight, frequencyCap are "Required."; advertiserId is "Output only."
    // (the tool folds the path id into the body; output-only input is ignored).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/advertisers/${ADV}/campaigns`);
    expectJsonAuth(req);
    expect(req.body).toEqual({ ...data, advertiserId: ADV });
    expect(out.entity.campaignId).toBe("901");
    expectOneTokenPerApiCall();
  });

  it("insertionOrder → POST v4/advertisers/{advertiserId}/insertionOrders", async () => {
    const ioData = {
      campaignId: "444",
      displayName: "IO Autumn",
      entityStatus: "ENTITY_STATUS_DRAFT",
      pacing: INSERTION_ORDER.pacing,
      frequencyCap: { unlimited: true },
      kpi: INSERTION_ORDER.kpi,
      budget: INSERTION_ORDER.budget,
      bidStrategy: INSERTION_ORDER.bidStrategy,
      optimizationObjective: "NO_OBJECTIVE",
    };
    stub.route({
      method: "POST",
      path: `/v4/advertisers/${ADV}/insertionOrders`,
      response: echo({ insertionOrderId: "902" }),
    });
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "insertionOrder",
        advertiserId: ADV,
        data: ioData,
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `advertisers.insertionOrders.create` — POST
    // `v4/advertisers/{advertisersId}/insertionOrders`, request InsertionOrder.
    // `schemas.InsertionOrder` "Required." fields: campaignId, displayName,
    // entityStatus, pacing, frequencyCap, kpi, budget; `entityStatus`
    // description: "For CreateInsertionOrder method, only ENTITY_STATUS_DRAFT is allowed".
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/advertisers/${ADV}/insertionOrders`);
    expect(req.body).toEqual({ ...ioData, advertiserId: ADV });
    expectOneTokenPerApiCall();
  });

  it("dry_run sends nothing", async () => {
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        data,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(0);
  });
});

describe("dv360_update_entity → advertisers.<collection>.patch", () => {
  it("lineItem → GET, then PATCH …/lineItems/{id}?updateMask=… with the merged LineItem", async () => {
    const current = lineItem("222");
    stub.route({ method: "GET", path: `/v4/advertisers/${ADV}/lineItems/222`, response: current });
    stub.route({ method: "PATCH", path: `/v4/advertisers/${ADV}/lineItems/222`, response: echo() });

    const out = await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "lineItem",
        advertiserId: ADV,
        lineItemId: "222",
        data: { displayName: "LI renamed" },
        updateMask: "displayName",
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: `advertisers.lineItems.patch` — httpMethod PATCH, flatPath
    // `v4/advertisers/{advertisersId}/lineItems/{lineItemsId}`, query
    // `updateMask` ("Required. The mask to control which fields to update.",
    // format google-fieldmask), request $ref LineItem. Fields outside the mask
    // are ignored, so sending the whole merged resource is within the contract.
    expect(req.method).toBe("PATCH");
    expect(req.url).toBe(`${API}/advertisers/${ADV}/lineItems/222?updateMask=displayName`);
    expect(req.query).toEqual({ updateMask: "displayName" });
    expectJsonAuth(req);
    expect(req.body).toEqual({ ...current, displayName: "LI renamed" });
    expect(out.previousValues).toEqual({ displayName: "LI 222" });
    // One GET (the tool's pre-read, passed through — no second GET) + one PATCH.
    expect(apiRequests().map((r) => r.method)).toEqual(["GET", "PATCH"]);
    expectOneTokenPerApiCall();
  });

  it("a multi-field mask is sent comma-separated (percent-encoded ',')", async () => {
    stub.route({ method: "GET", path: `/v4/advertisers/${ADV}/campaigns/444`, response: CAMPAIGN });
    stub.route({ method: "PATCH", path: `/v4/advertisers/${ADV}/campaigns/444`, response: echo() });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        campaignId: "444",
        data: { displayName: "Winter", entityStatus: "ENTITY_STATUS_PAUSED" },
        updateMask: "displayName,entityStatus",
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `advertisers.campaigns.patch` — PATCH
    // `v4/advertisers/{advertisersId}/campaigns/{campaignsId}`; google-fieldmask
    // is a comma-separated path list.
    expect(req.url).toBe(
      `${API}/advertisers/${ADV}/campaigns/444?updateMask=displayName%2CentityStatus`
    );
    expect(req.query.updateMask).toBe("displayName,entityStatus");
    expect(req.body).toEqual({
      ...CAMPAIGN,
      displayName: "Winter",
      entityStatus: "ENTITY_STATUS_PAUSED",
    });
  });

  it("dry_run sends no PATCH", async () => {
    stub.route({
      method: "GET",
      path: `/v4/advertisers/${ADV}/lineItems/222`,
      response: lineItem("222"),
    });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "lineItem",
        advertiserId: ADV,
        lineItemId: "222",
        data: { displayName: "x" },
        updateMask: "displayName",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(0);
  });
});

describe("dv360_delete_entity → advertisers.<collection>.delete", () => {
  it("archived campaign → GET, then DELETE v4/advertisers/{a}/campaigns/{id}, no body", async () => {
    stub.route({
      method: "GET",
      path: `/v4/advertisers/${ADV}/campaigns/444`,
      response: { ...CAMPAIGN, entityStatus: "ENTITY_STATUS_ARCHIVED" },
    });

    const out = await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        campaignId: "444",
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: `advertisers.campaigns.delete` — httpMethod DELETE, flatPath
    // `v4/advertisers/{advertisersId}/campaigns/{campaignsId}`, no request, no
    // query parameters; its description: "The campaign should be archived
    // first, i.e. set entity_status to ENTITY_STATUS_ARCHIVED, to be able to delete it."
    expect(req.method).toBe("DELETE");
    expect(req.url).toBe(`${API}/advertisers/${ADV}/campaigns/444`);
    expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(req.body).toBeUndefined();
    expect(out.success).toBe(true);
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expectOneTokenPerApiCall();
  });

  it("a non-archived line item is refused before any DELETE", async () => {
    stub.route({
      method: "GET",
      path: `/v4/advertisers/${ADV}/lineItems/222`,
      response: lineItem("222"),
    });
    await expect(
      deleteEntityLogic(
        DeleteEntityInputSchema.parse({
          entityType: "lineItem",
          advertiserId: ADV,
          lineItemId: "222",
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/archived before it can be deleted/);
    // basis: `advertisers.lineItems.delete` description — "The line item
    // should be archived first ... to be able to delete it."
    expect(writes()).toHaveLength(0);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        campaignId: "444",
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends no DELETE and does not prompt", async () => {
    stub.route({ method: "GET", path: `/v4/advertisers/${ADV}/campaigns/444`, response: CAMPAIGN });
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        campaignId: "444",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });
});

/**
 * Partner-/advertiser-owned top-level resources. Where the owner id goes is
 * per-method in Discovery, and differs by resource:
 *   - inventorySources / inventorySourceGroups: `partnerId` / `advertiserId`
 *     are QUERY parameters on create, patch and (groups) delete, and are not
 *     properties of `schemas.InventorySource` / `schemas.InventorySourceGroup`.
 *   - customBiddingAlgorithms: the owner is a BODY field
 *     (`schemas.CustomBiddingAlgorithm.partnerId`, "Immutable") and `.patch`
 *     takes only `updateMask`.
 * Before #236 the generic tools sent the owner id in the body and no scope
 * query for the first group — a request Discovery does not describe.
 */
describe("owner-scoped resources via dv360_create/update/delete_entity", () => {
  const ISG = {
    name: "inventorySourceGroups/5",
    inventorySourceGroupId: "5",
    displayName: "Deals",
  };
  const echoIsg = (req: WireRequest) => ({ ...ISG, ...((req.body as object) ?? {}) });

  it("inventorySourceGroup create → POST v4/inventorySourceGroups?partnerId=…, body without partnerId", async () => {
    stub.route({ path: /^\/v4\/inventorySourceGroups/, response: echoIsg });
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "inventorySourceGroup",
        partnerId: "555",
        data: { displayName: "Deals" },
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `inventorySourceGroups.create` — POST `v4/inventorySourceGroups`,
    // query partnerId | advertiserId ("The ID of the partner that owns the
    // inventory source group"), request InventorySourceGroup {name,
    // inventorySourceGroupId, displayName} — no partnerId property.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/inventorySourceGroups?partnerId=555`);
    expectJsonAuth(req);
    expect(req.body).toEqual({ displayName: "Deals" });
  });

  it("inventorySourceGroup update → PATCH …/{id}?updateMask=…&partnerId=…", async () => {
    stub.route({ path: /^\/v4\/inventorySourceGroups/, response: echoIsg });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "inventorySourceGroup",
        partnerId: "555",
        inventorySourceGroupId: "5",
        data: { displayName: "PMP deals" },
        updateMask: "displayName",
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `inventorySourceGroups.patch` — PATCH
    // `v4/inventorySourceGroups/{inventorySourceGroupId}`, query updateMask
    // ("Required.") + partnerId | advertiserId.
    expect(req.method).toBe("PATCH");
    expect(req.url).toBe(`${API}/inventorySourceGroups/5?updateMask=displayName&partnerId=555`);
    expect(req.body).toEqual({ ...ISG, displayName: "PMP deals" });
  });

  it("inventorySourceGroup delete → DELETE …/{id}?advertiserId=…", async () => {
    stub.route({ path: /^\/v4\/inventorySourceGroups/, response: echoIsg });
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "inventorySourceGroup",
        advertiserId: ADV,
        inventorySourceGroupId: "5",
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `inventorySourceGroups.delete` — DELETE
    // `v4/inventorySourceGroups/{inventorySourceGroupsId}`, query partnerId |
    // advertiserId ("The ID of the advertiser that owns the inventory source group").
    expect(req.method).toBe("DELETE");
    expect(req.url).toBe(`${API}/inventorySourceGroups/5?advertiserId=${ADV}`);
    expect(req.body).toBeUndefined();
    expectOneTokenPerApiCall();
  });

  it("inventorySource create → POST v4/inventorySources?partnerId=…, body without partnerId", async () => {
    const data = {
      displayName: "PMP",
      dealId: "deal-1",
      exchange: "EXCHANGE_GOOGLE_AD_MANAGER",
      inventorySourceType: "INVENTORY_SOURCE_TYPE_PRIVATE",
      commitment: "INVENTORY_SOURCE_COMMITMENT_NON_GUARANTEED",
      deliveryMethod: "INVENTORY_SOURCE_DELIVERY_METHOD_PROGRAMMATIC",
      rateDetails: {
        inventorySourceRateType: "INVENTORY_SOURCE_RATE_TYPE_CPM_FIXED",
        rate: { currencyCode: "USD", units: "1" },
      },
      status: { entityStatus: "ENTITY_STATUS_ACTIVE" },
    };
    stub.route({
      method: "POST",
      path: "/v4/inventorySources",
      response: echo({ inventorySourceId: "9" }),
    });
    await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "inventorySource", partnerId: "555", data }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `inventorySources.create` — POST `v4/inventorySources`, query
    // partnerId | advertiserId ("The ID of the partner that the request is
    // being made within"), request InventorySource (no partnerId property;
    // `rateDetails` "Required.", `rate` → Money {currencyCode, units int64}).
    expect(req.url).toBe(`${API}/inventorySources?partnerId=555`);
    expect(req.body).toEqual(data);
  });

  it("customBiddingAlgorithm update keeps the owner in the body and sends only updateMask", async () => {
    const cba = {
      name: "customBiddingAlgorithms/7001",
      customBiddingAlgorithmId: "7001",
      displayName: "Algo",
      customBiddingAlgorithmType: "SCRIPT_BASED",
      entityStatus: "ENTITY_STATUS_ACTIVE",
      partnerId: "555",
    };
    stub.route({ method: "GET", path: "/v4/customBiddingAlgorithms/7001", response: cba });
    stub.route({ method: "PATCH", path: "/v4/customBiddingAlgorithms/7001", response: echo() });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "customBiddingAlgorithm",
        partnerId: "555",
        customBiddingAlgorithmId: "7001",
        data: { displayName: "Algo v2" },
        updateMask: "displayName",
      }),
      ctx,
      sdk
    );
    // basis: `customBiddingAlgorithms.get` takes query partnerId | advertiserId;
    // `customBiddingAlgorithms.patch` — PATCH
    // `v4/customBiddingAlgorithms/{customBiddingAlgorithmsId}`, query ONLY
    // updateMask; `schemas.CustomBiddingAlgorithm.partnerId` is a body field.
    expect(apiRequests().map((r) => `${r.method} ${r.url}`)).toEqual([
      `GET ${API}/customBiddingAlgorithms/7001?partnerId=555`,
      `PATCH ${API}/customBiddingAlgorithms/7001?updateMask=displayName`,
    ]);
    expect(writes()[0]!.body).toEqual({ ...cba, displayName: "Algo v2" });
  });
});

describe("dv360_adjust_line_item_bids → lineItems.get then lineItems.patch", () => {
  it("PATCHes updateMask=bidStrategy.fixedBid.bidAmountMicros with the new bid as an int64 string", async () => {
    const current = lineItem("222");
    stub.route({ method: "GET", path: `/v4/advertisers/${ADV}/lineItems/222`, response: current });
    stub.route({ method: "PATCH", path: `/v4/advertisers/${ADV}/lineItems/222`, response: echo() });

    const out = await adjustLineItemBidsLogic(
      AdjustLineItemBidsInputSchema.parse({
        adjustments: [{ advertiserId: ADV, lineItemId: "222", newBidMicros: 2_000_000 }],
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: `advertisers.lineItems.patch` (PATCH, `updateMask` query, request
    // LineItem). `schemas.FixedBidStrategy.bidAmountMicros`: type string,
    // format int64 — so 2000000 travels as "2000000".
    expect(req.method).toBe("PATCH");
    expect(req.url).toBe(
      `${API}/advertisers/${ADV}/lineItems/222?updateMask=bidStrategy.fixedBid.bidAmountMicros`
    );
    expectJsonAuth(req);
    expect(req.body).toEqual({
      ...current,
      bidStrategy: { fixedBid: { bidAmountMicros: "2000000" } },
    });
    expect(out.successful).toEqual([
      expect.objectContaining({
        lineItemId: "222",
        previousBidMicros: 1_500_000,
        newBidMicros: 2_000_000,
      }),
    ]);
    expect(apiRequests().map((r) => r.method)).toEqual(["GET", "PATCH"]);
    expectOneTokenPerApiCall();
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await adjustLineItemBidsLogic(
      AdjustLineItemBidsInputSchema.parse({
        adjustments: [{ advertiserId: ADV, lineItemId: "222", newBidMicros: 2_000_000 }],
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await adjustLineItemBidsLogic(
      AdjustLineItemBidsInputSchema.parse({
        adjustments: [{ advertiserId: ADV, lineItemId: "222", newBidMicros: 2_000_000 }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("dv360_bulk_update_status → <collection>.get then <collection>.patch per entity", () => {
  it("PATCHes updateMask=entityStatus per entity, skipping one already at the target", async () => {
    stub.route({
      method: "GET",
      path: `/v4/advertisers/${ADV}/lineItems/222`,
      response: lineItem("222"),
    });
    stub.route({
      method: "GET",
      path: `/v4/advertisers/${ADV}/lineItems/223`,
      response: lineItem("223", { entityStatus: "ENTITY_STATUS_PAUSED" }),
    });
    stub.route({ method: "PATCH", path: /\/lineItems\/22[23]$/, response: echo() });

    const out = await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "lineItem",
        advertiserId: ADV,
        entityIds: ["222", "223"],
        status: "ENTITY_STATUS_PAUSED",
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: `advertisers.lineItems.patch` — PATCH with `updateMask`;
    // `schemas.LineItem.entityStatus` enum includes ENTITY_STATUS_PAUSED.
    expect(req.method).toBe("PATCH");
    expect(req.url).toBe(`${API}/advertisers/${ADV}/lineItems/222?updateMask=entityStatus`);
    expectJsonAuth(req);
    expect(req.body).toEqual(lineItem("222", { entityStatus: "ENTITY_STATUS_PAUSED" }));
    expect(out.successCount).toBe(2);
    expect(apiRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET /v4/advertisers/${ADV}/lineItems/222`,
      `PATCH /v4/advertisers/${ADV}/lineItems/222`,
      `GET /v4/advertisers/${ADV}/lineItems/223`,
    ]);
    expectOneTokenPerApiCall();
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        entityIds: ["444"],
        status: "ENTITY_STATUS_ARCHIVED",
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        entityIds: ["444"],
        status: "ENTITY_STATUS_ARCHIVED",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("dv360_bulk_create_entities → one <collection>.create per item", () => {
  const items = [
    {
      displayName: "Bulk A",
      entityStatus: "ENTITY_STATUS_PAUSED",
      campaignGoal: CAMPAIGN.campaignGoal,
      campaignFlight: CAMPAIGN.campaignFlight,
      frequencyCap: { unlimited: true },
    },
    {
      displayName: "Bulk B",
      entityStatus: "ENTITY_STATUS_PAUSED",
      campaignGoal: CAMPAIGN.campaignGoal,
      campaignFlight: CAMPAIGN.campaignFlight,
      frequencyCap: { unlimited: true },
    },
  ];

  it("campaign → POST v4/advertisers/{a}/campaigns once per item, body = the item", async () => {
    stub.route({
      method: "POST",
      path: `/v4/advertisers/${ADV}/campaigns`,
      response: echo({ campaignId: "905" }),
    });
    const out = await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({ entityType: "campaign", advertiserId: ADV, items }),
      ctx,
      sdk
    );
    const w = writes();
    expect(w).toHaveLength(2);
    // basis: `advertisers.campaigns.create` — POST, request Campaign (one per
    // resource; v4 has no batch create for campaigns).
    for (const req of w) {
      expect(req.method).toBe("POST");
      expect(req.url).toBe(`${API}/advertisers/${ADV}/campaigns`);
      expectJsonAuth(req);
    }
    // Items run concurrently, so match bodies as a set.
    expect(w.map((r) => r.body)).toEqual(
      expect.arrayContaining(items.map((item) => ({ ...item, advertiserId: ADV })))
    );
    expect(out.successCount).toBe(2);
    expectOneTokenPerApiCall();
  });

  it("dry_run sends nothing", async () => {
    await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        items,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("dv360_bulk_update_entities → <collection>.get then <collection>.patch per item", () => {
  it("GETs then PATCHes each item with its own updateMask", async () => {
    stub.route({
      method: "GET",
      path: `/v4/advertisers/${ADV}/lineItems/222`,
      response: lineItem("222"),
    });
    stub.route({
      method: "GET",
      path: `/v4/advertisers/${ADV}/lineItems/223`,
      response: lineItem("223"),
    });
    stub.route({ method: "PATCH", path: /\/lineItems\/22[23]$/, response: echo() });

    const out = await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "lineItem",
        advertiserId: ADV,
        items: [
          { entityId: "222", data: { displayName: "Renamed" }, updateMask: "displayName" },
          {
            entityId: "223",
            data: {
              pacing: {
                pacingPeriod: "PACING_PERIOD_DAILY",
                pacingType: "PACING_TYPE_EVEN",
                dailyMaxMicros: "5000000",
              },
            },
            updateMask: "pacing",
          },
        ],
      }),
      ctx,
      sdk
    );

    // basis: `advertisers.lineItems.patch` — PATCH
    // `v4/advertisers/{advertisersId}/lineItems/{lineItemsId}?updateMask=…`,
    // request LineItem; `schemas.Pacing.dailyMaxMicros` format int64 (string).
    expect(apiRequests().map((r) => `${r.method} ${r.url}`)).toEqual([
      `GET ${API}/advertisers/${ADV}/lineItems/222`,
      `PATCH ${API}/advertisers/${ADV}/lineItems/222?updateMask=displayName`,
      `GET ${API}/advertisers/${ADV}/lineItems/223`,
      `PATCH ${API}/advertisers/${ADV}/lineItems/223?updateMask=pacing`,
    ]);
    const [first, second] = writes();
    expectJsonAuth(first!);
    expect(first!.body).toEqual({ ...lineItem("222"), displayName: "Renamed" });
    expect(second!.body).toEqual({
      ...lineItem("223"),
      pacing: {
        pacingPeriod: "PACING_PERIOD_DAILY",
        pacingType: "PACING_TYPE_EVEN",
        dailyMaxMicros: "5000000",
      },
    });
    expect(out.successCount).toBe(2);
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expectOneTokenPerApiCall();
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "lineItem",
        advertiserId: ADV,
        // `pacing` is a sensitive field, so even a one-item batch prompts.
        items: [
          {
            entityId: "222",
            data: {
              pacing: { pacingPeriod: "PACING_PERIOD_FLIGHT", pacingType: "PACING_TYPE_EVEN" },
            },
            updateMask: "pacing",
          },
        ],
      }),
      ctx,
      sdk
    );
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "lineItem",
        advertiserId: ADV,
        items: [{ entityId: "222", data: { displayName: "x" }, updateMask: "displayName" }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

/**
 * Custom bidding. The owner scope travels in the BODY on
 * `customBiddingAlgorithms.create` (`schemas.CustomBiddingAlgorithm.advertiserId`
 * / `.partnerId`, "Immutable") and as a QUERY parameter on every scripts/rules
 * method. The upload is Discovery's two-step media flow: `uploadScript` /
 * `uploadRules` (httpMethod GET) return a `CustomBiddingScriptRef` /
 * `CustomBiddingAlgorithmRulesRef` whose `resourceName` is uploaded with
 * `media.upload`, then referenced by `scripts.create` / `rules.create`.
 *
 * Every one of these calls draws one limiter token from the owner's bucket —
 * `dv360:{advertiserId}` for an advertiser-owned algorithm, `dv360:partner:{id}`
 * for a partner-owned one. They carry no advertiserId in their PATH ids, and
 * used to draw no token at all (#236, dv360 #24).
 * basis: DV360 counts every API request against its quotas (per advertiser
 * per project, and per project — developers.google.com/display-video/api/limits,
 * corroboration only, docs/reviews/2026-09-fleet-review/_quotas-google.md);
 * `media.upload` is a method of the same API (Discovery `media.upload`).
 */
describe("custom bidding", () => {
  const RESOURCE = "customBiddingAlgorithms/7001/scriptRef/9001";
  const RULES_RESOURCE = "customBiddingAlgorithms/7001/rulesRef/9002";
  const SCRIPT = "return impression.bid * 1.2;";
  const RULES = '{"rules":[]}';

  function routeUploads() {
    stub.route({
      method: "POST",
      path: "/v4/customBiddingAlgorithms",
      response: echo({ customBiddingAlgorithmId: "7001" }),
    });
    stub.route({
      method: "GET",
      path: "/v4/customBiddingAlgorithms/7001:uploadScript",
      response: { resourceName: RESOURCE },
    });
    stub.route({
      method: "GET",
      path: "/v4/customBiddingAlgorithms/7001:uploadRules",
      response: { resourceName: RULES_RESOURCE },
    });
    stub.route({
      method: "POST",
      path: "/v4/customBiddingAlgorithms/7001/scripts",
      response: {
        name: "customBiddingAlgorithms/7001/scripts/8001",
        customBiddingAlgorithmId: "7001",
        customBiddingScriptId: "8001",
        state: "PENDING",
        active: false,
        createTime: "2026-09-30T00:00:00Z",
      },
    });
    stub.route({
      method: "POST",
      path: "/v4/customBiddingAlgorithms/7001/rules",
      response: {
        name: "customBiddingAlgorithms/7001/rules/8002",
        customBiddingAlgorithmId: "7001",
        customBiddingAlgorithmRulesId: "8002",
        state: "ACCEPTED",
        active: false,
        createTime: "2026-09-30T00:00:00Z",
      },
    });
  }

  function expectScriptUploadChain(
    scopeQuery: string,
    bodyText: string,
    resource: string,
    kind: "Script" | "Rules"
  ) {
    const verb = kind === "Script" ? "uploadScript" : "uploadRules";
    const sub = kind === "Script" ? "scripts" : "rules";
    const chain = apiRequests().filter((r) => r.path !== "/v4/customBiddingAlgorithms");
    // basis: `customBiddingAlgorithms.uploadScript` / `.uploadRules` —
    // httpMethod GET, flatPath `v4/customBiddingAlgorithms/{id}:uploadScript`,
    // query advertiserId | partnerId.
    expect(chain[0]!.method).toBe("GET");
    expect(chain[0]!.url).toBe(`${API}/customBiddingAlgorithms/7001:${verb}?${scopeQuery}`);
    // basis: `media.upload` — httpMethod POST, `mediaUpload.protocols.simple.path`
    // `/upload/media/{+resourceName}` ({+…} = reserved expansion, slashes kept);
    // description: "Upload requests will not be successful without including
    // `upload_type=media` query string" (global parameter `uploadType`). The
    // octet-stream content type: unverified (code-only) — `mediaUpload.accept` is "*/*".
    const media = chain[1]!;
    expect(media.method).toBe("POST");
    expect(media.url).toBe(
      `https://displayvideo.googleapis.com/upload/media/${resource}?uploadType=media`
    );
    expect(media.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(media.headers["content-type"]).toBe("application/octet-stream");
    expect(media.rawBody?.toString("utf8")).toBe(bodyText);
    // basis: `customBiddingAlgorithms.scripts.create` / `.rules.create` — POST
    // `v4/customBiddingAlgorithms/{id}/scripts|rules`, query advertiserId |
    // partnerId, request CustomBiddingScript{script: CustomBiddingScriptRef} /
    // CustomBiddingAlgorithmRules{rules: CustomBiddingAlgorithmRulesRef}, both
    // refs carrying `resourceName`.
    const create = chain[2]!;
    expect(create.method).toBe("POST");
    expect(create.url).toBe(`${API}/customBiddingAlgorithms/7001/${sub}?${scopeQuery}`);
    expectJsonAuth(create);
    expect(create.body).toEqual(
      kind === "Script"
        ? { script: { resourceName: resource } }
        : { rules: { resourceName: resource } }
    );
    expect(chain).toHaveLength(3);
  }

  describe("dv360_create_custom_bidding_algorithm → customBiddingAlgorithms.create (+ upload chain)", () => {
    it("advertiser-owned SCRIPT_BASED with initialScript", async () => {
      routeUploads();
      let out!: Awaited<ReturnType<typeof createCustomBiddingAlgorithmLogic>>;
      const spent = await tokensSpentDuring(async () => {
        out = await createCustomBiddingAlgorithmLogic(
          CreateCustomBiddingAlgorithmInputSchema.parse({
            displayName: "CB Algo",
            algorithmType: "SCRIPT_BASED",
            ownerType: "advertiser",
            ownerId: ADV,
            initialScript: SCRIPT,
          }),
          ctx,
          sdk
        );
      });

      const create = apiRequests()[0]!;
      // basis: `customBiddingAlgorithms.create` — POST `v4/customBiddingAlgorithms`,
      // no query parameters, request CustomBiddingAlgorithm: displayName
      // ("Required."), customBiddingAlgorithmType (enum SCRIPT_BASED |
      // RULE_BASED, "Required. Immutable."), entityStatus, advertiserId
      // ("Immutable. The unique ID of the advertiser that owns ...").
      expect(create.method).toBe("POST");
      expect(create.url).toBe(`${API}/customBiddingAlgorithms`);
      expectJsonAuth(create);
      expect(create.body).toEqual({
        displayName: "CB Algo",
        customBiddingAlgorithmType: "SCRIPT_BASED",
        entityStatus: "ENTITY_STATUS_ACTIVE",
        advertiserId: ADV,
      });
      expectScriptUploadChain(`advertiserId=${ADV}`, SCRIPT, RESOURCE, "Script");
      expect(out.scriptUpload).toEqual({ success: true, scriptId: "8001", state: "PENDING" });
      // create + uploadScript + media.upload + scripts.create
      expect(apiRequests()).toHaveLength(4);
      expect(spent).toBe(4);
      expectOneTokenPerApiCall();
    });

    it("partner-owned RULE_BASED with sharedAdvertiserIds and initialRules", async () => {
      routeUploads();
      const spent = await tokensSpentDuring(() =>
        createCustomBiddingAlgorithmLogic(
          CreateCustomBiddingAlgorithmInputSchema.parse({
            displayName: "Partner Algo",
            algorithmType: "RULE_BASED",
            ownerType: "partner",
            ownerId: "555",
            sharedAdvertiserIds: [ADV, "112"],
            initialRules: RULES,
          }),
          ctx,
          sdk
        )
      );
      const create = apiRequests()[0]!;
      // basis: `schemas.CustomBiddingAlgorithm.partnerId` ("Immutable.") and
      // `.sharedAdvertiserIds` (array of int64 strings — "only applicable if
      // the algorithm is owned by a partner").
      expect(create.url).toBe(`${API}/customBiddingAlgorithms`);
      expect(create.body).toEqual({
        displayName: "Partner Algo",
        customBiddingAlgorithmType: "RULE_BASED",
        entityStatus: "ENTITY_STATUS_ACTIVE",
        partnerId: "555",
        sharedAdvertiserIds: [ADV, "112"],
      });
      expectScriptUploadChain("partnerId=555", RULES, RULES_RESOURCE, "Rules");
      // create + uploadRules + media.upload + rules.create, on the partner's bucket
      expect(apiRequests()).toHaveLength(4);
      expect(spent).toBe(4);
      expectOneTokenPerApiCallOnPartner("555");
    });

    it("dry_run sends nothing", async () => {
      await createCustomBiddingAlgorithmLogic(
        CreateCustomBiddingAlgorithmInputSchema.parse({
          displayName: "CB Algo",
          algorithmType: "SCRIPT_BASED",
          ownerType: "advertiser",
          ownerId: ADV,
          dry_run: true,
        }),
        ctx,
        sdk
      );
      expect(apiRequests()).toHaveLength(0);
    });
  });

  describe("dv360_manage_custom_bidding_script (upload) → uploadScript, media.upload, scripts.create", () => {
    it("scopes every call to the owner and uploads the raw script bytes", async () => {
      routeUploads();
      let out!: Awaited<ReturnType<typeof manageCustomBiddingScriptLogic>>;
      const spent = await tokensSpentDuring(async () => {
        out = await manageCustomBiddingScriptLogic(
          ManageCustomBiddingScriptInputSchema.parse({
            customBiddingAlgorithmId: "7001",
            action: "upload",
            scriptContent: SCRIPT,
            partnerId: "555",
          }),
          ctx,
          sdk
        );
      });
      expectScriptUploadChain("partnerId=555", SCRIPT, RESOURCE, "Script");
      expect(out.script?.customBiddingScriptId).toBe("8001");
      expect(spent).toBe(3);
      expectOneTokenPerApiCallOnPartner("555");
    });

    it("dry_run sends nothing", async () => {
      await manageCustomBiddingScriptLogic(
        ManageCustomBiddingScriptInputSchema.parse({
          customBiddingAlgorithmId: "7001",
          action: "upload",
          scriptContent: SCRIPT,
          partnerId: "555",
          dry_run: true,
        }),
        ctx,
        sdk
      );
      expect(apiRequests()).toHaveLength(0);
    });
  });

  describe("dv360_manage_custom_bidding_rules (upload) → uploadRules, media.upload, rules.create", () => {
    it("scopes every call to the owner and uploads the raw rules bytes", async () => {
      routeUploads();
      let out!: Awaited<ReturnType<typeof manageCustomBiddingRulesLogic>>;
      const spent = await tokensSpentDuring(async () => {
        out = await manageCustomBiddingRulesLogic(
          ManageCustomBiddingRulesInputSchema.parse({
            customBiddingAlgorithmId: "7001",
            action: "upload",
            rulesContent: RULES,
            advertiserId: ADV,
          }),
          ctx,
          sdk
        );
      });
      expectScriptUploadChain(`advertiserId=${ADV}`, RULES, RULES_RESOURCE, "Rules");
      expect(out.rules?.customBiddingAlgorithmRulesId).toBe("8002");
      expect(spent).toBe(3);
      expectOneTokenPerApiCall();
    });

    it("dry_run sends nothing", async () => {
      await manageCustomBiddingRulesLogic(
        ManageCustomBiddingRulesInputSchema.parse({
          customBiddingAlgorithmId: "7001",
          action: "upload",
          rulesContent: RULES,
          advertiserId: ADV,
          dry_run: true,
        }),
        ctx,
        sdk
      );
      expect(apiRequests()).toHaveLength(0);
    });
  });
});

describe("dv360_create_assigned_targeting → …targetingTypes.assignedTargetingOptions.create", () => {
  const data = { channelDetails: { channelId: "123456", negative: true } };

  it("lineItem → POST …/lineItems/{id}/targetingTypes/{type}/assignedTargetingOptions, body = data", async () => {
    stub.route({
      method: "POST",
      path: /\/assignedTargetingOptions$/,
      response: echo({ assignedTargetingOptionId: "123456" }),
    });
    const out = await createAssignedTargetingLogic(
      CreateAssignedTargetingInputSchema.parse({
        parentType: "lineItem",
        advertiserId: ADV,
        lineItemId: "222",
        targetingType: "TARGETING_TYPE_CHANNEL",
        data,
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `advertisers.lineItems.targetingTypes.assignedTargetingOptions.create`
    // — POST `v4/advertisers/{advertisersId}/lineItems/{lineItemsId}/targetingTypes/
    // {targetingTypesId}/assignedTargetingOptions`, request AssignedTargetingOption;
    // `schemas.AssignedTargetingOption.channelDetails` → ChannelAssignedTargetingOptionDetails
    // {channelId (int64 string), negative (boolean)}.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(
      `${API}/advertisers/${ADV}/lineItems/222/targetingTypes/TARGETING_TYPE_CHANNEL/assignedTargetingOptions`
    );
    expectJsonAuth(req);
    expect(req.body).toEqual(data);
    expect(out.assignedTargetingOptionId).toBe("123456");
    expectOneTokenPerApiCall();
  });

  it("advertiser → POST v4/advertisers/{a}/targetingTypes/{type}/assignedTargetingOptions", async () => {
    await createAssignedTargetingLogic(
      CreateAssignedTargetingInputSchema.parse({
        parentType: "advertiser",
        advertiserId: ADV,
        targetingType: "TARGETING_TYPE_CHANNEL",
        data,
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `advertisers.targetingTypes.assignedTargetingOptions.create` — POST
    // `v4/advertisers/{advertisersId}/targetingTypes/{targetingTypesId}/assignedTargetingOptions`.
    expect(req.url).toBe(
      `${API}/advertisers/${ADV}/targetingTypes/TARGETING_TYPE_CHANNEL/assignedTargetingOptions`
    );
    expect(req.body).toEqual(data);
  });

  it("dry_run sends nothing", async () => {
    await createAssignedTargetingLogic(
      CreateAssignedTargetingInputSchema.parse({
        parentType: "lineItem",
        advertiserId: ADV,
        lineItemId: "222",
        targetingType: "TARGETING_TYPE_CHANNEL",
        data,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

// dv360 #16. basis: v4 Discovery rev 20260928 — `targetingType` enum
// (TARGETING_TYPE_YOUTUBE_CHANNEL_PACK is new), and the `targetingType`
// parameter description of each create/delete method: advertiser "Supported
// targeting types:" 5 types; adGroup create 14, delete the same plus
// TARGETING_TYPE_SESSION_POSITION; lineItem "Supported targeting types
// include:" (not exhaustive, so not restricted).
describe("dv360 assigned targeting: per-parent targeting types", () => {
  const base = { advertiserId: ADV, data: { channelDetails: { channelId: "1" } } };
  const create = (extra: Record<string, unknown>) =>
    CreateAssignedTargetingInputSchema.safeParse({ ...base, ...extra }).success;
  const del = (extra: Record<string, unknown>) =>
    DeleteAssignedTargetingInputSchema.safeParse({
      advertiserId: ADV,
      assignedTargetingOptionId: "1",
      ...extra,
    }).success;

  it("offers TARGETING_TYPE_YOUTUBE_CHANNEL_PACK", () => {
    expect(
      create({
        parentType: "lineItem",
        lineItemId: "222",
        targetingType: "TARGETING_TYPE_YOUTUBE_CHANNEL_PACK",
      })
    ).toBe(true);
  });

  it("advertiser: only the five documented types, on create and delete", () => {
    expect(create({ parentType: "advertiser", targetingType: "TARGETING_TYPE_CHANNEL" })).toBe(
      true
    );
    expect(create({ parentType: "advertiser", targetingType: "TARGETING_TYPE_GEO_REGION" })).toBe(
      false
    );
    expect(del({ parentType: "advertiser", targetingType: "TARGETING_TYPE_GEO_REGION" })).toBe(
      false
    );
  });

  it("adGroup: SESSION_POSITION can be deleted but not created", () => {
    const sp = {
      parentType: "adGroup",
      adGroupId: "666",
      targetingType: "TARGETING_TYPE_SESSION_POSITION",
    };
    expect(create(sp)).toBe(false);
    expect(del(sp)).toBe(true);
    expect(
      create({
        parentType: "adGroup",
        adGroupId: "666",
        targetingType: "TARGETING_TYPE_DEVICE_TYPE",
      })
    ).toBe(false);
  });

  it("lineItem: not restricted (the documented list is not exhaustive)", () => {
    expect(
      create({
        parentType: "lineItem",
        lineItemId: "222",
        targetingType: "TARGETING_TYPE_DEVICE_TYPE",
      })
    ).toBe(true);
  });
});

describe("dv360_delete_assigned_targeting → …assignedTargetingOptions.delete", () => {
  const input = {
    parentType: "adGroup",
    advertiserId: ADV,
    adGroupId: "666",
    targetingType: "TARGETING_TYPE_GEO_REGION",
    assignedTargetingOptionId: "2840",
  };

  it("adGroup → DELETE …/adGroups/{id}/targetingTypes/{type}/assignedTargetingOptions/{optionId}", async () => {
    const out = await deleteAssignedTargetingLogic(
      DeleteAssignedTargetingInputSchema.parse(input),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `advertisers.adGroups.targetingTypes.assignedTargetingOptions.delete`
    // — DELETE `v4/advertisers/{advertisersId}/adGroups/{adGroupsId}/targetingTypes/
    // {targetingTypesId}/assignedTargetingOptions/{assignedTargetingOptionsId}`,
    // no request body, no query parameters.
    expect(req.method).toBe("DELETE");
    expect(req.url).toBe(
      `${API}/advertisers/${ADV}/adGroups/666/targetingTypes/TARGETING_TYPE_GEO_REGION/assignedTargetingOptions/2840`
    );
    expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(req.body).toBeUndefined();
    expect(out.success).toBe(true);
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expectOneTokenPerApiCall();
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await deleteAssignedTargetingLogic(DeleteAssignedTargetingInputSchema.parse(input), ctx, sdk);
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends no DELETE and does not prompt", async () => {
    await deleteAssignedTargetingLogic(
      DeleteAssignedTargetingInputSchema.parse({ ...input, dry_run: true }),
      ctx,
      sdk
    );
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });
});

describe("dv360_upload_image / dv360_upload_video → advertisers.assets.upload (multipart)", () => {
  const BYTES = "\x89PNG-fake-image-bytes";

  function expectMultipartUpload(filename: string, contentType: string, bytes: string) {
    const req = onlyWrite();
    // basis: `advertisers.assets.upload` — httpMethod POST,
    // `mediaUpload.protocols.simple` {multipart: true, path
    // `/upload/v4/advertisers/{+advertiserId}/assets`}, request CreateAssetRequest
    // {filename: "Required. The filename of the asset, including the file
    // extension."}; description: "Must be used within the multipart media upload
    // process". `uploadType=multipart` is the global `uploadType` parameter.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${UPLOAD_API}/advertisers/${ADV}/assets?uploadType=multipart`);
    expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    const ct = req.headers["content-type"]!;
    const boundary = /^multipart\/related; boundary=(.+)$/.exec(ct)?.[1];
    expect(boundary).toBeTruthy();
    // basis: Google multipart upload (multipart/related: JSON metadata part,
    // then the media part) — the part framing is unverified (code-only): the
    // upload guide is not in the Discovery document.
    expect(req.rawBody!.toString("latin1")).toBe(
      `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify({ filename })}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${contentType}\r\n` +
        `Content-Transfer-Encoding: binary\r\n\r\n` +
        `${bytes}\r\n` +
        `--${boundary}--\r\n`
    );
    expectOneTokenPerApiCall();
  }

  it("upload_image downloads the media, then uploads CreateAssetRequest{filename} + bytes", async () => {
    stub.route({
      method: "GET",
      host: "cdn.example.com",
      path: "/banner.png",
      rawBody: Buffer.from(BYTES, "latin1"),
      contentType: "image/png",
    });
    stub.route({
      method: "POST",
      path: `/upload/v4/advertisers/${ADV}/assets`,
      response: { asset: { mediaId: "31337" } },
    });
    const out = await uploadImageLogic(
      UploadImageInputSchema.parse({
        advertiserId: ADV,
        mediaUrl: "https://cdn.example.com/banner.png",
      }),
      ctx,
      sdk
    );
    expectMultipartUpload("banner.png", "image/png", BYTES);
    // basis: `schemas.CreateAssetResponse.asset` → Asset.mediaId (int64).
    expect(out.assetId).toBe("31337");
  });

  it("upload_video uses the same endpoint with the video content type", async () => {
    stub.route({
      method: "GET",
      host: "cdn.example.com",
      path: "/spot.mp4",
      rawBody: Buffer.from("mp4-bytes", "latin1"),
      contentType: "video/mp4",
    });
    stub.route({
      method: "POST",
      path: `/upload/v4/advertisers/${ADV}/assets`,
      response: { asset: { mediaId: "31338" } },
    });
    const out = await uploadVideoLogic(
      UploadVideoInputSchema.parse({
        advertiserId: ADV,
        mediaUrl: "https://cdn.example.com/spot.mp4",
      }),
      ctx,
      sdk
    );
    expectMultipartUpload("spot.mp4", "video/mp4", "mp4-bytes");
    expect(out.assetId).toBe("31338");
  });

  it("dry_run downloads and uploads nothing", async () => {
    await uploadImageLogic(
      UploadImageInputSchema.parse({
        advertiserId: ADV,
        mediaUrl: "https://cdn.example.com/banner.png",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    await uploadVideoLogic(
      UploadVideoInputSchema.parse({
        advertiserId: ADV,
        mediaUrl: "https://cdn.example.com/spot.mp4",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests.filter((r) => r.url !== GOOGLE_TOKEN_URL)).toHaveLength(0);
  });
});

describe("dv360_duplicate_entity", () => {
  it("lineItem → lineItems.duplicate, re-read, and PATCH an ACTIVE copy to PAUSED", async () => {
    stub.route({
      method: "GET",
      path: `/v4/advertisers/${ADV}/lineItems/222`,
      response: lineItem("222"),
    });
    stub.route({
      method: "POST",
      path: `/v4/advertisers/${ADV}/lineItems/222:duplicate`,
      response: { duplicateLineItemId: "999" },
    });
    stub.route({
      method: "GET",
      path: `/v4/advertisers/${ADV}/lineItems/999`,
      response: lineItem("999", { displayName: "Copy of LI 222" }),
    });
    stub.route({ method: "PATCH", path: `/v4/advertisers/${ADV}/lineItems/999`, response: echo() });

    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "lineItem",
        advertiserId: ADV,
        lineItemId: "222",
      }),
      ctx,
      sdk
    );

    expect(apiRequests().map((r) => `${r.method} ${r.url}`)).toEqual([
      `GET ${API}/advertisers/${ADV}/lineItems/222`,
      `POST ${API}/advertisers/${ADV}/lineItems/222:duplicate`,
      `GET ${API}/advertisers/${ADV}/lineItems/999`,
      `PATCH ${API}/advertisers/${ADV}/lineItems/999?updateMask=entityStatus`,
    ]);
    const [dup, patch] = writes();
    // basis: `advertisers.lineItems.duplicate` — POST
    // `v4/advertisers/{advertisersId}/lineItems/{lineItemsId}:duplicate`, request
    // DuplicateLineItemRequest {targetDisplayName, containsEuPoliticalAds},
    // response DuplicateLineItemResponse {duplicateLineItemId}.
    expectJsonAuth(dup!);
    expect(dup!.body).toEqual({
      targetDisplayName: "Copy of LI 222",
      containsEuPoliticalAds: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    });
    // basis: `advertisers.lineItems.patch` with updateMask entityStatus.
    expect(patch!.body).toEqual(
      lineItem("999", { displayName: "Copy of LI 222", entityStatus: "ENTITY_STATUS_PAUSED" })
    );
    expectOneTokenPerApiCall();
  });

  it("insertionOrder → GET, then POST insertionOrders with server fields stripped and DRAFT status", async () => {
    stub.route({
      method: "GET",
      path: `/v4/advertisers/${ADV}/insertionOrders/333`,
      response: INSERTION_ORDER,
    });
    stub.route({
      method: "POST",
      path: `/v4/advertisers/${ADV}/insertionOrders`,
      response: echo({ insertionOrderId: "334" }),
    });

    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "insertionOrder",
        advertiserId: ADV,
        insertionOrderId: "333",
        displayName: "IO copy",
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: v4 Discovery has no `advertisers.insertionOrders.duplicate`;
    // `advertisers.insertionOrders.create` — POST, request InsertionOrder.
    // `schemas.InsertionOrder.name` / `.insertionOrderId` / `.updateTime` are
    // "Output only."; `.entityStatus`: "For CreateInsertionOrder method, only
    // ENTITY_STATUS_DRAFT is allowed".
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/advertisers/${ADV}/insertionOrders`);
    expectJsonAuth(req);
    const { name: _n, insertionOrderId: _i, updateTime: _u, ...copied } = INSERTION_ORDER;
    expect(req.body).toEqual({
      ...copied,
      displayName: "IO copy",
      entityStatus: "ENTITY_STATUS_DRAFT",
    });
    expectOneTokenPerApiCall();
  });

  it("dry_run sends nothing but reads", async () => {
    stub.route({
      method: "GET",
      path: `/v4/advertisers/${ADV}/lineItems/222`,
      response: lineItem("222"),
    });
    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "lineItem",
        advertiserId: ADV,
        lineItemId: "222",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(0);
  });
});
