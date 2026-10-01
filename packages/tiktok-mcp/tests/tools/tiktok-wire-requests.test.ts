// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-request assertions for every tiktok-mcp tool that issues a non-GET
 * upstream request (#236). Each test calls the REAL tool logic over REAL
 * session services (TikTokService, TikTokHttpClient, the access-token adapter
 * and the package's real module-level `RateLimiter`), with only
 * `globalThis.fetch` stubbed, and asserts the full request: HTTP method, URL
 * (+ query) and the exact body.
 *
 * Expected shapes come from TikTok's official Business API SDK:
 *   https://github.com/tiktok/tiktok-business-api-sdk
 *   commit f809c396520df2d7b201a9ccc5378d822b728ed3 (fetched 2026-09-30).
 * The CRUD / upload endpoints are not among its `yml_files/` OpenAPI specs;
 * they are cited from the generated Python client:
 *   `python_sdk/business_api_client/api/<file>.py` `<operation>` — path, HTTP
 *   method, body/form/query params and `header_params['Access-Token']`;
 *   `python_sdk/business_api_client/models/<model>.py` `swagger_types` — the
 *   body fields, "required" = the setter raises on `None`.
 * `yml_files/tool_targeting_search.yml` and
 * `yml_files/smart_plus_campaign_status_update.yml` (the `StatusOptType` enum
 * ENABLE/DISABLE/DELETE) are cited by file.
 * The version segment comes from `mcpConfig.tiktokApiVersion` (platform-facts
 * `tiktok.api_version`); the SDK hardcodes the same `/open_api/v1.3/`.
 *
 * Rate limiting: every entity read draws TIKTOK_READ_TOKENS (1) and every
 * create / update / status update TIKTOK_WRITE_TOKENS (3) from the session's
 * per-token key `tiktok:token:{quotaClient}` (`session.quotaKey`); targeting
 * search and audience estimate draw 1; a media upload draws 3 and each
 * video-info poll 1.
 *
 * `tiktok_submit_report` (POST report/task/create/) is pinned at the end
 * against `python_sdk/business_api_client/api/reporting_api.py`
 * `report_task_create` and `models/report_task_create_body.py`, plus the
 * platform-facts `tiktok.async_report_create_options` fact (verified
 * 2026-09-30 from TikTok's own create-task page). It draws one token from the
 * per-token REPORTING bucket (`{quotaKey}:reporting`), not the CRUD bucket.
 *
 * Covered elsewhere: the rest of the async report chain
 * (`tiktok_check_report_status` → `tiktok_download_report`, #232/#259) only
 * GETs and is tested in `tests/services/tiktok-reporting-service.test.ts` and
 * the tools' own tests. Everything else not listed here sends only GETs.
 */

import { createHash } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Video processing is polled at `tiktokVideoUploadPollIntervalMs` (20 s by
// default), read from config at import; 1 ms keeps the upload test from
// sleeping. Timing only — no request changes.
vi.hoisted(() => {
  process.env.TIKTOK_VIDEO_UPLOAD_POLL_INTERVAL_MS = "1";
});

import { mcpConfig } from "../../src/config/index.js";
import {
  TIKTOK_READ_TOKENS,
  TIKTOK_WRITE_TOKENS,
} from "../../src/services/tiktok/tiktok-service.js";
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
  adjustBidsLogic,
  AdjustBidsInputSchema,
} from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";
import {
  duplicateEntityLogic,
  DuplicateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/duplicate-entity.tool.js";
import {
  searchTargetingLogic,
  SearchTargetingInputSchema,
} from "../../src/mcp-server/tools/definitions/search-targeting.tool.js";
import {
  getAudienceEstimateLogic,
  GetAudienceEstimateInputSchema,
} from "../../src/mcp-server/tools/definitions/get-audience-estimate.tool.js";
import {
  uploadImageLogic,
  UploadImageInputSchema,
} from "../../src/mcp-server/tools/definitions/upload-image.tool.js";
import {
  uploadVideoLogic,
  UploadVideoInputSchema,
} from "../../src/mcp-server/tools/definitions/upload-video.tool.js";
import {
  submitReportLogic,
  SubmitReportInputSchema,
} from "../../src/mcp-server/tools/definitions/submit-report.tool.js";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  rateLimiter,
  TIKTOK_HOST,
  TEST_ACCESS_TOKEN,
  TEST_ADVERTISER_ID,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/wire.js";

const API = `${mcpConfig.tiktokApiBaseUrl}/open_api/${mcpConfig.tiktokApiVersion}`;
const V = `/open_api/${mcpConfig.tiktokApiVersion}`;
const ADV = TEST_ADVERTISER_ID;
const LIMIT = mcpConfig.tiktokRateLimitPerMinute;
const ctx = { requestId: "wire-req" } as any;

let stub: FetchStub;
let session: WireSession;
let sdk: ReturnType<typeof acceptingSdkContext>;

beforeEach(() => {
  stub = installFetchStub();
  session = createWireSession("tiktok-wire-236");
  sdk = acceptingSdkContext(session.sessionId);
});

afterEach(() => {
  session.dispose();
  stub.restore();
});

function apiRequests(): WireRequest[] {
  return stub.to(TIKTOK_HOST);
}

function writes(): WireRequest[] {
  return apiRequests().filter((r) => r.method !== "GET");
}

function onlyWrite(): WireRequest {
  const w = writes();
  expect(w).toHaveLength(1);
  return w[0]!;
}

/**
 * basis: every SDK operation sets `header_params['Access-Token']` (no other
 * auth scheme; `auth_settings = []`) and, for a body, `Content-Type:
 * application/json` via `select_header_content_type(['application/json'])`.
 */
function expectJsonAuth(req: WireRequest) {
  expect(req.headers["access-token"]).toBe(TEST_ACCESS_TOKEN);
  expect(req.headers["authorization"]).toBeUndefined();
  expect(req.headers["content-type"]).toBe("application/json");
}

function remaining(): number {
  return rateLimiter.getRemainingTokens(session.quotaKey);
}

describe("tiktok_create_entity → {campaign,adgroup,ad}/create/", () => {
  it("campaign → POST campaign/create/ with advertiser_id and the caller's fields", async () => {
    stub.route({
      method: "POST",
      path: `${V}/campaign/create/`,
      data: {
        campaign_id: "1800000000000001",
        campaign_name: "Autumn",
        operation_status: "DISABLE",
      },
    });

    const out = await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        data: {
          campaign_name: "Autumn",
          objective_type: "TRAFFIC",
          budget_mode: "BUDGET_MODE_DAY",
          budget: 100,
          operation_status: "DISABLE",
        },
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: campaign_creation_api.py campaign_create — POST
    // /open_api/v1.3/campaign/create/, JSON body CampaignCreateBody;
    // campaign_create_body.py: advertiser_id (str, required), campaign_name
    // (str, required), objective_type (str, required), budget_mode (str),
    // budget (float), operation_status (str).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/campaign/create/`);
    expectJsonAuth(req);
    expect(req.body).toEqual({
      advertiser_id: ADV,
      campaign_name: "Autumn",
      objective_type: "TRAFFIC",
      budget_mode: "BUDGET_MODE_DAY",
      budget: 100,
      operation_status: "DISABLE",
    });
    expect(out.entity.campaign_id).toBe("1800000000000001");
    expect(apiRequests()).toHaveLength(1);
    expect(remaining()).toBe(LIMIT - TIKTOK_WRITE_TOKENS);
  });

  it("adGroup → POST adgroup/create/", async () => {
    stub.route({
      method: "POST",
      path: `${V}/adgroup/create/`,
      data: { adgroup_id: "1700000000000001" },
    });
    const data = {
      campaign_id: "1800000000000001",
      adgroup_name: "US 25-44",
      placement_type: "PLACEMENT_TYPE_NORMAL",
      placements: ["PLACEMENT_TIKTOK"],
      location_ids: ["6252001"],
      budget_mode: "BUDGET_MODE_DAY",
      budget: 50,
      schedule_type: "SCHEDULE_FROM_NOW",
      schedule_start_time: "2026-10-01 00:00:00",
      optimization_goal: "CLICK",
      billing_event: "CPC",
      bid_type: "BID_TYPE_NO_BID",
      pacing: "PACING_MODE_SMOOTH",
    };
    await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "adGroup", advertiserId: ADV, data }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: adgroup_api.py adgroup_create — POST /open_api/v1.3/adgroup/create/,
    // body AdgroupCreateBody; adgroup_create_body.py required: advertiser_id,
    // adgroup_name, billing_event, budget, budget_mode, campaign_id,
    // optimization_goal, pacing, schedule_start_time, schedule_type; also
    // declares placement_type, placements list[str], location_ids list[str],
    // bid_type.
    expect(req.url).toBe(`${API}/adgroup/create/`);
    expectJsonAuth(req);
    expect(req.body).toEqual({ advertiser_id: ADV, ...data });
  });

  it("ad → POST ad/create/ with creatives[]", async () => {
    stub.route({ method: "POST", path: `${V}/ad/create/`, data: { ad_ids: ["1600000000000001"] } });
    const data = {
      adgroup_id: "1700000000000001",
      creatives: [
        {
          ad_name: "Spot A",
          ad_format: "SINGLE_VIDEO",
          video_id: "v10033g50000",
          identity_id: "7000000000000009",
          identity_type: "CUSTOMIZED_USER",
          ad_text: "Autumn sale",
          call_to_action: "SHOP_NOW",
          landing_page_url: "https://example.com/autumn",
        },
      ],
    };
    await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "ad", advertiserId: ADV, data }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: ad_api.py ad_create — POST /open_api/v1.3/ad/create/, body
    // AdCreateBody; ad_create_body.py: adgroup_id (required), advertiser_id
    // (required), creatives list[AdcreateCreatives] (required).
    expect(req.url).toBe(`${API}/ad/create/`);
    expectJsonAuth(req);
    expect(req.body).toEqual({ advertiser_id: ADV, ...data });
  });

  it("dry_run sends nothing", async () => {
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        data: { campaign_name: "Autumn", objective_type: "TRAFFIC" },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });
});

describe("tiktok_update_entity → {campaign,adgroup,ad}/update/", () => {
  it("campaign → pre-state GET, then POST campaign/update/ with campaign_id in the body", async () => {
    stub.route({
      method: "GET",
      path: `${V}/campaign/get/`,
      data: {
        list: [{ campaign_id: "1800000000000001", campaign_name: "Autumn", budget: 100 }],
        page_info: { page: 1, page_size: 1, total_number: 1, total_page: 1 },
      },
    });
    stub.route({
      method: "POST",
      path: `${V}/campaign/update/`,
      data: { campaign_id: "1800000000000001", campaign_name: "Autumn v2", budget: 200 },
    });

    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        entityId: "1800000000000001",
        data: { campaign_name: "Autumn v2", budget: 200 },
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: campaign_creation_api.py campaign_update — POST
    // /open_api/v1.3/campaign/update/, body CampaignUpdateBody;
    // campaign_update_body.py: advertiser_id (required), campaign_id
    // (required), campaign_name, budget (float). Updates are POST, not PATCH.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/campaign/update/`);
    expectJsonAuth(req);
    expect(req.body).toEqual({
      advertiser_id: ADV,
      campaign_id: "1800000000000001",
      campaign_name: "Autumn v2",
      budget: 200,
    });
    // The pre-state read: campaign_creation_api.py campaign_get — GET, query
    // advertiser_id, filtering (JSON), page_size, fields (list, JSON-encoded
    // by api_client.py's 'multi' collection format).
    const [pre] = apiRequests();
    expect(pre!.method).toBe("GET");
    expect(pre!.path).toBe(`${V}/campaign/get/`);
    expect(pre!.query.advertiser_id).toBe(ADV);
    expect(JSON.parse(pre!.query.filtering!)).toEqual({ campaign_ids: ["1800000000000001"] });
    expect(apiRequests().map((r) => r.method)).toEqual(["GET", "POST"]);
    expect(remaining()).toBe(LIMIT - TIKTOK_READ_TOKENS - TIKTOK_WRITE_TOKENS);
  });

  it("adGroup → POST adgroup/update/ with adgroup_id in the body", async () => {
    stub.route({
      method: "POST",
      path: `${V}/adgroup/update/`,
      data: { adgroup_id: "1700000000000001", adgroup_name: "AG", budget: 75 },
    });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "adGroup",
        advertiserId: ADV,
        entityId: "1700000000000001",
        data: { budget: 75 },
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: adgroup_api.py adgroup_update — POST
    // /open_api/v1.3/adgroup/update/; adgroup_update_body.py: adgroup_id
    // (required), advertiser_id (required), budget (float).
    expect(req.url).toBe(`${API}/adgroup/update/`);
    expectJsonAuth(req);
    expect(req.body).toEqual({ advertiser_id: ADV, adgroup_id: "1700000000000001", budget: 75 });
  });

  // basis: ad_api.py ad_update — POST /open_api/v1.3/ad/update/, body
  // AdUpdateBody; ad_update_body.py declares ONLY adgroup_id (required),
  // advertiser_id (required), creatives list[AdupdateCreatives] (required) and
  // patch_update — there is no top-level `ad_id`; adupdate_creatives.py
  // carries `ad_id` (and ad_name, ad_text, … ) per creative.
  const AD_ID = "1600000000000001";
  const AD_GROUP_ID = "1700000000000001";
  function routeAdRead() {
    stub.route({
      method: "GET",
      path: `${V}/ad/get/`,
      data: {
        list: [
          { ad_id: AD_ID, adgroup_id: AD_GROUP_ID, ad_name: "Autumn", status: "AD_STATUS_ENABLE" },
        ],
        page_info: { page: 1, page_size: 1, total_number: 1, total_page: 1 },
      },
    });
  }

  it("ad → POST ad/update/ with adgroup_id from the pre-read and ad_id inside creatives[0]", async () => {
    routeAdRead();
    stub.route({ method: "POST", path: `${V}/ad/update/`, data: {} });

    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "ad",
        advertiserId: ADV,
        entityId: AD_ID,
        data: { ad_name: "Autumn v2" },
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/ad/update/`);
    expectJsonAuth(req);
    expect(req.body).toEqual({
      advertiser_id: ADV,
      adgroup_id: AD_GROUP_ID,
      creatives: [{ ad_id: AD_ID, ad_name: "Autumn v2" }],
    });
    expect(req.body).not.toHaveProperty("ad_id");
    // The tool's pre-state read supplies adgroup_id: one GET, not two. (The
    // re-read fallback for `after` runs because this POST returns no entity.)
    const reads = apiRequests().filter((r) => r.method === "GET");
    expect(reads[0]!.path).toBe(`${V}/ad/get/`);
    expect(JSON.parse(reads[0]!.query.filtering!)).toEqual({ ad_ids: [AD_ID] });
    expect(apiRequests().map((r) => r.method)).toEqual(["GET", "POST", "GET"]);
  });

  it("ad → a caller-supplied adgroup_id and creatives[0] are sent as given, with ad_id set", async () => {
    stub.route({ method: "POST", path: `${V}/ad/update/`, data: {} });

    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "ad",
        advertiserId: ADV,
        entityId: AD_ID,
        data: {
          adgroup_id: AD_GROUP_ID,
          creatives: [{ ad_text: "New copy", call_to_action: "LEARN_MORE" }],
        },
      }),
      ctx,
      sdk
    );

    expect(onlyWrite().body).toEqual({
      advertiser_id: ADV,
      adgroup_id: AD_GROUP_ID,
      creatives: [{ ad_id: AD_ID, ad_text: "New copy", call_to_action: "LEARN_MORE" }],
    });
  });

  it("ad → refuses a data.ad_id naming another ad, sending nothing", async () => {
    routeAdRead();
    await expect(
      updateEntityLogic(
        UpdateEntityInputSchema.parse({
          entityType: "ad",
          advertiserId: ADV,
          entityId: AD_ID,
          data: { ad_id: "1600000000000999", ad_name: "x" },
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/different ad than entityId/);
    expect(apiRequests()).toHaveLength(0);
  });

  it("ad (bulk) → reads each ad for its adgroup_id, then POSTs ad/update/ per ad", async () => {
    routeAdRead();
    stub.route({ method: "POST", path: `${V}/ad/update/`, data: {} });

    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "ad",
        advertiserId: ADV,
        items: [{ entityId: AD_ID, data: { ad_name: "Autumn v2" } }],
      }),
      ctx,
      sdk
    );

    expect(apiRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET ${V}/ad/get/`,
      `POST ${V}/ad/update/`,
    ]);
    expect(onlyWrite().body).toEqual({
      advertiser_id: ADV,
      adgroup_id: AD_GROUP_ID,
      creatives: [{ ad_id: AD_ID, ad_name: "Autumn v2" }],
    });
    // The read the ad path adds is counted, and the pre-check models it.
    expect(remaining()).toBe(LIMIT - TIKTOK_READ_TOKENS - TIKTOK_WRITE_TOKENS);
  });

  it("dry_run sends no POST", async () => {
    stub.route({
      method: "GET",
      path: `${V}/campaign/get/`,
      data: { list: [{ campaign_id: "1800000000000001", campaign_name: "Autumn" }] },
    });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        entityId: "1800000000000001",
        data: { budget: 200 },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(0);
  });
});

describe("tiktok_update_entity with data.operation_status → {entity}/status/update/", () => {
  it("campaign DISABLE → POST campaign/status/update/, never campaign/update/", async () => {
    stub.route({
      method: "GET",
      path: `${V}/campaign/get/`,
      data: {
        list: [{ campaign_id: "1800000000000001", campaign_name: "Autumn", budget: 100 }],
        page_info: { page: 1, page_size: 1, total_number: 1, total_page: 1 },
      },
    });

    const out = await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        entityId: "1800000000000001",
        data: { operation_status: "DISABLE" },
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: TikTok SDK (tiktok-business-api-sdk @ f809c39) python_sdk/docs:
    // CampaignUpdateBody has no operation_status; CampaignStatusUpdateBody is
    // (advertiser_id, campaign_ids list[str], operation_status str), sent by
    // campaign_creation_api.py campaign_status_update — POST
    // /open_api/v1.3/campaign/status/update/.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/campaign/status/update/`);
    expectJsonAuth(req);
    expect(req.body).toEqual({
      advertiser_id: ADV,
      campaign_ids: ["1800000000000001"],
      operation_status: "DISABLE",
    });
    // Pre-state read, the status write, then a re-read for `after` (the status
    // endpoint returns no entity).
    expect(apiRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET ${V}/campaign/get/`,
      `POST ${V}/campaign/status/update/`,
      `GET ${V}/campaign/get/`,
    ]);
    expect(out.updated).toBe(true);
    expect(out.dispatchedCapability.operation).toBe("pause");
    expect(remaining()).toBe(LIMIT - 2 * TIKTOK_READ_TOKENS - TIKTOK_WRITE_TOKENS);
  });

  it("ad ENABLE → POST ad/status/update/ with ad_ids, no adgroup_id lookup", async () => {
    const AD_ID = "1600000000000001";
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "ad",
        advertiserId: ADV,
        entityId: AD_ID,
        data: { operation_status: "ENABLE" },
      }),
      ctx,
      sdk
    );
    // basis: AdStatusUpdateBody (advertiser_id, ad_ids, operation_status);
    // ad_api.py ad_status_update — POST /open_api/v1.3/ad/status/update/.
    const req = onlyWrite();
    expect(req.url).toBe(`${API}/ad/status/update/`);
    expect(req.body).toEqual({ advertiser_id: ADV, ad_ids: [AD_ID], operation_status: "ENABLE" });
  });

  it("refuses operation_status mixed with field changes, sending no write", async () => {
    await expect(
      updateEntityLogic(
        UpdateEntityInputSchema.parse({
          entityType: "campaign",
          advertiserId: ADV,
          entityId: "1800000000000001",
          data: { operation_status: "DISABLE", budget: 200 },
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/operation_status must be sent on its own/);
    expect(apiRequests()).toHaveLength(0);
  });

  it("refuses DELETE, pointing to tiktok_delete_entity, sending nothing", async () => {
    await expect(
      updateEntityLogic(
        UpdateEntityInputSchema.parse({
          entityType: "adGroup",
          advertiserId: ADV,
          entityId: "1700000000000001",
          data: { operation_status: "DELETE" },
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/tiktok_delete_entity/);
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run reports a mixed payload as would-fail and sends no POST", async () => {
    stub.route({
      method: "GET",
      path: `${V}/campaign/get/`,
      data: { list: [{ campaign_id: "1800000000000001", campaign_name: "Autumn" }] },
    });
    const out = await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        entityId: "1800000000000001",
        data: { operation_status: "ENABLE", campaign_name: "x" },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(out.dryRun?.wouldSucceed).toBe(false);
    expect(out.dryRun?.validationErrors.map((e) => e.code)).toEqual(["MIXED_STATUS_UPDATE"]);
    expect(writes()).toHaveLength(0);
  });
});

describe("tiktok_delete_entity → {entity}/status/update/ operation_status DELETE", () => {
  it("one POST carrying every id and operation_status DELETE", async () => {
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        entityIds: ["1800000000000001", "1800000000000002"],
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: campaign_creation_api.py campaign_status_update — POST
    // /open_api/v1.3/campaign/status/update/, body CampaignStatusUpdateBody
    // (advertiser_id, campaign_ids list[str], operation_status str);
    // smart_plus_campaign_status_update.yml: campaign_ids maxItems 20,
    // operation_status enum StatusOptType {DELETE, DISABLE, ENABLE}. The SDK
    // has no campaign/delete/ operation.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/campaign/status/update/`);
    expectJsonAuth(req);
    expect(req.body).toEqual({
      advertiser_id: ADV,
      campaign_ids: ["1800000000000001", "1800000000000002"],
      operation_status: "DELETE",
    });
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(apiRequests()).toHaveLength(1);
    expect(remaining()).toBe(LIMIT - TIKTOK_WRITE_TOKENS);
  });

  it("ad → POST ad/status/update/ with ad_ids", async () => {
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "ad",
        advertiserId: ADV,
        entityIds: ["1600000000000001"],
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: ad_api.py ad_status_update — POST /open_api/v1.3/ad/status/update/;
    // ad_status_update_body.py: ad_ids list[str], advertiser_id (required),
    // operation_status (required).
    expect(req.url).toBe(`${API}/ad/status/update/`);
    expect(req.body).toEqual({
      advertiser_id: ADV,
      ad_ids: ["1600000000000001"],
      operation_status: "DELETE",
    });
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    const out = await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        entityIds: ["1800000000000001"],
      }),
      ctx,
      sdk
    );
    expect(out.confirmed).toBe(false);
    expect(apiRequests()).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing and does not prompt", async () => {
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        entityIds: ["1800000000000001"],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("tiktok_bulk_update_status → {entity}/status/update/", () => {
  it("adGroup DISABLE → one POST adgroup/status/update/ with every id", async () => {
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "adGroup",
        advertiserId: ADV,
        entityIds: ["1700000000000001", "1700000000000002"],
        operationStatus: "DISABLE",
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: adgroup_api.py adgroup_status_update — POST
    // /open_api/v1.3/adgroup/status/update/; adgroup_status_update_body.py:
    // adgroup_ids list[str] (required), advertiser_id (required),
    // operation_status (required; StatusOptType DISABLE).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/adgroup/status/update/`);
    expectJsonAuth(req);
    expect(req.body).toEqual({
      advertiser_id: ADV,
      adgroup_ids: ["1700000000000001", "1700000000000002"],
      operation_status: "DISABLE",
    });
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(remaining()).toBe(LIMIT - TIKTOK_WRITE_TOKENS);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        entityIds: ["1800000000000001"],
        operationStatus: "ENABLE",
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
        entityIds: ["1800000000000001"],
        operationStatus: "ENABLE",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("tiktok_bulk_create_entities → one {entity}/create/ per item", () => {
  it("POSTs campaign/create/ once per item", async () => {
    stub.route({
      method: "POST",
      path: `${V}/campaign/create/`,
      data: (req: WireRequest) => ({
        campaign_id: (req.body as { campaign_name: string }).campaign_name === "A" ? "1" : "2",
      }),
    });
    const items = [
      { campaign_name: "A", objective_type: "TRAFFIC" },
      { campaign_name: "B", objective_type: "REACH" },
    ];
    const out = await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({ entityType: "campaign", advertiserId: ADV, items }),
      ctx,
      sdk
    );
    // basis: campaign_creation_api.py campaign_create (see create above) — the
    // SDK has no batch create; one request per item.
    const w = writes();
    expect(w).toHaveLength(2);
    for (const req of w) {
      expect(req.method).toBe("POST");
      expect(req.url).toBe(`${API}/campaign/create/`);
      expectJsonAuth(req);
    }
    expect(w.map((r) => r.body)).toEqual(
      expect.arrayContaining(items.map((i) => ({ advertiser_id: ADV, ...i })))
    );
    expect(out.successCount).toBe(2);
    expect(remaining()).toBe(LIMIT - 2 * TIKTOK_WRITE_TOKENS);
  });

  it("dry_run sends nothing", async () => {
    await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        items: [{ campaign_name: "A", objective_type: "TRAFFIC" }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("tiktok_bulk_update_entities → one {entity}/update/ per item", () => {
  it("POSTs adgroup/update/ once per item after one confirmation", async () => {
    const out = await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "adGroup",
        advertiserId: ADV,
        items: [
          { entityId: "1700000000000001", data: { budget: 60 } },
          { entityId: "1700000000000002", data: { adgroup_name: "Renamed" } },
        ],
      }),
      ctx,
      sdk
    );
    // basis: adgroup_api.py adgroup_update; adgroup_update_body.py adgroup_id
    // (required), advertiser_id (required), budget, adgroup_name.
    const w = writes();
    expect(w).toHaveLength(2);
    for (const req of w) {
      expect(req.url).toBe(`${API}/adgroup/update/`);
      expectJsonAuth(req);
    }
    expect(w.map((r) => r.body)).toEqual(
      expect.arrayContaining([
        { advertiser_id: ADV, adgroup_id: "1700000000000001", budget: 60 },
        { advertiser_id: ADV, adgroup_id: "1700000000000002", adgroup_name: "Renamed" },
      ])
    );
    // A budget change is a sensitive field: one confirmation for the batch.
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(out.successCount).toBe(2);
    expect(remaining()).toBe(LIMIT - 2 * TIKTOK_WRITE_TOKENS);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "adGroup",
        advertiserId: ADV,
        items: [{ entityId: "1700000000000001", data: { budget: 60 } }],
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "adGroup",
        advertiserId: ADV,
        items: [{ entityId: "1700000000000001", data: { budget: 60 } }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("tiktok_adjust_bids → adgroup/get/ then adgroup/update/ {bid_price} per ad group", () => {
  it("reads each ad group, then POSTs its new bid_price", async () => {
    stub.route({
      method: "GET",
      path: `${V}/adgroup/get/`,
      data: (req: WireRequest) => {
        const [id] = JSON.parse(req.query.filtering!).adgroup_ids as string[];
        return { list: [{ adgroup_id: id, bid_price: 1.1 }] };
      },
    });
    const out = await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        advertiserId: ADV,
        adjustments: [
          { adGroupId: "1700000000000001", bidPrice: 1.5 },
          { adGroupId: "1700000000000002", bidPrice: 0.8 },
        ],
      }),
      ctx,
      sdk
    );
    // basis: adgroup_api.py adgroup_update; adgroup_update_body.py adgroup_id
    // (required), advertiser_id (required), bid_price (float). The pre-read:
    // adgroup_api.py adgroup_get — GET, query advertiser_id, filtering, fields.
    expect(apiRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET ${V}/adgroup/get/`,
      `POST ${V}/adgroup/update/`,
      `GET ${V}/adgroup/get/`,
      `POST ${V}/adgroup/update/`,
    ]);
    const w = writes();
    for (const req of w) {
      expect(req.url).toBe(`${API}/adgroup/update/`);
      expectJsonAuth(req);
    }
    expect(w.map((r) => r.body)).toEqual([
      { advertiser_id: ADV, adgroup_id: "1700000000000001", bid_price: 1.5 },
      { advertiser_id: ADV, adgroup_id: "1700000000000002", bid_price: 0.8 },
    ]);
    expect(out.results.map((r) => r.previousBid)).toEqual([1.1, 1.1]);
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(remaining()).toBe(LIMIT - 2 * (TIKTOK_READ_TOKENS + TIKTOK_WRITE_TOKENS));
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        advertiserId: ADV,
        adjustments: [{ adGroupId: "1700000000000001", bidPrice: 1.5 }],
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        advertiserId: ADV,
        adjustments: [{ adGroupId: "1700000000000001", bidPrice: 1.5 }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("tiktok_duplicate_entity refuses (no copy endpoint in the SDK)", () => {
  it("sends nothing", async () => {
    await expect(
      duplicateEntityLogic(
        DuplicateEntityInputSchema.parse({
          entityType: "campaign",
          advertiserId: ADV,
          entityId: "1800000000000001",
        }),
        ctx,
        sdk
      )
    ).rejects.toMatchObject({ code: -32600 });
    // basis: no `*/copy/` path among the SDK's api/*.py operations.
    expect(stub.requests).toHaveLength(0);
  });
});

describe("tiktok_search_targeting → POST tool/targeting/search/", () => {
  it("sends the spec's required body fields", async () => {
    stub.route({
      method: "POST",
      path: `${V}/tool/targeting/search/`,
      data: { targeting_tag_list: [{ geo: { geo_id: "6252001" }, name: "United States" }] },
    });
    const out = await searchTargetingLogic(
      SearchTargetingInputSchema.parse({
        advertiserId: ADV,
        query: "united",
        placements: ["PLACEMENT_TIKTOK"],
        objectiveType: "TRAFFIC",
        promotionType: "WEBSITE",
        geoTypes: ["COUNTRY"],
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: yml_files/tool_targeting_search.yml paths[/tool/targeting/search/].post
    // — requestBody application/json, required [advertiser_id, placements,
    // objective_type, keywords, search_type]; keywords array<string>,
    // search_type enum {BATCH_REGION_SEARCH, BATCH_ZIPCODE_SEARCH,
    // FUZZY_SEARCH}, geo_types array<string>, promotion_type string.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/tool/targeting/search/`);
    expectJsonAuth(req);
    expect(req.body).toEqual({
      advertiser_id: ADV,
      keywords: ["united"],
      search_type: "FUZZY_SEARCH",
      placements: ["PLACEMENT_TIKTOK"],
      objective_type: "TRAFFIC",
      promotion_type: "WEBSITE",
      geo_types: ["COUNTRY"],
    });
    expect(out.count).toBe(1);
    expect(remaining()).toBe(LIMIT - TIKTOK_READ_TOKENS);
  });
});

describe("tiktok_get_audience_estimate → POST ad/audience_size/estimate/", () => {
  it("POSTs the targeting config with advertiser_id", async () => {
    stub.route({
      method: "POST",
      path: `${V}/ad/audience_size/estimate/`,
      data: { user_count: { lower_end: 1000, upper_end: 2000 } },
    });
    const targetingConfig = {
      objective_type: "TRAFFIC",
      placements: ["PLACEMENT_TIKTOK"],
      location_ids: ["6252001"],
      age_groups: ["AGE_25_34"],
    };
    await getAudienceEstimateLogic(
      GetAudienceEstimateInputSchema.parse({ advertiserId: ADV, targetingConfig }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: path only — tool_targeting_search.yml / tool_targeting_list.yml
    // info.description name "/ad/audience_size/estimate/" as an endpoint
    // taking location_ids / zipcode_ids / isp_ids. The SDK defines no
    // operation for it, so the method and body shape are unverified
    // (code-only).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/ad/audience_size/estimate/`);
    expectJsonAuth(req);
    expect(req.body).toEqual({ advertiser_id: ADV, ...targetingConfig });
    expect(remaining()).toBe(LIMIT - TIKTOK_READ_TOKENS);
  });
});

describe("media uploads (multipart)", () => {
  function boundaryOf(req: WireRequest): string {
    const b = /^multipart\/form-data; boundary=(.+)$/.exec(req.headers["content-type"]!)?.[1];
    expect(b).toBeTruthy();
    return b!;
  }

  it("tiktok_upload_image → GET the media, POST file/image/ad/upload/ (UPLOAD_BY_FILE)", async () => {
    const bytes = Buffer.from("png-bytes", "latin1");
    stub.route({
      method: "GET",
      host: "cdn.example.com",
      path: "/banner.png",
      rawBody: bytes,
      contentType: "image/png",
    });
    stub.route({
      method: "POST",
      path: `${V}/file/image/ad/upload/`,
      data: { image_id: "ad-site-i18n-sg/202609300000", image_url: "https://p16.example/i" },
    });

    const out = await uploadImageLogic(
      UploadImageInputSchema.parse({
        advertiserId: ADV,
        mediaUrl: "https://cdn.example.com/banner.png",
      }),
      ctx,
      sdk
    );

    expect(stub.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      "GET https://cdn.example.com/banner.png",
      `POST ${API}/file/image/ad/upload/`,
    ]);
    const req = onlyWrite();
    // basis: file_api.py ad_image_upload — POST
    // /open_api/v1.3/file/image/ad/upload/, Content-Type multipart/form-data;
    // form params advertiser_id, upload_type, image_signature (and file_id,
    // file_name, image_url); file part `image_file`; Access-Token header. The
    // image_signature = MD5 of the file for UPLOAD_BY_FILE: the tool's own
    // comment cites FileImageAdUpload — the SDK model has no description, so
    // the MD5 rule itself is unverified (code-only).
    expect(req.headers["access-token"]).toBe(TEST_ACCESS_TOKEN);
    const b = boundaryOf(req);
    const md5 = createHash("md5").update(bytes).digest("hex");
    expect(req.rawBody!.toString("latin1")).toBe(
      `--${b}\r\nContent-Disposition: form-data; name="advertiser_id"\r\n\r\n${ADV}\r\n` +
        `--${b}\r\nContent-Disposition: form-data; name="upload_type"\r\n\r\nUPLOAD_BY_FILE\r\n` +
        `--${b}\r\nContent-Disposition: form-data; name="image_signature"\r\n\r\n${md5}\r\n` +
        `--${b}\r\nContent-Disposition: form-data; name="image_file"; filename="banner.png"\r\n` +
        `Content-Type: image/png\r\n\r\npng-bytes\r\n--${b}--\r\n`
    );
    expect(out.imageId).toBe("ad-site-i18n-sg/202609300000");
  });

  it("tiktok_upload_video → GET the media, POST file/video/ad/upload/, poll GET file/video/ad/info/", async () => {
    const bytes = Buffer.from("mp4-bytes", "latin1");
    stub.route({
      method: "GET",
      host: "cdn.example.com",
      path: "/spot.mp4",
      rawBody: bytes,
      contentType: "video/mp4",
    });
    stub.route({
      method: "POST",
      path: `${V}/file/video/ad/upload/`,
      data: { video_id: "v10033g50000" },
    });
    stub.route({
      method: "GET",
      path: `${V}/file/video/ad/info/`,
      data: {
        list: [{ video_id: "v10033g50000", video_status: "bind_success", duration: 15 }],
      },
    });

    const out = await uploadVideoLogic(
      UploadVideoInputSchema.parse({
        advertiserId: ADV,
        mediaUrl: "https://cdn.example.com/spot.mp4",
        videoName: "Autumn spot",
      }),
      ctx,
      sdk
    );

    expect(stub.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /spot.mp4",
      `POST ${V}/file/video/ad/upload/`,
      `GET ${V}/file/video/ad/info/`,
    ]);
    const req = onlyWrite();
    // basis: file_api.py ad_video_upload — POST
    // /open_api/v1.3/file/video/ad/upload/, multipart/form-data; form params
    // advertiser_id, upload_type, video_signature, file_name (…); file part
    // `video_file`. There is no `video_name` param (all_params).
    expect(req.url).toBe(`${API}/file/video/ad/upload/`);
    expect(req.headers["access-token"]).toBe(TEST_ACCESS_TOKEN);
    const b = boundaryOf(req);
    const md5 = createHash("md5").update(bytes).digest("hex");
    expect(req.rawBody!.toString("latin1")).toBe(
      `--${b}\r\nContent-Disposition: form-data; name="advertiser_id"\r\n\r\n${ADV}\r\n` +
        `--${b}\r\nContent-Disposition: form-data; name="upload_type"\r\n\r\nUPLOAD_BY_FILE\r\n` +
        `--${b}\r\nContent-Disposition: form-data; name="video_signature"\r\n\r\n${md5}\r\n` +
        `--${b}\r\nContent-Disposition: form-data; name="file_name"\r\n\r\nAutumn spot\r\n` +
        `--${b}\r\nContent-Disposition: form-data; name="video_file"; filename="spot.mp4"\r\n` +
        `Content-Type: video/mp4\r\n\r\nmp4-bytes\r\n--${b}--\r\n`
    );
    // basis: file_api.py ad_video_info — GET /open_api/v1.3/file/video/ad/info/,
    // query advertiser_id, video_ids (collection 'multi', which api_client.py
    // encodes as json.dumps(list)).
    const poll = apiRequests().find((r) => r.method === "GET")!;
    expect(poll.query).toEqual({ advertiser_id: ADV, video_ids: '["v10033g50000"]' });
    expect(out.videoId).toBe("v10033g50000");
  });

  // Uploads used to go through `tiktokService.client.postMultipart` / `.get`
  // directly and never touch the limiter (#236). Each upstream call now draws
  // from the session's bucket: the upload POST is a write, each video-info
  // poll a read. The media download itself goes to the caller's host, not
  // TikTok, and draws nothing.
  it("tiktok_upload_image draws one write from the session's bucket", async () => {
    stub.route({
      method: "GET",
      host: "cdn.example.com",
      path: "/banner.png",
      rawBody: Buffer.from("png-bytes", "latin1"),
      contentType: "image/png",
    });
    stub.route({
      method: "POST",
      path: `${V}/file/image/ad/upload/`,
      data: { image_id: "ad-site-i18n-sg/202609300000" },
    });

    await uploadImageLogic(
      UploadImageInputSchema.parse({
        advertiserId: ADV,
        mediaUrl: "https://cdn.example.com/banner.png",
      }),
      ctx,
      sdk
    );

    expect(writes()).toHaveLength(1);
    expect(remaining()).toBe(LIMIT - TIKTOK_WRITE_TOKENS);
  });

  it("tiktok_upload_video draws one write for the upload and one read per video-info poll", async () => {
    stub.route({
      method: "GET",
      host: "cdn.example.com",
      path: "/spot.mp4",
      rawBody: Buffer.from("mp4-bytes", "latin1"),
      contentType: "video/mp4",
    });
    stub.route({
      method: "POST",
      path: `${V}/file/video/ad/upload/`,
      data: { video_id: "v10033g50000" },
    });
    let polls = 0;
    stub.route({
      method: "GET",
      path: `${V}/file/video/ad/info/`,
      // Still processing on the first poll, bound on the second.
      data: () => ({
        list: [
          {
            video_id: "v10033g50000",
            video_status: ++polls === 1 ? "processing" : "bind_success",
          },
        ],
      }),
    });

    await uploadVideoLogic(
      UploadVideoInputSchema.parse({
        advertiserId: ADV,
        mediaUrl: "https://cdn.example.com/spot.mp4",
      }),
      ctx,
      sdk
    );

    expect(apiRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      `POST ${V}/file/video/ad/upload/`,
      `GET ${V}/file/video/ad/info/`,
      `GET ${V}/file/video/ad/info/`,
    ]);
    expect(remaining()).toBe(LIMIT - TIKTOK_WRITE_TOKENS - 2 * TIKTOK_READ_TOKENS);
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
    expect(stub.requests).toHaveLength(0);
  });
});

describe("tiktok_submit_report → report/task/create/", () => {
  /** The per-token reporting bucket (rate-limit-keys.ts tiktokReportingQuotaKey). */
  const reportingRemaining = () => rateLimiter.getRemainingTokens(`${session.quotaKey}:reporting`);

  it("BASIC → POST report/task/create/ asking for a downloadable CSV with untranslated titles", async () => {
    stub.route({
      method: "POST",
      path: `${V}/report/task/create/`,
      data: { task_id: "7300000000000000001" },
    });

    const out = await submitReportLogic(
      SubmitReportInputSchema.parse({
        advertiserId: ADV,
        dataLevel: "AUCTION_CAMPAIGN",
        dimensions: ["campaign_id", "stat_time_day"],
        metrics: ["impressions", "clicks", "spend"],
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        orderField: "spend",
        orderType: "DESC",
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: reporting_api.py report_task_create — POST
    // /open_api/v1.3/report/task/create/, `header_params['Access-Token']`,
    // Content-Type application/json, JSON body ReportTaskCreateBody;
    // report_task_create_body.py swagger_types: advertiser_id (str),
    // report_type (str, required), service_type (str), data_level (str),
    // dimensions list[str] (required), metrics list[str], start_date (str),
    // end_date (str), order_field (str), order_type (str), output_format
    // (str), enable_report_title_translation (bool).
    // basis: platform-facts tiktok.async_report_create_options (verified
    // 2026-09-30, TikTok "Create an asynchronous report task" v1.3):
    // output_format CSV_DOWNLOAD is a documented value, and
    // enable_report_title_translation=false is valid for BASIC and AUDIENCE.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/report/task/create/`);
    expectJsonAuth(req);
    expect(req.body).toEqual({
      advertiser_id: ADV,
      report_type: "BASIC",
      service_type: "AUCTION",
      output_format: "CSV_DOWNLOAD",
      enable_report_title_translation: false,
      data_level: "AUCTION_CAMPAIGN",
      dimensions: ["campaign_id", "stat_time_day"],
      metrics: ["impressions", "clicks", "spend"],
      start_date: "2026-09-01",
      end_date: "2026-09-07",
      order_field: "spend",
      order_type: "DESC",
    });
    expect(out.taskId).toBe("7300000000000000001");
    expect(out.effect).toEqual({
      effectKind: "report_requested",
      summary: { report_type: "BASIC", report_handle: "7300000000000000001" },
    });
    // basis: unverified (code-only) — submit_report asks for no confirmation
    // (an effect write with no platform-state change beyond a report task).
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(apiRequests()).toHaveLength(1);
    // basis: unverified (code-only) — rate-limit-keys.ts: one token from the
    // reporting bucket, none from the CRUD bucket.
    expect(reportingRemaining()).toBe(LIMIT - 1);
    expect(remaining()).toBe(LIMIT);
  });

  it("PLAYABLE_MATERIAL → no enable_report_title_translation, no data_level when none is given", async () => {
    stub.route({
      method: "POST",
      path: `${V}/report/task/create/`,
      data: { task_id: "7300000000000000002" },
    });

    await submitReportLogic(
      SubmitReportInputSchema.parse({
        advertiserId: ADV,
        reportType: "PLAYABLE_MATERIAL",
        serviceType: "RESERVATION",
        dimensions: ["playable_id"],
        metrics: ["impressions"],
        startDate: "2026-09-01",
        endDate: "2026-09-02",
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: platform-facts tiktok.async_report_create_options —
    // enable_report_title_translation is valid only for BASIC and AUDIENCE,
    // so it is omitted here. report_task_create_body.py: service_type (str).
    expect(req.url).toBe(`${API}/report/task/create/`);
    expectJsonAuth(req);
    expect(req.body).toEqual({
      advertiser_id: ADV,
      report_type: "PLAYABLE_MATERIAL",
      service_type: "RESERVATION",
      output_format: "CSV_DOWNLOAD",
      dimensions: ["playable_id"],
      metrics: ["impressions"],
      start_date: "2026-09-01",
      end_date: "2026-09-02",
    });
  });

  it("refuses an advertiserId other than the session's and sends nothing", async () => {
    await expect(
      submitReportLogic(
        SubmitReportInputSchema.parse({
          advertiserId: "7000000000000000999",
          dimensions: ["campaign_id"],
          metrics: ["spend"],
          startDate: "2026-09-01",
          endDate: "2026-09-02",
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow();
    expect(apiRequests()).toHaveLength(0);
    expect(reportingRemaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing and draws nothing", async () => {
    const out = await submitReportLogic(
      SubmitReportInputSchema.parse({
        advertiserId: ADV,
        dimensions: ["campaign_id"],
        metrics: ["spend"],
        startDate: "2026-09-01",
        endDate: "2026-09-02",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(out.taskId).toBeUndefined();
    expect(out.dryRun?.wouldSucceed).toBe(true);
    expect(stub.requests).toHaveLength(0);
    expect(reportingRemaining()).toBe(LIMIT);
  });
});
