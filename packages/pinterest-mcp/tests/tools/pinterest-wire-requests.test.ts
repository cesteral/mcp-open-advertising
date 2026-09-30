// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-request assertions for every pinterest-mcp tool that issues a non-GET
 * upstream request (#236). Each test calls the REAL tool logic over REAL
 * session services (PinterestService, PinterestReportingService,
 * PinterestHttpClient, the access-token adapter and the package's real
 * `RateLimiter`), with only `globalThis.fetch` stubbed, and asserts the full
 * request: HTTP method, URL (+ query) and the exact JSON body.
 *
 * Expected shapes come from Pinterest's published OpenAPI description, the
 * spec `scripts/generate-types.ts` generates `src/generated/types.ts` from:
 *   https://raw.githubusercontent.com/pinterest/api-description/main/v5/openapi.json
 *   info.version 5.28.0 (the version `src/generated/types.ts` records),
 *   pinterest/api-description commit 51aca009f10a90283ccdf3956d509fc995ebac23,
 *   fetched 2026-09-30, sha256 b698c180678a616bf1d635b374c086ba9cb2484117035c12f2b906eebe92a3e5.
 *   servers[0].url `https://api.pinterest.com/v5`.
 * Citations are `<operationId>` (method, path, parameters, requestBody $ref)
 * and `components.schemas.<Name>`.
 *
 * The `Content-Type: application/json` header on JSON bodies is implied by
 * each requestBody's `application/json` content key.
 *
 * Rate limiting: calls keyed by the ad account draw from
 * `pinterest:{adAccountId}` — a read costs PINTEREST_READ_TOKENS (1), a write
 * PINTEREST_WRITE_TOKENS (3); reporting calls draw 1 from
 * `pinterest:reporting`.
 *
 * list/get/check/download/targeting/pacing/validate tools send only GETs and
 * are out of scope here.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Video processing is polled at `pinterestVideoUploadPollIntervalMs` (20 s by
// default), read from config at import; 1 ms keeps the upload test from
// sleeping. Timing only — no request changes.
vi.hoisted(() => {
  process.env.PINTEREST_VIDEO_UPLOAD_POLL_INTERVAL_MS = "1";
});

import { mcpConfig } from "../../src/config/index.js";
import {
  PINTEREST_READ_TOKENS,
  PINTEREST_WRITE_TOKENS,
} from "../../src/services/pinterest/pinterest-service.js";
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
  submitReportLogic,
  SubmitReportInputSchema,
} from "../../src/mcp-server/tools/definitions/submit-report.tool.js";
import {
  getReportLogic,
  GetReportInputSchema,
} from "../../src/mcp-server/tools/definitions/get-report.tool.js";
import {
  getReportBreakdownsLogic,
  GetReportBreakdownsInputSchema,
} from "../../src/mcp-server/tools/definitions/get-report-breakdowns.tool.js";
import {
  getDeliveryEstimateLogic,
  GetDeliveryEstimateInputSchema,
} from "../../src/mcp-server/tools/definitions/get-delivery-estimate.tool.js";
import {
  getAdPreviewLogic,
  GetAdPreviewInputSchema,
} from "../../src/mcp-server/tools/definitions/get-ad-preview.tool.js";
import {
  uploadVideoLogic,
  UploadVideoInputSchema,
} from "../../src/mcp-server/tools/definitions/upload-video.tool.js";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  rateLimiter,
  PINTEREST_HOST,
  TEST_ACCESS_TOKEN,
  AD_ACCOUNT_ID,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/wire.js";

/** servers[0].url */
const API = "https://api.pinterest.com/v5";
const AD = AD_ACCOUNT_ID;
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

/** Every request to api.pinterest.com except the adapter's session validation. */
function apiRequests(): WireRequest[] {
  return stub.to(PINTEREST_HOST).filter((r) => r.path !== "/v5/user_account");
}

function writes(): WireRequest[] {
  return apiRequests().filter((r) => r.method !== "GET");
}

function onlyWrite(): WireRequest {
  const w = writes();
  expect(w).toHaveLength(1);
  return w[0]!;
}

/** basis: `components.securitySchemes.pinterest_oauth2` (OAuth2 → RFC 6750 bearer); Content-Type — the requestBody's application/json key. */
function expectJsonAuth(req: WireRequest) {
  expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  expect(req.headers["content-type"]).toBe("application/json");
}

/**
 * Every ad-account-keyed call drew its weight from the REAL limiter bucket:
 * a GET one read, anything else one write.
 */
function expectAccountTokensPerCall() {
  const spent = apiRequests().reduce(
    (sum, r) => sum + (r.method === "GET" ? PINTEREST_READ_TOKENS : PINTEREST_WRITE_TOKENS),
    0
  );
  expect(rateLimiter.getRemainingTokens(`pinterest:${AD}`)).toBe(
    mcpConfig.pinterestRateLimitPerMinute - spent
  );
}

/** Pinterest's batch-write envelope (`CampaignBatchWriteResponseModel` etc.): `{ items: [{ data, exceptions }] }`. */
function batchEcho(extra: Record<string, unknown> = {}) {
  return (req: WireRequest) => ({
    items: (req.body as Array<Record<string, unknown>>).map((item) => ({
      data: { id: "987", ...item, ...extra },
      exceptions: [],
    })),
  });
}

const CAMPAIGN = {
  id: "626736533506",
  ad_account_id: AD,
  name: "Autumn",
  status: "ACTIVE",
  objective_type: "AWARENESS",
  lifetime_spend_cap: 0,
  daily_spend_cap: 50_000_000,
  order_line_id: null,
  tracking_urls: null,
  start_time: 1_790_000_000,
  end_time: null,
  is_flexible_daily_budgets: false,
  is_campaign_budget_optimization: false,
  created_time: 1_760_000_000,
  updated_time: 1_760_000_100,
  type: "campaign",
  summary_status: "RUNNING",
};

const AD_GROUP = {
  id: "2680060704746",
  ad_account_id: AD,
  campaign_id: "626736533506",
  name: "AG",
  status: "ACTIVE",
  budget_in_micro_currency: 10_000_000,
  bid_in_micro_currency: 1_000_000,
  budget_type: "DAILY",
  billable_event: "IMPRESSION",
  created_time: 1_760_000_000,
  updated_time: 1_760_000_100,
  type: "adgroup",
  summary_status: "RUNNING",
};

describe("session validation", () => {
  it("the access-token adapter validates with GET /v5/user_account", () => {
    const [validate] = stub.to(PINTEREST_HOST);
    // basis: `user_account/get` — GET /user_account; OAuth2 bearer token.
    expect(validate!.method).toBe("GET");
    expect(validate!.url).toBe(`${API}/user_account`);
    expect(validate!.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  });
});

describe("pinterest_create_entity", () => {
  it("campaign → POST /ad_accounts/{ad_account_id}/campaigns with a one-item array", async () => {
    const data = {
      name: "Autumn",
      objective_type: "AWARENESS",
      status: "PAUSED",
      daily_spend_cap: 50_000_000,
    };
    stub.route({
      method: "POST",
      path: `/v5/ad_accounts/${AD}/campaigns`,
      response: batchEcho({ id: "901" }),
    });

    const out = await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "campaign", adAccountId: AD, data }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: `campaigns/create` — POST /ad_accounts/{ad_account_id}/campaigns,
    // requestBody `CampaignBatchCreateRequest` (array, minItems 1, maxItems 30)
    // of `CampaignCreateItem` (required: name, objective_type; status
    // `EntityStatus`; daily_spend_cap integer micro-currency).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/ad_accounts/${AD}/campaigns`);
    expectJsonAuth(req);
    expect(req.body).toEqual([data]);
    expect(out.entity.id).toBe("901");
    expectAccountTokensPerCall();
  });

  it("a rejected batch item (HTTP 200 with exceptions) fails the tool", async () => {
    stub.route({
      method: "POST",
      path: `/v5/ad_accounts/${AD}/campaigns`,
      response: { items: [{ data: null, exceptions: [{ code: 2, message: "Invalid name" }] }] },
    });
    // basis: `campaigns/create` 200 → `CampaignBatchWriteResponseModel.items[]`
    // → `CampaignBatchItem {data, exceptions: Exception[]}` — a rejection arrives as 200.
    await expect(
      createEntityLogic(
        CreateEntityInputSchema.parse({
          entityType: "campaign",
          adAccountId: AD,
          data: { name: "", objective_type: "AWARENESS" },
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/Invalid name/);
  });

  it("creative (Pin) → POST /pins with a single PinCreate object", async () => {
    const data = {
      board_id: "1234567890",
      title: "Autumn look",
      link: "https://shop.example.com/autumn",
      media_source: { source_type: "image_url", url: "https://cdn.example.com/a.jpg" },
    };
    stub.route({ method: "POST", path: "/v5/pins", response: { id: "813", ...data } });
    await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "creative", adAccountId: AD, data }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `pins/create` — POST /pins, requestBody `PinCreate` (an object,
    // not a batch array; board_id, title, link, media_source).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/pins`);
    expectJsonAuth(req);
    expect(req.body).toEqual(data);
    expectAccountTokensPerCall();
  });

  // basis: `pins/create` / `pins/update` / `pins/delete` / `pins/get` take an
  // optional `ad_account_id` query parameter — "Business Access: Specify an
  // ad_account_id ... to use the owner of that ad_account as the 'operation
  // user_account'". The creative path never sends it, so for a Business Access
  // member the Pin is created / changed / deleted as the TOKEN user, not as the
  // owner of the `adAccountId` the tool was called (and scope-checked) with.
  it.todo(
    "creative writes send ?ad_account_id={adAccountId} (Business Access) — reported on #236, not fixed here"
  );

  it("dry_run sends nothing", async () => {
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "campaign",
        adAccountId: AD,
        data: { name: "Autumn", objective_type: "AWARENESS" },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("pinterest_update_entity", () => {
  it("adGroup → GET (pre-state), then PATCH /ad_accounts/{id}/ad_groups with [{...data, id}]", async () => {
    stub.route({
      method: "GET",
      path: `/v5/ad_accounts/${AD}/ad_groups/${AD_GROUP.id}`,
      response: AD_GROUP,
    });
    stub.route({
      method: "PATCH",
      path: `/v5/ad_accounts/${AD}/ad_groups`,
      response: batchEcho(),
    });

    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "adGroup",
        adAccountId: AD,
        entityId: AD_GROUP.id,
        data: { name: "AG renamed", budget_in_micro_currency: 20_000_000 },
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: `ad_groups/update` — PATCH /ad_accounts/{ad_account_id}/ad_groups,
    // requestBody `AdGroupBatchUpdateRequest` (array, maxItems 30) of
    // `AdGroupUpdateBatchUpdate` (required: id; name string;
    // budget_in_micro_currency integer).
    expect(req.method).toBe("PATCH");
    expect(req.url).toBe(`${API}/ad_accounts/${AD}/ad_groups`);
    expectJsonAuth(req);
    expect(req.body).toEqual([
      { name: "AG renamed", budget_in_micro_currency: 20_000_000, id: AD_GROUP.id },
    ]);
    expect(apiRequests().map((r) => r.method)).toEqual(["GET", "PATCH"]);
    expectAccountTokensPerCall();
  });

  it("an `id` inside data cannot redirect the PATCH to another entity", async () => {
    stub.route({
      method: "GET",
      path: `/v5/ad_accounts/${AD}/campaigns/${CAMPAIGN.id}`,
      response: CAMPAIGN,
    });
    stub.route({ method: "PATCH", path: `/v5/ad_accounts/${AD}/campaigns`, response: batchEcho() });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "campaign",
        adAccountId: AD,
        entityId: CAMPAIGN.id,
        data: { id: "999", status: "PAUSED" },
      }),
      ctx,
      sdk
    );
    // basis: `campaigns/update` — `CampaignBatchUpdateItem.id` ("required")
    // names the campaign the item updates.
    expect(onlyWrite().body).toEqual([{ id: CAMPAIGN.id, status: "PAUSED" }]);
  });

  it("creative (Pin) → PATCH /pins/{pin_id} with a flat PinUpdate object", async () => {
    stub.route({ method: "PATCH", path: "/v5/pins/813", response: { id: "813" } });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "creative",
        adAccountId: AD,
        entityId: "813",
        data: { title: "New title", alt_text: "alt" },
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `pins/update` — PATCH /pins/{pin_id}, requestBody `PinUpdate`
    // (object: title, alt_text, …).
    expect(req.method).toBe("PATCH");
    expect(req.url).toBe(`${API}/pins/813`);
    expectJsonAuth(req);
    expect(req.body).toEqual({ title: "New title", alt_text: "alt" });
  });

  it("dry_run sends no PATCH", async () => {
    stub.route({
      method: "GET",
      path: `/v5/ad_accounts/${AD}/ad_groups/${AD_GROUP.id}`,
      response: AD_GROUP,
    });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "adGroup",
        adAccountId: AD,
        entityId: AD_GROUP.id,
        data: { name: "x" },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(0);
  });
});

describe("pinterest_delete_entity", () => {
  it("campaign → one PATCH [{status: ARCHIVED, id}] per id (v5 has no campaign DELETE)", async () => {
    stub.route({ method: "PATCH", path: `/v5/ad_accounts/${AD}/campaigns`, response: batchEcho() });

    const out = await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        adAccountId: AD,
        entityIds: ["111", "112"],
      }),
      ctx,
      sdk
    );

    // basis: the spec defines only get/post/patch on
    // /ad_accounts/{ad_account_id}/campaigns and only get on
    // /campaigns/{campaign_id} — no DELETE; `EntityStatus` enum includes ARCHIVED.
    const w = writes();
    expect(w).toHaveLength(2);
    for (const req of w) {
      expect(req.method).toBe("PATCH");
      expect(req.url).toBe(`${API}/ad_accounts/${AD}/campaigns`);
      expectJsonAuth(req);
    }
    expect(w.map((r) => r.body)).toEqual(
      expect.arrayContaining([
        [{ status: "ARCHIVED", id: "111" }],
        [{ status: "ARCHIVED", id: "112" }],
      ])
    );
    expect(out.succeededCount).toBe(2);
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expectAccountTokensPerCall();
  });

  it("creative (Pin) → DELETE /pins/{pin_id}, no body", async () => {
    stub.route({ method: "DELETE", path: "/v5/pins/813", response: {} });
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "creative",
        adAccountId: AD,
        entityIds: ["813"],
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `pins/delete` — DELETE /pins/{pin_id}, no requestBody.
    expect(req.method).toBe("DELETE");
    expect(req.url).toBe(`${API}/pins/813`);
    expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(req.body).toBeUndefined();
    expectAccountTokensPerCall();
  });

  // PinterestService.deleteEntity draws ONE write weight for a whole batch of
  // Pin DELETEs (`pinterestBulkBuckets.delete` documents it: "a single 3-token
  // consume for the whole batch"), so N DELETE /pins/{id} requests spend the
  // tokens of one. Asserting per-call accounting for N > 1 would fail today.
  it.todo(
    "a multi-Pin delete draws one write weight per DELETE /pins/{pin_id} — reported on #236, not fixed here"
  );

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        adAccountId: AD,
        entityIds: ["111"],
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing and does not prompt", async () => {
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        adAccountId: AD,
        entityIds: ["111"],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("pinterest_bulk_update_status → ad_groups/update per id", () => {
  it("PATCHes [{status, id}] once per ad group", async () => {
    stub.route({ method: "PATCH", path: `/v5/ad_accounts/${AD}/ad_groups`, response: batchEcho() });
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "adGroup",
        adAccountId: AD,
        entityIds: ["201", "202"],
        operationStatus: "PAUSED",
      }),
      ctx,
      sdk
    );
    // basis: `ad_groups/update` — PATCH, `AdGroupUpdateBatchUpdate` {id
    // (required), status: EntityStatus}.
    const w = writes();
    expect(w).toHaveLength(2);
    for (const req of w) {
      expect(req.method).toBe("PATCH");
      expect(req.url).toBe(`${API}/ad_accounts/${AD}/ad_groups`);
      expectJsonAuth(req);
    }
    expect(w.map((r) => r.body)).toEqual(
      expect.arrayContaining([[{ status: "PAUSED", id: "201" }], [{ status: "PAUSED", id: "202" }]])
    );
    expectAccountTokensPerCall();
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "adGroup",
        adAccountId: AD,
        entityIds: ["201"],
        operationStatus: "PAUSED",
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "adGroup",
        adAccountId: AD,
        entityIds: ["201"],
        operationStatus: "PAUSED",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("pinterest_bulk_create_entities → ads/create per item", () => {
  const items = [
    { ad_group_id: "201", creative_type: "REGULAR", pin_id: "813", status: "PAUSED", name: "A" },
    { ad_group_id: "201", creative_type: "REGULAR", pin_id: "814", status: "PAUSED", name: "B" },
  ];

  it("POSTs a one-item array per ad", async () => {
    stub.route({ method: "POST", path: `/v5/ad_accounts/${AD}/ads`, response: batchEcho() });
    const out = await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({ entityType: "ad", adAccountId: AD, items }),
      ctx,
      sdk
    );
    // basis: `ads/create` — POST /ad_accounts/{ad_account_id}/ads,
    // requestBody `AdBatchCreateRequest` (array, maxItems 30) of `AdCreate`
    // (ad_group_id, creative_type, pin_id, status, name).
    const w = writes();
    expect(w).toHaveLength(2);
    for (const req of w) {
      expect(req.method).toBe("POST");
      expect(req.url).toBe(`${API}/ad_accounts/${AD}/ads`);
      expectJsonAuth(req);
    }
    expect(w.map((r) => r.body)).toEqual(expect.arrayContaining(items.map((i) => [i])));
    expect(out.successCount).toBe(2);
    expectAccountTokensPerCall();
  });

  it("dry_run sends nothing", async () => {
    await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({
        entityType: "ad",
        adAccountId: AD,
        items,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("pinterest_bulk_update_entities → campaigns/update per item", () => {
  const items = [
    { entityId: "111", data: { daily_spend_cap: 60_000_000 } },
    { entityId: "112", data: { name: "Renamed" } },
  ];

  it("PATCHes [{...data, id}] per item after one confirmation (a spend field is sensitive)", async () => {
    stub.route({ method: "PATCH", path: `/v5/ad_accounts/${AD}/campaigns`, response: batchEcho() });
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({ entityType: "campaign", adAccountId: AD, items }),
      ctx,
      sdk
    );
    // basis: `campaigns/update` — PATCH, `CampaignBatchUpdateRequest` of
    // `CampaignBatchUpdateItem` {id (required), daily_spend_cap integer, name}.
    const w = writes();
    expect(w).toHaveLength(2);
    for (const req of w) {
      expect(req.method).toBe("PATCH");
      expect(req.url).toBe(`${API}/ad_accounts/${AD}/campaigns`);
    }
    expect(w.map((r) => r.body)).toEqual(
      expect.arrayContaining([
        [{ daily_spend_cap: 60_000_000, id: "111" }],
        [{ name: "Renamed", id: "112" }],
      ])
    );
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expectAccountTokensPerCall();
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({ entityType: "campaign", adAccountId: AD, items }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "campaign",
        adAccountId: AD,
        items,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("pinterest_duplicate_entity → campaigns/get then campaigns/create", () => {
  it("POSTs the source minus read-only fields, with status forced PAUSED", async () => {
    stub.route({
      method: "GET",
      path: `/v5/ad_accounts/${AD}/campaigns/${CAMPAIGN.id}`,
      response: CAMPAIGN,
    });
    stub.route({
      method: "POST",
      path: `/v5/ad_accounts/${AD}/campaigns`,
      response: batchEcho({ id: "902" }),
    });

    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "campaign",
        adAccountId: AD,
        entityId: CAMPAIGN.id,
        options: { name: "Autumn (copy)", status: "ACTIVE" },
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: no copy endpoint exists in the spec; `campaigns/create` — POST,
    // array of `CampaignCreateItem`. The `Campaign` fields absent from
    // `CampaignCreateItem` (id, created_time, updated_time, type,
    // summary_status) are dropped, as is ad_account_id (the path names it).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/ad_accounts/${AD}/campaigns`);
    expectJsonAuth(req);
    expect(req.body).toEqual([
      {
        name: "Autumn (copy)",
        status: "PAUSED",
        objective_type: "AWARENESS",
        lifetime_spend_cap: 0,
        daily_spend_cap: 50_000_000,
        order_line_id: null,
        tracking_urls: null,
        start_time: 1_790_000_000,
        end_time: null,
        is_flexible_daily_budgets: false,
        is_campaign_budget_optimization: false,
      },
    ]);
    expectAccountTokensPerCall();
  });

  // basis: `components.schemas.Campaign` has `performance_plus_campaign_settings`,
  // `CampaignCreateItem` does not (only `CampaignBatchUpdateItem` does), and it
  // is not in READ_ONLY_FIELDS.campaign — so a source carrying it is copied
  // into the create body. Whether Pinterest rejects or ignores it: unverified.
  it.todo(
    "a duplicated campaign's create body carries only CampaignCreateItem fields (performance_plus_campaign_settings) — reported on #236"
  );

  it("dry_run reads the source and sends no create", async () => {
    stub.route({
      method: "GET",
      path: `/v5/ad_accounts/${AD}/campaigns/${CAMPAIGN.id}`,
      response: CAMPAIGN,
    });
    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "campaign",
        adAccountId: AD,
        entityId: CAMPAIGN.id,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(0);
  });
});

describe("pinterest_adjust_bids → ad_groups/get then ad_groups/update", () => {
  it("PATCHes bid_in_micro_currency as integer micros", async () => {
    stub.route({
      method: "GET",
      path: `/v5/ad_accounts/${AD}/ad_groups/${AD_GROUP.id}`,
      response: AD_GROUP,
    });
    stub.route({ method: "PATCH", path: `/v5/ad_accounts/${AD}/ad_groups`, response: batchEcho() });

    const out = await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        adAccountId: AD,
        adjustments: [{ adGroupId: AD_GROUP.id, bidPrice: 1.5 }],
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: `ad_groups/update` — PATCH; `AdGroupUpdateBatchUpdate
    // .bid_in_micro_currency` type integer ("Bid price in micro currency").
    expect(req.method).toBe("PATCH");
    expect(req.url).toBe(`${API}/ad_accounts/${AD}/ad_groups`);
    expectJsonAuth(req);
    expect(req.body).toEqual([{ bid_in_micro_currency: 1_500_000, id: AD_GROUP.id }]);
    expect(out.results).toEqual([
      expect.objectContaining({
        adGroupId: AD_GROUP.id,
        success: true,
        previousBid: 1,
        newBid: 1.5,
      }),
    ]);
    expect(apiRequests().map((r) => r.method)).toEqual(["GET", "PATCH"]);
    expectAccountTokensPerCall();
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        adAccountId: AD,
        adjustments: [{ adGroupId: AD_GROUP.id, bidPrice: 1.5 }],
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        adAccountId: AD,
        adjustments: [{ adGroupId: AD_GROUP.id, bidPrice: 1.5 }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("reporting → analytics/create_report, analytics/get_report", () => {
  const REPORT_URL = "https://pinterest-analytics.s3.amazonaws.com/report-1.csv";

  /** basis: `analytics/create_report` response `AdsAnalyticsCreateAsyncResponse {token, report_status}`. */
  function routeReport() {
    stub.route({
      method: "POST",
      path: `/v5/ad_accounts/${AD}/reports`,
      response: { token: "tok-1", report_status: "IN_PROGRESS", message: null },
    });
    // basis: `analytics/get_report` response `AdsAnalyticsGetAsyncResponse {report_status, url, size}`.
    stub.route({
      method: "GET",
      path: `/v5/ad_accounts/${AD}/reports`,
      response: { report_status: "FINISHED", url: REPORT_URL, size: 42 },
    });
    stub.route({
      method: "GET",
      host: "pinterest-analytics.s3.amazonaws.com",
      path: "/report-1.csv",
      rawBody: "CAMPAIGN_ID,IMPRESSION_1\n111,1000\n",
      contentType: "text/csv",
    });
  }

  function expectReportTokens(calls: number) {
    expect(rateLimiter.getRemainingTokens("pinterest:reporting")).toBe(
      mcpConfig.pinterestRateLimitPerMinute - calls
    );
  }

  it("pinterest_submit_report → POST /ad_accounts/{id}/reports with AdsAnalyticsCreateAsyncRequest", async () => {
    routeReport();
    const out = await submitReportLogic(
      SubmitReportInputSchema.parse({
        adAccountId: AD,
        type: "AD",
        columns: ["IMPRESSION_1", "SPEND_IN_DOLLAR"],
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        granularity: "WEEK",
        adIds: ["301"],
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `analytics/create_report` — POST /ad_accounts/{ad_account_id}/reports,
    // requestBody `AdsAnalyticsCreateAsyncRequest` (required: start_date,
    // end_date, granularity). `level`: `MetricsReportingLevel` (ads are
    // PIN_PROMOTION); `report_format`: `DataOutputFormat` JSON|CSV, default JSON;
    // `granularity`: `Granularity` TOTAL|DAY|HOUR|WEEK|MONTH; `columns`:
    // `ReportingColumnAsync`; `ad_ids` array of `Pinterest.Lib.IntegerFormatType`.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/ad_accounts/${AD}/reports`);
    expectJsonAuth(req);
    expect(req.body).toEqual({
      level: "PIN_PROMOTION",
      report_format: "CSV",
      columns: ["IMPRESSION_1", "SPEND_IN_DOLLAR"],
      start_date: "2026-09-01",
      end_date: "2026-09-07",
      granularity: "WEEK",
      ad_ids: ["301"],
    });
    expect(out.taskId).toBe("tok-1");
    expectReportTokens(1);
  });

  it("pinterest_submit_report dry_run sends nothing", async () => {
    await submitReportLogic(
      SubmitReportInputSchema.parse({
        adAccountId: AD,
        columns: ["IMPRESSION_1"],
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("pinterest_get_report → POST reports, GET reports?token=…, then GET the report url", async () => {
    routeReport();
    const out = await getReportLogic(
      GetReportInputSchema.parse({
        adAccountId: AD,
        columns: ["CAMPAIGN_ID", "IMPRESSION_1"],
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        campaignIds: ["111"],
      }),
      ctx,
      sdk
    );
    // basis: `analytics/create_report` (POST), then `analytics/get_report` —
    // GET /ad_accounts/{ad_account_id}/reports, query `token` (required); its
    // `url` is fetched without Pinterest auth (a pre-signed download URL).
    const calls = stub.requests.filter((r) => r.path !== "/v5/user_account");
    expect(calls.map((r) => `${r.method} ${r.url}`)).toEqual([
      `POST ${API}/ad_accounts/${AD}/reports`,
      `GET ${API}/ad_accounts/${AD}/reports?token=tok-1`,
      `GET ${REPORT_URL}`,
    ]);
    expect(calls[0]!.body).toEqual({
      level: "CAMPAIGN",
      report_format: "CSV",
      columns: ["CAMPAIGN_ID", "IMPRESSION_1"],
      start_date: "2026-09-01",
      end_date: "2026-09-07",
      granularity: "DAY",
      campaign_ids: ["111"],
    });
    expect(calls[2]!.headers["authorization"]).toBeUndefined();
    expect(out.taskId).toBe("tok-1");
    expectReportTokens(2);
  });

  it("pinterest_get_report_breakdowns → level *_TARGETING with targeting_types", async () => {
    routeReport();
    await getReportBreakdownsLogic(
      GetReportBreakdownsInputSchema.parse({
        adAccountId: AD,
        type: "AD_GROUP",
        columns: ["IMPRESSION_1"],
        breakdowns: ["COUNTRY", "AGE_BUCKET"],
        startDate: "2026-09-01",
        endDate: "2026-09-07",
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `AdsAnalyticsCreateAsyncRequest.targeting_types` — "Requires
    // `level` to be a value ending in `_TARGETING`"; items
    // `AdAdsAnalyticsAsyncTargetingTypes` (COUNTRY, AGE_BUCKET).
    expect(req.url).toBe(`${API}/ad_accounts/${AD}/reports`);
    expect(req.body).toEqual({
      level: "AD_GROUP_TARGETING",
      report_format: "CSV",
      columns: ["IMPRESSION_1"],
      start_date: "2026-09-01",
      end_date: "2026-09-07",
      granularity: "DAY",
      targeting_types: ["COUNTRY", "AGE_BUCKET"],
    });
  });
});

describe("pinterest_get_delivery_estimate → ad_groups/audience_sizing", () => {
  it("POSTs {targeting_spec} and draws one read token", async () => {
    const targeting = { GEO: ["US"], AGE_BUCKET: ["25-34"] };
    stub.route({
      method: "POST",
      path: `/v5/ad_accounts/${AD}/ad_groups/audience_sizing`,
      response: { audience_size_lower_bound: 1000, audience_size_upper_bound: 2000 },
    });
    await getDeliveryEstimateLogic(
      GetDeliveryEstimateInputSchema.parse({ adAccountId: AD, targetingConfig: targeting }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `ad_groups/audience_sizing` — POST
    // /ad_accounts/{ad_account_id}/ad_groups/audience_sizing, requestBody
    // `AdGroupAudienceSizingCreate` {targeting_spec: TargetingSpecOptimal, …}.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/ad_accounts/${AD}/ad_groups/audience_sizing`);
    expectJsonAuth(req);
    expect(req.body).toEqual({ targeting_spec: targeting });
    // A read-only POST: PinterestService draws a read weight for it.
    expect(rateLimiter.getRemainingTokens(`pinterest:${AD}`)).toBe(
      mcpConfig.pinterestRateLimitPerMinute - PINTEREST_READ_TOKENS
    );
  });
});

describe("pinterest_get_ad_preview → ads/get then ad_previews/create", () => {
  it("reads the ad's pin_id and POSTs AdPreviewCreateFromPin", async () => {
    stub.route({
      method: "GET",
      path: `/v5/ad_accounts/${AD}/ads/301`,
      response: { id: "301", pin_id: "813", ad_group_id: "201" },
    });
    stub.route({
      method: "POST",
      path: `/v5/ad_accounts/${AD}/ad_previews`,
      response: { url: "https://www.pinterest.com/ad-preview/abc" },
    });
    await getAdPreviewLogic(
      GetAdPreviewInputSchema.parse({
        adAccountId: AD,
        adId: "301",
        creativeType: "MAX_WIDTH_VIDEO_COLLECTION",
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `ad_previews/create` — POST /ad_accounts/{ad_account_id}/ad_previews,
    // requestBody `AdPreviewRequest` oneOf … `AdPreviewSourcePinId` (title
    // AdPreviewCreateFromPin: pin_id required, creative_type `AdPinPreviewCreativeType`).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/ad_accounts/${AD}/ad_previews`);
    expectJsonAuth(req);
    expect(req.body).toEqual({ pin_id: "813", creative_type: "MAX_WIDTH_VIDEO_COLLECTION" });
    // One read (the ad GET) + the preview POST, which draws a read weight.
    expect(rateLimiter.getRemainingTokens(`pinterest:${AD}`)).toBe(
      mcpConfig.pinterestRateLimitPerMinute - 2 * PINTEREST_READ_TOKENS
    );
  });
});

describe("pinterest_upload_video → media/create, the S3 form POST, then media/get", () => {
  const UPLOAD_URL = "https://pinterest-media-upload.s3-accelerate.amazonaws.com/";
  const PARAMS = {
    "x-amz-date": "20260930T000000Z",
    "x-amz-signature": "sig",
    "x-amz-security-token": "tok",
    "x-amz-algorithm": "AWS4-HMAC-SHA256",
    key: "uploads/11/aa/22/3:video:1",
    policy: "eyJleHBpcmF0aW9uIjoi",
    "x-amz-credential": "ASIA/20260930/us-east-1/s3/aws4_request",
    "Content-Type": "multipart/form-data",
  };

  it("registers the upload, posts the form fields + file to upload_url, then polls the media", async () => {
    stub.route({
      method: "GET",
      host: "cdn.example.com",
      path: "/spot.mp4",
      rawBody: Buffer.from("mp4-bytes", "latin1"),
      contentType: "video/mp4",
    });
    stub.route({
      method: "POST",
      path: "/v5/media",
      response: {
        media_id: "12345",
        media_type: "video",
        upload_url: UPLOAD_URL,
        upload_parameters: PARAMS,
      },
    });
    stub.route({
      method: "POST",
      host: "pinterest-media-upload.s3-accelerate.amazonaws.com",
      path: "/",
      response: {},
    });
    stub.route({
      method: "GET",
      path: "/v5/media/12345",
      response: { media_id: "12345", media_type: "video", status: "succeeded" },
    });

    const out = await uploadVideoLogic(
      UploadVideoInputSchema.parse({
        adAccountId: AD,
        mediaUrl: "https://cdn.example.com/spot.mp4",
      }),
      ctx,
      sdk
    );

    const calls = stub.requests.filter((r) => r.path !== "/v5/user_account");
    expect(calls.map((r) => `${r.method} ${r.url}`)).toEqual([
      "GET https://cdn.example.com/spot.mp4",
      `POST ${API}/media`,
      `POST ${UPLOAD_URL}`,
      `GET ${API}/media/12345`,
    ]);
    const [, register, s3] = calls;
    // basis: `media/create` — POST /media, requestBody `MediaUploadCreate`
    // (required: media_type; `MediaUploadType` enum ["video"]).
    expectJsonAuth(register!);
    expect(register!.body).toEqual({ media_type: "video" });
    // basis: `media/create` description — "make an HTTP POST request ... to
    // `upload_url` ... Send the media file's contents as the request's `file`
    // parameter and also include all of the parameters from
    // `upload_parameters`" (`MediaUploadParameters`, e.g. Content-Type
    // "multipart/form-data"). The pre-signed S3 URL carries no Pinterest auth.
    // Part framing (RFC 7578) is unverified (code-only).
    expect(s3!.headers["authorization"]).toBeUndefined();
    const boundary = /^multipart\/form-data; boundary=(.+)$/.exec(
      s3!.headers["content-type"]!
    )?.[1];
    expect(boundary).toBeTruthy();
    const fields = Object.entries(PARAMS)
      .map(
        ([name, value]) =>
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      )
      .join("");
    expect(s3!.rawBody!.toString("latin1")).toBe(
      fields +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="spot.mp4"\r\n` +
        `Content-Type: video/mp4\r\n\r\nmp4-bytes\r\n--${boundary}--\r\n`
    );
    // basis: `media/get` — GET /media/{media_id}, response `Media.status`
    // (`MediaUploadStatus`: registered | processing | succeeded | failed).
    expect(out.mediaId).toBe("12345");
    expect(out.mediaStatus).toBe("succeeded");
  });

  // The media/create POST and media/get polls go through
  // `pinterestService.client` directly and never touch the limiter, so this
  // tool is the one Pinterest write path with no rate accounting at all.
  it.todo(
    "pinterest_upload_video draws limiter tokens for media/create and media/get — reported on #236, not fixed here"
  );

  it("dry_run downloads and uploads nothing", async () => {
    await uploadVideoLogic(
      UploadVideoInputSchema.parse({
        adAccountId: AD,
        mediaUrl: "https://cdn.example.com/spot.mp4",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests.filter((r) => r.path !== "/v5/user_account")).toHaveLength(0);
  });
});
