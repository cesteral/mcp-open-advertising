// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-request assertions for every meta-mcp tool that issues a non-GET
 * upstream request (#236). Each test calls the REAL tool logic over REAL
 * session services (MetaService, MetaInsightsService, MetaGraphApiClient, the
 * access-token adapter and the package's real `RateLimiter`), with only
 * `globalThis.fetch` stubbed, and asserts the full request: HTTP method, URL
 * (+ query) and every body parameter.
 *
 * Expected shapes come from Meta's machine-readable Marketing API specs, the
 * ones Meta generates its Business SDKs from:
 *   https://github.com/facebook/facebook-business-sdk-codegen
 *   commit 8420be6d5752c568a4f01dd608fa3cce6b2db960 (main, fetched 2026-09-30),
 *   `api_specs/specs/{Campaign,AdSet,Ad,AdAccount,HighDemandPeriod}.json` and
 *   `api_specs/specs/enum_types.json`.
 * Citations are `<Node>.json apis[<METHOD> <endpoint>]` (endpoint `—` = the
 * node itself, i.e. `#update` / `#delete`) and their `params` (name, type,
 * required). The Graph version is not part of those specs: the base URL is
 * taken from `mcpConfig.metaApiBaseUrl`, which platform-facts.json
 * `meta.api_version` pins, so these tests do not restate it.
 *
 * Encoding: the specs give parameter names and types, not a body encoding
 * (Graph accepts form or JSON). MetaGraphApiClient sends
 * `application/x-www-form-urlencoded`, with object / list values JSON-encoded
 * and list<string> `fields` / `breakdowns` comma-joined — `basis: unverified
 * (code-only)` for the encoding; the assertions pin the parameter names and
 * values the spec defines.
 *
 * Rate limiting: creates draw META_WRITE_TOKENS (3) from `meta:{adAccountId}`;
 * reads draw 1 and updates / deletes / copies / budget schedules draw 3 from
 * `meta:default`; an async insights job draws 1 from `meta:default`.
 *
 * list/get/insights/targeting/preview/estimate/pacing/validate tools send only
 * GETs and are out of scope here.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Video processing is polled at `metaVideoUploadPollIntervalMs` (15 s by
// default), read from config at import; 1 ms keeps the upload test from
// sleeping. Timing only — no request changes.
vi.hoisted(() => {
  process.env.META_VIDEO_UPLOAD_POLL_INTERVAL_MS = "1";
});

import { mcpConfig } from "../../src/config/index.js";
import { META_READ_TOKENS, META_WRITE_TOKENS } from "../../src/services/meta/meta-service.js";
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
  manageBudgetScheduleLogic,
  ManageBudgetScheduleInputSchema,
} from "../../src/mcp-server/tools/definitions/manage-budget-schedule.tool.js";
import {
  submitReportLogic,
  SubmitReportInputSchema,
} from "../../src/mcp-server/tools/definitions/submit-report.tool.js";
import {
  uploadImageLogic,
  UploadImageInputSchema,
} from "../../src/mcp-server/tools/definitions/upload-image.tool.js";
import {
  uploadVideoLogic,
  UploadVideoInputSchema,
} from "../../src/mcp-server/tools/definitions/upload-video.tool.js";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  rateLimiter,
  GRAPH_HOST,
  TEST_ACCESS_TOKEN,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/wire.js";

/** The versioned Graph base URL (platform-facts `meta.api_version`). */
const API = mcpConfig.metaApiBaseUrl;
const ACT = "act_1234567890";
const ctx = { requestId: "wire-req" } as any;

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

/** Every Graph request except the adapter's session validation (`GET /me`). */
function apiRequests(): WireRequest[] {
  return stub.to(GRAPH_HOST).filter((r) => !r.path.endsWith("/me"));
}

function writes(): WireRequest[] {
  return apiRequests().filter((r) => r.method !== "GET");
}

function onlyWrite(): WireRequest {
  const w = writes();
  expect(w).toHaveLength(1);
  return w[0]!;
}

/** basis: Graph bearer token; the form encoding — unverified (code-only), see the file header. */
function expectFormAuth(req: WireRequest) {
  expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  expect(req.headers["content-type"]).toBe("application/x-www-form-urlencoded");
}

function remaining(key: string): number {
  return rateLimiter.getRemainingTokens(key);
}

const LIMIT = mcpConfig.metaRateLimitPerMinute;

/** Route `GET /{id}` (the snapshot / pre-state reads) to a node with that id. */
function routeNodeReads(extra: Record<string, unknown> = {}) {
  stub.route({
    method: "GET",
    path: /^\/v[\d.]+\/\d+$/,
    response: (req: WireRequest) => ({ id: req.path.split("/").pop(), ...extra }),
  });
}

describe("session validation", () => {
  it("the access-token adapter validates with GET /me", () => {
    const [validate] = stub.to(GRAPH_HOST);
    // basis: Graph `User` node read (`/me`), bearer token.
    expect(validate!.method).toBe("GET");
    expect(validate!.url).toBe(`${API}/me?fields=id,name`);
    expect(validate!.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  });
});

describe("meta_create_entity → AdAccount.json POST <edge>", () => {
  it("campaign → POST /act_{id}/campaigns with the spec's campaign params", async () => {
    stub.route({
      method: "POST",
      path: `/${API.split("/").pop()}/${ACT}/campaigns`,
      response: { id: "120200000000001" },
    });
    routeNodeReads({ name: "Autumn", status: "PAUSED", objective: "OUTCOME_TRAFFIC" });

    const out = await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACT,
        data: {
          name: "Autumn",
          objective: "OUTCOME_TRAFFIC",
          status: "PAUSED",
          special_ad_categories: ["NONE"],
          daily_budget: 5000,
        },
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: AdAccount.json apis[POST campaigns] (return Campaign) — params
    // name string, objective `adaccountcampaigns_objective_enum_param`
    // (OUTCOME_TRAFFIC), status `adaccountcampaigns_status_enum_param`
    // (PAUSED), special_ad_categories list<…> REQUIRED (NONE), daily_budget
    // unsigned int.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/${ACT}/campaigns`);
    expectFormAuth(req);
    expect(req.form).toEqual({
      name: "Autumn",
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: '["NONE"]',
      daily_budget: "5000",
    });
    expect(out.entity.id).toBe("120200000000001");
    // Create: one write on the ad-account bucket; the `after` re-read: one read on default.
    expect(remaining(`meta:${ACT}`)).toBe(LIMIT - META_WRITE_TOKENS);
    expect(remaining("meta:default")).toBe(LIMIT - META_READ_TOKENS);
  });

  it("adSet → POST /act_{id}/adsets with targeting as a JSON-encoded object", async () => {
    stub.route({ method: "POST", path: /\/adsets$/, response: { id: "120200000000002" } });
    routeNodeReads();
    const targeting = { geo_locations: { countries: ["US"] }, age_min: 18 };
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "adSet",
        adAccountId: ACT,
        data: {
          name: "AS",
          campaign_id: "120200000000001",
          billing_event: "IMPRESSIONS",
          optimization_goal: "LINK_CLICKS",
          bid_amount: 150,
          daily_budget: 2000,
          targeting,
          status: "PAUSED",
        },
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: AdAccount.json apis[POST adsets] (return AdSet) — name string
    // REQUIRED, campaign_id string, billing_event / optimization_goal enums,
    // bid_amount int, daily_budget unsigned int, targeting `Targeting` (an
    // object: JSON-encoded in the form body — encoding unverified (code-only)).
    expect(req.url).toBe(`${API}/${ACT}/adsets`);
    expect(req.form).toEqual({
      name: "AS",
      campaign_id: "120200000000001",
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      bid_amount: "150",
      daily_budget: "2000",
      targeting: JSON.stringify(targeting),
      status: "PAUSED",
    });
  });

  it("dry_run sends nothing", async () => {
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACT,
        data: { name: "Autumn", objective: "OUTCOME_TRAFFIC", special_ad_categories: ["NONE"] },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(0);
  });
});

describe("meta_update_entity → <Node>.json POST — (#update)", () => {
  it("POSTs the changed params to /{id}, after a pre-state read", async () => {
    routeNodeReads({ name: "AS", status: "ACTIVE", daily_budget: "2000" });
    stub.route({ method: "POST", path: /\/120200000000002$/, response: { success: true } });

    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "adSet",
        entityId: "120200000000002",
        data: { daily_budget: 3000, status: "PAUSED" },
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: AdSet.json apis[POST — #update] (return AdSet) — daily_budget
    // unsigned int, status `adcampaign_status` (ACTIVE|ARCHIVED|DELETED|PAUSED).
    // Graph updates are POST to the node, not PATCH.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/120200000000002`);
    expectFormAuth(req);
    expect(req.form).toEqual({ daily_budget: "3000", status: "PAUSED" });
    expect(remaining("meta:default")).toBe(
      LIMIT - META_WRITE_TOKENS - 2 * META_READ_TOKENS // pre-state read + `after` read
    );
    expect(apiRequests().map((r) => r.method)).toEqual(["GET", "POST", "GET"]);
  });

  it("dry_run sends no POST", async () => {
    routeNodeReads({ name: "AS", status: "ACTIVE" });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "adSet",
        entityId: "120200000000002",
        data: { status: "PAUSED" },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(0);
  });
});

describe("meta_delete_entity → <Node>.json DELETE — (#delete)", () => {
  it("DELETE /{id}, no body, after the pre-delete read", async () => {
    routeNodeReads({ name: "Autumn", status: "PAUSED" });
    stub.route({ method: "DELETE", path: /\/120200000000001$/, response: { success: true } });

    const out = await deleteEntityLogic(
      DeleteEntityInputSchema.parse({ entityType: "campaign", entityId: "120200000000001" }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: Campaign.json apis[DELETE — #delete] (return Object; no params).
    expect(req.method).toBe("DELETE");
    expect(req.url).toBe(`${API}/120200000000001`);
    expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(req.body).toBeUndefined();
    expect(out.success).toBe(true);
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(remaining("meta:default")).toBe(LIMIT - META_WRITE_TOKENS - META_READ_TOKENS);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({ entityType: "campaign", entityId: "120200000000001" }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends no DELETE and does not prompt", async () => {
    routeNodeReads({ name: "Autumn", status: "PAUSED" });
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        entityId: "120200000000001",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });
});

describe("meta_bulk_update_status → POST /{id} {status} per id", () => {
  it("one POST per entity with the status param", async () => {
    stub.route({ method: "POST", path: /\/12020000000000[12]$/, response: { success: true } });
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        entityIds: ["120200000000001", "120200000000002"],
        status: "PAUSED",
      }),
      ctx,
      sdk
    );
    // basis: Campaign.json apis[POST — #update] — status `adcampaigngroup_status`.
    const w = writes();
    expect(w).toHaveLength(2);
    for (const req of w) {
      expect(req.method).toBe("POST");
      expectFormAuth(req);
      expect(req.form).toEqual({ status: "PAUSED" });
    }
    expect(w.map((r) => r.url).sort()).toEqual([
      `${API}/120200000000001`,
      `${API}/120200000000002`,
    ]);
    expect(remaining("meta:default")).toBe(LIMIT - 2 * META_WRITE_TOKENS);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({ entityIds: ["120200000000001"], status: "ARCHIVED" }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityIds: ["120200000000001"],
        status: "ARCHIVED",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("meta_bulk_create_entities → AdAccount.json POST ads per item", () => {
  const items = [
    {
      name: "Ad A",
      adset_id: "120200000000002",
      creative: { creative_id: "555" },
      status: "PAUSED",
    },
    {
      name: "Ad B",
      adset_id: "120200000000002",
      creative: { creative_id: "556" },
      status: "PAUSED",
    },
  ];

  it("POSTs each item to /act_{id}/ads", async () => {
    stub.route({ method: "POST", path: /\/ads$/, response: { id: "120200000000009" } });
    const out = await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({ entityType: "ad", adAccountId: ACT, items }),
      ctx,
      sdk
    );
    // basis: AdAccount.json apis[POST ads] (return Ad) — name string REQUIRED,
    // creative `AdCreative` REQUIRED (an object: JSON-encoded), adset_id
    // unsigned int, status `adaccountads_status_enum_param`.
    const w = writes();
    expect(w).toHaveLength(2);
    for (const req of w) {
      expect(req.method).toBe("POST");
      expect(req.url).toBe(`${API}/${ACT}/ads`);
      expectFormAuth(req);
    }
    expect(w.map((r) => r.form)).toEqual(
      expect.arrayContaining(
        items.map((i) => ({
          name: i.name,
          adset_id: i.adset_id,
          creative: JSON.stringify(i.creative),
          status: "PAUSED",
        }))
      )
    );
    expect(out.successCount).toBe(2);
    expect(remaining(`meta:${ACT}`)).toBe(LIMIT - 2 * META_WRITE_TOKENS);
  });

  it("dry_run sends nothing", async () => {
    await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({
        entityType: "ad",
        adAccountId: ACT,
        items,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("meta_bulk_update_entities → POST /{id} per item", () => {
  const items = [
    { entityId: "120200000000002", data: { daily_budget: 4000 } },
    { entityId: "120200000000003", data: { name: "Renamed" } },
  ];

  it("POSTs each item's params to its node after one confirmation (a budget field is sensitive)", async () => {
    stub.route({ method: "POST", path: /\/12020000000000[23]$/, response: { success: true } });
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({ entityType: "adSet", items }),
      ctx,
      sdk
    );
    // basis: AdSet.json apis[POST — #update] — daily_budget unsigned int, name string.
    const byUrl = Object.fromEntries(writes().map((r) => [r.url, r.form]));
    expect(byUrl).toEqual({
      [`${API}/120200000000002`]: { daily_budget: "4000" },
      [`${API}/120200000000003`]: { name: "Renamed" },
    });
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(remaining("meta:default")).toBe(LIMIT - 2 * META_WRITE_TOKENS);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await bulkUpdateEntitiesLogic(BulkUpdateEntitiesInputSchema.parse({ items }), ctx, sdk);
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({ items, dry_run: true }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("meta_duplicate_entity → <Node>.json POST copies", () => {
  it("POSTs rename_options and status_option to /{id}/copies", async () => {
    stub.route({
      method: "POST",
      path: /\/120200000000001\/copies$/,
      response: { copied_campaign_id: "120200000000077", ad_object_ids: [] },
    });
    routeNodeReads({ name: "Autumn (copy)", status: "PAUSED" });

    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "campaign",
        entityId: "120200000000001",
        renameOptions: { suffix: " (copy)" },
        statusOption: "PAUSED",
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: Campaign.json apis[POST copies] (return Campaign) — rename_options
    // Object, status_option `adcampaigngroupcopies_status_option_enum_param`
    // (ACTIVE | INHERITED_FROM_SOURCE | PAUSED). rename_options' inner keys
    // (rename_suffix) are not described by the spec: unverified (code-only).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/120200000000001/copies`);
    expectFormAuth(req);
    expect(req.form).toEqual({
      rename_options: JSON.stringify({ rename_suffix: " (copy)" }),
      status_option: "PAUSED",
    });
    expect(remaining("meta:default")).toBe(LIMIT - META_WRITE_TOKENS - META_READ_TOKENS);
  });

  it("dry_run sends no copy", async () => {
    routeNodeReads({ name: "Autumn", status: "ACTIVE" });
    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "campaign",
        entityId: "120200000000001",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(0);
  });
});

describe("meta_adjust_bids → AdSet read then AdSet.json POST — (#update)", () => {
  it("reads id,name,bid_amount,bid_strategy then POSTs bid_amount", async () => {
    routeNodeReads({ name: "AS", bid_amount: 100, bid_strategy: "LOWEST_COST_WITH_BID_CAP" });
    stub.route({ method: "POST", path: /\/120200000000002$/, response: { success: true } });

    const out = await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        adjustments: [{ adSetId: "120200000000002", bidAmount: 150 }],
      }),
      ctx,
      sdk
    );

    const [read, write] = apiRequests();
    // basis: AdSet.json fields bid_amount (unsigned int), bid_strategy, name.
    expect(read!.method).toBe("GET");
    expect(read!.url).toBe(`${API}/120200000000002?fields=id%2Cname%2Cbid_amount%2Cbid_strategy`);
    // basis: AdSet.json apis[POST — #update] — bid_amount int.
    expect(write!.method).toBe("POST");
    expect(write!.url).toBe(`${API}/120200000000002`);
    expectFormAuth(write!);
    expect(write!.form).toEqual({ bid_amount: "150" });
    expect(out.results).toEqual([
      expect.objectContaining({
        adSetId: "120200000000002",
        success: true,
        previousBidAmount: 100,
      }),
    ]);
    expect(apiRequests()).toHaveLength(2);
    expect(remaining("meta:default")).toBe(LIMIT - META_READ_TOKENS - META_WRITE_TOKENS);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        adjustments: [{ adSetId: "120200000000002", bidAmount: 150 }],
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        adjustments: [{ adSetId: "120200000000002", bidAmount: 150 }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("meta_manage_budget_schedule (create) → Campaign.json POST budget_schedules", () => {
  const data = {
    budget_value: 5000,
    budget_value_type: "ABSOLUTE",
    time_start: 1_790_000_000,
    time_end: 1_790_086_400,
  };

  it("POSTs the four required HighDemandPeriod params", async () => {
    stub.route({ method: "POST", path: /\/budget_schedules$/, response: { id: "9001" } });
    await manageBudgetScheduleLogic(
      ManageBudgetScheduleInputSchema.parse({
        operation: "create",
        campaignId: "120200000000001",
        data,
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: Campaign.json apis[POST budget_schedules] (return HighDemandPeriod)
    // — budget_value unsigned int REQUIRED, budget_value_type
    // `adcampaigngroupbudget_schedules_budget_value_type_enum_param`
    // (ABSOLUTE | MULTIPLIER) REQUIRED, time_start / time_end unsigned int REQUIRED.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/120200000000001/budget_schedules`);
    expectFormAuth(req);
    expect(req.form).toEqual({
      budget_value: "5000",
      budget_value_type: "ABSOLUTE",
      time_start: "1790000000",
      time_end: "1790086400",
    });
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(remaining("meta:default")).toBe(LIMIT - META_WRITE_TOKENS);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await manageBudgetScheduleLogic(
      ManageBudgetScheduleInputSchema.parse({
        operation: "create",
        campaignId: "120200000000001",
        data,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await manageBudgetScheduleLogic(
      ManageBudgetScheduleInputSchema.parse({
        operation: "create",
        campaignId: "120200000000001",
        data,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(0);
  });
});

describe("meta_submit_report → <Node>.json POST insights (async AdReportRun)", () => {
  it("POSTs the insights params to /{id}/insights", async () => {
    stub.route({
      method: "POST",
      path: /\/insights$/,
      response: { report_run_id: "777", id: "777" },
    });
    const out = await submitReportLogic(
      SubmitReportInputSchema.parse({
        entityId: ACT,
        fields: ["impressions", "spend"],
        timeRange: { since: "2026-09-01", until: "2026-09-07" },
        timeIncrement: "1",
        level: "campaign",
        breakdowns: ["age", "gender"],
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: AdAccount.json apis[POST insights] (return AdReportRun) — fields
    // list<string>, time_range map, time_increment string, level
    // `adaccountinsights_level_enum_param`, breakdowns
    // list<adaccountinsights_breakdowns_enum_param>. List values are sent
    // comma-joined, time_range JSON-encoded: unverified (code-only).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/${ACT}/insights`);
    expectFormAuth(req);
    const { async: _async, ...params } = req.form!;
    expect(params).toEqual({
      fields: "impressions,spend",
      time_range: JSON.stringify({ since: "2026-09-01", until: "2026-09-07" }),
      time_increment: "1",
      level: "campaign",
      breakdowns: "age,gender",
    });
    expect(out.reportRunId).toBe("777");
    expect(remaining("meta:default")).toBe(LIMIT - META_READ_TOKENS);
  });

  // basis: AdAccount.json / Campaign.json apis[POST insights] list no `async`
  // param — a POST to /insights IS the async job (it returns AdReportRun).
  // MetaInsightsService.submitInsightsReport also sends `async=1`, which the
  // spec does not define (the test above deliberately leaves it unasserted).
  // Whether Graph ignores or rejects it: unverified.
  it.todo(
    "meta_submit_report sends only spec-defined insights params (drop async=1) — reported on #236, not fixed here"
  );

  it("dry_run sends nothing", async () => {
    await submitReportLogic(
      SubmitReportInputSchema.parse({ entityId: ACT, datePreset: "last_7d", dry_run: true }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("media uploads (multipart)", () => {
  function boundaryOf(req: WireRequest): string {
    const b = /^multipart\/form-data; boundary=(.+)$/.exec(req.headers["content-type"]!)?.[1];
    expect(b).toBeTruthy();
    return b!;
  }

  it("meta_upload_image → POST /act_{id}/adimages with the file part named `bytes`", async () => {
    stub.route({
      method: "GET",
      host: "cdn.example.com",
      path: "/banner.png",
      rawBody: Buffer.from("png-bytes", "latin1"),
      contentType: "image/png",
    });
    stub.route({
      method: "POST",
      path: /\/adimages$/,
      response: {
        images: { "banner.png": { hash: "abc123", url: "https://scontent.example/abc" } },
      },
    });

    const out = await uploadImageLogic(
      UploadImageInputSchema.parse({
        adAccountId: ACT,
        mediaUrl: "https://cdn.example.com/banner.png",
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: AdAccount.json apis[POST adimages] — params `bytes` (string) and
    // `copy_from`. Multipart framing and sending the raw file as the `bytes`
    // part: unverified (code-only) — see the todo below.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/${ACT}/adimages`);
    expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    const b = boundaryOf(req);
    expect(req.rawBody!.toString("latin1")).toBe(
      `--${b}\r\nContent-Disposition: form-data; name="bytes"; filename="banner.png"\r\n` +
        `Content-Type: image/png\r\n\r\npng-bytes\r\n--${b}--\r\n`
    );
    expect(out.imageHash).toBe("abc123");
  });

  // basis: AdAccount.json apis[POST adimages] declares `bytes` as a string
  // (Meta's reference documents it as base64) and has no `name` param, yet
  // uploadImageLogic sends the RAW file as a multipart part named `bytes` and
  // adds a `name` field when one is given. Whether Graph accepts either:
  // unverified — neither is exercised live (#203).
  it.todo(
    "meta_upload_image sends `bytes` in a form the spec defines (base64 string) and no undeclared `name` — reported on #236"
  );

  // The adimages / advideos POSTs and the video status polls go through
  // `metaService.graphApiClient` directly and never touch the limiter.
  it.todo(
    "meta_upload_image / meta_upload_video draw limiter tokens per Graph call — reported on #236, not fixed here"
  );

  it("meta_upload_video → HEAD + GET the media, POST /act_{id}/advideos (`source`), poll GET /{video_id}?fields=status", async () => {
    stub.route({
      method: "HEAD",
      host: "cdn.example.com",
      path: "/spot.mp4",
      rawBody: "",
      contentType: "video/mp4",
    });
    stub.route({
      method: "GET",
      host: "cdn.example.com",
      path: "/spot.mp4",
      rawBody: Buffer.from("mp4-bytes", "latin1"),
      contentType: "video/mp4",
    });
    stub.route({ method: "POST", path: /\/advideos$/, response: { id: "8801" } });
    stub.route({
      method: "GET",
      path: /\/8801$/,
      response: { id: "8801", status: { video_status: "ready", processing_progress: 100 } },
    });

    const out = await uploadVideoLogic(
      UploadVideoInputSchema.parse({
        adAccountId: ACT,
        mediaUrl: "https://cdn.example.com/spot.mp4",
        title: "Spot",
        description: "Autumn spot",
      }),
      ctx,
      sdk
    );

    expect(
      stub.requests.filter((r) => !r.path.endsWith("/me")).map((r) => `${r.method} ${r.url}`)
    ).toEqual([
      "HEAD https://cdn.example.com/spot.mp4",
      "GET https://cdn.example.com/spot.mp4",
      `POST ${API}/${ACT}/advideos`,
      `GET ${API}/8801?fields=status`,
    ]);
    const req = onlyWrite();
    // basis: AdAccount.json apis[POST advideos] (return AdVideo) — title
    // string, description string, source string (the file). Multipart
    // framing: unverified (code-only).
    expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    const b = boundaryOf(req);
    expect(req.rawBody!.toString("latin1")).toBe(
      `--${b}\r\nContent-Disposition: form-data; name="title"\r\n\r\nSpot\r\n` +
        `--${b}\r\nContent-Disposition: form-data; name="description"\r\n\r\nAutumn spot\r\n` +
        `--${b}\r\nContent-Disposition: form-data; name="source"; filename="spot.mp4"\r\n` +
        `Content-Type: video/mp4\r\n\r\nmp4-bytes\r\n--${b}--\r\n`
    );
    expect(out.videoId).toBe("8801");
  });

  it("dry_run downloads and uploads nothing", async () => {
    await uploadImageLogic(
      UploadImageInputSchema.parse({
        adAccountId: ACT,
        mediaUrl: "https://cdn.example.com/banner.png",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    await uploadVideoLogic(
      UploadVideoInputSchema.parse({
        adAccountId: ACT,
        mediaUrl: "https://cdn.example.com/spot.mp4",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests.filter((r) => !r.path.endsWith("/me"))).toHaveLength(0);
  });
});
