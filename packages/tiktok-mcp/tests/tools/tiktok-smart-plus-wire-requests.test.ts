/**
 * Wire-request assertions for the Upgraded Smart+ tools (#236). Same method as
 * `tiktok-wire-requests.test.ts`: the REAL tool logic over REAL session
 * services, with only `globalThis.fetch` stubbed, asserting the upstream method,
 * URL and exact body.
 *
 * From 2027-01-01 the legacy create endpoints stop creating non-Search campaigns
 * (and ad groups / ads under them) for the Sales, App Promotion and Lead
 * Generation objectives; the replacement is `/smart_plus/`:
 *   https://business-api.tiktok.com/portal/docs/whats-new/v1.3 (read 2026-11-13).
 *
 * Sources for the shapes:
 *   - TikTok's reference pages, read in a rendered browser 2026-11-13:
 *     create-an-upgraded-smart-campaign / -ad-group / -ad,
 *     update-the-operation-statuses-of-upgraded-smart-campaigns (all under
 *     business-api.tiktok.com/portal/docs/<slug>/v1.3), and the compatibility
 *     guide (docs?id=1854112742370306: legacy update endpoints cannot touch
 *     Upgraded Smart+ entities; the legacy get endpoints return them).
 *   - The official SDK, tiktok/tiktok-business-api-sdk @
 *     f809c396520df2d7b201a9ccc5378d822b728ed3 `yml_files/smart_plus_*.yml`:
 *     paths, and required fields — campaign create: advertiser_id,
 *     campaign_name, objective_type, request_id; campaign/adgroup update:
 *     advertiser_id + campaign_id / adgroup_id; ad update: advertiser_id +
 *     smart_plus_ad_id; status update: advertiser_id, <entity>_ids (1-20),
 *     operation_status (ad: smart_plus_ad_ids); get: advertiser_id, fields,
 *     filtering, page, page_size as query parameters.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mcpConfig } from "../../src/config/index.js";
import {
  TIKTOK_READ_TOKENS,
  TIKTOK_WRITE_TOKENS,
} from "../../src/services/tiktok/tiktok-service.js";
import {
  createSmartPlusEntityLogic,
  CreateSmartPlusEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/create-smart-plus-entity.tool.js";
import {
  updateSmartPlusEntityLogic,
  UpdateSmartPlusEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/update-smart-plus-entity.tool.js";
import {
  updateSmartPlusStatusLogic,
  UpdateSmartPlusStatusInputSchema,
} from "../../src/mcp-server/tools/definitions/update-smart-plus-status.tool.js";
import {
  getSmartPlusEntityLogic,
  GetSmartPlusEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/get-smart-plus-entity.tool.js";
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
  session = createWireSession("tiktok-smart-plus-wire");
  sdk = acceptingSdkContext(session.sessionId);
});

afterEach(() => {
  session.dispose();
  stub.restore();
});

function apiRequests(): WireRequest[] {
  return stub.to(TIKTOK_HOST);
}

function onlyWrite(): WireRequest {
  const w = apiRequests().filter((r) => r.method !== "GET");
  expect(w).toHaveLength(1);
  return w[0]!;
}

function expectJsonAuth(req: WireRequest) {
  expect(req.headers["access-token"]).toBe(TEST_ACCESS_TOKEN);
  expect(req.headers["authorization"]).toBeUndefined();
  expect(req.headers["content-type"]).toBe("application/json");
}

function remaining(): number {
  return rateLimiter.getRemainingTokens(session.quotaKey);
}

describe("tiktok_create_smart_plus_entity → /smart_plus/{campaign,adgroup,ad}/create/", () => {
  it("campaign → POST smart_plus/campaign/create/ with a generated request_id", async () => {
    stub.route({
      method: "POST",
      path: `${V}/smart_plus/campaign/create/`,
      data: {
        campaign_id: "1800000000000001",
        campaign_name: "Sales 2027",
        objective_type: "WEB_CONVERSIONS",
        operation_status: "DISABLE",
        budget_mode: "BUDGET_MODE_DYNAMIC_DAILY_BUDGET",
        budget: 100,
      },
    });

    const out = await createSmartPlusEntityLogic(
      CreateSmartPlusEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        data: {
          campaign_name: "Sales 2027",
          objective_type: "WEB_CONVERSIONS",
          sales_destination: "WEBSITE",
          budget_mode: "BUDGET_MODE_DYNAMIC_DAILY_BUDGET",
          budget: 100,
          operation_status: "DISABLE",
        },
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: TikTok "Create an Upgraded Smart+ Campaign" — POST
    // https://business-api.tiktok.com/open_api/v1.3/smart_plus/campaign/create/,
    // JSON body; required advertiser_id, request_id ("string representation of a
    // 64-bit integer"), objective_type, campaign_name; sales_destination required
    // when objective_type is WEB_CONVERSIONS. SDK smart_plus_campaign_create.yml.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/smart_plus/campaign/create/`);
    expectJsonAuth(req);
    const body = req.body as Record<string, unknown>;
    expect(body.request_id).toMatch(/^[1-9][0-9]{0,18}$/);
    expect(BigInt(body.request_id as string) <= 0x7fffffffffffffffn).toBe(true);
    expect(body).toEqual({
      advertiser_id: ADV,
      request_id: body.request_id,
      campaign_name: "Sales 2027",
      objective_type: "WEB_CONVERSIONS",
      sales_destination: "WEBSITE",
      budget_mode: "BUDGET_MODE_DYNAMIC_DAILY_BUDGET",
      budget: 100,
      operation_status: "DISABLE",
    });
    expect(out.entity.campaign_id).toBe("1800000000000001");
    // The created entity is normalized: operation_status DISABLE → paused, the
    // dynamic daily budget is a daily budget.
    expect(out.after?.platformEntityId).toBe("1800000000000001");
    expect(out.after?.status.canonical).toBe("paused");
    expect(out.after?.budget.daily?.amountMinor).toBe(10000);
    expect(apiRequests()).toHaveLength(1);
    expect(remaining()).toBe(LIMIT - TIKTOK_WRITE_TOKENS);
  });

  it("campaign → keeps a caller-supplied request_id (TikTok's idempotency key)", async () => {
    stub.route({
      method: "POST",
      path: `${V}/smart_plus/campaign/create/`,
      data: { campaign_id: "1800000000000002" },
    });
    await createSmartPlusEntityLogic(
      CreateSmartPlusEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        data: {
          request_id: "123456789",
          campaign_name: "App",
          objective_type: "APP_PROMOTION",
          app_promotion_type: "APP_INSTALL",
        },
      }),
      ctx,
      sdk
    );
    // basis: same page — "If you retry requests with the same request ID multiple
    // times, then only one will succeed."
    expect(onlyWrite().body).toEqual({
      advertiser_id: ADV,
      request_id: "123456789",
      campaign_name: "App",
      objective_type: "APP_PROMOTION",
      app_promotion_type: "APP_INSTALL",
    });
  });

  it("adGroup → POST smart_plus/adgroup/create/ with request_id", async () => {
    stub.route({
      method: "POST",
      path: `${V}/smart_plus/adgroup/create/`,
      data: { adgroup_id: "1700000000000001", campaign_id: "1800000000000001" },
    });
    const data = {
      campaign_id: "1800000000000001",
      adgroup_name: "US Android",
      app_id: "7000000000000000009",
      promotion_type: "APP_ANDROID",
      optimization_goal: "INSTALL",
      bid_type: "BID_TYPE_NO_BID",
      billing_event: "OCPM",
      schedule_type: "SCHEDULE_START_END",
      schedule_start_time: "2027-01-05 00:00:00",
      schedule_end_time: "2027-03-31 23:59:59",
      targeting_optimization_mode: "AUTOMATIC",
      targeting_spec: {
        location_ids: ["1562822"],
        spc_audience_age: "OVER_EIGHTEEN",
        operating_systems: ["ANDROID"],
      },
    };
    await createSmartPlusEntityLogic(
      CreateSmartPlusEntityInputSchema.parse({ entityType: "adGroup", advertiserId: ADV, data }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: TikTok "Create an Upgraded Smart+ Ad Group" — POST
    // .../open_api/v1.3/smart_plus/adgroup/create/; required advertiser_id,
    // request_id, campaign_id, adgroup_name, promotion_type, optimization_goal,
    // bid_type, billing_event, targeting_spec, schedule_type,
    // schedule_start_time; the page's own curl example is this payload.
    expect(req.url).toBe(`${API}/smart_plus/adgroup/create/`);
    expectJsonAuth(req);
    const body = req.body as Record<string, unknown>;
    expect(typeof body.request_id).toBe("string");
    expect(body).toEqual({ advertiser_id: ADV, request_id: body.request_id, ...data });
  });

  it("ad → POST smart_plus/ad/create/ with no request_id; id comes back as smart_plus_ad_id", async () => {
    stub.route({
      method: "POST",
      path: `${V}/smart_plus/ad/create/`,
      data: { smart_plus_ad_id: "1900000000000001", ad_name: "Spot", operation_status: "ENABLE" },
    });
    const data = {
      adgroup_id: "1700000000000001",
      ad_name: "Spot",
      landing_page_url_list: [{ landing_page_url: "https://example.com/sale" }],
      creative_list: [
        {
          creative_info: {
            ad_format: "SINGLE_VIDEO",
            video_info: { video_id: "v10033g50000" },
            image_info: [{ web_uri: "ad-site-i18n/cover" }],
            identity_type: "TT_USER",
            identity_id: "7000000000000009",
          },
        },
      ],
      ad_text_list: [{ ad_text: "Spring sale" }],
    };
    const out = await createSmartPlusEntityLogic(
      CreateSmartPlusEntityInputSchema.parse({ entityType: "ad", advertiserId: ADV, data }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: TikTok "Create an Upgraded Smart+ Ad" — POST
    // .../open_api/v1.3/smart_plus/ad/create/; required advertiser_id,
    // adgroup_id; no request_id parameter; response data.smart_plus_ad_id. The
    // body below follows the page's curl example (creative_list[].creative_info,
    // ad_text_list, landing_page_url_list). SDK smart_plus_ad_create.yml.
    expect(req.url).toBe(`${API}/smart_plus/ad/create/`);
    expectJsonAuth(req);
    expect(req.body).toEqual({ advertiser_id: ADV, ...data });
    expect(out.after?.platformEntityId).toBe("1900000000000001");
    expect(out.after?.status.canonical).toBe("active");
  });

  it("rejects an objective the Upgraded Smart+ API does not offer, before any request", async () => {
    await expect(
      createSmartPlusEntityLogic(
        CreateSmartPlusEntityInputSchema.parse({
          entityType: "campaign",
          advertiserId: ADV,
          data: { campaign_name: "Traffic", objective_type: "TRAFFIC" },
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(
      /objective_type must be one of APP_PROMOTION, WEB_CONVERSIONS, LEAD_GENERATION/
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run reports missing required fields and sends nothing", async () => {
    const out = await createSmartPlusEntityLogic(
      CreateSmartPlusEntityInputSchema.parse({
        entityType: "adGroup",
        advertiserId: ADV,
        data: { campaign_id: "1", adgroup_name: "x" },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(out.dryRun?.wouldSucceed).toBe(false);
    expect(out.dryRun?.validationErrors.map((e) => e.field)).toContain("data.targeting_spec");
    expect(apiRequests()).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });
});

describe("tiktok_update_smart_plus_entity → /smart_plus/{campaign,adgroup,ad}/update/", () => {
  it("campaign → pre-read via smart_plus/campaign/get/, then POST smart_plus/campaign/update/ with campaign_id", async () => {
    stub.route({
      method: "GET",
      path: `${V}/smart_plus/campaign/get/`,
      data: {
        list: [
          {
            campaign_id: "1800000000000001",
            campaign_name: "Sales 2027",
            operation_status: "ENABLE",
            budget_mode: "BUDGET_MODE_DYNAMIC_DAILY_BUDGET",
            budget: 100,
          },
        ],
        page_info: { page: 1, page_size: 1, total_number: 1, total_page: 1 },
      },
    });
    stub.route({
      method: "POST",
      path: `${V}/smart_plus/campaign/update/`,
      data: { campaign_id: "1800000000000001" },
    });

    const out = await updateSmartPlusEntityLogic(
      UpdateSmartPlusEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        entityId: "1800000000000001",
        data: { campaign_name: "Sales 2027 v2", budget: 150 },
      }),
      ctx,
      sdk
    );

    // basis: TikTok "Update an Upgraded Smart+ Campaign" — POST
    // .../open_api/v1.3/smart_plus/campaign/update/; SDK
    // smart_plus_campaign_update.yml required: advertiser_id, campaign_id.
    const req = onlyWrite();
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/smart_plus/campaign/update/`);
    expectJsonAuth(req);
    expect(req.body).toEqual({
      advertiser_id: ADV,
      campaign_name: "Sales 2027 v2",
      budget: 150,
      campaign_id: "1800000000000001",
    });

    // basis: TikTok "Get Upgraded Smart+ Campaigns" — GET smart_plus/campaign/get/
    // with `filtering` (campaign_ids), `page_size` as query parameters; SDK
    // smart_plus_campaign_get.yml (fields is optional, so it is not sent).
    const get = apiRequests().find((r) => r.method === "GET")!;
    expect(get.url.startsWith(`${API}/smart_plus/campaign/get/`)).toBe(true);
    expect(JSON.parse(get.query.filtering!)).toEqual({ campaign_ids: ["1800000000000001"] });
    expect(get.query.advertiser_id).toBe(ADV);
    expect(get.query.fields).toBeUndefined();

    expect(out.before?.budget.daily?.amountMinor).toBe(10000);
    expect(remaining()).toBe(LIMIT - TIKTOK_READ_TOKENS * 2 - TIKTOK_WRITE_TOKENS);
  });

  it("ad → POST smart_plus/ad/update/ with smart_plus_ad_id, id applied last", async () => {
    stub.route({
      method: "GET",
      path: `${V}/smart_plus/ad/get/`,
      data: { list: [{ smart_plus_ad_id: "1900000000000001", operation_status: "ENABLE" }] },
    });
    stub.route({ method: "POST", path: `${V}/smart_plus/ad/update/`, data: {} });
    await updateSmartPlusEntityLogic(
      UpdateSmartPlusEntityInputSchema.parse({
        entityType: "ad",
        advertiserId: ADV,
        entityId: "1900000000000001",
        data: { ad_name: "Spot v2", smart_plus_ad_id: "someone-elses-ad" },
      }),
      ctx,
      sdk
    );
    // basis: TikTok "Update an Upgraded Smart+ Ad" — POST
    // .../open_api/v1.3/smart_plus/ad/update/; SDK smart_plus_ad_update.yml
    // required: advertiser_id, smart_plus_ad_id.
    const req = onlyWrite();
    expect(req.url).toBe(`${API}/smart_plus/ad/update/`);
    expect(req.body).toEqual({
      advertiser_id: ADV,
      ad_name: "Spot v2",
      smart_plus_ad_id: "1900000000000001",
    });
    const get = apiRequests().find((r) => r.method === "GET")!;
    expect(JSON.parse(get.query.filtering!)).toEqual({ smart_plus_ad_ids: ["1900000000000001"] });
  });

  it("adGroup → POST smart_plus/adgroup/update/ with adgroup_id", async () => {
    stub.route({
      method: "GET",
      path: `${V}/smart_plus/adgroup/get/`,
      data: { list: [{ adgroup_id: "1700000000000001", operation_status: "ENABLE" }] },
    });
    stub.route({ method: "POST", path: `${V}/smart_plus/adgroup/update/`, data: {} });
    await updateSmartPlusEntityLogic(
      UpdateSmartPlusEntityInputSchema.parse({
        entityType: "adGroup",
        advertiserId: ADV,
        entityId: "1700000000000001",
        data: { schedule_end_time: "2027-04-30 23:59:59" },
      }),
      ctx,
      sdk
    );
    // basis: TikTok "Update an Upgraded Smart+ Ad Group"; SDK
    // smart_plus_adgroup_update.yml required: advertiser_id, adgroup_id.
    const req = onlyWrite();
    expect(req.url).toBe(`${API}/smart_plus/adgroup/update/`);
    expect(req.body).toEqual({
      advertiser_id: ADV,
      schedule_end_time: "2027-04-30 23:59:59",
      adgroup_id: "1700000000000001",
    });
  });

  it("refuses operation_status (status has its own endpoint) before any request", async () => {
    await expect(
      updateSmartPlusEntityLogic(
        UpdateSmartPlusEntityInputSchema.parse({
          entityType: "campaign",
          advertiserId: ADV,
          entityId: "1",
          data: { operation_status: "DISABLE" },
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/tiktok_update_smart_plus_status/);
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run reads the entity but writes nothing", async () => {
    stub.route({
      method: "GET",
      path: `${V}/smart_plus/campaign/get/`,
      data: { list: [{ campaign_id: "1", operation_status: "ENABLE", budget: 10 }] },
    });
    const out = await updateSmartPlusEntityLogic(
      UpdateSmartPlusEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        entityId: "1",
        data: { budget: 20 },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(out.dryRun?.wouldSucceed).toBe(true);
    expect(apiRequests().every((r) => r.method === "GET")).toBe(true);
  });
});

describe("tiktok_update_smart_plus_status → /smart_plus/{campaign,adgroup,ad}/status/update/", () => {
  it("campaign → POST smart_plus/campaign/status/update/ with campaign_ids", async () => {
    stub.route({ method: "POST", path: `${V}/smart_plus/campaign/status/update/`, data: {} });
    const out = await updateSmartPlusStatusLogic(
      UpdateSmartPlusStatusInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        entityIds: ["1800000000000001", "1800000000000002"],
        operationStatus: "DISABLE",
      }),
      ctx,
      sdk
    );
    // basis: TikTok "Update the operation statuses of Upgraded Smart+ Campaigns"
    // — POST .../open_api/v1.3/smart_plus/campaign/status/update/; required
    // advertiser_id, campaign_ids (1-20), operation_status DELETE|DISABLE|ENABLE.
    // SDK smart_plus_campaign_status_update.yml.
    const req = onlyWrite();
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/smart_plus/campaign/status/update/`);
    expectJsonAuth(req);
    expect(req.body).toEqual({
      advertiser_id: ADV,
      campaign_ids: ["1800000000000001", "1800000000000002"],
      operation_status: "DISABLE",
    });
    expect(out.successCount).toBe(2);
    expect(remaining()).toBe(LIMIT - TIKTOK_WRITE_TOKENS);
  });

  it("adGroup → POST smart_plus/adgroup/status/update/ with adgroup_ids", async () => {
    stub.route({ method: "POST", path: `${V}/smart_plus/adgroup/status/update/`, data: {} });
    await updateSmartPlusStatusLogic(
      UpdateSmartPlusStatusInputSchema.parse({
        entityType: "adGroup",
        advertiserId: ADV,
        entityIds: ["1700000000000001"],
        operationStatus: "ENABLE",
      }),
      ctx,
      sdk
    );
    // basis: SDK smart_plus_adgroup_status_update.yml required: advertiser_id,
    // adgroup_ids, operation_status.
    const req = onlyWrite();
    expect(req.url).toBe(`${API}/smart_plus/adgroup/status/update/`);
    expect(req.body).toEqual({
      advertiser_id: ADV,
      adgroup_ids: ["1700000000000001"],
      operation_status: "ENABLE",
    });
  });

  it("ad → POST smart_plus/ad/status/update/ with smart_plus_ad_ids", async () => {
    stub.route({ method: "POST", path: `${V}/smart_plus/ad/status/update/`, data: {} });
    await updateSmartPlusStatusLogic(
      UpdateSmartPlusStatusInputSchema.parse({
        entityType: "ad",
        advertiserId: ADV,
        entityIds: ["1900000000000001"],
        operationStatus: "DELETE",
      }),
      ctx,
      sdk
    );
    // basis: SDK smart_plus_ad_status_update.yml required: advertiser_id,
    // smart_plus_ad_ids, operation_status.
    const req = onlyWrite();
    expect(req.url).toBe(`${API}/smart_plus/ad/status/update/`);
    expect(req.body).toEqual({
      advertiser_id: ADV,
      smart_plus_ad_ids: ["1900000000000001"],
      operation_status: "DELETE",
    });
  });

  it("dry_run sends nothing", async () => {
    await updateSmartPlusStatusLogic(
      UpdateSmartPlusStatusInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        entityIds: ["1"],
        operationStatus: "DISABLE",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });
});

describe("tiktok_get_smart_plus_entity → GET /smart_plus/*/get/", () => {
  it("is a read: one GET, one read token, no write", async () => {
    stub.route({
      method: "GET",
      path: `${V}/smart_plus/adgroup/get/`,
      data: { list: [{ adgroup_id: "1700000000000001" }] },
    });
    const out = await getSmartPlusEntityLogic(
      GetSmartPlusEntityInputSchema.parse({
        entityType: "adGroup",
        advertiserId: ADV,
        entityId: "1700000000000001",
      }),
      ctx,
      sdk
    );
    expect(out.entity.adgroup_id).toBe("1700000000000001");
    expect(apiRequests()).toHaveLength(1);
    expect(apiRequests()[0]!.method).toBe("GET");
    expect(remaining()).toBe(LIMIT - TIKTOK_READ_TOKENS);
  });
});
