// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-request assertions for every snapchat-mcp write tool (#236). Each test
 * calls the REAL tool logic over REAL session services (SnapchatService,
 * SnapchatReportingService, SnapchatHttpClient, a `SnapchatAccessTokenAdapter`
 * validated against a stubbed `GET /v1/me`, and the package's real module
 * `RateLimiter`), with only `globalThis.fetch` stubbed, and asserts the full
 * request: HTTP method, URL and query, the auth / content-type headers and the
 * exact body — plus that a declined confirmation and a `dry_run` send no write,
 * and how many limiter tokens each call draws.
 *
 * Vendor sources. Snap publishes no machine-readable Ads API spec and no Ads
 * API SDK, and developers.snap.com is unreachable from this repo's egress.
 * What is available:
 *
 *   [facts] The three snapchat facts in platform-facts.json that someone read
 *           first-hand on Snap's own pages (status `verified`, 2026-09-30):
 *           - `snapchat.stats_report_dimension` and
 *             `snapchat.stats_day_bounds_account_timezone`, source
 *             https://developers.snap.com/api/marketing-api/Ads-API/measurement
 *           - `snapchat.campaign_objective_v2`, source
 *             https://developers.snap.com/api/marketing-api/Ads-API/campaigns
 *           Cited as `fact <id>`; only what the fact's `claim` states is
 *           treated as sourced.
 *
 * Searched and NOT usable as a basis: Snap's GitHub org (`Snapchat`) publishes
 * business-sdk-{python,java,go,php,ruby} and business-sdk-v3-java, which are
 * Conversions API (CAPI) clients only — e.g. business-sdk-python
 * commit 69ecef62e8ca4f16f3bd825f091a501bac1c0722 README.md, "CAPI Business
 * SDK in Python", fetched 2026-10-01 via raw.githubusercontent.com. No repo in
 * the org names adsapi.snapchat.com or an Ads API collection (`adsquads`).
 *
 * So most of what is pinned here — every path, the `{ <collection>: [...] }`
 * body wrapper, the full-object PUT, the DELETE route, the media upload
 * sequence and the Bearer header — is `basis: unverified (code-only)`: it pins
 * what the code sends today, so a change is a reviewed decision, not a
 * confirmation that Snap accepts it. The host is `mcpConfig.snapchatApiBaseUrl`
 * (platform-facts `snapchat.api_base`, also unverified) and is not restated.
 *
 * Rate limiting (services/snapchat/rate-limit-keys.ts): entity, media and
 * ad-account calls draw from `snapchat:user:{me.id}` — a read 1 token
 * (SNAPCHAT_READ_TOKENS), a write 3 (SNAPCHAT_WRITE_TOKENS); stats submits and
 * polls draw 1 from `...:reporting`. The source-file download of an upload is
 * not a Snap call and draws none. The module limit is 10/min, so every test
 * stays within one window.
 *
 * Out of scope (no write): get_entity, list_entities, list_ad_accounts,
 * get_targeting_options, search_targeting, get_audience_estimate (a POST read),
 * get_ad_preview, check_report_status, download_report, get_report,
 * get_report_breakdowns, get_pacing_status, validate_entity.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.hoisted(() => {
  // The upload tools wait this long before each media status poll (default 20s).
  // Timing only: one poll, no wait.
  process.env.SNAPCHAT_VIDEO_UPLOAD_POLL_INTERVAL_MS = "1";
});

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
  bulkUpdateStatusLogic,
  BulkUpdateStatusInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import {
  bulkUpdateEntitiesLogic,
  BulkUpdateEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import {
  bulkCreateEntitiesLogic,
  BulkCreateEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import {
  adjustBidsLogic,
  AdjustBidsInputSchema,
} from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";
import {
  duplicateEntityLogic,
  DuplicateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/duplicate-entity.tool.js";
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
  API_BASE_URL,
  API_HOST,
  TEST_SNAPCHAT_TOKEN,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/wire.js";

const API = API_BASE_URL;
const LIMIT = mcpConfig.snapchatRateLimitPerMinute;
const ctx = { requestId: "snap-wire-req" } as any;

const ACCOUNT = "8c4b0b9c-0000-4000-8000-00000000acc1";
const CAMP = "c4a1d2e3-0000-4000-8000-0000000000c1";
const CAMP_2 = "c4a1d2e3-0000-4000-8000-0000000000c2";
const SQUAD = "5e7f0a1b-0000-4000-8000-0000000000a1";
const AD_ID = "ad000000-0000-4000-8000-0000000000d1";
const CREATIVE = "cc000000-0000-4000-8000-0000000000e1";

/** A campaign as GET /v1/campaigns/{id} returns it (fields: unverified, code-only). */
function campaign(id: string, name: string): Record<string, unknown> {
  return {
    id,
    updated_at: "2026-09-01T10:00:00.000Z",
    created_at: "2026-08-01T10:00:00.000Z",
    name,
    ad_account_id: ACCOUNT,
    status: "ACTIVE",
    objective_v2_properties: { objective_v2_type: "TRAFFIC" },
    daily_budget_micro: 50_000_000,
    start_time: "2026-08-02T00:00:00.000Z",
    delivery_status: ["VALID"],
  };
}

const SQUAD_ENTITY: Record<string, unknown> = {
  id: SQUAD,
  name: "US 25-44",
  status: "ACTIVE",
  campaign_id: CAMP,
  type: "SNAP_ADS",
  placement_v2: { config: "AUTOMATIC", platforms: ["SNAPCHAT"] },
  billing_event: "IMPRESSION",
  bid_strategy: "LOWEST_COST_WITH_MAX_BID",
  bid_micro: 1_000_000,
  daily_budget_micro: 20_000_000,
  optimization_goal: "IMPRESSIONS",
  targeting: { geos: [{ country_code: "us" }] },
};

const AD_ENTITY: Record<string, unknown> = {
  id: AD_ID,
  name: "Story ad",
  status: "ACTIVE",
  ad_squad_id: SQUAD,
  creative_id: CREATIVE,
  type: "SNAP_AD",
};

const COLLECTIONS: Record<string, { responseKey: string; entityKey: string }> = {
  campaigns: { responseKey: "campaigns", entityKey: "campaign" },
  adsquads: { responseKey: "adsquads", entityKey: "adsquad" },
  ads: { responseKey: "ads", entityKey: "ad" },
  creatives: { responseKey: "creatives", entityKey: "creative" },
};

/** Snap's envelope around one or more entities (shape: unverified, code-only). */
function envelope(responseKey: string, entityKey: string, entities: Record<string, unknown>[]) {
  return {
    request_status: "SUCCESS",
    request_id: "req-wire",
    [responseKey]: entities.map((e) => ({ sub_request_status: "SUCCESS", [entityKey]: e })),
  };
}

let stub: FetchStub;
let session: WireSession;
let sdk: ReturnType<typeof acceptingSdkContext>;
/** id → entity served by GET /v1/{collection}/{id}. */
let store: Map<string, Record<string, unknown>>;

beforeEach(async () => {
  stub = installFetchStub();
  session = await createWireSession(stub, ACCOUNT, "snapchat-wire-236");
  sdk = acceptingSdkContext(session.sessionId);
  store = new Map([
    [CAMP, campaign(CAMP, "Autumn")],
    [CAMP_2, campaign(CAMP_2, "Winter")],
    [SQUAD, SQUAD_ENTITY],
    [AD_ID, AD_ENTITY],
  ]);
  // GET by id: /v1/{campaigns|adsquads|ads|creatives}/{id}
  stub.route({
    method: "GET",
    host: API_HOST,
    path: /^\/v1\/(campaigns|adsquads|ads|creatives)\/[^/]+$/,
    response: (req: WireRequest) => {
      const [, , collection, id] = req.path.split("/");
      const { responseKey, entityKey } = COLLECTIONS[collection!]!;
      const entity = store.get(id!);
      return entity
        ? envelope(responseKey, entityKey, [entity])
        : { request_status: "ERROR", display_message: `${id} not found` };
    },
  });
  // Create (POST) and update (PUT) on a collection route echo the items back.
  stub.route({
    host: API_HOST,
    path: /\/(campaigns|adsquads|ads|creatives)$/,
    match: (req) => req.method === "POST" || req.method === "PUT",
    response: (req: WireRequest) => {
      const collection = req.path.split("/").pop()!;
      const { responseKey, entityKey } = COLLECTIONS[collection]!;
      const items = (req.body as Record<string, Record<string, unknown>[]>)[responseKey] ?? [];
      return envelope(
        responseKey,
        entityKey,
        items.map((item, i) => ({ id: `new-${collection}-${i + 1}`, ...item }))
      );
    },
  });
  stub.route({
    method: "DELETE",
    host: API_HOST,
    path: /^\/v1\/(campaigns|adsquads|ads|creatives)\/[^/]+$/,
    response: { request_status: "SUCCESS", request_id: "req-del" },
  });
});

afterEach(() => {
  session.dispose();
  stub.restore();
  vi.useRealTimers();
});

function snapRequests(): WireRequest[] {
  return stub.to(API_HOST);
}

function snapWrites(): WireRequest[] {
  return snapRequests().filter((r) => r.method !== "GET");
}

function onlyWrite(): WireRequest {
  const w = snapWrites();
  expect(w).toHaveLength(1);
  return w[0]!;
}

function trail(): string[] {
  return snapRequests().map((r) => `${r.method} ${r.path}`);
}

function remaining(): number {
  return rateLimiter.getRemainingTokens(session.quotaKey);
}

function reportingRemaining(): number {
  return rateLimiter.getRemainingTokens(session.reportingQuotaKey);
}

/**
 * basis: unverified (code-only). Every Snap call carries the session's access
 * token as `Authorization: Bearer <token>` (snapchat-http-client.ts
 * getHeaders), and `Content-Type: application/json` exactly when a JSON body
 * is sent. No Snap-authored source for the Ads API header was reachable.
 */
function expectSnapJson(req: WireRequest, opts: { body: boolean }) {
  expect(req.host).toBe(API_HOST);
  expect(req.headers["authorization"]).toBe(`Bearer ${TEST_SNAPCHAT_TOKEN}`);
  if (opts.body) expect(req.headers["content-type"]).toBe("application/json");
  else {
    expect(req.headers["content-type"]).toBeUndefined();
    expect(req.body).toBeUndefined();
  }
}

/** The merged full object the update path PUTs: the entity as read, the patch over it. */
function merged(id: string, patch: Record<string, unknown>) {
  return { ...store.get(id)!, ...patch, id };
}

// ─── snapchat_create_entity ─────────────────────────────────────────────────

describe("snapchat_create_entity → one POST to the parent collection", () => {
  it("campaign → POST /v1/adaccounts/{id}/campaigns { campaigns: [data + ad_account_id] }", async () => {
    const data = {
      name: "Summer Sale",
      status: "PAUSED",
      start_time: "2026-11-01T00:00:00.000Z",
      objective_v2_properties: { objective_v2_type: "TRAFFIC" },
      daily_budget_micro: 10_000_000,
    };
    const out = await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "campaign", adAccountId: ACCOUNT, data }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: unverified (code-only) — the route, the POST method and the
    // `{ campaigns: [...] }` wrapper (entity-mapping.ts createPath,
    // SnapchatService.createEntity).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/v1/adaccounts/${ACCOUNT}/campaigns`);
    expectSnapJson(req, { body: true });
    // basis: fact snapchat.campaign_objective_v2
    // (https://developers.snap.com/api/marketing-api/Ads-API/campaigns) —
    // campaign create takes `objective_v2_properties` ({ objective_v2_type:
    // ... TRAFFIC ... }), which replaces the legacy `objective`; nothing here
    // adds `objective`. The other fields and the injected `ad_account_id`:
    // unverified (code-only).
    expect(req.body).toEqual({ campaigns: [{ ...data, ad_account_id: ACCOUNT }] });
    expect(req.body).not.toHaveProperty("campaigns.0.objective");
    expect(trail()).toEqual([`POST /v1/adaccounts/${ACCOUNT}/campaigns`]);
    expect(out.entity).toMatchObject({ id: "new-campaigns-1", name: "Summer Sale" });
    expect(remaining()).toBe(LIMIT - 3); // one write
  });

  it("adGroup → reads the parent campaign, then POST /v1/campaigns/{id}/adsquads", async () => {
    const data = {
      name: "US 25-44",
      status: "PAUSED",
      type: "SNAP_ADS",
      placement_v2: { config: "AUTOMATIC", platforms: ["SNAPCHAT"] },
      billing_event: "IMPRESSION",
      bid_strategy: "LOWEST_COST_WITH_MAX_BID",
      bid_micro: 1_000_000,
      daily_budget_micro: 5_000_000,
      optimization_goal: "IMPRESSIONS",
      targeting: { geos: [{ country_code: "us" }] },
      start_time: "2026-11-01T00:00:00.000Z",
    };
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "adGroup",
        adAccountId: ACCOUNT,
        campaignId: CAMP,
        data,
      }),
      ctx,
      sdk
    );

    // The parent read is the bound-account ownership check (GET carries no account).
    expect(trail()).toEqual([`GET /v1/campaigns/${CAMP}`, `POST /v1/campaigns/${CAMP}/adsquads`]);
    expectSnapJson(snapRequests()[0]!, { body: false });
    const req = onlyWrite();
    // basis: unverified (code-only) — route and `{ adsquads: [...] }` wrapper.
    expect(req.url).toBe(`${API}/v1/campaigns/${CAMP}/adsquads`);
    expectSnapJson(req, { body: true });
    // basis: fact snapchat.campaign_objective_v2 — "Ad squads require
    // `placement_v2`; the old `placement` attribute is no longer accepted".
    // The rest of the body and the injected `campaign_id`: unverified (code-only).
    expect(req.body).toEqual({ adsquads: [{ ...data, campaign_id: CAMP }] });
    expect(req.body).not.toHaveProperty("adsquads.0.placement");
    expect(remaining()).toBe(LIMIT - 1 - 3);
  });

  it("ad → walks ad squad → campaign, then POST /v1/adsquads/{id}/ads", async () => {
    const data = { name: "Story ad", creative_id: CREATIVE, type: "SNAP_AD", status: "PAUSED" };
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "ad",
        adAccountId: ACCOUNT,
        adSquadId: SQUAD,
        data,
      }),
      ctx,
      sdk
    );

    expect(trail()).toEqual([
      `GET /v1/adsquads/${SQUAD}`,
      `GET /v1/campaigns/${CAMP}`,
      `POST /v1/adsquads/${SQUAD}/ads`,
    ]);
    const req = onlyWrite();
    // basis: unverified (code-only) — route, wrapper and injected `ad_squad_id`.
    expect(req.url).toBe(`${API}/v1/adsquads/${SQUAD}/ads`);
    expectSnapJson(req, { body: true });
    expect(req.body).toEqual({ ads: [{ ...data, ad_squad_id: SQUAD }] });
    expect(remaining()).toBe(LIMIT - 2 - 3);
  });

  it("creative → POST /v1/adaccounts/{id}/creatives", async () => {
    const data = {
      name: "Hero",
      type: "SNAP_AD",
      brand_name: "Acme",
      headline: "New season",
      top_snap_media_id: "media-1",
    };
    await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "creative", adAccountId: ACCOUNT, data }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: unverified (code-only).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/v1/adaccounts/${ACCOUNT}/creatives`);
    expectSnapJson(req, { body: true });
    expect(req.body).toEqual({ creatives: [{ ...data, ad_account_id: ACCOUNT }] });
    expect(snapRequests()).toHaveLength(1);
    expect(remaining()).toBe(LIMIT - 3);
  });

  it("a body parent that disagrees with the route is refused before anything is sent", async () => {
    await expect(
      createEntityLogic(
        CreateEntityInputSchema.parse({
          entityType: "adGroup",
          adAccountId: ACCOUNT,
          campaignId: CAMP,
          data: { name: "x", campaign_id: CAMP_2 },
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/does not match/);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing", async () => {
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        data: { name: "x", status: "PAUSED" },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });
});

// ─── snapchat_update_entity ─────────────────────────────────────────────────

describe("snapchat_update_entity → read, then a full-object PUT on the parent collection", () => {
  it("campaign → PUT /v1/adaccounts/{id}/campaigns { campaigns: [merged entity] }", async () => {
    const out = await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        entityId: CAMP,
        data: { daily_budget_micro: 75_000_000 },
      }),
      ctx,
      sdk
    );

    // `before` snapshot read, the merge read, then the PUT.
    expect(trail()).toEqual([
      `GET /v1/campaigns/${CAMP}`,
      `GET /v1/campaigns/${CAMP}`,
      `PUT /v1/adaccounts/${ACCOUNT}/campaigns`,
    ]);
    const req = onlyWrite();
    // basis: unverified (code-only) — that Snap updates by PUT on the parent
    // collection with the FULL object (the entity as read, every field
    // included, the patch over it) and accepts the read-only fields
    // (`created_at`, `updated_at`, `delivery_status`) it returned on the read.
    expect(req.url).toBe(`${API}/v1/adaccounts/${ACCOUNT}/campaigns`);
    expectSnapJson(req, { body: true });
    expect(req.body).toEqual({
      campaigns: [merged(CAMP, { daily_budget_micro: 75_000_000 })],
    });
    expect(out.updated).toBe(true);
    expect(remaining()).toBe(LIMIT - 1 - 3 - 1);
  });

  it("adGroup → PUT /v1/campaigns/{campaignId}/adsquads", async () => {
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "adGroup",
        adAccountId: ACCOUNT,
        campaignId: CAMP,
        entityId: SQUAD,
        data: { name: "US 25-54" },
      }),
      ctx,
      sdk
    );
    // The first ad-squad read walks to its campaign; the second finds it memoized.
    expect(trail()).toEqual([
      `GET /v1/adsquads/${SQUAD}`,
      `GET /v1/campaigns/${CAMP}`,
      `GET /v1/adsquads/${SQUAD}`,
      `PUT /v1/campaigns/${CAMP}/adsquads`,
    ]);
    const req = onlyWrite();
    // basis: unverified (code-only).
    expect(req.url).toBe(`${API}/v1/campaigns/${CAMP}/adsquads`);
    expect(req.body).toEqual({ adsquads: [merged(SQUAD, { name: "US 25-54" })] });
    expect(remaining()).toBe(LIMIT - 2 - 3 - 1);
  });

  it("a campaignId that is not the ad squad's own campaign is refused, not PUT to its route", async () => {
    // The create path refuses a route parent that disagrees with the body's
    // (`resolveCreateTarget`); the update route is built from the caller's
    // `campaignId` while the merged body keeps the entity's own `campaign_id`,
    // so the same disagreement must be refused here too.
    await expect(
      updateEntityLogic(
        UpdateEntityInputSchema.parse({
          entityType: "adGroup",
          adAccountId: ACCOUNT,
          campaignId: CAMP_2,
          entityId: SQUAD,
          data: { name: "US 25-54" },
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/campaign_id/);
    expect(snapWrites()).toHaveLength(0);
  });

  it("dry_run reads but sends no PUT", async () => {
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        entityId: CAMP,
        data: { status: "PAUSED" },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(snapWrites()).toHaveLength(0);
    expect(trail()).toEqual([`GET /v1/campaigns/${CAMP}`]);
    expect(remaining()).toBe(LIMIT - 1);
  });
});

// ─── snapchat_delete_entity ─────────────────────────────────────────────────

describe("snapchat_delete_entity → ownership read, then DELETE /v1/{entity}s/{id} per id", () => {
  it("deletes each campaign with its own bodiless DELETE after the confirmation", async () => {
    const out = await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        entityIds: [CAMP, CAMP_2],
      }),
      ctx,
      sdk
    );

    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    // Ids run concurrently, so only each id's own order is fixed.
    for (const id of [CAMP, CAMP_2]) {
      const own = trail().filter((t) => t.endsWith(id));
      expect(own).toEqual([`GET /v1/campaigns/${id}`, `DELETE /v1/campaigns/${id}`]);
    }
    const deletes = snapWrites();
    expect(deletes).toHaveLength(2);
    for (const req of deletes) {
      // basis: unverified (code-only) — DELETE on the entity-specific path, no
      // body, no query (entity-mapping.ts deletePath).
      expect(req.method).toBe("DELETE");
      expect(req.query).toEqual({});
      expectSnapJson(req, { body: false });
    }
    expect(deletes.map((r) => r.url).sort()).toEqual(
      [`${API}/v1/campaigns/${CAMP}`, `${API}/v1/campaigns/${CAMP_2}`].sort()
    );
    expect(out).toMatchObject({ confirmed: true, deleted: true, succeededCount: 2 });
    expect(remaining()).toBe(LIMIT - 2 * (1 + 3));
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    const out = await deleteEntityLogic(
      DeleteEntityInputSchema.parse({ entityType: "ad", adAccountId: ACCOUNT, entityIds: [AD_ID] }),
      ctx,
      sdk
    );
    expect(out.confirmed).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing and asks nothing", async () => {
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        entityIds: [CAMP],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(remaining()).toBe(LIMIT);
  });
});

// ─── snapchat_bulk_update_status ────────────────────────────────────────────

describe("snapchat_bulk_update_status → reads, then ONE collection PUT", () => {
  it("campaigns → PUT /v1/adaccounts/{id}/campaigns with each merged object", async () => {
    const out = await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        entityIds: [CAMP, CAMP_2],
        operationStatus: "PAUSED",
      }),
      ctx,
      sdk
    );

    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(
      snapRequests()
        .filter((r) => r.method === "GET")
        .map((r) => r.path)
        .sort()
    ).toEqual([`/v1/campaigns/${CAMP}`, `/v1/campaigns/${CAMP_2}`].sort());
    const req = onlyWrite();
    // basis: unverified (code-only) — status changes as a full-object PUT of
    // every item on the parent collection, in input order.
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`${API}/v1/adaccounts/${ACCOUNT}/campaigns`);
    expectSnapJson(req, { body: true });
    expect(req.body).toEqual({
      campaigns: [merged(CAMP, { status: "PAUSED" }), merged(CAMP_2, { status: "PAUSED" })],
    });
    expect(out).toMatchObject({ confirmed: true, successCount: 2, failureCount: 0 });
    expect(remaining()).toBe(LIMIT - 3 - 2);
  });

  it("ads → PUT /v1/adsquads/{adSquadId}/ads", async () => {
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "ad",
        adAccountId: ACCOUNT,
        adSquadId: SQUAD,
        entityIds: [AD_ID],
        operationStatus: "ACTIVE",
      }),
      ctx,
      sdk
    );
    expect(trail()).toEqual([
      `GET /v1/ads/${AD_ID}`,
      `GET /v1/adsquads/${SQUAD}`,
      `GET /v1/campaigns/${CAMP}`,
      `PUT /v1/adsquads/${SQUAD}/ads`,
    ]);
    // basis: unverified (code-only).
    expect(onlyWrite().body).toEqual({ ads: [merged(AD_ID, { status: "ACTIVE" })] });
    expect(remaining()).toBe(LIMIT - 3 - 3);
  });

  it("an adSquadId that is not the ad's own squad is refused before the PUT", async () => {
    await expect(
      bulkUpdateStatusLogic(
        BulkUpdateStatusInputSchema.parse({
          entityType: "ad",
          adAccountId: ACCOUNT,
          adSquadId: "5e7f0a1b-0000-4000-8000-0000000000a9",
          entityIds: [AD_ID],
          operationStatus: "PAUSED",
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/ad_squad_id/);
    expect(snapWrites()).toHaveLength(0);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    const out = await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        entityIds: [CAMP],
        operationStatus: "PAUSED",
      }),
      ctx,
      sdk
    );
    expect(out.confirmed).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing and asks nothing", async () => {
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        entityIds: [CAMP],
        operationStatus: "PAUSED",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(remaining()).toBe(LIMIT);
  });
});

// ─── snapchat_bulk_update_entities ──────────────────────────────────────────

describe("snapchat_bulk_update_entities → reads, then ONE collection PUT", () => {
  it("a budget change asks first, then PUTs every merged object", async () => {
    const out = await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        items: [
          { entityId: CAMP, data: { daily_budget_micro: 60_000_000 } },
          { entityId: CAMP_2, data: { name: "Winter v2" } },
        ],
      }),
      ctx,
      sdk
    );

    // `daily_budget_micro` is a sensitive field: the batch is confirmed first.
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    const req = onlyWrite();
    // basis: unverified (code-only).
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`${API}/v1/adaccounts/${ACCOUNT}/campaigns`);
    expectSnapJson(req, { body: true });
    expect(req.body).toEqual({
      campaigns: [
        merged(CAMP, { daily_budget_micro: 60_000_000 }),
        merged(CAMP_2, { name: "Winter v2" }),
      ],
    });
    expect(out).toMatchObject({ confirmed: true, successCount: 2 });
    expect(remaining()).toBe(LIMIT - 3 - 2);
  });

  it("a small non-sensitive batch is sent without a prompt", async () => {
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        items: [{ entityId: CAMP, data: { name: "Autumn v2" } }],
      }),
      ctx,
      sdk
    );
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(onlyWrite().body).toEqual({ campaigns: [merged(CAMP, { name: "Autumn v2" })] });
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    const out = await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        items: [{ entityId: CAMP, data: { daily_budget_micro: 1_000_000 } }],
      }),
      ctx,
      sdk
    );
    expect(out.confirmed).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing and asks nothing", async () => {
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        items: [{ entityId: CAMP, data: { daily_budget_micro: 1_000_000 } }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(remaining()).toBe(LIMIT);
  });
});

// ─── snapchat_bulk_create_entities ──────────────────────────────────────────

describe("snapchat_bulk_create_entities → ONE POST carrying every item", () => {
  it("campaigns → POST /v1/adaccounts/{id}/campaigns; per-item results follow input order", async () => {
    stub.route({
      method: "POST",
      host: API_HOST,
      path: `/v1/adaccounts/${ACCOUNT}/campaigns`,
      // A partial failure: Snap reports per item (`sub_request_status`).
      response: {
        request_status: "PARTIAL",
        campaigns: [
          { sub_request_status: "SUCCESS", campaign: { id: "new-1", name: "A" } },
          {
            sub_request_status: "ERROR",
            sub_request_error_reason: "budget too low",
            sub_request_error_message: "daily_budget_micro below minimum",
          },
        ],
      },
    });
    const items = [
      {
        name: "A",
        status: "PAUSED",
        start_time: "2026-11-01T00:00:00.000Z",
        objective_v2_properties: { objective_v2_type: "SALES" },
        daily_budget_micro: 20_000_000,
      },
      {
        name: "B",
        status: "PAUSED",
        start_time: "2026-11-01T00:00:00.000Z",
        objective_v2_properties: { objective_v2_type: "AWARENESS_AND_ENGAGEMENT" },
        daily_budget_micro: 1,
      },
    ];
    const out = await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({ entityType: "campaign", adAccountId: ACCOUNT, items }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: unverified (code-only) — one POST with every item in the
    // collection wrapper, each given the route's `ad_account_id`.
    // `objective_v2_properties` / its types: fact snapchat.campaign_objective_v2
    // (https://developers.snap.com/api/marketing-api/Ads-API/campaigns).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/v1/adaccounts/${ACCOUNT}/campaigns`);
    expectSnapJson(req, { body: true });
    expect(req.body).toEqual({
      campaigns: items.map((i) => ({ ...i, ad_account_id: ACCOUNT })),
    });
    expect(snapRequests()).toHaveLength(1);
    expect(out.results).toEqual([
      { index: 0, success: true, entity: { id: "new-1", name: "A" }, error: undefined },
      {
        index: 1,
        success: false,
        entity: undefined,
        error: "daily_budget_micro below minimum",
      },
    ]);
    expect(remaining()).toBe(LIMIT - 3);
  });

  it("dry_run sends nothing", async () => {
    await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        items: [{ name: "A" }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });
});

// ─── snapchat_adjust_bids ───────────────────────────────────────────────────

describe("snapchat_adjust_bids → read-modify-write of bid_micro per ad squad", () => {
  it("PUT /v1/campaigns/{campaign_id}/adsquads with bid_micro in micro-currency", async () => {
    const out = await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        adAccountId: ACCOUNT,
        adjustments: [{ adGroupId: SQUAD, bidPrice: 1.5 }],
      }),
      ctx,
      sdk
    );

    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(trail()).toEqual([
      `GET /v1/adsquads/${SQUAD}`,
      `GET /v1/campaigns/${CAMP}`,
      `GET /v1/adsquads/${SQUAD}`,
      // The route's campaign comes from the ad squad's own `campaign_id`.
      `PUT /v1/campaigns/${CAMP}/adsquads`,
    ]);
    const req = onlyWrite();
    // basis: unverified (code-only) — the field `bid_micro` and its
    // micro-currency unit (1.5 → 1_500_000), and the full-object PUT.
    expect(req.url).toBe(`${API}/v1/campaigns/${CAMP}/adsquads`);
    expectSnapJson(req, { body: true });
    expect(req.body).toEqual({ adsquads: [merged(SQUAD, { bid_micro: 1_500_000 })] });
    expect(out.results).toEqual([{ adGroupId: SQUAD, success: true, previousBid: 1, newBid: 1.5 }]);
    expect(remaining()).toBe(LIMIT - 2 - 3 - 1);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    const out = await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        adAccountId: ACCOUNT,
        adjustments: [{ adGroupId: SQUAD, bidPrice: 2 }],
      }),
      ctx,
      sdk
    );
    expect(out.confirmed).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing and asks nothing", async () => {
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        adAccountId: ACCOUNT,
        adjustments: [{ adGroupId: SQUAD, bidPrice: 2 }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(remaining()).toBe(LIMIT);
  });
});

// ─── snapchat_duplicate_entity ──────────────────────────────────────────────

describe("snapchat_duplicate_entity → read the source, POST a copy (no native copy)", () => {
  it("campaign → POST /v1/adaccounts/{id}/campaigns with the source minus system fields", async () => {
    const out = await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        entityId: CAMP,
        options: { name: "Autumn (copy)" },
      }),
      ctx,
      sdk
    );

    expect(trail()).toEqual([
      `GET /v1/campaigns/${CAMP}`,
      `POST /v1/adaccounts/${ACCOUNT}/campaigns`,
    ]);
    const req = onlyWrite();
    // basis: unverified (code-only) — that Snap has no copy endpoint, and
    // which fields the create rejects (`id`, `created_at`, `updated_at`,
    // `delivery_status` are dropped; `ad_account_id` is re-injected from the
    // route). The copy keeps the source's `status` — ACTIVE here, so it would
    // deliver at once; the tool's description states this, unlike gads /
    // pinterest / msads / dv360, which always create the copy paused.
    expect(req.url).toBe(`${API}/v1/adaccounts/${ACCOUNT}/campaigns`);
    expectSnapJson(req, { body: true });
    expect(req.body).toEqual({
      campaigns: [
        {
          name: "Autumn (copy)",
          status: "ACTIVE",
          objective_v2_properties: { objective_v2_type: "TRAFFIC" },
          daily_budget_micro: 50_000_000,
          start_time: "2026-08-02T00:00:00.000Z",
          ad_account_id: ACCOUNT,
        },
      ],
    });
    expect(out.newEntity).toMatchObject({ id: "new-campaigns-1" });
    expect(remaining()).toBe(LIMIT - 1 - 3);
  });

  it("dry_run reads the source but sends no POST", async () => {
    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "campaign",
        adAccountId: ACCOUNT,
        entityId: CAMP,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(snapWrites()).toHaveLength(0);
    expect(trail()).toEqual([`GET /v1/campaigns/${CAMP}`]);
  });
});

// ─── snapchat_submit_report ─────────────────────────────────────────────────

describe("snapchat_submit_report → async stats request (a GET with async=true)", () => {
  const STATS_PATH = `/v1/adaccounts/${ACCOUNT}/stats`;

  beforeEach(() => {
    stub.route({
      method: "GET",
      host: API_HOST,
      path: STATS_PATH,
      response: {
        request_status: "SUCCESS",
        async_stats_reports: [
          { async_stats_report: { report_run_id: "run-42", async_status: "STARTED" } },
        ],
      },
    });
  });

  it("explicit day bounds → GET /v1/adaccounts/{id}/stats with the exact query", async () => {
    const out = await submitReportLogic(
      SubmitReportInputSchema.parse({
        adAccountId: ACCOUNT,
        fields: ["impressions", "swipes", "spend"],
        startTime: "2026-03-01T00:00:00-08:00",
        endTime: "2026-03-02T00:00:00-08:00",
        dimensionType: "CAMPAIGN",
      }),
      ctx,
      sdk
    );

    const reqs = snapRequests();
    expect(reqs).toHaveLength(1);
    const req = reqs[0]!;
    // basis: unverified (code-only) — the path, GET, `async=true`,
    // `async_format=csv`, comma-joined `fields`, `granularity`, and
    // `breakdown=campaign` for the entity level.
    expect(req.method).toBe("GET");
    expect(req.path).toBe(STATS_PATH);
    expectSnapJson(req, { body: false });
    // basis: fact snapchat.stats_day_bounds_account_timezone
    // (https://developers.snap.com/api/marketing-api/Ads-API/measurement) —
    // with DAY granularity `start_time` / `end_time` are required, are the
    // account's daily boundary on the start of an hour, and a one-day query
    // ends at the next midnight (Snap's example: start
    // 2020-01-25T00:00:00-08:00, end 2020-01-26T00:00:00-08:00). Sent verbatim.
    expect(req.query).toEqual({
      async: "true",
      async_format: "csv",
      fields: "impressions,swipes,spend",
      granularity: "DAY",
      start_time: "2026-03-01T00:00:00-08:00",
      end_time: "2026-03-02T00:00:00-08:00",
      breakdown: "campaign",
    });
    // basis: fact snapchat.stats_report_dimension (same source) — insight
    // breakdowns go in `report_dimension`, which replaced `dimension` /
    // `pivots` (sunset 2020-06-20). This tool requests none of them.
    expect(req.query).not.toHaveProperty("report_dimension");
    expect(req.query).not.toHaveProperty("dimension");
    expect(req.query).not.toHaveProperty("pivots");
    expect(out.taskId).toBe("run-42");
    expect(reportingRemaining()).toBe(LIMIT - 1);
    expect(remaining()).toBe(LIMIT);
  });

  it("a datePreset is resolved to local midnights in the ad account's timezone", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    stub.route({
      method: "GET",
      host: API_HOST,
      path: `/v1/adaccounts/${ACCOUNT}`,
      response: {
        request_status: "SUCCESS",
        adaccounts: [
          {
            sub_request_status: "SUCCESS",
            adaccount: { id: ACCOUNT, timezone: "America/Los_Angeles" },
          },
        ],
      },
    });

    await submitReportLogic(
      SubmitReportInputSchema.parse({
        adAccountId: ACCOUNT,
        fields: ["spend"],
        datePreset: "YESTERDAY",
      }),
      ctx,
      sdk
    );

    // basis: unverified (code-only) — the account read that supplies `timezone`.
    expect(trail()).toEqual([`GET /v1/adaccounts/${ACCOUNT}`, `GET ${STATS_PATH}`]);
    const stats = snapRequests()[1]!;
    // basis: fact snapchat.stats_day_bounds_account_timezone — the daily
    // boundary "for the timezone of the Ad Account", ending at the next
    // midnight. 2026-03-09 in Los Angeles is PDT (DST began 2026-03-08), so
    // both bounds carry -07:00.
    expect(stats.query.start_time).toBe("2026-03-09T00:00:00-07:00");
    expect(stats.query.end_time).toBe("2026-03-10T00:00:00-07:00");
    expect(stats.query.granularity).toBe("DAY");
    expect(remaining()).toBe(LIMIT - 1); // the account read
    expect(reportingRemaining()).toBe(LIMIT - 1);
  });

  it("a bound off the start of an hour is refused before anything is sent", async () => {
    // basis: fact snapchat.stats_day_bounds_account_timezone ("on the start of an hour").
    await expect(
      submitReportLogic(
        SubmitReportInputSchema.parse({
          adAccountId: ACCOUNT,
          fields: ["spend"],
          startTime: "2026-03-01T00:30:00-08:00",
          endTime: "2026-03-02T00:00:00-08:00",
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/start of an hour/);
    expect(stub.requests).toHaveLength(0);
    expect(reportingRemaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing", async () => {
    await submitReportLogic(
      SubmitReportInputSchema.parse({
        adAccountId: ACCOUNT,
        fields: ["spend"],
        startTime: "2026-03-01T00:00:00-08:00",
        endTime: "2026-03-02T00:00:00-08:00",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
    expect(reportingRemaining()).toBe(LIMIT);
  });
});

// ─── snapchat_upload_image / snapchat_upload_video ──────────────────────────

describe.each([
  {
    tool: "snapchat_upload_image",
    logic: uploadImageLogic,
    schema: UploadImageInputSchema,
    type: "IMAGE",
    file: "hero.png",
    contentType: "image/png",
  },
  {
    tool: "snapchat_upload_video",
    logic: uploadVideoLogic,
    schema: UploadVideoInputSchema,
    type: "VIDEO",
    file: "spot.mp4",
    contentType: "video/mp4",
  },
])(
  "$tool → create media, upload the binary, poll",
  ({ logic, schema, type, file, contentType }) => {
    const MEDIA_HOST = "cdn.example.com";
    const MEDIA_ID = "media-0001";
    const BYTES = Buffer.from(`fake-${type.toLowerCase()}-bytes`);

    beforeEach(() => {
      stub.route({
        method: "GET",
        host: MEDIA_HOST,
        path: `/${file}`,
        rawBody: BYTES,
        contentType,
      });
      stub.route({
        method: "POST",
        host: API_HOST,
        path: `/v1/adaccounts/${ACCOUNT}/media`,
        response: {
          request_status: "SUCCESS",
          media: [
            {
              sub_request_status: "SUCCESS",
              media: { id: MEDIA_ID, media_status: "PENDING_UPLOAD" },
            },
          ],
        },
      });
      stub.route({
        method: "POST",
        host: API_HOST,
        path: `/v1/media/${MEDIA_ID}/upload`,
        response: { request_status: "SUCCESS" },
      });
      stub.route({
        method: "GET",
        host: API_HOST,
        path: `/v1/media/${MEDIA_ID}`,
        response: {
          request_status: "SUCCESS",
          media: [
            { sub_request_status: "SUCCESS", media: { id: MEDIA_ID, media_status: "READY" } },
          ],
        },
      });
    });

    it("sends the three Snap calls in order with the token on each", async () => {
      const out = await logic(
        schema.parse({
          adAccountId: ACCOUNT,
          mediaUrl: `https://${MEDIA_HOST}/${file}`,
          name: "Hero",
        }),
        ctx,
        sdk
      );

      expect(stub.requests.map((r) => `${r.method} ${r.host}${r.path}`)).toEqual([
        `GET ${MEDIA_HOST}/${file}`,
        `POST ${API_HOST}/v1/adaccounts/${ACCOUNT}/media`,
        `POST ${API_HOST}/v1/media/${MEDIA_ID}/upload`,
        `GET ${API_HOST}/v1/media/${MEDIA_ID}`,
      ]);
      const [download, create, upload, poll] = stub.requests;

      // The source download is not a Snap call: it must not carry the Snap token.
      expect(download!.headers["authorization"]).toBeUndefined();

      // Step 1 — basis: unverified (code-only): POST the media entity with
      // { media: [{ name, type, ad_account_id }] }.
      expect(create!.url).toBe(`${API}/v1/adaccounts/${ACCOUNT}/media`);
      expectSnapJson(create!, { body: true });
      expect(create!.body).toEqual({ media: [{ name: "Hero", type, ad_account_id: ACCOUNT }] });

      // Step 2 — basis: unverified (code-only): the bytes as multipart field
      // `file` (with the source's filename and content type), no other fields.
      expect(upload!.url).toBe(`${API}/v1/media/${MEDIA_ID}/upload`);
      expect(upload!.headers["authorization"]).toBe(`Bearer ${TEST_SNAPCHAT_TOKEN}`);
      const boundary = /^multipart\/form-data; boundary=(.+)$/.exec(
        upload!.headers["content-type"] ?? ""
      )?.[1];
      expect(boundary).toBeTruthy();
      expect(
        upload!.rawBody?.equals(
          Buffer.concat([
            Buffer.from(
              `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="file"; filename="${file}"\r\n` +
                `Content-Type: ${contentType}\r\n\r\n`
            ),
            BYTES,
            Buffer.from(`\r\n--${boundary}--\r\n`),
          ])
        )
      ).toBe(true);

      // Step 3 — basis: unverified (code-only): poll GET /v1/media/{id} until
      // `media_status` is READY.
      expect(poll!.url).toBe(`${API}/v1/media/${MEDIA_ID}`);
      expectSnapJson(poll!, { body: false });

      expect(out).toMatchObject({ mediaId: MEDIA_ID, mediaStatus: "READY" });
      // Two writes and one read; the download draws nothing.
      expect(remaining()).toBe(LIMIT - 3 - 3 - 1);
    });

    it("dry_run downloads, creates and uploads nothing", async () => {
      await logic(
        schema.parse({
          adAccountId: ACCOUNT,
          mediaUrl: `https://${MEDIA_HOST}/${file}`,
          dry_run: true,
        }),
        ctx,
        sdk
      );
      expect(stub.requests).toHaveLength(0);
      expect(remaining()).toBe(LIMIT);
    });
  }
);
