// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-request assertions for every linkedin-mcp write tool (#236). Each test
 * calls the REAL tool logic over REAL session services (LinkedInService,
 * LinkedInHttpClient, the access-token adapter and the package's real
 * module-level `RateLimiter`), with only `globalThis.fetch` stubbed, and
 * asserts the full request: HTTP method, URL (+ the verbatim Rest.li 2.0 query
 * string), the Rest.li / versioning headers and the exact body.
 *
 * NOTHING HERE HAS BEEN EXERCISED AGAINST LINKEDIN. learn.microsoft.com and
 * api.linkedin.com are unreachable from this repo's egress, so these are the
 * only LinkedIn-authored sources available (fetched 2026-10-01):
 *
 *   [js]    linkedin-developers/linkedin-api-js-client
 *           commit e4a1fae1f829b370a339477a071d8affe0f6fd3b — LinkedIn's
 *           official Rest.li client: `lib/utils/api-utils.ts`
 *           (`getRestliRequestHeaders`, `buildRestliUrl`), `lib/restli-client.ts`
 *           (`create`, `partialUpdate`, `delete`, `action`),
 *           `lib/utils/constants.ts`, the request/response fixtures in
 *           `tests/restli-client.test.ts`, and `examples/crud-ad-accounts.ts`.
 *   [py]    linkedin-developers/linkedin-api-python-client
 *           commit 6331e52f5ea59b326447efa67a9bf925ed2d9ec7 —
 *           `linkedin_api/clients/restli/utils/api.py`
 *           (`get_restli_request_headers`), `tests/clients/restli/client_test.py`
 *           (`checked_headers`, CREATE / PARTIAL_UPDATE fixtures) and the
 *           README `action` example.
 *   [restli] linkedin/rest.li commit 8173ce2d3eb0a997f0c24df136134486fb4c3cd3 —
 *           LinkedIn's Rest.li framework: `restli-server/src/main/java/com/
 *           linkedin/restli/internal/server/RestLiRouter.java`
 *           (`setupResourceMethodLookup`, the routing table) and
 *           `ResourceMethodMatchKey.java` (upper-cases the method header).
 *
 * What those sources DO pin: the Rest.li method → HTTP method / header / body
 * mapping (CREATE = POST to the collection; PARTIAL_UPDATE = POST to the
 * entity with body `{ patch: { $set } }`; DELETE = DELETE on the entity;
 * ACTION = POST with `?action=<name>` and the params as the body), the header
 * names and values (`Authorization: Bearer`, `X-RestLi-Protocol-Version:
 * 2.0.0`, `LinkedIn-Version`), path-key encoding, and the CREATE response
 * shape (201, no body, id in `x-restli-id`).
 *
 * What they do NOT pin: which LinkedIn resource paths exist at version
 * `mcpConfig.linkedinApiVersion` (the account-scoped `/rest/adAccounts/{id}/…`
 * collections and the legacy `/v2/` item paths are platform-facts
 * `linkedin.*` claims, all `unverified`), and any entity field model. The
 * official clients' own ads examples (README, versions 202209/202210) address
 * `/adCampaignGroups` UN-nested — they predate the claimed move under
 * `/adAccounts/{id}` and neither confirm nor refute it. Everything in that
 * class is marked `basis: unverified (code-only)`.
 *
 * The official clients send `X-RestLi-Method` on every request; this server
 * sends it only for PARTIAL_UPDATE. Per [restli] RestLiRouter's routing table
 * the header is optional for the other three (rows with an empty RMETHOD), so
 * the requests below still route — the absence is asserted, not treated as a
 * defect. Likewise the official clients send `LinkedIn-Version` only to the
 * versioned `/rest` base (`buildRestliUrl`); this server also sends it on its
 * legacy `/v2/` calls (#210 staging), which no source covers.
 *
 * Rate limiting: one process-wide key, `linkedin:default`
 * (`bulk-capacity.ts LINKEDIN_ENTITY_KEY`): an entity read draws 1 token and
 * every create / partial update / delete 3 (`linkedin-service.ts`). Default
 * limit `mcpConfig.linkedinRateLimitPerMinute` (10/min) — each test stays
 * within one window.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JsonRpcErrorCode } from "@cesteral/shared";
import { mcpConfig } from "../../src/config/index.js";
import { LINKEDIN_ENTITY_KEY } from "../../src/mcp-server/tools/utils/bulk-capacity.js";
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
  API_VERSION,
  TEST_ACCESS_TOKEN,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/wire.js";

const LIMIT = mcpConfig.linkedinRateLimitPerMinute;
const ctx = { requestId: "wire-req" } as any;

const ACCOUNT_ID = "507404993";
const ACCOUNT_URN = `urn:li:sponsoredAccount:${ACCOUNT_ID}`;
const GROUP_URN = "urn:li:sponsoredCampaignGroup:600000001";
const CAMPAIGN_URN = "urn:li:sponsoredCampaign:700000001";
const CAMPAIGN_URN_2 = "urn:li:sponsoredCampaign:700000002";

/**
 * basis: [js] `buildRestliUrl` encodes every path key with `encode`, which
 * percent-escapes the Rest.li reserved `:` — a URN key becomes
 * `urn%3Ali%3A…` (cf. the [js] batch-delete fixture
 * `ids=List(urn%3Ali%3Amember%3A123,…)`).
 */
const enc = (urn: string) => urn.replace(/:/g, "%3A");

let stub: FetchStub;
let session: WireSession;
let sdk: ReturnType<typeof acceptingSdkContext>;

beforeEach(() => {
  stub = installFetchStub();
  session = createWireSession("linkedin-wire-236");
  sdk = acceptingSdkContext(session.sessionId);
});

afterEach(() => {
  session.dispose();
  stub.restore();
});

function apiRequests(): WireRequest[] {
  return stub.to(API_HOST);
}

function writes(): WireRequest[] {
  return apiRequests().filter((r) => r.method !== "GET");
}

function onlyWrite(): WireRequest {
  const w = writes();
  expect(w).toHaveLength(1);
  return w[0]!;
}

function remaining(): number {
  return rateLimiter.getRemainingTokens(LINKEDIN_ENTITY_KEY);
}

/**
 * basis: [js] `getRestliRequestHeaders` / [py] `get_restli_request_headers`:
 * `Authorization: Bearer <token>`, `X-RestLi-Protocol-Version: 2.0.0`,
 * `LinkedIn-Version: <YYYYMM>` (the value from config — platform-facts
 * `linkedin.api_version`, unverified), `Content-Type: application/json` on a
 * JSON body. Header names are case-insensitive (fetch lower-cases them).
 */
function expectRestliHeaders(req: WireRequest, opts: { json: boolean; method?: string }) {
  expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  expect(req.headers["x-restli-protocol-version"]).toBe("2.0.0");
  expect(req.headers["linkedin-version"]).toBe(API_VERSION);
  if (opts.json) expect(req.headers["content-type"]).toBe("application/json");
  else expect(req.headers["content-type"]).toBeUndefined();
  // basis: [restli] RestLiRouter.setupResourceMethodLookup — POST on a
  // collection with no RMETHOD routes to CREATE, POST + `action` to ACTION,
  // DELETE on an entity to DELETE; ResourceMethodMatchKey upper-cases the
  // header, so [py]'s "PARTIAL_UPDATE" and [js]'s "partial_update" are one value.
  expect(req.headers["x-restli-method"]).toBe(opts.method);
}

/** basis: [js] tests/restli-client.test.ts CREATE fixture — `data: null, status: 201,
 * headers: { 'x-restli-id': 123 }`; [py] client_test.py CREATE — `"json": None,
 * "status": 201, "headers": {"x-restli-id": "123"}`. */
function createdRoute(path: string, id: string) {
  stub.route({ method: "POST", path, status: 201, rawBody: "", headers: { "x-restli-id": id } });
}

/** basis: [js] PARTIAL_UPDATE and DELETE fixtures answer `status: 204` with no body. */
function noContentRoute(method: string, path: string) {
  stub.route({ method, path, status: 204 });
}

const campaignEntity = (urn: string, extra: Record<string, unknown> = {}) => ({
  id: Number(urn.split(":").pop()),
  account: ACCOUNT_URN,
  campaignGroup: GROUP_URN,
  name: "Autumn",
  status: "PAUSED",
  type: "SPONSORED_UPDATES",
  dailyBudget: { amount: "50.00", currencyCode: "USD" },
  ...extra,
});

describe("linkedin_create_entity → Rest.li CREATE", () => {
  const campaign = {
    name: "Autumn",
    account: ACCOUNT_URN,
    campaignGroup: GROUP_URN,
    type: "SPONSORED_UPDATES",
    objectiveType: "BRAND_AWARENESS",
    status: "DRAFT",
    dailyBudget: { amount: "50.00", currencyCode: "USD" },
    bidType: "CPM",
    unitCost: { amount: "10.00", currencyCode: "USD" },
  };

  it("campaign → POST /rest/adAccounts/{id}/adCampaigns; the 201's x-restli-id is the new id", async () => {
    createdRoute(`/rest/adAccounts/${ACCOUNT_ID}/adCampaigns`, "700000009");

    const out = await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "campaign", data: campaign }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: [js] restli-client.ts `create` — POST to the collection URL, the
    // entity as the JSON body, X-RestLi-Method create (optional, see header).
    // basis: unverified (code-only) — the account-scoped collection
    // /rest/adAccounts/{numeric id}/adCampaigns is platform-facts
    // linkedin.campaigns_are_account_scoped; the payload fields are the
    // caller's `data`, passed through unchanged.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API_BASE_URL}/rest/adAccounts/${ACCOUNT_ID}/adCampaigns`);
    expectRestliHeaders(req, { json: true });
    expect(req.body).toEqual(campaign);
    // basis: [js] restli-utils.ts getCreatedEntityId — the created id is the
    // `x-restli-id` response header; [py] restli.py reads the same header.
    expect(out.entity).toEqual({ id: "700000009" });
    expect(apiRequests()).toHaveLength(1);
    expect(remaining()).toBe(LIMIT - 3);
  });

  it("campaignGroup → POST /rest/adAccounts/{id}/adCampaignGroups", async () => {
    createdRoute(`/rest/adAccounts/${ACCOUNT_ID}/adCampaignGroups`, "600000009");
    const data = {
      name: "Q4",
      account: ACCOUNT_URN,
      status: "DRAFT",
      totalBudget: { amount: "5000.00", currencyCode: "USD" },
      runSchedule: { start: 1790000000000, end: 1795000000000 },
    };
    const out = await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "campaignGroup", data }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: unverified (code-only) — platform-facts
    // linkedin.campaign_groups_are_account_scoped. The [js] README batchCreate
    // example (version 202209) posts campaign groups to /adCampaignGroups
    // un-nested, with `account` in each entity as here.
    expect(req.url).toBe(`${API_BASE_URL}/rest/adAccounts/${ACCOUNT_ID}/adCampaignGroups`);
    expectRestliHeaders(req, { json: true });
    expect(req.body).toEqual(data);
    expect(out.entity).toEqual({ id: "600000009" });
  });

  it("creative → POST /v2/adCreatives (legacy, not migrated), id decoded from x-restli-id", async () => {
    // basis: [py] client_test.py CREATE "complex entity id" — x-restli-id
    // carries a reduced-encoded URN (`urn%3Ali%3Aapp%3A123`).
    createdRoute("/v2/adCreatives", "urn%3Ali%3AsponsoredCreative%3A800000009");
    const data = {
      campaign: CAMPAIGN_URN,
      status: "ACTIVE",
      reference: "urn:li:share:123",
    };
    const out = await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "creative", data }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: unverified (code-only) — platform-facts
    // linkedin.creatives_need_schema_rewrite: creatives stay on /v2/adCreatives.
    expect(req.url).toBe(`${API_BASE_URL}/v2/adCreatives`);
    expectRestliHeaders(req, { json: true });
    expect(req.body).toEqual(data);
    expect(out.entity).toEqual({ id: "urn:li:sponsoredCreative:800000009" });
  });

  it("conversionRule → POST /v2/conversions (legacy, not migrated)", async () => {
    createdRoute("/v2/conversions", "900000009");
    const data = { name: "Signup", type: "LEAD", account: ACCOUNT_URN, status: "ACTIVE" };
    await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "conversionRule", data }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: unverified (code-only) — entity-mapping.ts: /rest/conversions is
    // unconfirmed (#210), so conversions stay on /v2/conversions.
    expect(req.url).toBe(`${API_BASE_URL}/v2/conversions`);
    expect(req.body).toEqual(data);
  });

  it("a campaign payload with no account is refused before any request", async () => {
    const { account: _omit, ...noAccount } = campaign;
    await expect(
      createEntityLogic(
        CreateEntityInputSchema.parse({ entityType: "campaign", data: noAccount }),
        ctx,
        sdk
      )
    ).rejects.toMatchObject({ code: JsonRpcErrorCode.InvalidParams });
    expect(stub.requests).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "campaign", data: campaign, dry_run: true }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });
});

describe("linkedin_update_entity → Rest.li PARTIAL_UPDATE", () => {
  it("campaign → GET pre-state, POST {patch:{$set}} with X-Restli-Method PARTIAL_UPDATE, GET post-state", async () => {
    const item = `/v2/adCampaigns/${enc(CAMPAIGN_URN)}`;
    stub.route({ method: "GET", path: item, response: campaignEntity(CAMPAIGN_URN) });
    noContentRoute("POST", item);

    const out = await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "campaign",
        entityUrn: CAMPAIGN_URN,
        data: { status: "ACTIVE", dailyBudget: { amount: "75.00", currencyCode: "USD" } },
      }),
      ctx,
      sdk
    );

    // basis: unverified (code-only) — the pre-read and the post-read fallback
    // (a 204 partial update returns no entity) are this server's snapshot
    // capture, not a LinkedIn requirement.
    expect(apiRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET ${item}`,
      `POST ${item}`,
      `GET ${item}`,
    ]);
    const req = onlyWrite();
    // basis: [js] restli-client.ts `partialUpdate` with `patchSetObject` —
    // POST to the entity URL, body `{ patch: { $set: patchSetObject } }`
    // (fixture "Partial update using patchSetObject"); [py] client_test.py
    // PARTIAL_UPDATE checks `X-RestLi-Method: PARTIAL_UPDATE` and the same body;
    // [js] constants.ts RESTLI_METHOD_TO_HTTP_METHOD_MAP PARTIAL_UPDATE → POST.
    // basis: unverified (code-only) — the legacy /v2/adCampaigns/{urn} item
    // path: linkedin-service.ts entityItemPath keeps /v2/ for get/update/delete
    // because a URN does not carry its account (#210).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API_BASE_URL}${item}`);
    expect(req.rawQuery).toBe("");
    expectRestliHeaders(req, { json: true, method: "PARTIAL_UPDATE" });
    expect(req.body).toEqual({
      patch: {
        $set: { status: "ACTIVE", dailyBudget: { amount: "75.00", currencyCode: "USD" } },
      },
    });
    expect(out.success).toBe(true);
    expect(remaining()).toBe(LIMIT - 1 - 3 - 1);
  });

  it("adAccount → POST /rest/adAccounts/{numeric id} (versioned item path)", async () => {
    noContentRoute("POST", `/rest/adAccounts/${ACCOUNT_ID}`);
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "adAccount",
        entityUrn: ACCOUNT_URN,
        data: { name: "Renamed" },
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: [js] examples/crud-ad-accounts.ts — partialUpdate on
    // `/adAccounts/{id}` with pathKeys `{ id }` (the numeric id) and
    // `patchSetObject: { name }`, versioned (so the /rest base).
    expect(req.url).toBe(`${API_BASE_URL}/rest/adAccounts/${ACCOUNT_ID}`);
    expectRestliHeaders(req, { json: true, method: "PARTIAL_UPDATE" });
    expect(req.body).toEqual({ patch: { $set: { name: "Renamed" } } });
    // Out of canonical snapshot scope: no pre/post read.
    expect(apiRequests()).toHaveLength(1);
    expect(remaining()).toBe(LIMIT - 3);
  });

  it("campaignGroup → POST /v2/adCampaignGroups/{urn}", async () => {
    const item = `/v2/adCampaignGroups/${enc(GROUP_URN)}`;
    noContentRoute("POST", item);
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "campaignGroup",
        entityUrn: GROUP_URN,
        data: { status: "PAUSED" },
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: unverified (code-only) — legacy /v2/ item path (#210).
    expect(req.url).toBe(`${API_BASE_URL}${item}`);
    expect(req.body).toEqual({ patch: { $set: { status: "PAUSED" } } });
  });

  it("dry_run reads the entity and writes nothing", async () => {
    const item = `/v2/adCampaigns/${enc(CAMPAIGN_URN)}`;
    stub.route({ method: "GET", path: item, response: campaignEntity(CAMPAIGN_URN) });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "campaign",
        entityUrn: CAMPAIGN_URN,
        data: { status: "ACTIVE" },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(0);
    expect(remaining()).toBe(LIMIT - 1);
  });
});

describe("linkedin_delete_entity → Rest.li DELETE", () => {
  it("campaign → confirm, GET pre-state, DELETE /v2/adCampaigns/{urn} with no body", async () => {
    const item = `/v2/adCampaigns/${enc(CAMPAIGN_URN)}`;
    stub.route({
      method: "GET",
      path: item,
      response: campaignEntity(CAMPAIGN_URN, { status: "DRAFT" }),
    });
    noContentRoute("DELETE", item);

    const out = await deleteEntityLogic(
      DeleteEntityInputSchema.parse({ entityType: "campaign", entityUrn: CAMPAIGN_URN }),
      ctx,
      sdk
    );

    expect(apiRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET ${item}`,
      `DELETE ${item}`,
    ]);
    const req = onlyWrite();
    // basis: [js] restli-client.ts `delete` — HTTP DELETE on the entity URL,
    // no body (fixture "Delete on a collection resource": path
    // /testResource/123, status 204); [js] constants.ts DELETE → DELETE.
    // basis: unverified (code-only) — legacy /v2/ item path (#210).
    expect(req.method).toBe("DELETE");
    expect(req.url).toBe(`${API_BASE_URL}${item}`);
    expectRestliHeaders(req, { json: false });
    expect(req.rawBody).toBeUndefined();
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(out.confirmed).toBe(true);
    expect(remaining()).toBe(LIMIT - 1 - 3);
  });

  it("creative → DELETE /v2/adCreatives/{urn} (no pre-read: out of snapshot scope)", async () => {
    const urn = "urn:li:sponsoredCreative:800000001";
    noContentRoute("DELETE", `/v2/adCreatives/${enc(urn)}`);
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({ entityType: "creative", entityUrn: urn }),
      ctx,
      sdk
    );
    // basis: unverified (code-only) — creatives stay on /v2/adCreatives.
    // The pre-delete read is best-effort and runs for every type; for a
    // creative it reads, finds no canonical kind, and moves on.
    expect(onlyWrite().url).toBe(`${API_BASE_URL}/v2/adCreatives/${enc(urn)}`);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    const out = await deleteEntityLogic(
      DeleteEntityInputSchema.parse({ entityType: "campaign", entityUrn: CAMPAIGN_URN }),
      ctx,
      sdk
    );
    expect(out.confirmed).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run reads, does not prompt, and deletes nothing", async () => {
    const item = `/v2/adCampaigns/${enc(CAMPAIGN_URN)}`;
    stub.route({ method: "GET", path: item, response: campaignEntity(CAMPAIGN_URN) });
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        entityUrn: CAMPAIGN_URN,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });
});

/** Writes sorted by path — bulk items run concurrently (executeBulkConcurrent). */
function sortedWrites(): WireRequest[] {
  return [...writes()].sort((a, b) => a.path.localeCompare(b.path));
}

describe("linkedin_bulk_update_status → one PARTIAL_UPDATE per entity", () => {
  it("2 campaigns PAUSED → 2 POSTs of {patch:{$set:{status}}}", async () => {
    for (const urn of [CAMPAIGN_URN, CAMPAIGN_URN_2]) {
      noContentRoute("POST", `/v2/adCampaigns/${enc(urn)}`);
    }
    const out = await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        entityUrns: [CAMPAIGN_URN, CAMPAIGN_URN_2],
        status: "PAUSED",
      }),
      ctx,
      sdk
    );
    const reqs = sortedWrites();
    expect(reqs).toHaveLength(2);
    // basis: [js] `partialUpdate` / [py] PARTIAL_UPDATE (see update_entity).
    // LinkedIn's BATCH_PARTIAL_UPDATE ([js] `batchPartialUpdate`) is not used;
    // each entity gets its own call. basis: unverified (code-only) — /v2/ path.
    expect(reqs.map((r) => r.url)).toEqual([
      `${API_BASE_URL}/v2/adCampaigns/${enc(CAMPAIGN_URN)}`,
      `${API_BASE_URL}/v2/adCampaigns/${enc(CAMPAIGN_URN_2)}`,
    ]);
    for (const req of reqs) {
      expect(req.method).toBe("POST");
      expectRestliHeaders(req, { json: true, method: "PARTIAL_UPDATE" });
      expect(req.body).toEqual({ patch: { $set: { status: "PAUSED" } } });
    }
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(out.successCount).toBe(2);
    expect(apiRequests()).toHaveLength(2);
    expect(remaining()).toBe(LIMIT - 2 * 3);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    const out = await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        entityUrns: [CAMPAIGN_URN],
        status: "ARCHIVED",
      }),
      ctx,
      sdk
    );
    expect(out.confirmed).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing and does not prompt", async () => {
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        entityUrns: [CAMPAIGN_URN],
        status: "PAUSED",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(stub.requests).toHaveLength(0);
  });
});

describe("linkedin_bulk_create_entities → one CREATE per item", () => {
  const item = (name: string) => ({
    name,
    account: ACCOUNT_URN,
    campaignGroup: GROUP_URN,
    type: "SPONSORED_UPDATES",
    objectiveType: "WEBSITE_TRAFFIC",
    status: "DRAFT",
  });

  it("2 campaigns → 2 POSTs to /rest/adAccounts/{id}/adCampaigns", async () => {
    let next = 700000010;
    stub.route({
      method: "POST",
      path: `/rest/adAccounts/${ACCOUNT_ID}/adCampaigns`,
      status: 201,
      rawBody: "",
      get headers() {
        return { "x-restli-id": String(next++) };
      },
    });
    const out = await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({
        entityType: "campaign",
        items: [item("A"), item("B")],
      }),
      ctx,
      sdk
    );
    const reqs = writes();
    expect(reqs).toHaveLength(2);
    // basis: [js] `create` (see create_entity). LinkedIn's BATCH_CREATE
    // ([js] `batchCreate`, body `{ elements: [...] }`) is not used.
    // basis: unverified (code-only) — account-scoped collection path.
    for (const req of reqs) {
      expect(req.method).toBe("POST");
      expect(req.url).toBe(`${API_BASE_URL}/rest/adAccounts/${ACCOUNT_ID}/adCampaigns`);
      expectRestliHeaders(req, { json: true });
    }
    expect(reqs.map((r) => r.body).sort((a: any, b: any) => a.name.localeCompare(b.name))).toEqual([
      item("A"),
      item("B"),
    ]);
    expect(out.successCount).toBe(2);
    expect(out.results.map((r) => r.entity?.id).sort()).toEqual(["700000010", "700000011"]);
    expect(remaining()).toBe(LIMIT - 2 * 3);
  });

  it("an empty item is refused before any request", async () => {
    await expect(
      bulkCreateEntitiesLogic(
        BulkCreateEntitiesInputSchema.parse({ entityType: "campaign", items: [item("A"), {}] }),
        ctx,
        sdk
      )
    ).rejects.toMatchObject({ code: JsonRpcErrorCode.InvalidParams });
    expect(stub.requests).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({
        entityType: "campaign",
        items: [item("A")],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("linkedin_bulk_update_entities → one PARTIAL_UPDATE per item", () => {
  const items = [
    { entityUrn: CAMPAIGN_URN, data: { dailyBudget: { amount: "75.00", currencyCode: "USD" } } },
    { entityUrn: CAMPAIGN_URN_2, data: { dailyBudget: { amount: "90.00", currencyCode: "USD" } } },
  ];

  it("2 campaigns → 2 POSTs, each with its own $set", async () => {
    for (const urn of [CAMPAIGN_URN, CAMPAIGN_URN_2]) {
      noContentRoute("POST", `/v2/adCampaigns/${enc(urn)}`);
    }
    const out = await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({ entityType: "campaign", items }),
      ctx,
      sdk
    );
    const reqs = sortedWrites();
    // basis: [js] `partialUpdate` / [py] PARTIAL_UPDATE (see update_entity).
    // basis: unverified (code-only) — /v2/ item path (#210).
    expect(reqs.map((r) => [r.url, r.body])).toEqual([
      [`${API_BASE_URL}/v2/adCampaigns/${enc(CAMPAIGN_URN)}`, { patch: { $set: items[0]!.data } }],
      [
        `${API_BASE_URL}/v2/adCampaigns/${enc(CAMPAIGN_URN_2)}`,
        { patch: { $set: items[1]!.data } },
      ],
    ]);
    for (const req of reqs) expectRestliHeaders(req, { json: true, method: "PARTIAL_UPDATE" });
    // A budget change is a sensitive field, so even 2 items prompt.
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(out.successCount).toBe(2);
    expect(remaining()).toBe(LIMIT - 2 * 3);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    const out = await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({ entityType: "campaign", items }),
      ctx,
      sdk
    );
    expect(out.confirmed).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing and does not prompt", async () => {
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({ entityType: "campaign", items, dry_run: true }),
      ctx,
      sdk
    );
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(stub.requests).toHaveLength(0);
  });
});

describe("linkedin_adjust_bids → PARTIAL_UPDATE of unitCost", () => {
  const adjustments = [
    { campaignUrn: CAMPAIGN_URN, amount: "8.50", currencyCode: "USD" },
    { campaignUrn: CAMPAIGN_URN_2, amount: "15.00", currencyCode: "USD" },
  ];

  it("2 campaigns → sequential POSTs of {patch:{$set:{unitCost}}}", async () => {
    for (const urn of [CAMPAIGN_URN, CAMPAIGN_URN_2]) {
      noContentRoute("POST", `/v2/adCampaigns/${enc(urn)}`);
    }
    const out = await adjustBidsLogic(
      AdjustBidsInputSchema.parse({ adjustments, reason: "pacing" }),
      ctx,
      sdk
    );
    const reqs = writes();
    // basis: [js] `partialUpdate` / [py] PARTIAL_UPDATE (see update_entity).
    // basis: unverified (code-only) — that a campaign's bid is the
    // `unitCost` field as `{ amount, currencyCode }` (no field model is
    // published in any source here), and the /v2/ item path.
    expect(reqs.map((r) => [r.method, r.url, r.body])).toEqual([
      [
        "POST",
        `${API_BASE_URL}/v2/adCampaigns/${enc(CAMPAIGN_URN)}`,
        { patch: { $set: { unitCost: { amount: "8.50", currencyCode: "USD" } } } },
      ],
      [
        "POST",
        `${API_BASE_URL}/v2/adCampaigns/${enc(CAMPAIGN_URN_2)}`,
        { patch: { $set: { unitCost: { amount: "15.00", currencyCode: "USD" } } } },
      ],
    ]);
    for (const req of reqs) expectRestliHeaders(req, { json: true, method: "PARTIAL_UPDATE" });
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(out.totalSucceeded).toBe(2);
    expect(apiRequests()).toHaveLength(2);
    expect(remaining()).toBe(LIMIT - 2 * 3);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    const out = await adjustBidsLogic(AdjustBidsInputSchema.parse({ adjustments }), ctx, sdk);
    expect(out.confirmed).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing and does not prompt", async () => {
    await adjustBidsLogic(AdjustBidsInputSchema.parse({ adjustments, dry_run: true }), ctx, sdk);
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(stub.requests).toHaveLength(0);
  });
});

describe("linkedin_duplicate_entity → GET source, then CREATE the copy", () => {
  it("campaign → strips read-only fields, renames, forces DRAFT, POSTs to the account's collection", async () => {
    const item = `/v2/adCampaigns/${enc(CAMPAIGN_URN)}`;
    stub.route({
      method: "GET",
      path: item,
      response: campaignEntity(CAMPAIGN_URN, {
        status: "ACTIVE",
        objectiveType: "BRAND_AWARENESS",
        changeAuditStamps: { created: { time: 1 }, lastModified: { time: 2 } },
        version: { versionTag: "3" },
        servingStatuses: ["RUNNABLE"],
        associatedEntity: "urn:li:organization:1",
      }),
    });
    createdRoute(`/rest/adAccounts/${ACCOUNT_ID}/adCampaigns`, "700000099");

    const out = await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({ entityType: "campaign", entityUrn: CAMPAIGN_URN }),
      ctx,
      sdk
    );

    expect(apiRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET ${item}`,
      `POST /rest/adAccounts/${ACCOUNT_ID}/adCampaigns`,
    ]);
    const req = onlyWrite();
    // basis: [js] `create` (see create_entity) — POST, entity as the body.
    // basis: unverified (code-only) — LinkedIn has no copy endpoint in any
    // source here; which fields are read-only (id, changeAuditStamps,
    // version, servingStatuses, associatedEntity, …) and the DRAFT status of
    // the copy are this server's choices, as is the account-scoped path.
    expect(req.url).toBe(`${API_BASE_URL}/rest/adAccounts/${ACCOUNT_ID}/adCampaigns`);
    expectRestliHeaders(req, { json: true });
    expect(req.body).toEqual({
      account: ACCOUNT_URN,
      campaignGroup: GROUP_URN,
      name: "Copy of Autumn",
      status: "DRAFT",
      type: "SPONSORED_UPDATES",
      objectiveType: "BRAND_AWARENESS",
      dailyBudget: { amount: "50.00", currencyCode: "USD" },
    });
    expect(out.newEntity).toEqual({ id: "700000099" });
    expect(remaining()).toBe(LIMIT - 1 - 3);
  });

  it("dry_run reads the source and creates nothing", async () => {
    const item = `/v2/adCampaigns/${enc(CAMPAIGN_URN)}`;
    stub.route({ method: "GET", path: item, response: campaignEntity(CAMPAIGN_URN) });
    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "campaign",
        entityUrn: CAMPAIGN_URN,
        newName: "Winter",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(0);
  });
});

describe("linkedin_upload_image / linkedin_upload_video → registerUpload ACTION + binary PUT", () => {
  const MEDIA_HOST = "cdn.example.com";
  const UPLOAD_URL =
    "https://api.linkedin.com/mediaUpload/C5522AQGTYER3k3ByHQ/feedshare-uploadedImage/0?ca=vector_feedshare";
  const ASSET = "urn:li:digitalmediaAsset:C5522AQGTYER3k3ByHQ";

  const cases = [
    {
      tool: "linkedin_upload_image",
      run: (mediaUrl: string, dry_run = false) =>
        uploadImageLogic(
          UploadImageInputSchema.parse({ adAccountUrn: ACCOUNT_URN, mediaUrl, dry_run }),
          ctx,
          sdk
        ),
      mediaPath: "/banner.png",
      contentType: "image/png",
      recipe: "urn:li:digitalmediaRecipe:ads-image",
    },
    {
      tool: "linkedin_upload_video",
      run: (mediaUrl: string, dry_run = false) =>
        uploadVideoLogic(
          UploadVideoInputSchema.parse({ adAccountUrn: ACCOUNT_URN, mediaUrl, dry_run }),
          ctx,
          sdk
        ),
      mediaPath: "/spot.mp4",
      contentType: "video/mp4",
      recipe: "urn:li:digitalmediaRecipe:ads-video",
    },
  ] as const;

  for (const c of cases) {
    it(`${c.tool}: download, POST /v2/assets?action=registerUpload, PUT the bytes to the uploadUrl`, async () => {
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
      stub.route({
        method: "GET",
        host: MEDIA_HOST,
        path: c.mediaPath,
        rawBody: bytes,
        contentType: c.contentType,
      });
      stub.route({
        method: "POST",
        path: "/v2/assets",
        response: {
          value: {
            uploadMechanism: {
              "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
                uploadUrl: UPLOAD_URL,
                headers: {},
              },
            },
            asset: ASSET,
          },
        },
      });
      stub.route({ method: "PUT", path: new URL(UPLOAD_URL).pathname, status: 201, rawBody: "" });

      const out = await c.run(`https://${MEDIA_HOST}${c.mediaPath}`);

      expect(stub.requests.map((r) => `${r.method} ${r.host}${r.path}`)).toEqual([
        `GET ${MEDIA_HOST}${c.mediaPath}`,
        `POST ${API_HOST}/v2/assets`,
        `PUT ${API_HOST}${new URL(UPLOAD_URL).pathname}`,
      ]);

      const register = stub.requests[1]!;
      // basis: [js] restli-client.ts `action` — POST to the resource with
      // `?action=<actionName>` in the query and the action params as the JSON
      // body (fixture "Action on a non-versioned resource":
      // /testResource?action=doSomething); [restli] RestLiRouter: POST with an
      // `action` param and no RMETHOD routes to ACTION. [py] README `action`
      // example: `/liveAssetActions?action=register` with body
      // `{ registerLiveEventRequest: { owner, recipes: ["urn:li:digitalmediaRecipe:…"] } }`
      // — the same request-wrapper / owner / recipes shape.
      // basis: unverified (code-only) — the `/v2/assets` resource, the
      // `registerUpload` action name, the `ads-image` / `ads-video` recipes and
      // `serviceRelationships`, and the response's `uploadMechanism` /
      // `asset`: no source here documents the Assets API.
      expect(register.url).toBe(`${API_BASE_URL}/v2/assets?action=registerUpload`);
      expect(register.rawQuery).toBe("action=registerUpload");
      expectRestliHeaders(register, { json: true });
      expect(register.body).toEqual({
        registerUploadRequest: {
          owner: ACCOUNT_URN,
          recipes: [c.recipe],
          serviceRelationships: [
            { identifier: "urn:li:userGeneratedContent", relationshipType: "OWNER" },
          ],
        },
      });

      const put = stub.requests[2]!;
      // basis: unverified (code-only) — the binary PUT to the returned
      // uploadUrl with the bearer token, the downloaded Content-Type and the
      // Rest.li / version headers (linkedin-http-client.ts putBinary).
      expect(put.url).toBe(UPLOAD_URL);
      expect(put.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
      expect(put.headers["content-type"]).toBe(c.contentType);
      expect(put.headers["linkedin-version"]).toBe(API_VERSION);
      expect(put.headers["x-restli-protocol-version"]).toBe("2.0.0");
      expect(put.rawBody).toEqual(Buffer.from(bytes));

      expect(out.assetUrn).toBe(ASSET);
      // basis: unverified (code-only) — the register POST goes through
      // `linkedInService.client.post`, which bypasses LinkedInService's
      // limiter, so an upload draws NO token (see the it.todo below).
      expect(remaining()).toBe(LIMIT);
    });

    it(`${c.tool}: dry_run downloads and uploads nothing`, async () => {
      await c.run(`https://${MEDIA_HOST}${c.mediaPath}`, true);
      expect(stub.requests).toHaveLength(0);
    });
  }

  it.todo(
    "linkedin_upload_image / linkedin_upload_video: the registerUpload POST and the binary PUT draw " +
      "no linkedin:default token (they call LinkedInService.client directly), so uploads are invisible " +
      "to the process rate limiter; metering them needs a cost decision no vendor source states"
  );
  it.todo(
    "linkedin_upload_image / linkedin_upload_video: the tool descriptions promise a 3-step " +
      "'register → upload binary → confirm' flow, but no confirm request is ever sent; correcting " +
      "the description changes both definitionHashes"
  );
});
