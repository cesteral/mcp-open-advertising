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
 * `mcpConfig.linkedinApiVersion`, and any entity field model. The item paths
 * (get / update / delete under `/rest/adAccounts/{id}/…`, and
 * `/rest/conversions/{id}?account=`) are read off LinkedIn's own Marketing API
 * pages instead, cited at each test (platform-facts `linkedin.*`, `verified`). The
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
 * every create / partial update / delete, and each media-upload initialize /
 * finalize POST, 3 (`linkedin-service.ts LINKEDIN_WRITE_TOKENS`); the byte PUTs
 * to LinkedIn's upload URLs draw none. Default
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
  listEntitiesLogic,
  ListEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/list-entities.tool.js";
import {
  listAdAccountsLogic,
  ListAdAccountsInputSchema,
} from "../../src/mcp-server/tools/definitions/list-ad-accounts.tool.js";
import { LinkedInAccessTokenAdapter } from "../../src/auth/linkedin-auth-adapter.js";
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
  uploadImageTool,
  UploadImageInputSchema,
} from "../../src/mcp-server/tools/definitions/upload-image.tool.js";
import {
  uploadVideoLogic,
  uploadVideoTool,
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

/**
 * Item paths, all on /rest/ and under the owning account (#210).
 * basis: LinkedIn Campaigns page, "Get a Campaign" / "Update" / "Delete a
 * Campaign": GET, POST (X-RestLi-Method: PARTIAL_UPDATE, `{patch:{$set}}`) and
 * DELETE on /rest/adAccounts/{adAccountId}/adCampaigns/{campaignID}; Campaign
 * Groups page, the same on .../adCampaignGroups/{adCampaignGroupId}; Creatives
 * page, the same on .../creatives/{creative ID} with the URN encoded
 * (`creatives/urn%3Ali%3AsponsoredCreative%3A120491345`). All read from
 * learn.microsoft.com/en-us/linkedin/marketing (li-lms-2026-10) on 2026-11-14.
 * Campaign and group keys are the numeric ids the pages' samples use.
 */
const numericId = (urn: string) => urn.split(":").pop()!;
const campaignItem = (urn: string) =>
  `/rest/adAccounts/${ACCOUNT_ID}/adCampaigns/${numericId(urn)}`;
const groupItem = (urn: string) =>
  `/rest/adAccounts/${ACCOUNT_ID}/adCampaignGroups/${numericId(urn)}`;
const creativeItem = (urn: string) => `/rest/adAccounts/${ACCOUNT_ID}/creatives/${enc(urn)}`;

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

  it("creative → POST /rest/adAccounts/{id}/creatives, the account from adAccountUrn", async () => {
    // basis: [py] client_test.py CREATE "complex entity id" — x-restli-id
    // carries a reduced-encoded URN (`urn%3Ali%3Aapp%3A123`).
    createdRoute(
      `/rest/adAccounts/${ACCOUNT_ID}/creatives`,
      "urn%3Ali%3AsponsoredCreative%3A800000009"
    );
    const data = {
      campaign: CAMPAIGN_URN,
      content: { reference: "urn:li:share:123" },
      intendedStatus: "DRAFT",
      name: "Autumn A",
    };
    const out = await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "creative", adAccountUrn: ACCOUNT_URN, data }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: LinkedIn Creatives page (read 2026-11-14), "Create a Creative":
    // POST /rest/adAccounts/{adAccountId}/creatives with body { content,
    // campaign, intendedStatus } (`account` is read-only, so it is not sent);
    // 201 with the id in x-restli-id, e.g. urn:li:sponsoredCreative:120491345.
    expect(req.url).toBe(`${API_BASE_URL}/rest/adAccounts/${ACCOUNT_ID}/creatives`);
    expectRestliHeaders(req, { json: true });
    expect(req.body).toEqual(data);
    expect(out.entity).toEqual({ id: "urn:li:sponsoredCreative:800000009" });
  });

  it("a creative create without adAccountUrn is refused before any request", () => {
    expect(() =>
      CreateEntityInputSchema.parse({
        entityType: "creative",
        data: { campaign: CAMPAIGN_URN, content: { reference: "urn:li:share:1" } },
      })
    ).toThrow(/adAccountUrn is required/);
    expect(stub.requests).toHaveLength(0);
  });

  it("a creative `status` is refused (its field is intendedStatus)", async () => {
    await expect(
      createEntityLogic(
        CreateEntityInputSchema.parse({
          entityType: "creative",
          adAccountUrn: ACCOUNT_URN,
          data: {
            campaign: CAMPAIGN_URN,
            content: { reference: "urn:li:share:1" },
            status: "DRAFT",
          },
        }),
        ctx,
        sdk
      )
    ).rejects.toMatchObject({ code: JsonRpcErrorCode.InvalidParams });
    expect(stub.requests).toHaveLength(0);
  });

  it("refuses an adAccountUrn that disagrees with a campaign's data.account", async () => {
    await expect(
      createEntityLogic(
        CreateEntityInputSchema.parse({
          entityType: "campaign",
          adAccountUrn: "urn:li:sponsoredAccount:1",
          data: { name: "x", account: ACCOUNT_URN, campaignGroup: GROUP_URN },
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/different ad account/);
    expect(stub.requests).toHaveLength(0);
  });

  it("conversionRule → POST /rest/conversions (account stays in the body)", async () => {
    createdRoute("/rest/conversions", "900000009");
    const data = {
      name: "Signup",
      type: "LEAD",
      account: ACCOUNT_URN,
      conversionMethod: "CONVERSIONS_API",
    };
    await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "conversionRule", data }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: LinkedIn Conversions API page, "Create a conversion rule" (read
    // 2026-11-13): `POST https://api.linkedin.com/rest/conversions` with the
    // ad account URN as the `account` field of the JSON body; 201 with the id in
    // the `x-restli-id` header. The path carries no account.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API_BASE_URL}/rest/conversions`);
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
    const item = campaignItem(CAMPAIGN_URN);
    stub.route({ method: "GET", path: item, response: campaignEntity(CAMPAIGN_URN) });
    noContentRoute("POST", item);

    const out = await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "campaign",
        entityUrn: CAMPAIGN_URN,
        adAccountUrn: ACCOUNT_URN,
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
    // basis: LinkedIn Campaigns page (read 2026-11-14) — partial update is
    // POST /rest/adAccounts/{adAccountId}/adCampaigns/{campaignID} with
    // X-RestLi-Method: PARTIAL_UPDATE and body {"patch":{"$set":{…}}}.
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

  it("campaignGroup → POST /rest/adAccounts/{id}/adCampaignGroups/{numeric id}", async () => {
    const item = groupItem(GROUP_URN);
    noContentRoute("POST", item);
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "campaignGroup",
        entityUrn: GROUP_URN,
        adAccountUrn: ACCOUNT_URN,
        data: { status: "PAUSED" },
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: LinkedIn Campaign Groups page (read 2026-11-14), "To update the
    // status": POST /rest/adAccounts/{adAccountId}/adCampaignGroups/{adCampaignGroupId}
    // with {"patch":{"$set":{"status":…}}}.
    expect(req.url).toBe(`${API_BASE_URL}${item}`);
    expectRestliHeaders(req, { json: true, method: "PARTIAL_UPDATE" });
    expect(req.body).toEqual({ patch: { $set: { status: "PAUSED" } } });
  });

  it("conversionRule → POST /rest/conversions/{id}?account={encoded account URN}", async () => {
    const path = "/rest/conversions/104004";
    noContentRoute("POST", path);
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "conversionRule",
        entityUrn: "urn:lla:llaPartnerConversion:104004",
        adAccountUrn: ACCOUNT_URN,
        data: { name: "Signups" },
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: LinkedIn Conversion Tracking page (read 2026-11-13 and
    // 2026-11-14), "Update a Conversion": POST
    // /rest/conversions/107524?account=urn%3Ali%3AsponsoredAccount%3A519072844
    // with X-RestLi-Method partial_update and {"patch":{"$set":{…}}}. It
    // replaces the legacy /v2/conversions/{urn} item path.
    expect(req.method).toBe("POST");
    expect(req.path).toBe(path);
    expect(req.rawQuery).toBe(`account=${enc(ACCOUNT_URN)}`);
    expectRestliHeaders(req, { json: true, method: "PARTIAL_UPDATE" });
    expect(req.body).toEqual({ patch: { $set: { name: "Signups" } } });
  });

  it("creative → POST /rest/adAccounts/{id}/creatives/{encoded URN} with intendedStatus", async () => {
    const urn = "urn:li:sponsoredCreative:800000001";
    noContentRoute("POST", creativeItem(urn));
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "creative",
        entityUrn: urn,
        adAccountUrn: ACCOUNT_URN,
        data: { intendedStatus: "PAUSED" },
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: LinkedIn Creatives page (read 2026-11-14), "Update a Creative":
    // POST /rest/adAccounts/{adAccountId}/creatives/urn%3Ali%3AsponsoredCreative%3A…
    // with X-RestLi-Method: PARTIAL_UPDATE and {"patch":{"$set":{"intendedStatus":…}}}.
    expect(req.url).toBe(`${API_BASE_URL}${creativeItem(urn)}`);
    expectRestliHeaders(req, { json: true, method: "PARTIAL_UPDATE" });
    expect(req.body).toEqual({ patch: { $set: { intendedStatus: "PAUSED" } } });
  });

  it("a creative `status` is refused before any request (its field is intendedStatus)", async () => {
    await expect(
      updateEntityLogic(
        UpdateEntityInputSchema.parse({
          entityType: "creative",
          entityUrn: "urn:li:sponsoredCreative:800000001",
          adAccountUrn: ACCOUNT_URN,
          data: { status: "PAUSED" },
        }),
        ctx,
        sdk
      )
    ).rejects.toMatchObject({ code: JsonRpcErrorCode.InvalidParams });
    expect(stub.requests).toHaveLength(0);
  });

  it("dry_run reads the entity and writes nothing", async () => {
    const item = campaignItem(CAMPAIGN_URN);
    stub.route({ method: "GET", path: item, response: campaignEntity(CAMPAIGN_URN) });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "campaign",
        entityUrn: CAMPAIGN_URN,
        adAccountUrn: ACCOUNT_URN,
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
  it("campaign → confirm, GET pre-state, DELETE /rest/adAccounts/{id}/adCampaigns/{numeric id} with no body", async () => {
    const item = campaignItem(CAMPAIGN_URN);
    stub.route({
      method: "GET",
      path: item,
      response: campaignEntity(CAMPAIGN_URN, { status: "DRAFT" }),
    });
    noContentRoute("DELETE", item);

    const out = await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        entityUrn: CAMPAIGN_URN,
        adAccountUrn: ACCOUNT_URN,
      }),
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
    // basis: LinkedIn Campaigns page (read 2026-11-14), "Delete a Campaign":
    // DELETE /rest/adAccounts/{adAccountId}/adCampaigns/{campaignID} deletes a
    // DRAFT campaign. X-RestLi-Method: DELETE is sent on every delete: the
    // Creatives page says it "must be included", and [js]/[py] send it too.
    expect(req.method).toBe("DELETE");
    expect(req.url).toBe(`${API_BASE_URL}${item}`);
    expectRestliHeaders(req, { json: false, method: "DELETE" });
    expect(req.rawBody).toBeUndefined();
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(out.confirmed).toBe(true);
    expect(remaining()).toBe(LIMIT - 1 - 3);
  });

  it("creative → DELETE /rest/adAccounts/{id}/creatives/{encoded URN} with X-RestLi-Method DELETE", async () => {
    const urn = "urn:li:sponsoredCreative:800000001";
    noContentRoute("DELETE", creativeItem(urn));
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "creative",
        entityUrn: urn,
        adAccountUrn: ACCOUNT_URN,
      }),
      ctx,
      sdk
    );
    // basis: LinkedIn Creatives page (read 2026-11-14), "Delete a Creative":
    // DELETE /rest/adAccounts/{adAccountId}/creatives/{creative ID}, the ID
    // being the encoded URN, and "The header X-RestLi-Method must be included
    // in the request and set to DELETE".
    // The pre-delete read is best-effort and runs for every type; for a
    // creative it reads, finds no canonical kind, and moves on.
    const req = onlyWrite();
    expect(req.url).toBe(`${API_BASE_URL}${creativeItem(urn)}`);
    expectRestliHeaders(req, { json: false, method: "DELETE" });
  });

  it("refuses a delete without adAccountUrn before any request", () => {
    expect(() =>
      DeleteEntityInputSchema.parse({ entityType: "campaign", entityUrn: CAMPAIGN_URN })
    ).toThrow(/adAccountUrn is required/);
    expect(stub.requests).toHaveLength(0);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    const out = await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        entityUrn: CAMPAIGN_URN,
        adAccountUrn: ACCOUNT_URN,
      }),
      ctx,
      sdk
    );
    expect(out.confirmed).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run reads, does not prompt, and deletes nothing", async () => {
    const item = campaignItem(CAMPAIGN_URN);
    stub.route({ method: "GET", path: item, response: campaignEntity(CAMPAIGN_URN) });
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        entityUrn: CAMPAIGN_URN,
        adAccountUrn: ACCOUNT_URN,
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
      noContentRoute("POST", campaignItem(urn));
    }
    const out = await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        adAccountUrn: ACCOUNT_URN,
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
    // each entity gets its own call. basis: LinkedIn Campaigns page — the
    // account-scoped item path (see update_entity).
    expect(reqs.map((r) => r.url)).toEqual([
      `${API_BASE_URL}${campaignItem(CAMPAIGN_URN)}`,
      `${API_BASE_URL}${campaignItem(CAMPAIGN_URN_2)}`,
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

  it("creatives → the status is sent as intendedStatus", async () => {
    const urns = ["urn:li:sponsoredCreative:800000001", "urn:li:sponsoredCreative:800000002"];
    for (const urn of urns) noContentRoute("POST", creativeItem(urn));
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "creative",
        adAccountUrn: ACCOUNT_URN,
        entityUrns: urns,
        status: "PAUSED",
      }),
      ctx,
      sdk
    );
    // basis: LinkedIn Creatives page (read 2026-11-14) — a creative's status
    // field is intendedStatus, set by partial update on its item path.
    expect(sortedWrites().map((r) => [r.url, r.body])).toEqual(
      urns.map((urn) => [
        `${API_BASE_URL}${creativeItem(urn)}`,
        { patch: { $set: { intendedStatus: "PAUSED" } } },
      ])
    );
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    const out = await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        adAccountUrn: ACCOUNT_URN,
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
        adAccountUrn: ACCOUNT_URN,
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
      noContentRoute("POST", campaignItem(urn));
    }
    const out = await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "campaign",
        adAccountUrn: ACCOUNT_URN,
        items,
      }),
      ctx,
      sdk
    );
    const reqs = sortedWrites();
    // basis: [js] `partialUpdate` / [py] PARTIAL_UPDATE (see update_entity).
    // basis: LinkedIn Campaigns page — the account-scoped item path (see update_entity).
    expect(reqs.map((r) => [r.url, r.body])).toEqual([
      [`${API_BASE_URL}${campaignItem(CAMPAIGN_URN)}`, { patch: { $set: items[0]!.data } }],
      [`${API_BASE_URL}${campaignItem(CAMPAIGN_URN_2)}`, { patch: { $set: items[1]!.data } }],
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
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "campaign",
        adAccountUrn: ACCOUNT_URN,
        items,
      }),
      ctx,
      sdk
    );
    expect(out.confirmed).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing and does not prompt", async () => {
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "campaign",
        adAccountUrn: ACCOUNT_URN,
        items,
        dry_run: true,
      }),
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
      noContentRoute("POST", campaignItem(urn));
    }
    const out = await adjustBidsLogic(
      AdjustBidsInputSchema.parse({ adAccountUrn: ACCOUNT_URN, adjustments, reason: "pacing" }),
      ctx,
      sdk
    );
    const reqs = writes();
    // basis: [js] `partialUpdate` / [py] PARTIAL_UPDATE (see update_entity).
    // basis: unverified (code-only) — that a campaign's bid is the
    // `unitCost` field as `{ amount, currencyCode }` (no field model is
    // published in any source here). basis: LinkedIn Campaigns page — the
    // account-scoped item path (see update_entity).
    expect(reqs.map((r) => [r.method, r.url, r.body])).toEqual([
      [
        "POST",
        `${API_BASE_URL}${campaignItem(CAMPAIGN_URN)}`,
        { patch: { $set: { unitCost: { amount: "8.50", currencyCode: "USD" } } } },
      ],
      [
        "POST",
        `${API_BASE_URL}${campaignItem(CAMPAIGN_URN_2)}`,
        { patch: { $set: { unitCost: { amount: "15.00", currencyCode: "USD" } } } },
      ],
    ]);
    for (const req of reqs) expectRestliHeaders(req, { json: true, method: "PARTIAL_UPDATE" });
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(out.successCount).toBe(2);
    expect(apiRequests()).toHaveLength(2);
    expect(remaining()).toBe(LIMIT - 2 * 3);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    const out = await adjustBidsLogic(
      AdjustBidsInputSchema.parse({ adAccountUrn: ACCOUNT_URN, adjustments }),
      ctx,
      sdk
    );
    expect(out.confirmed).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing and does not prompt", async () => {
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({ adAccountUrn: ACCOUNT_URN, adjustments, dry_run: true }),
      ctx,
      sdk
    );
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(stub.requests).toHaveLength(0);
  });
});

describe("linkedin_duplicate_entity → GET source, then CREATE the copy", () => {
  it("campaign → strips read-only fields, renames, forces DRAFT, POSTs to the account's collection", async () => {
    const item = campaignItem(CAMPAIGN_URN);
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
      DuplicateEntityInputSchema.parse({
        entityType: "campaign",
        entityUrn: CAMPAIGN_URN,
        adAccountUrn: ACCOUNT_URN,
      }),
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

  it("refuses to duplicate an adAccount (schema)", () => {
    // basis: LinkedIn Ad Accounts page documents create but no copy.
    expect(() =>
      DuplicateEntityInputSchema.parse({
        entityType: "adAccount",
        entityUrn: ACCOUNT_URN,
        adAccountUrn: ACCOUNT_URN,
      })
    ).toThrow();
    expect(stub.requests).toHaveLength(0);
  });

  it("creative → GET it on the Creatives API, POST a DRAFT copy to the account's creatives", async () => {
    const urn = "urn:li:sponsoredCreative:800000001";
    stub.route({
      method: "GET",
      path: creativeItem(urn),
      response: {
        id: urn,
        account: ACCOUNT_URN,
        campaign: CAMPAIGN_URN,
        name: "Autumn A",
        intendedStatus: "ACTIVE",
        content: { reference: "urn:li:share:123" },
        createdAt: 1,
        createdBy: "urn:li:person:x",
        lastModifiedAt: 2,
        lastModifiedBy: "urn:li:person:x",
        isServing: true,
        isTest: false,
        review: { status: "APPROVED" },
        servingHoldReasons: ["STOPPED"],
      },
    });
    createdRoute(
      `/rest/adAccounts/${ACCOUNT_ID}/creatives`,
      "urn%3Ali%3AsponsoredCreative%3A800000099"
    );
    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "creative",
        entityUrn: urn,
        adAccountUrn: ACCOUNT_URN,
      }),
      ctx,
      sdk
    );
    expect(apiRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET ${creativeItem(urn)}`,
      `POST /rest/adAccounts/${ACCOUNT_ID}/creatives`,
    ]);
    // basis: LinkedIn Creatives page (read 2026-11-14) — the schema marks
    // account, createdAt, createdBy, id, isServing, lastModified*, review and
    // servingHoldReasons read-only; the status field is intendedStatus. That
    // the copy is a DRAFT named "Copy of …" is this server's choice.
    expect(onlyWrite().body).toEqual({
      campaign: CAMPAIGN_URN,
      name: "Copy of Autumn A",
      intendedStatus: "DRAFT",
      content: { reference: "urn:li:share:123" },
    });
  });

  it("dry_run reads the source and creates nothing", async () => {
    const item = campaignItem(CAMPAIGN_URN);
    stub.route({ method: "GET", path: item, response: campaignEntity(CAMPAIGN_URN) });
    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "campaign",
        entityUrn: CAMPAIGN_URN,
        adAccountUrn: ACCOUNT_URN,
        newName: "Winter",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(0);
  });
});

/**
 * Uploads are on LinkedIn's Images and Videos APIs (#210), which replace the
 * Assets API (`/v2/assets?action=registerUpload`).
 *
 * basis: LinkedIn Images API page
 * (learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api,
 * li-lms-2026-10, read 2026-11-16), "Initialize Image Upload": `POST
 * /rest/images?action=initializeUpload` with body `{ initializeUploadRequest:
 * { owner } }`, `owner` a person (`urn:li:person:…`) or organization
 * (`urn:li:organization:…`) URN; the response is `{ value: { uploadUrlExpiresAt,
 * uploadUrl, image: "urn:li:image:…" } }`. "Upload the Image" links to the
 * Vector Asset page (…/shares/vector-asset-api, read 2026-11-16): a PUT of the
 * bytes to the uploadUrl, which "requires a valid OAuth token in the
 * 'Authorization' header" (its sample answers 201).
 *
 * basis: LinkedIn Videos API page (…/community-management/shares/videos-api,
 * li-lms-2026-10, read 2026-11-16), "How to Upload Videos": initialize, split the
 * file into parts, upload each part, finalize. `POST
 * /rest/videos?action=initializeUpload` with `{ initializeUploadRequest: { owner,
 * fileSizeBytes, uploadCaptions, uploadThumbnail } }` (owner a person or
 * organization URN; fileSizeBytes required, and "determines how many parts the
 * video upload will be broken into"); the response carries `video`,
 * `uploadToken` and `uploadInstructions[{ uploadUrl, firstByte, lastByte }]`
 * (inclusive byte ranges, sorted). "Upload the Video": a PUT of each part with
 * `Content-Type: application/octet-stream` and no Authorization header in the
 * sample (the Vector Asset page: the video upload call "doesn't accept an OAuth
 * token"); each response's `ETag` header is saved. "Finalize Video Upload":
 * `POST /rest/videos?action=finalizeUpload` with `{ finalizeUploadRequest: {
 * video, uploadToken, uploadedPartIds } }`, the part ids being the ETags in the
 * order of the upload instructions (schema: `ETag: "e438…"` corresponds to
 * `uploadedPartIds: ["e438…"]`), answered 200.
 *
 * Neither page's upload sample sends `LinkedIn-Version` or
 * `X-Restli-Protocol-Version` to the upload URL (it is a `dms-uploads` URL on
 * www.linkedin.com, not a Rest.li resource), so the PUTs send neither.
 */
describe("linkedin_upload_image / linkedin_upload_video → Images / Videos API", () => {
  const MEDIA_HOST = "cdn.example.com";
  const UPLOAD_HOST = "www.linkedin.com";
  const ORG_URN = "urn:li:organization:5583111";
  const IMAGE_URN = "urn:li:image:C4E10AQFoyyAjHPMQuQ";
  const VIDEO_URN = "urn:li:video:C5505AQH-oV1qvnFtKA";
  const IMAGE_UPLOAD_URL = `https://${UPLOAD_HOST}/dms-uploads/C4E10AQFoyyAjHPMQuQ/uploaded-image/0?ca=vector_ads&cn=uploads&sync=0&v=beta&ut=08zHQjMjAOLqc1`;
  const VIDEO_PART_URLS = [
    `https://${UPLOAD_HOST}/dms-uploads/C5505AQH-oV1qvnFtKA/uploadedVideo?sau=part0`,
    `https://${UPLOAD_HOST}/dms-uploads/C5505AQH-oV1qvnFtKA/uploadedVideo/1?sau=part1`,
  ];

  const runImage = (mediaUrl: string, dry_run = false) =>
    uploadImageLogic(
      UploadImageInputSchema.parse({ ownerUrn: ORG_URN, mediaUrl, dry_run }),
      ctx,
      sdk
    );
  const runVideo = (mediaUrl: string, dry_run = false) =>
    uploadVideoLogic(
      UploadVideoInputSchema.parse({ ownerUrn: ORG_URN, mediaUrl, dry_run }),
      ctx,
      sdk
    );

  function mediaRoute(path: string, bytes: Uint8Array, contentType: string) {
    stub.route({ method: "GET", host: MEDIA_HOST, path, rawBody: bytes, contentType });
  }

  const isAction = (name: string) => (req: WireRequest) => req.rawQuery === `action=${name}`;

  describe("linkedin_upload_image", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

    function imageRoutes(onInit?: (req: WireRequest) => boolean) {
      mediaRoute("/banner.png", bytes, "image/png");
      stub.route({
        method: "POST",
        path: "/rest/images",
        match: (req) => isAction("initializeUpload")(req) && (onInit ? onInit(req) : true),
        response: {
          value: {
            uploadUrlExpiresAt: 1650567510704,
            uploadUrl: IMAGE_UPLOAD_URL,
            image: IMAGE_URN,
          },
        },
      });
    }

    it("downloads, POSTs /rest/images?action=initializeUpload, PUTs the bytes with the token", async () => {
      imageRoutes();
      stub.route({
        method: "PUT",
        host: UPLOAD_HOST,
        path: new URL(IMAGE_UPLOAD_URL).pathname,
        status: 201,
        rawBody: "",
      });

      const out = await runImage(`https://${MEDIA_HOST}/banner.png`);

      expect(stub.requests.map((r) => `${r.method} ${r.host}${r.path}`)).toEqual([
        `GET ${MEDIA_HOST}/banner.png`,
        `POST ${API_HOST}/rest/images`,
        `PUT ${UPLOAD_HOST}${new URL(IMAGE_UPLOAD_URL).pathname}`,
      ]);

      const init = stub.requests[1]!;
      // basis: Images API, "Initialize Image Upload" (see the block comment).
      expect(init.url).toBe(`${API_BASE_URL}/rest/images?action=initializeUpload`);
      expect(init.rawQuery).toBe("action=initializeUpload");
      expectRestliHeaders(init, { json: true });
      expect(init.body).toEqual({ initializeUploadRequest: { owner: ORG_URN } });

      const put = stub.requests[2]!;
      // basis: Vector Asset page, "Upload the Image": PUT with the OAuth token.
      expect(put.url).toBe(IMAGE_UPLOAD_URL);
      expect(put.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
      expect(put.headers["content-type"]).toBe("image/png");
      expect(put.headers["linkedin-version"]).toBeUndefined();
      expect(put.headers["x-restli-protocol-version"]).toBeUndefined();
      expect(put.rawBody).toEqual(Buffer.from(bytes));

      expect(out.imageUrn).toBe(IMAGE_URN);
      expect(out.effect).toEqual({
        effectKind: "asset_uploaded",
        summary: { asset_type: "image", asset_handle: IMAGE_URN },
      });
      // basis: unverified (code-only) — the server's own cost model: the
      // initialize POST is a write (LINKEDIN_WRITE_TOKENS, 3) on
      // `linkedin:default`; the PUT goes to the upload host, not the API, and
      // draws nothing.
      expect(remaining()).toBe(LIMIT - 3);
    });

    it("draws the write token before the initialize POST is sent", async () => {
      let atInit: number | undefined;
      imageRoutes(() => {
        atInit = remaining();
        return true;
      });
      stub.route({ method: "PUT", host: UPLOAD_HOST, path: /.*/, status: 201, rawBody: "" });

      await runImage(`https://${MEDIA_HOST}/banner.png`);
      expect(atInit).toBe(LIMIT - 3);
    });

    it("fails without a PUT when the initialize response has no uploadUrl or image", async () => {
      mediaRoute("/banner.png", bytes, "image/png");
      stub.route({ method: "POST", path: "/rest/images", response: { value: {} } });

      await expect(runImage(`https://${MEDIA_HOST}/banner.png`)).rejects.toMatchObject({
        code: JsonRpcErrorCode.InternalError,
      });
      expect(stub.requests.filter((r) => r.method === "PUT")).toHaveLength(0);
    });

    it("dry_run downloads and uploads nothing", async () => {
      await runImage(`https://${MEDIA_HOST}/banner.png`, true);
      expect(stub.requests).toHaveLength(0);
    });
  });

  describe("linkedin_upload_video", () => {
    // Ten bytes, split by the initialize response into two parts (0-5, 6-9).
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const instructions = [
      { uploadUrl: VIDEO_PART_URLS[0], firstByte: 0, lastByte: 5 },
      { uploadUrl: VIDEO_PART_URLS[1], firstByte: 6, lastByte: 9 },
    ];
    // The schema shows a quoted ETag; the "Upload the Video" sample an unquoted one.
    const ETAGS = ['"e4383924336106965d6cd2a111beaceb"', "/ambry-videoei/signedId/AQHX97.bin"];
    const PART_IDS = ["e4383924336106965d6cd2a111beaceb", "/ambry-videoei/signedId/AQHX97.bin"];

    function videoRoutes(
      opts: {
        uploadInstructions?: unknown;
        etags?: Array<string | undefined>;
        onInit?: (req: WireRequest) => boolean;
        onFinalize?: (req: WireRequest) => boolean;
      } = {}
    ) {
      mediaRoute("/spot.mp4", bytes, "video/mp4");
      stub.route({
        method: "POST",
        path: "/rest/videos",
        match: (req) =>
          isAction("initializeUpload")(req) && (opts.onInit ? opts.onInit(req) : true),
        response: {
          value: {
            uploadUrlsExpireAt: 1633234498985,
            video: VIDEO_URN,
            uploadInstructions: opts.uploadInstructions ?? instructions,
            uploadToken: "upload-token-1",
          },
        },
      });
      const etags = opts.etags ?? ETAGS;
      VIDEO_PART_URLS.forEach((url, i) => {
        const etag = etags[i];
        stub.route({
          method: "PUT",
          host: UPLOAD_HOST,
          path: new URL(url).pathname,
          status: 200,
          rawBody: "",
          ...(etag !== undefined ? { headers: { etag } } : {}),
        });
      });
      stub.route({
        method: "POST",
        path: "/rest/videos",
        match: (req) =>
          isAction("finalizeUpload")(req) && (opts.onFinalize ? opts.onFinalize(req) : true),
        status: 200,
        rawBody: "",
      });
    }

    it("initializes with the file size, PUTs each part, then finalizes with the ETags in order", async () => {
      videoRoutes();

      const out = await runVideo(`https://${MEDIA_HOST}/spot.mp4`);

      expect(stub.requests.map((r) => `${r.method} ${r.host}${r.path}?${r.rawQuery}`)).toEqual([
        `GET ${MEDIA_HOST}/spot.mp4?`,
        `POST ${API_HOST}/rest/videos?action=initializeUpload`,
        `PUT ${UPLOAD_HOST}${new URL(VIDEO_PART_URLS[0]!).pathname}?sau=part0`,
        `PUT ${UPLOAD_HOST}${new URL(VIDEO_PART_URLS[1]!).pathname}?sau=part1`,
        `POST ${API_HOST}/rest/videos?action=finalizeUpload`,
      ]);

      const init = stub.requests[1]!;
      // basis: Videos API, "Initialize Video Upload" (see the block comment).
      expect(init.url).toBe(`${API_BASE_URL}/rest/videos?action=initializeUpload`);
      expectRestliHeaders(init, { json: true });
      expect(init.body).toEqual({
        initializeUploadRequest: {
          owner: ORG_URN,
          fileSizeBytes: bytes.length,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      });

      // basis: Videos API, "Upload the Video": each part's inclusive byte range,
      // application/octet-stream, no OAuth token.
      const parts = stub.requests.filter((r) => r.method === "PUT");
      expect(parts.map((p) => p.url)).toEqual(VIDEO_PART_URLS);
      expect(parts[0]!.rawBody).toEqual(Buffer.from(bytes.subarray(0, 6)));
      expect(parts[1]!.rawBody).toEqual(Buffer.from(bytes.subarray(6, 10)));
      for (const p of parts) {
        expect(p.headers["content-type"]).toBe("application/octet-stream");
        expect(p.headers["authorization"]).toBeUndefined();
        expect(p.headers["linkedin-version"]).toBeUndefined();
        expect(p.headers["x-restli-protocol-version"]).toBeUndefined();
      }

      const finalize = stub.requests[4]!;
      // basis: Videos API, "Finalize Video Upload".
      expect(finalize.url).toBe(`${API_BASE_URL}/rest/videos?action=finalizeUpload`);
      expectRestliHeaders(finalize, { json: true });
      expect(finalize.body).toEqual({
        finalizeUploadRequest: {
          video: VIDEO_URN,
          uploadToken: "upload-token-1",
          uploadedPartIds: PART_IDS,
        },
      });

      expect(out.videoUrn).toBe(VIDEO_URN);
      expect(out.effect).toEqual({
        effectKind: "asset_uploaded",
        summary: { asset_type: "video", asset_handle: VIDEO_URN },
      });
      // basis: unverified (code-only) — initialize and finalize are writes (3
      // each); the part PUTs go to the upload host and draw nothing, so a long
      // video's part count cannot exhaust the per-minute budget.
      expect(remaining()).toBe(LIMIT - 2 * 3);
    });

    it("draws a write token before the initialize and the finalize POST, none for the parts", async () => {
      const seen: number[] = [];
      videoRoutes({
        onInit: () => {
          seen.push(remaining());
          return true;
        },
        onFinalize: () => {
          seen.push(remaining());
          return true;
        },
      });

      await runVideo(`https://${MEDIA_HOST}/spot.mp4`);
      expect(seen).toEqual([LIMIT - 3, LIMIT - 2 * 3]);
    });

    it("does not finalize when a part's response carries no ETag", async () => {
      videoRoutes({ etags: [ETAGS[0], undefined] });

      await expect(runVideo(`https://${MEDIA_HOST}/spot.mp4`)).rejects.toMatchObject({
        code: JsonRpcErrorCode.InternalError,
      });
      expect(stub.requests.filter((r) => isAction("finalizeUpload")(r))).toHaveLength(0);
    });

    it("uploads nothing when the upload instructions do not cover the file", async () => {
      videoRoutes({ uploadInstructions: [instructions[0]] });

      await expect(runVideo(`https://${MEDIA_HOST}/spot.mp4`)).rejects.toMatchObject({
        code: JsonRpcErrorCode.InternalError,
      });
      expect(stub.requests.filter((r) => r.method === "PUT")).toHaveLength(0);
    });

    it("dry_run downloads and uploads nothing", async () => {
      await runVideo(`https://${MEDIA_HOST}/spot.mp4`, true);
      expect(stub.requests).toHaveLength(0);
    });
  });

  // basis: Images API / Videos API: initializeUploadRequest.owner "Can be a
  // person(urn:li:person:123), or organization(urn:li:organization:123) URN".
  for (const schema of [UploadImageInputSchema, UploadVideoInputSchema]) {
    it("refuses an ad-account owner and accepts a person or organization", () => {
      const base = { mediaUrl: "https://cdn.example.com/a" };
      expect(schema.safeParse({ ...base, ownerUrn: ACCOUNT_URN }).success).toBe(false);
      expect(schema.safeParse({ ...base, ownerUrn: ORG_URN }).success).toBe(true);
      expect(schema.safeParse({ ...base, ownerUrn: "urn:li:person:A1b2-C3_d" }).success).toBe(true);
    });
  }

  it("the descriptions name the requests each tool sends", () => {
    expect(uploadImageTool.description).toContain("POST /rest/images?action=initializeUpload");
    expect(uploadVideoTool.description).toContain("POST /rest/videos?action=initializeUpload");
    expect(uploadVideoTool.description).toContain("POST /rest/videos?action=finalizeUpload");
    for (const tool of [uploadImageTool, uploadVideoTool]) {
      expect(tool.description).not.toMatch(/\/v2\/assets|registerUpload|digitalmediaAsset/);
    }
  });
});

describe("linkedin_list_entities → creative (Creatives API criteria finder)", () => {
  // basis: LinkedIn Creatives page (read 2026-11-14), "Search For Creatives":
  // GET /rest/adAccounts/{adAccountId}/creatives?q=criteria with
  // X-RestLi-Method: FINDER ("must be included"); cursor paging with pageSize
  // (max 100) and pageToken, the next token in metadata.nextPageToken.
  it("first page: q=criteria&pageSize=N, FINDER header, nextPageToken as the cursor", async () => {
    stub.route({
      method: "GET",
      path: `/rest/adAccounts/${ACCOUNT_ID}/creatives`,
      response: {
        metadata: { nextPageToken: "DgGerr1i" },
        elements: [{ id: "urn:li:sponsoredCreative:1", intendedStatus: "DRAFT" }],
      },
    });
    const out = await listEntitiesLogic(
      ListEntitiesInputSchema.parse({
        entityType: "creative",
        adAccountUrn: ACCOUNT_URN,
        count: 10,
      }),
      ctx,
      sdk
    );
    const [req] = apiRequests();
    expect(apiRequests()).toHaveLength(1);
    expect(req!.path).toBe(`/rest/adAccounts/${ACCOUNT_ID}/creatives`);
    expect(req!.rawQuery).toBe("q=criteria&pageSize=10");
    expect(req!.headers["x-restli-method"]).toBe("FINDER");
    expect(out.entities).toHaveLength(1);
    expect(out.pagination.nextCursor).toBe("DgGerr1i");
    expect(out.pagination.nextPageInputKey).toBe("pageToken");
  });

  it("next page: sends the pageToken back; no token means the last page", async () => {
    stub.route({
      method: "GET",
      path: `/rest/adAccounts/${ACCOUNT_ID}/creatives`,
      response: { metadata: {}, elements: [] },
    });
    const out = await listEntitiesLogic(
      ListEntitiesInputSchema.parse({
        entityType: "creative",
        adAccountUrn: ACCOUNT_URN,
        pageToken: "DgGerr1i",
      }),
      ctx,
      sdk
    );
    expect(apiRequests()[0]!.rawQuery).toBe("q=criteria&pageSize=25&pageToken=DgGerr1i");
    expect(out.pagination.nextCursor).toBeNull();
  });

  it("refuses a creative page larger than 100 before any request", async () => {
    await expect(
      listEntitiesLogic(
        ListEntitiesInputSchema.parse({
          entityType: "creative",
          adAccountUrn: ACCOUNT_URN,
          count: 101,
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/at most 100 per page/);
    expect(stub.requests).toHaveLength(0);
  });
});

/**
 * basis: LinkedIn Cursor-based Pagination page (read 2026-11-16): "From
 * 202401 version and above" the adAccounts, adCampaignGroups, adCampaigns and
 * adCreatives search APIs page with `pageSize` and `pageToken`; the next token
 * is `metadata.nextPageToken`, and a response without one is the end of the
 * dataset. The Campaigns and Campaign Groups pages (read 2026-11-16) give the
 * account-scoped `GET /rest/adAccounts/{adAccountId}/adCampaigns?q=search` and
 * `/adCampaignGroups?q=search` with "Max is 1,000" for pageSize, and pass the
 * token back as `&pageToken=…` on the same search.
 */
describe("linkedin_list_entities → campaign / campaignGroup (search finder, cursor paging)", () => {
  for (const [entityType, collection] of [
    ["campaign", "adCampaigns"],
    ["campaignGroup", "adCampaignGroups"],
  ] as const) {
    it(`${entityType}: q=search&pageSize=N, no start/count, nextPageToken as the cursor`, async () => {
      stub.route({
        method: "GET",
        path: `/rest/adAccounts/${ACCOUNT_ID}/${collection}`,
        response: {
          metadata: { nextPageToken: "DgGerr1iVQreCJVjZDOW_grcp63nueBDipsS4DJpvJo" },
          elements: [{ id: 1 }, { id: 2 }],
        },
      });
      const out = await listEntitiesLogic(
        ListEntitiesInputSchema.parse({ entityType, adAccountUrn: ACCOUNT_URN, count: 1000 }),
        ctx,
        sdk
      );
      const [req] = apiRequests();
      expect(apiRequests()).toHaveLength(1);
      expect(req!.method).toBe("GET");
      expect(req!.url).toBe(
        `${API_BASE_URL}/rest/adAccounts/${ACCOUNT_ID}/${collection}?q=search&pageSize=1000`
      );
      expect(req!.headers["x-restli-method"]).toBe("FINDER");
      expect(out.pagination.nextCursor).toBe("DgGerr1iVQreCJVjZDOW_grcp63nueBDipsS4DJpvJo");
      expect(out.pagination.nextPageInputKey).toBe("pageToken");
    });

    it(`${entityType}: sends the pageToken back; no token means the last page`, async () => {
      stub.route({
        method: "GET",
        path: `/rest/adAccounts/${ACCOUNT_ID}/${collection}`,
        response: { metadata: {}, elements: [{ id: 3 }] },
      });
      const out = await listEntitiesLogic(
        ListEntitiesInputSchema.parse({
          entityType,
          adAccountUrn: ACCOUNT_URN,
          pageToken: "DgGerr1i",
        }),
        ctx,
        sdk
      );
      expect(apiRequests()[0]!.rawQuery).toBe("q=search&pageSize=25&pageToken=DgGerr1i");
      expect(out.pagination.nextCursor).toBeNull();
      expect(out.pagination.hasMore).toBe(false);
    });
  }

  it("refuses a page larger than 1,000 before any request", async () => {
    expect(() =>
      ListEntitiesInputSchema.parse({
        entityType: "campaign",
        adAccountUrn: ACCOUNT_URN,
        count: 1001,
      })
    ).toThrow();
    expect(stub.requests).toHaveLength(0);
  });
});

/**
 * basis: LinkedIn Ad Accounts page (read 2026-11-16), "Search for Accounts":
 * `GET https://api.linkedin.com/rest/adAccounts?q=search`, where an omitted
 * search criterion returns "all accounts the caller has access to"; the
 * adAccounts API pages with `pageSize`/`pageToken` ("The max allowed pageSize
 * is 1,000") and the sample response carries `metadata.nextPageToken`.
 */
describe("linkedin_list_ad_accounts → adAccounts search finder (cursor paging)", () => {
  it("first page: GET /rest/adAccounts?q=search&pageSize=N", async () => {
    stub.route({
      method: "GET",
      path: "/rest/adAccounts",
      response: {
        elements: [{ id: 507404993, name: "Dunder Mifflin Account", currency: "USD" }],
        metadata: { nextPageToken: "DgGerr1iVQreCJVjZDOW_grcp63nueBDipsS4DJpvJo" },
      },
    });
    const out = await listAdAccountsLogic(ListAdAccountsInputSchema.parse({}), ctx, sdk);
    const [req] = apiRequests();
    expect(apiRequests()).toHaveLength(1);
    expect(req!.method).toBe("GET");
    expect(req!.url).toBe(`${API_BASE_URL}/rest/adAccounts?q=search&pageSize=25`);
    expect(out.accounts).toHaveLength(1);
    expect(out.pagination.nextCursor).toBe("DgGerr1iVQreCJVjZDOW_grcp63nueBDipsS4DJpvJo");
    expect(out.pagination.nextPageInputKey).toBe("pageToken");
  });

  it("next page: sends the pageToken back; no token means the last page", async () => {
    stub.route({
      method: "GET",
      path: "/rest/adAccounts",
      response: { elements: [], metadata: {} },
    });
    const out = await listAdAccountsLogic(
      ListAdAccountsInputSchema.parse({ pageToken: "DgGerr1i", count: 1000 }),
      ctx,
      sdk
    );
    expect(apiRequests()[0]!.rawQuery).toBe("q=search&pageSize=1000&pageToken=DgGerr1i");
    expect(out.pagination.nextCursor).toBeNull();
  });

  it("linkedin_list_entities adAccount sends the same request", async () => {
    stub.route({
      method: "GET",
      path: "/rest/adAccounts",
      response: { elements: [], metadata: {} },
    });
    await listEntitiesLogic(ListEntitiesInputSchema.parse({ entityType: "adAccount" }), ctx, sdk);
    expect(apiRequests()[0]!.url).toBe(`${API_BASE_URL}/rest/adAccounts?q=search&pageSize=25`);
  });
});

/**
 * basis: LinkedIn Ad Account Users page (read 2026-11-16), "Find Ad Accounts
 * by Authenticated User": `GET https://api.linkedin.com/rest/adAccountUsers?
 * q=authenticatedUser` ("The only required parameter is q=authenticatedUser")
 * with Authorization, Linkedin-Version and X-Restli-Protocol-Version: 2.0.0; it
 * needs the r_ads scope, and each row's `user` is the token's member.
 */
describe("session validation → adAccountUsers authenticatedUser finder", () => {
  it("GET /rest/adAccountUsers?q=authenticatedUser; the person URN is the row's user", async () => {
    stub.route({
      method: "GET",
      path: "/rest/adAccountUsers",
      response: {
        elements: [
          {
            account: "urn:li:sponsoredAccount:516413367",
            role: "ACCOUNT_BILLING_ADMIN",
            user: "urn:li:person:K1RwyVNukt",
          },
        ],
        paging: { count: 1, links: [], start: 0, total: 1 },
      },
    });
    const adapter = new LinkedInAccessTokenAdapter(TEST_ACCESS_TOKEN, API_BASE_URL, API_VERSION);
    await adapter.validate();

    const [req] = apiRequests();
    expect(apiRequests()).toHaveLength(1);
    expect(req!.method).toBe("GET");
    expect(req!.url).toBe(`${API_BASE_URL}/rest/adAccountUsers?q=authenticatedUser`);
    expect(req!.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(req!.headers["linkedin-version"]).toBe(API_VERSION);
    expect(req!.headers["x-restli-protocol-version"]).toBe("2.0.0");
    expect(adapter.personId).toBe("urn:li:person:K1RwyVNukt");
    expect(stub.requests.some((r) => r.path.startsWith("/v2/"))).toBe(false);
  });

  it("a 401 is Unauthorized", async () => {
    stub.route({
      method: "GET",
      path: "/rest/adAccountUsers",
      status: 401,
      response: { status: 401, message: "Invalid access token" },
    });
    const adapter = new LinkedInAccessTokenAdapter(TEST_ACCESS_TOKEN, API_BASE_URL, API_VERSION);
    await expect(adapter.validate()).rejects.toMatchObject({
      code: JsonRpcErrorCode.Unauthorized,
    });
  });
});

describe("linkedin_list_entities → conversionRule", () => {
  it("GET /rest/conversions?q=account&account=<urn>, with no paging parameters", async () => {
    // basis: LinkedIn Conversions API page, "Find Conversion Rules by Ad
    // Account" (read 2026-11-13): `GET /rest/conversions?q=account&account=
    // urn%3Ali%3AsponsoredAccount%3A{id}`. The documented response is
    // `{ elements: [...] }` with no `paging`, and the request has no
    // start/count/pageSize: a `search` finder 404s ("No virtual resource found")
    // and a `pageSize` is rejected 400 QUERY_PARAM_NOT_ALLOWED (#301).
    stub.route({
      method: "GET",
      path: "/rest/conversions",
      response: { elements: [{ id: 104012, name: "Signup", account: ACCOUNT_URN }] },
    });

    const out = await listEntitiesLogic(
      ListEntitiesInputSchema.parse({ entityType: "conversionRule", adAccountUrn: ACCOUNT_URN }),
      ctx,
      sdk
    );

    const [req] = apiRequests();
    expect(apiRequests()).toHaveLength(1);
    expect(req!.method).toBe("GET");
    expect(req!.url).toBe(`${API_BASE_URL}/rest/conversions?q=account&account=${enc(ACCOUNT_URN)}`);
    expect(out.entities).toHaveLength(1);
    // An unpaged finder must not hand back a cursor the next call would ignore.
    expect(out.pagination.nextCursor).toBeNull();
  });
});
