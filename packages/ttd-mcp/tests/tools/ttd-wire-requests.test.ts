// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-request assertions for every ttd-mcp tool that issues a non-GET
 * upstream request (#236): REST POST / PUT / DELETE and GraphQL mutations.
 * Each test calls the REAL tool logic over REAL session services (TtdService,
 * TtdReportingService, TtdHttpClient, the direct-token auth adapter and the
 * package's real module-level `RateLimiter`), with only `globalThis.fetch`
 * stubbed, and asserts the full request: HTTP method, URL, the routing headers
 * and the exact body.
 *
 * Vendor sources. partner.thetradedesk.com / open.thetradedesk.com and the
 * GraphQL schema explorer are unreachable from this repo's egress, so these
 * are the only TTD-authored sources available:
 *
 *   [docs]     TTD's documentation pages, vendored in this repo under
 *              `packages/ttd-mcp/docs/api/` (copied from open.thetradedesk.com /
 *              partner.thetradedesk.com; each file names its source page):
 *              `TTD_Foundations.md` (§2 auth, §7 GraphQL calls, §8 REST calls,
 *              §10 strict mode), `ttd-api-reference-part{1..5}.md` (the
 *              operation list, a few "Key Request Fields" tables) and
 *              `ttd_partner_portal_api_docs.md` (worked request examples).
 *              Cited as `docs/api/<file>:<line>`.
 *   [platform] TTD's sample scripts, https://github.com/thetradedesk/platform
 *              commit adff1a68022f213ceed2a0a25b19d59dc678751b (fetched
 *              2026-10-01 via raw.githubusercontent.com), cited as
 *              `platform Python/<path>:<line>`.
 *   [workflows] TTD's Workflows SDK, https://github.com/thetradedesk/ttd-workflows-python
 *              commit cd4e64cae0289dbd3df073a9d849bc04feb36d4f (fetched
 *              2026-10-01), cited as `workflows src/ttd_workflows/<path>`. It
 *              wraps a different service (`/workflows`), so it is cited only
 *              for header names and GraphQL passthrough input shapes.
 *
 * What none of them give: TTD publishes no machine-readable request schema for
 * the v3 REST API or the GraphQL schema (introspection is disabled — see
 * graphql-reference://ttd). So most request BODIES here are pinned against a
 * worked example, not a schema, and everything no example covers is marked
 * `basis: unverified (code-only)`. The repo's own `graphql-reference://ttd`
 * resource is NOT a vendor source (it records a 2026-04-14 live test with no
 * captured evidence) and is never cited as a basis.
 *
 * Hosts come from config (`mcpConfig.ttdApiBaseUrl`, platform-facts
 * `ttd.api_version`; `mcpConfig.ttdGraphqlUrl`). The GraphQL default
 * (`desk.thetradedesk.com/graphql`) is the `PROD_GQL_URL` of every platform
 * sample (e.g. platform Python/Campaign/Creating/CreateCampaignWorkflowREST.py:17);
 * docs/api/TTD_Foundations.md:439 lists `api.thetradedesk.com/graphql` instead.
 * These tests do not restate either.
 *
 * Rate limiting: every TTD call — REST and GraphQL alike — draws ONE token from
 * the session's per-credential key `ttd:client:{quotaClient}`
 * (`session.quotaKey`; services/ttd/rate-limit-keys.ts). The presigned-storage
 * PUT of a video upload and the media download are not TTD calls and draw none.
 *
 * Out of scope (GET only, or no upstream call): get_entity, get_ad_preview,
 * get_report_schedule, download_report, get_pacing_status, validate_entity.
 * GraphQL READ tools that POST a `query` document (get_context,
 * list_report_templates, get_report_template, list_report_types,
 * get_report_type_schema, get_entity_report_types, get_report_executions,
 * graphql_bulk_job) send no mutation and are not covered here; the REST
 * POST-query reads are covered at the end.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { McpError } from "@cesteral/shared";
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
  archiveEntitiesLogic,
  ArchiveEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/archive-entities.tool.js";
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
  uploadVideoLogic,
  UploadVideoInputSchema,
} from "../../src/mcp-server/tools/definitions/upload-video.tool.js";
import {
  bidListLogic,
  BidListInputSchema,
} from "../../src/mcp-server/tools/definitions/manage-bid-list.tool.js";
import {
  bidListBulkLogic,
  BidListBulkInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-manage-bid-lists.tool.js";
import {
  manageSeedLogic,
  ManageSeedInputSchema,
} from "../../src/mcp-server/tools/definitions/manage-seed.tool.js";
import {
  executeEntityReportLogic,
  ExecuteEntityReportInputSchema,
} from "../../src/mcp-server/tools/definitions/execute-entity-report.tool.js";
import {
  createReportTemplateLogic,
  CreateReportTemplateInputSchema,
} from "../../src/mcp-server/tools/definitions/create-report-template.tool.js";
import {
  updateReportTemplateLogic,
  UpdateReportTemplateInputSchema,
} from "../../src/mcp-server/tools/definitions/update-report-template.tool.js";
import {
  createTemplateScheduleLogic,
  CreateTemplateScheduleInputSchema,
} from "../../src/mcp-server/tools/definitions/create-template-schedule.tool.js";
import {
  updateReportScheduleLogic,
  UpdateReportScheduleInputSchema,
} from "../../src/mcp-server/tools/definitions/update-report-schedule.tool.js";
import {
  cancelReportExecutionLogic,
  CancelReportExecutionInputSchema,
} from "../../src/mcp-server/tools/definitions/cancel-report-execution.tool.js";
import {
  rerunReportScheduleLogic,
  RerunReportScheduleInputSchema,
} from "../../src/mcp-server/tools/definitions/rerun-report-schedule.tool.js";
import {
  createReportScheduleLogic,
  CreateReportScheduleInputSchema,
} from "../../src/mcp-server/tools/definitions/create-report-schedule.tool.js";
import {
  submitReportLogic,
  SubmitReportInputSchema,
} from "../../src/mcp-server/tools/definitions/submit-report.tool.js";
import {
  getReportLogic,
  GetReportInputSchema,
} from "../../src/mcp-server/tools/definitions/get-report.tool.js";
import {
  deleteReportScheduleLogic,
  DeleteReportScheduleInputSchema,
} from "../../src/mcp-server/tools/definitions/delete-report-schedule.tool.js";
import {
  graphqlQueryLogic,
  GraphqlQueryInputSchema,
} from "../../src/mcp-server/tools/definitions/graphql-query.tool.js";
import {
  graphqlQueryBulkLogic,
  GraphqlQueryBulkInputSchema,
} from "../../src/mcp-server/tools/definitions/graphql-query-bulk.tool.js";
import {
  graphqlMutationBulkLogic,
  GraphqlMutationBulkInputSchema,
} from "../../src/mcp-server/tools/definitions/graphql-mutation-bulk.tool.js";
import {
  graphqlCancelBulkJobLogic,
  GraphqlCancelBulkJobInputSchema,
} from "../../src/mcp-server/tools/definitions/graphql-cancel-bulk-job.tool.js";
import {
  listEntitiesLogic,
  ListEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/list-entities.tool.js";
import {
  checkReportStatusLogic,
  CheckReportStatusInputSchema,
} from "../../src/mcp-server/tools/definitions/check-report-status.tool.js";
import {
  listReportSchedulesLogic,
  ListReportSchedulesInputSchema,
} from "../../src/mcp-server/tools/definitions/list-report-schedules.tool.js";
import { MUTATION_BULK_PRODUCTION_OPT_IN } from "../../src/mcp-server/tools/utils/graphql-bulk-job.js";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  gqlOperation,
  gqlQuery,
  gqlVariables,
  rateLimiter,
  REST_BASE_URL,
  REST_HOST,
  REST_PREFIX,
  GRAPHQL_URL,
  GRAPHQL_HOST,
  GRAPHQL_PATH,
  SANDBOX_GRAPHQL_URL,
  SANDBOX_REST_BASE_URL,
  TEST_TTD_TOKEN,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/wire.js";

const API = REST_BASE_URL;
const V = REST_PREFIX;
const LIMIT = mcpConfig.ttdRateLimitPerMinute;
const ADV = "adv1a2b";
const ctx = { requestId: "wire-req" } as any;

let stub: FetchStub;
let session: WireSession;
let sdk: ReturnType<typeof acceptingSdkContext>;

beforeEach(() => {
  stub = installFetchStub();
  session = createWireSession("ttd-wire-236");
  sdk = acceptingSdkContext(session.sessionId);
});

afterEach(() => {
  session.dispose();
  stub.restore();
  vi.unstubAllEnvs();
});

function restRequests(): WireRequest[] {
  return stub.to(REST_HOST);
}

function restWrites(): WireRequest[] {
  return restRequests().filter((r) => r.method !== "GET");
}

function onlyRestWrite(): WireRequest {
  const w = restWrites();
  expect(w).toHaveLength(1);
  return w[0]!;
}

function graphqlRequests(url = GRAPHQL_URL): WireRequest[] {
  return stub.requests.filter((r) => r.url === url);
}

/** GraphQL requests whose document is a mutation. */
function mutations(url = GRAPHQL_URL): WireRequest[] {
  return graphqlRequests(url).filter((r) => /^\s*mutation\b/.test(gqlQuery(r)));
}

function onlyMutation(url = GRAPHQL_URL): WireRequest {
  const m = mutations(url);
  expect(m).toHaveLength(1);
  return m[0]!;
}

function remaining(): number {
  return rateLimiter.getRemainingTokens(session.quotaKey);
}

/**
 * basis: docs/api/TTD_Foundations.md:83 ("Include the token as the `TTD-Auth`
 * value in the headers of all API calls") and :485-488 (REST is JSON over
 * HTTPS; "set the HTTP Content-Type header: Content-Type: application/json");
 * platform Python/Campaign/Creating/CreateCampaignWorkflowREST.py:43-46
 * (`rest_headers = { "TTD-Auth": token, "Content-Type": "application/json" }`).
 * TTD names no other auth scheme, so no `Authorization` header.
 */
function expectRestAuth(req: WireRequest) {
  expect(req.headers["ttd-auth"]).toBe(TEST_TTD_TOKEN);
  expect(req.headers["content-type"]).toBe("application/json");
  expect(req.headers["authorization"]).toBeUndefined();
}

/**
 * basis: docs/api/TTD_Foundations.md:432 (a `TTD-Auth` header with the API
 * token) and :714 (GraphQL "sends queries to a single endpoint with the POST
 * HTTP method"); platform Python/Report/GenerateImmediateReportGQL.py:53-66
 * (`requests.post(url=gql_url, json={'query': body, 'variables': variables},
 * headers={'TTD-Auth': token})` — `json=` sets Content-Type: application/json).
 * The body carries exactly `query` and `variables`.
 */
function expectGraphqlRequest(req: WireRequest, url = GRAPHQL_URL) {
  expect(req.method).toBe("POST");
  expect(req.url).toBe(url);
  expect(req.headers["ttd-auth"]).toBe(TEST_TTD_TOKEN);
  expect(req.headers["content-type"]).toBe("application/json");
  expect(req.headers["authorization"]).toBeUndefined();
  for (const key of Object.keys(req.body as object)) {
    expect(["query", "variables"]).toContain(key);
  }
}

function routeGraphql(operation: string, response: unknown, url = GRAPHQL_URL) {
  const parsed = new URL(url);
  stub.route({
    method: "POST",
    host: parsed.host,
    path: parsed.pathname,
    match: gqlOperation(operation),
    response,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// REST entity writes
// ─────────────────────────────────────────────────────────────────────────

describe("ttd_create_entity → POST /v3/{entity}", () => {
  it("campaign → POST /v3/campaign with AdvertiserId merged into the body", async () => {
    stub.route({
      method: "POST",
      path: `${V}/campaign`,
      response: { CampaignId: "camp001", CampaignName: "Autumn", Version: "Kokai" },
    });
    const data = {
      CampaignName: "Autumn",
      Version: "Kokai",
      Budget: { Amount: 1200, CurrencyCode: "USD" },
      StartDate: "2026-11-01T00:00:00",
      EndDate: "2026-12-31T23:59:00",
      PacingMode: "PaceAhead",
      CampaignConversionReportingColumns: [],
      PrimaryGoal: { MaximizeReach: true },
      PrimaryChannel: "Video",
      SeedId: "seed01",
    };

    const out = await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "campaign", advertiserId: ADV, data }),
      ctx,
      sdk
    );

    const req = onlyRestWrite();
    // basis: platform Python/Campaign/Creating/CreateCampaignWorkflowREST.py:91-116
    // create_kokai_campaign — POST rest_url + '/campaign' with JSON body
    // { AdvertiserId, CampaignName, Version, Budget { Amount, CurrencyCode },
    // StartDate, EndDate, PacingMode, CampaignConversionReportingColumns,
    // PrimaryGoal, PrimaryChannel, IncludeDefaultsFromAdvertiser, SeedId };
    // docs/api/ttd-api-reference-part2.md:311 (`POST /v3/campaign`, LEGACY).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/campaign`);
    expectRestAuth(req);
    expect(req.headers["ttd-strict-mode"]).toBeUndefined();
    expect(req.body).toEqual({ AdvertiserId: ADV, ...data });
    expect(out.entity.CampaignId).toBe("camp001");
    expect(restRequests()).toHaveLength(1);
    expect(remaining()).toBe(LIMIT - 1);
  });

  it("adGroup → POST /v3/adgroup with CampaignId (and AdvertiserId) in the body", async () => {
    stub.route({ method: "POST", path: `${V}/adgroup`, response: { AdGroupId: "ag001" } });
    const data = {
      AdGroupName: "Strategy 1",
      IndustryCategoryId: 292,
      AdGroupCategory: { CategoryId: 8311 },
      IsEnabled: true,
      FunnelLocation: "Awareness",
      ChannelId: "Video",
      RTBAttributes: {
        BaseBidCPM: { Amount: 1.0, CurrencyCode: "USD" },
        MaxBidCPM: { Amount: 5.0, CurrencyCode: "USD" },
        CreativeIds: [],
      },
    };

    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "adGroup",
        advertiserId: ADV,
        campaignId: "camp001",
        data,
      }),
      ctx,
      sdk
    );

    const req = onlyRestWrite();
    // basis: platform Python/Campaign/Creating/CreateCampaignWorkflowREST.py:139-197
    // create_and_associate_adgroup — POST rest_url + '/adgroup' with body
    // { CampaignId, AdGroupName, IndustryCategoryId, AdGroupCategory { CategoryId },
    // IsEnabled, FunnelLocation, ChannelId, RTBAttributes { BaseBidCPM { Amount,
    // CurrencyCode }, MaxBidCPM { … }, CreativeIds, … } };
    // docs/api/ttd-api-reference-part1.md:406 (`POST /v3/adgroup`).
    // The sample sends no AdvertiserId; the tool also merges it in (the
    // adGroup's required parent ids). basis for AdvertiserId on this body:
    // unverified (code-only).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/adgroup`);
    expectRestAuth(req);
    expect(req.body).toEqual({ ...data, CampaignId: "camp001", AdvertiserId: ADV });
  });

  it("advertiser → POST /v3/advertiser with the top-level partnerId as PartnerId", async () => {
    stub.route({ method: "POST", path: `${V}/advertiser`, response: { AdvertiserId: "adv999" } });
    const data = {
      AdvertiserName: "Advertiser ABC",
      Description: "New advertiser",
      Country: "US",
      CurrencyCode: "USD",
      AttributionClickLookbackWindowInSeconds: 5184000,
      AttributionImpressionLookbackWindowInSeconds: 5184000,
      ClickDedupWindowInSeconds: 7,
      ConversionDedupWindowInSeconds: 60,
      DefaultRightMediaOfferTypeId: 1,
      AdvertiserCategory: { CategoryId: 8311 },
      DomainAddress: "https://www.domain.com",
    };

    await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "advertiser", partnerId: "ptn01", data }),
      ctx,
      sdk
    );

    const req = onlyRestWrite();
    // basis: docs/api/ttd_partner_portal_api_docs.md:168-203 "Create Advertisers
    // — REST API": POST /v3/advertiser with { PartnerId, AdvertiserName,
    // Description, Country, CurrencyCode, Attribution…/Dedup… windows,
    // DefaultRightMediaOfferTypeId, AdvertiserCategory { CategoryId },
    // DomainAddress }.
    expect(req.url).toBe(`${API}/advertiser`);
    expectRestAuth(req);
    expect(req.body).toEqual({ PartnerId: "ptn01", ...data });
  });

  it("conversionTracker → POST /v3/trackingtag", async () => {
    stub.route({ method: "POST", path: `${V}/trackingtag`, response: { TrackingTagId: "tt01" } });
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "conversionTracker",
        advertiserId: ADV,
        data: { TrackingTagName: "Checkout", TrackingTagType: "UniversalPixel" },
      }),
      ctx,
      sdk
    );
    const req = onlyRestWrite();
    // basis: docs/api/ttd-api-reference-part5.md:377-389 `POST /v3/trackingtag`,
    // Key Request Fields AdvertiserId (REQUIRED), TrackingTagName (REQUIRED),
    // TrackingTagType (REQUIRED, e.g. `UniversalPixel`).
    expect(req.url).toBe(`${API}/trackingtag`);
    expect(req.body).toEqual({
      AdvertiserId: ADV,
      TrackingTagName: "Checkout",
      TrackingTagType: "UniversalPixel",
    });
  });

  it("strictMode → sends TTD-Strict-Mode: true", async () => {
    stub.route({ method: "POST", path: `${V}/campaign`, response: { CampaignId: "camp001" } });
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        data: { CampaignName: "Strict" },
        strictMode: true,
      }),
      ctx,
      sdk
    );
    // basis: docs/api/TTD_Foundations.md:585-590 "Enable Strict Mode — Enter
    // `TTD-Strict-Mode` as a new key value. Set the `TTD-Strict-Mode` value to
    // `true`."
    const req = onlyRestWrite();
    expect(req.headers["ttd-strict-mode"]).toBe("true");
    expectRestAuth(req);
  });

  it("dry_run sends nothing and draws nothing", async () => {
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        data: { CampaignName: "Autumn" },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });
});

describe("ttd_update_entity → PUT /v3/{entity} with the id in the body", () => {
  it("campaign → pre-state GET, then a partial PUT /v3/campaign carrying CampaignId", async () => {
    stub.route({
      method: "GET",
      path: `${V}/campaign/camp001`,
      response: {
        CampaignId: "camp001",
        AdvertiserId: ADV,
        CampaignName: "Autumn",
        Availability: "Available",
        Budget: { Amount: 100, CurrencyCode: "USD" },
      },
    });
    stub.route({
      method: "PUT",
      path: `${V}/campaign`,
      response: {
        CampaignId: "camp001",
        AdvertiserId: ADV,
        CampaignName: "Autumn v2",
        Availability: "Available",
        Budget: { Amount: 200, CurrencyCode: "USD" },
      },
    });

    const out = await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "campaign",
        entityId: "camp001",
        advertiserId: ADV,
        data: { CampaignName: "Autumn v2", Budget: { Amount: 200, CurrencyCode: "USD" } },
      }),
      ctx,
      sdk
    );

    const req = onlyRestWrite();
    // basis: docs/api/TTD_Foundations.md:502-510 "Partial Object Updates — To
    // update only a subset of properties, submit the object ID and the
    // properties that need to be updated"; docs/api/ttd_partner_portal_api_docs.md:3007-3024
    // ("To update a campaign, use the PUT /v3/campaign endpoint", body
    // { "CampaignId": …, "PrimaryGoal": …, "SecondaryGoal": null } — no id in
    // the path); docs/api/ttd-api-reference-part2.md:317 (`PUT /v3/campaign`).
    // AdvertiserId is the tool's merged parent id — basis: unverified (code-only).
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`${API}/campaign`);
    expectRestAuth(req);
    expect(req.body).toEqual({
      CampaignId: "camp001",
      AdvertiserId: ADV,
      CampaignName: "Autumn v2",
      Budget: { Amount: 200, CurrencyCode: "USD" },
    });
    // Pre-state read: basis: platform Python/Campaign/Creating/CreateCampaignWorkflowREST.py:215-219
    // get_campaign — GET rest_url + '/campaign/' + campaign_id.
    expect(restRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET ${V}/campaign/camp001`,
      `PUT ${V}/campaign`,
    ]);
    expect(out.before?.displayName).toBe("Autumn");
    expect(out.after?.displayName).toBe("Autumn v2");
    expect(remaining()).toBe(LIMIT - 2);
  });

  it("adGroup → PUT /v3/adgroup carrying AdGroupId", async () => {
    stub.route({
      method: "PUT",
      path: `${V}/adgroup`,
      response: { AdGroupId: "ag001", AdGroupName: "Strategy 1" },
    });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "adGroup",
        entityId: "ag001",
        advertiserId: ADV,
        campaignId: "camp001",
        data: { RTBAttributes: { AudienceTargeting: { AudienceId: "aud1234" } } },
      }),
      ctx,
      sdk
    );
    const req = onlyRestWrite();
    // basis: docs/api/ttd_partner_portal_api_docs.md:4069-4086 "Assign an
    // Audience to an Ad Group" — PUT /v3/adgroup with { "AdGroupId": …,
    // "RTBAttributes": { "AudienceTargeting": { "AudienceId": … } } };
    // docs/api/ttd-api-reference-part1.md:410 (`PUT /v3/adgroup`).
    // AdvertiserId / CampaignId are the tool's merged parent ids — basis:
    // unverified (code-only).
    expect(req.url).toBe(`${API}/adgroup`);
    expectRestAuth(req);
    expect(req.body).toEqual({
      AdGroupId: "ag001",
      AdvertiserId: ADV,
      CampaignId: "camp001",
      RTBAttributes: { AudienceTargeting: { AudienceId: "aud1234" } },
    });
  });

  it("strictMode → the PUT carries TTD-Strict-Mode: true", async () => {
    stub.route({ method: "PUT", path: `${V}/creative`, response: { CreativeId: "cr01" } });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "creative",
        entityId: "cr01",
        advertiserId: ADV,
        data: { CreativeName: "Renamed" },
        strictMode: true,
      }),
      ctx,
      sdk
    );
    // basis: docs/api/TTD_Foundations.md:585-590 (TTD-Strict-Mode: true);
    // docs/api/ttd-api-reference-part2.md:629 (`PUT /v3/creative`).
    const req = onlyRestWrite();
    expect(req.url).toBe(`${API}/creative`);
    expect(req.headers["ttd-strict-mode"]).toBe("true");
    expect(req.body).toEqual({ CreativeId: "cr01", AdvertiserId: ADV, CreativeName: "Renamed" });
  });

  it("dry_run reads the entity but sends no PUT", async () => {
    stub.route({
      method: "GET",
      path: `${V}/campaign/camp001`,
      response: { CampaignId: "camp001", CampaignName: "Autumn", Availability: "Available" },
    });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "campaign",
        entityId: "camp001",
        advertiserId: ADV,
        data: { CampaignName: "Autumn v2" },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(restWrites()).toHaveLength(0);
    expect(restRequests().map((r) => r.method)).toEqual(["GET"]);
  });
});

describe("ttd_delete_entity → partial PUT { <id>, Availability: Archived }", () => {
  it("confirmed → pre-read GET, then PUT /v3/campaign with only the id and Availability", async () => {
    stub.route({
      method: "GET",
      path: `${V}/campaign/camp001`,
      response: { CampaignId: "camp001", CampaignName: "Autumn", Availability: "Available" },
    });
    stub.route({ method: "PUT", path: `${V}/campaign`, response: { CampaignId: "camp001" } });

    const out = await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        entityId: "camp001",
        advertiserId: ADV,
      }),
      ctx,
      sdk
    );

    const req = onlyRestWrite();
    // basis: docs/api/TTD_Foundations.md:502-510 (partial PUT: the object id plus
    // the properties to change) and :604 ("avoid copying GET payloads to PUT
    // requests"); docs/api/ttd-api-reference-part2.md:317 (`PUT /v3/campaign`).
    // TTD documents no REST delete for campaigns (the reference lists none).
    // The value "Archived" for `Availability`: basis: unverified (code-only) —
    // the vendored docs show only "Available" (ttd_partner_portal_api_docs.md:8960).
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`${API}/campaign`);
    expectRestAuth(req);
    expect(req.body).toEqual({ CampaignId: "camp001", Availability: "Archived" });
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(restRequests().map((r) => r.method)).toEqual(["GET", "PUT"]);
    expect(out.confirmed).toBe(true);
    expect(remaining()).toBe(LIMIT - 2);
  });

  it("conversionTracker → PUT /v3/trackingtag with TrackingTagId", async () => {
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "conversionTracker",
        entityId: "tt01",
        advertiserId: ADV,
      }),
      ctx,
      sdk
    );
    // basis: docs/api/ttd-api-reference-part5.md:391 (`PUT /v3/trackingtag`);
    // the id field name `TrackingTagId`: unverified (code-only).
    const req = onlyRestWrite();
    expect(req.url).toBe(`${API}/trackingtag`);
    expect(req.body).toEqual({ TrackingTagId: "tt01", Availability: "Archived" });
    // Out of canonical scope: no pre-read.
    expect(restRequests()).toHaveLength(1);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    const out = await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        entityId: "camp001",
        advertiserId: ADV,
      }),
      ctx,
      sdk
    );
    expect(out.confirmed).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run reads but sends no PUT and asks nothing", async () => {
    stub.route({
      method: "GET",
      path: `${V}/campaign/camp001`,
      response: { CampaignId: "camp001", CampaignName: "Autumn", Availability: "Available" },
    });
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "campaign",
        entityId: "camp001",
        advertiserId: ADV,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(restWrites()).toHaveLength(0);
    expect(sdk.elicitInput).not.toHaveBeenCalled();
  });
});

describe("ttd_archive_entities → one partial PUT per id", () => {
  it("adGroup → PUT /v3/adgroup { AdGroupId, Availability: Archived } per id", async () => {
    await archiveEntitiesLogic(
      ArchiveEntitiesInputSchema.parse({ entityType: "adGroup", entityIds: ["ag001", "ag002"] }),
      ctx,
      sdk
    );
    const w = restWrites();
    // basis: docs/api/TTD_Foundations.md:502-510 (partial PUT) and
    // docs/api/ttd-api-reference-part1.md:410 (`PUT /v3/adgroup`); TTD's v3
    // reference lists no batch archive for ad groups. Availability "Archived":
    // unverified (code-only).
    expect(w).toHaveLength(2);
    for (const req of w) {
      expect(req.method).toBe("PUT");
      expect(req.url).toBe(`${API}/adgroup`);
      expectRestAuth(req);
    }
    expect(w.map((r) => r.body)).toEqual(
      expect.arrayContaining([
        { AdGroupId: "ag001", Availability: "Archived" },
        { AdGroupId: "ag002", Availability: "Archived" },
      ])
    );
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(remaining()).toBe(LIMIT - 2);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await archiveEntitiesLogic(
      ArchiveEntitiesInputSchema.parse({ entityType: "campaign", entityIds: ["camp001"] }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing", async () => {
    await archiveEntitiesLogic(
      ArchiveEntitiesInputSchema.parse({
        entityType: "campaign",
        entityIds: ["camp001"],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
    expect(sdk.elicitInput).not.toHaveBeenCalled();
  });
});

describe("ttd_bulk_update_status → one partial PUT per id", () => {
  it("campaign Paused → PUT /v3/campaign { CampaignId, Availability: Paused } per id", async () => {
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        entityIds: ["camp001", "camp002"],
        status: "Paused",
      }),
      ctx,
      sdk
    );
    const w = restWrites();
    // basis: docs/api/TTD_Foundations.md:502-510 (partial PUT) and
    // docs/api/ttd-api-reference-part2.md:317 (`PUT /v3/campaign`). The
    // Availability values "Paused" / "Archived": unverified (code-only).
    expect(w).toHaveLength(2);
    for (const req of w) {
      expect(req.method).toBe("PUT");
      expect(req.url).toBe(`${API}/campaign`);
      expectRestAuth(req);
    }
    expect(w.map((r) => r.body)).toEqual(
      expect.arrayContaining([
        { CampaignId: "camp001", Availability: "Paused" },
        { CampaignId: "camp002", Availability: "Paused" },
      ])
    );
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(remaining()).toBe(LIMIT - 2);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        entityIds: ["camp001"],
        status: "Available",
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing", async () => {
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        entityIds: ["camp001"],
        status: "Paused",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("ttd_bulk_create_entities → one POST per item", () => {
  it("campaign → POST /v3/campaign per item, AdvertiserId merged into each", async () => {
    stub.route({
      method: "POST",
      path: `${V}/campaign`,
      response: (req: WireRequest) => ({
        CampaignId: `id-${(req.body as Record<string, string>).CampaignName}`,
      }),
    });
    const out = await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        items: [
          { CampaignName: "A", Budget: { Amount: 100, CurrencyCode: "USD" } },
          { CampaignName: "B", Budget: { Amount: 200, CurrencyCode: "USD" } },
        ],
      }),
      ctx,
      sdk
    );
    const w = restWrites();
    // basis: platform Python/Campaign/Creating/CreateCampaignWorkflowREST.py:91-116
    // (POST /campaign, body carries AdvertiserId + campaign fields). TTD's
    // bulk route (>100 records) is GraphQL-only (docs/api/TTD_Foundations.md §6);
    // this tool caps at 50 and sends one REST create per item.
    expect(w).toHaveLength(2);
    for (const req of w) {
      expect(req.method).toBe("POST");
      expect(req.url).toBe(`${API}/campaign`);
      expectRestAuth(req);
    }
    expect(w.map((r) => r.body)).toEqual(
      expect.arrayContaining([
        { AdvertiserId: ADV, CampaignName: "A", Budget: { Amount: 100, CurrencyCode: "USD" } },
        { AdvertiserId: ADV, CampaignName: "B", Budget: { Amount: 200, CurrencyCode: "USD" } },
      ])
    );
    expect(out.successCount).toBe(2);
    expect(remaining()).toBe(LIMIT - 2);
  });

  it("an empty item is refused before anything is sent", async () => {
    await expect(
      bulkCreateEntitiesLogic(
        BulkCreateEntitiesInputSchema.parse({
          entityType: "campaign",
          advertiserId: ADV,
          items: [{ CampaignName: "A" }, {}],
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/Invalid bulk create payload/);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing", async () => {
    await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        items: [{ CampaignName: "A" }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("ttd_bulk_update_entities → one partial PUT per item", () => {
  it("adGroup → PUT /v3/adgroup per item with AdGroupId and the merged parent ids", async () => {
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "adGroup",
        advertiserId: ADV,
        campaignId: "camp001",
        items: [
          {
            entityId: "ag001",
            data: { AdGroupName: "One", RTBAttributes: { BudgetSettings: {} } },
          },
          { entityId: "ag002", data: { AdGroupName: "Two" } },
        ],
      }),
      ctx,
      sdk
    );
    const w = restWrites();
    // basis: docs/api/TTD_Foundations.md:502-510 (partial PUT with the object
    // id); docs/api/ttd_partner_portal_api_docs.md:4069-4086 (PUT /v3/adgroup
    // body carries AdGroupId). AdvertiserId / CampaignId on an update: basis:
    // unverified (code-only).
    expect(w).toHaveLength(2);
    for (const req of w) {
      expect(req.method).toBe("PUT");
      expect(req.url).toBe(`${API}/adgroup`);
      expectRestAuth(req);
    }
    expect(w.map((r) => r.body)).toEqual(
      expect.arrayContaining([
        {
          AdGroupId: "ag001",
          AdvertiserId: ADV,
          CampaignId: "camp001",
          AdGroupName: "One",
          RTBAttributes: { BudgetSettings: {} },
        },
        { AdGroupId: "ag002", AdvertiserId: ADV, CampaignId: "camp001", AdGroupName: "Two" },
      ])
    );
    expect(remaining()).toBe(LIMIT - 2);
  });

  it("a sensitive field asks first; declined → sends nothing", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    const out = await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        items: [{ entityId: "camp001", data: { Budget: { Amount: 1, CurrencyCode: "USD" } } }],
      }),
      ctx,
      sdk
    );
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(out.confirmed).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing", async () => {
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "campaign",
        advertiserId: ADV,
        items: [{ entityId: "camp001", data: { CampaignName: "X" } }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("ttd_adjust_bids → partial PUT /v3/adgroup { AdGroupId, RTBAttributes }", () => {
  it("with currencyCode → one PUT per ad group carrying only the bid money objects", async () => {
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        adjustments: [
          { adGroupId: "ag001", baseBidCpm: 1.5, maxBidCpm: 4, currencyCode: "EUR" },
          { adGroupId: "ag002", maxBidCpm: 6, currencyCode: "EUR" },
        ],
      }),
      ctx,
      sdk
    );
    const w = restWrites();
    // basis: platform Python/Campaign/Creating/CreateCampaignWorkflowREST.py:153-176
    // — `RTBAttributes.BaseBidCPM` / `MaxBidCPM` are money objects
    // { Amount, CurrencyCode }; docs/api/TTD_Foundations.md:502-510 (partial PUT:
    // the AdGroupId plus only the properties to change);
    // docs/api/ttd-api-reference-part1.md:410 (`PUT /v3/adgroup`).
    expect(w).toHaveLength(2);
    for (const req of w) {
      expect(req.method).toBe("PUT");
      expect(req.url).toBe(`${API}/adgroup`);
      expectRestAuth(req);
    }
    expect(w.map((r) => r.body)).toEqual(
      expect.arrayContaining([
        {
          AdGroupId: "ag001",
          RTBAttributes: {
            BaseBidCPM: { Amount: 1.5, CurrencyCode: "EUR" },
            MaxBidCPM: { Amount: 4, CurrencyCode: "EUR" },
          },
        },
        { AdGroupId: "ag002", RTBAttributes: { MaxBidCPM: { Amount: 6, CurrencyCode: "EUR" } } },
      ])
    );
    expect(restRequests()).toHaveLength(2);
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(remaining()).toBe(LIMIT - 2);
  });

  it("without currencyCode → reads the ad group, then PUTs in the ad group's bid currency", async () => {
    stub.route({
      method: "GET",
      path: `${V}/adgroup/ag001`,
      response: {
        AdGroupId: "ag001",
        AdvertiserId: ADV,
        RTBAttributes: { BaseBidCPM: { Amount: 1, CurrencyCode: "GBP" } },
      },
    });
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({ adjustments: [{ adGroupId: "ag001", baseBidCpm: 2 }] }),
      ctx,
      sdk
    );
    // basis: GET by id — docs/api/ttd-api-reference-part1.md:414
    // (`GET /v3/adgroup/{adGroupId}`).
    expect(restRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET ${V}/adgroup/ag001`,
      `PUT ${V}/adgroup`,
    ]);
    expect(onlyRestWrite().body).toEqual({
      AdGroupId: "ag001",
      RTBAttributes: { BaseBidCPM: { Amount: 2, CurrencyCode: "GBP" } },
    });
    expect(remaining()).toBe(LIMIT - 2);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        adjustments: [{ adGroupId: "ag001", baseBidCpm: 2, currencyCode: "USD" }],
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing", async () => {
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        adjustments: [{ adGroupId: "ag001", baseBidCpm: 2, currencyCode: "USD" }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
    expect(sdk.elicitInput).not.toHaveBeenCalled();
  });
});

describe("ttd_duplicate_entity → GET /v3/campaign/{id}, then POST /v3/campaign", () => {
  const SOURCE = {
    CampaignId: "camp001",
    AdvertiserId: ADV,
    CampaignName: "Autumn",
    Version: "Kokai",
    Budget: { Amount: 1200, CurrencyCode: "USD" },
    StartDate: "2026-11-01T00:00:00",
    EndDate: "2026-12-31T23:59:00",
    PacingMode: "PaceAhead",
    PrimaryChannel: "Video",
    PrimaryGoal: { MaximizeReach: true },
    CampaignConversionReportingColumns: [],
    SeedId: "seed01",
    // GET-only / read-only properties that must not be pasted into the create:
    Availability: "Available",
    CreatedAtUTC: "2026-09-01T00:00:00",
    LastUpdatedAtUTC: "2026-09-02T00:00:00",
    CampaignFlights: [{ CampaignFlightId: 77 }],
  };

  it("posts only the documented create fields, with options applied", async () => {
    stub.route({ method: "GET", path: `${V}/campaign/camp001`, response: SOURCE });
    stub.route({
      method: "POST",
      path: `${V}/campaign`,
      response: { CampaignId: "camp002", CampaignName: "Autumn (copy)" },
    });

    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "campaign",
        entityId: "camp001",
        options: { CampaignName: "Autumn (copy)" },
      }),
      ctx,
      sdk
    );

    // basis: platform Python/Campaign/Creating/CreateCampaignWorkflowREST.py:215-219
    // (GET rest_url + '/campaign/' + id) and :91-116 (POST /campaign body:
    // AdvertiserId, CampaignName, Version, Budget, StartDate, EndDate,
    // PacingMode, CampaignConversionReportingColumns, PrimaryGoal,
    // PrimaryChannel, SeedId); docs/api/TTD_Foundations.md:515 ("Do not paste
    // the entire GET response schema").
    expect(restRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET ${V}/campaign/camp001`,
      `POST ${V}/campaign`,
    ]);
    const req = onlyRestWrite();
    expectRestAuth(req);
    expect(req.body).toEqual({
      AdvertiserId: ADV,
      CampaignName: "Autumn (copy)",
      Version: "Kokai",
      Budget: { Amount: 1200, CurrencyCode: "USD" },
      StartDate: "2026-11-01T00:00:00",
      EndDate: "2026-12-31T23:59:00",
      PacingMode: "PaceAhead",
      PrimaryChannel: "Video",
      PrimaryGoal: { MaximizeReach: true },
      CampaignConversionReportingColumns: [],
      SeedId: "seed01",
    });
    expect(remaining()).toBe(LIMIT - 2);
  });

  it("dry_run reads the source but creates nothing", async () => {
    stub.route({ method: "GET", path: `${V}/campaign/camp001`, response: SOURCE });
    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "campaign",
        entityId: "camp001",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(restWrites()).toHaveLength(0);
  });
});

describe("ttd_upload_video → generate URL, PUT bytes, POST /v3/creative", () => {
  const MEDIA_HOST = "cdn.example.com";
  const UPLOAD_HOST = "upload.example-storage.net";
  const UPLOAD_URL = `https://${UPLOAD_HOST}/videos/abc?sig=xyz`;
  const BYTES = Buffer.from("fake-mp4-bytes");

  it("sends the three steps in order with the documented auth on each", async () => {
    stub.route({
      method: "GET",
      host: MEDIA_HOST,
      path: "/spot.mp4",
      rawBody: BYTES,
      contentType: "video/mp4",
    });
    stub.route({
      method: "POST",
      path: `${V}/creative/generateuploadurlforvideocreative`,
      // Response field names: unverified — the tool forwards every field except
      // the first http(s) URL as "upload attributes".
      response: { UploadUrl: UPLOAD_URL, UploadId: "up-123" },
    });
    stub.route({ method: "PUT", host: UPLOAD_HOST, path: "/videos/abc", response: {} });
    stub.route({ method: "POST", path: `${V}/creative`, response: { CreativeId: "cr777" } });

    const out = await uploadVideoLogic(
      UploadVideoInputSchema.parse({
        advertiserId: ADV,
        mediaUrl: `https://${MEDIA_HOST}/spot.mp4`,
        creativeName: "Spot 30s",
        width: 1920,
        height: 1080,
        adFormatId: "af-16x9",
        clickThroughUrl: "https://example.com/landing",
      }),
      ctx,
      sdk
    );

    expect(stub.requests.map((r) => `${r.method} ${r.host}${r.path}`)).toEqual([
      `GET ${MEDIA_HOST}/spot.mp4`,
      `POST ${REST_HOST}${V}/creative/generateuploadurlforvideocreative`,
      `PUT ${UPLOAD_HOST}/videos/abc`,
      `POST ${REST_HOST}${V}/creative`,
    ]);
    const [, gen, put, create] = stub.requests;

    // Step 1 — basis: docs/api/ttd-api-reference-part2.md:641-643
    // `POST /v3/creative/generateuploadurlforvideocreative` "Generates a URL
    // for uploading video files. The returned upload attributes must be
    // included in the subsequent POST creative call." Its request body
    // { FileName, AdvertiserId }: unverified (code-only).
    expect(gen!.url).toBe(`${API}/creative/generateuploadurlforvideocreative`);
    expectRestAuth(gen!);
    expect(gen!.body).toEqual({ FileName: "spot.mp4", AdvertiserId: ADV });

    // Step 2 — the presigned storage URL carries its own signature: no TTD-Auth.
    // basis: unverified (code-only) for the video flow. TTD's one upload sample
    // (the GraphQL `fileUpload` flow, platform
    // Python/Campaign/Creating/CreateCampaignsBulkGQL.py:128-138 upload_file)
    // PUTs to the returned `uploadUrl` with no TTD-Auth header — and, against
    // the sandbox, with `x-ms-blob-type: BlockBlob`, which this tool does not
    // send. Whether the video URL needs it too is not documented here.
    expect(put!.url).toBe(UPLOAD_URL);
    expect(put!.headers["ttd-auth"]).toBeUndefined();
    expect(put!.headers["content-type"]).toBe("video/mp4");
    expect(put!.rawBody?.equals(BYTES)).toBe(true);

    // Step 3 — basis: docs/api/ttd-api-reference-part2.md:614-627 `POST
    // /v3/creative`, Key Request Fields AdvertiserId, CreativeName, Width,
    // Height, AdFormatId, CreativeType (e.g. Video). ClickThroughUrl and the
    // forwarded upload attributes (UploadId here): unverified (code-only).
    expect(create!.url).toBe(`${API}/creative`);
    expectRestAuth(create!);
    expect(create!.body).toEqual({
      UploadId: "up-123",
      CreativeName: "Spot 30s",
      Width: 1920,
      Height: 1080,
      AdFormatId: "af-16x9",
      ClickThroughUrl: "https://example.com/landing",
      AdvertiserId: ADV,
      CreativeType: "Video",
    });
    expect(out.creativeId).toBe("cr777");
    // Two TTD calls, two tokens; the media GET and the storage PUT draw none.
    expect(remaining()).toBe(LIMIT - 2);
  });

  it("dry_run downloads, uploads and creates nothing", async () => {
    await uploadVideoLogic(
      UploadVideoInputSchema.parse({
        advertiserId: ADV,
        mediaUrl: `https://${MEDIA_HOST}/spot.mp4`,
        creativeName: "Spot",
        width: 1920,
        height: 1080,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// GraphQL entity mutations
// ─────────────────────────────────────────────────────────────────────────

describe("ttd_manage_bid_list → bidList{Create,Update,Set,Delete} mutations", () => {
  // basis: docs/api/ttd-api-reference-part2.md:177-195 — `bidListCreate(input:
  // BidListCreateInput!): PayloadWithErrorsOfBidList!`, `bidListUpdate`,
  // `bidListSet`, `bidListDelete`; :207-241 — every `/v3/bidlist*` REST
  // endpoint is DEPRECATED in favour of these. The input type names of
  // update/set/delete (BidList{Update,Set,Delete}Input) are not in the vendored
  // reference: unverified (code-only).

  it("create → bidListCreate(input: $input) with the caller's input as $input", async () => {
    routeGraphql("bidListCreate", {
      data: { bidListCreate: { data: { id: "bl1", name: "Blocklist" }, userErrors: [] } },
    });
    const input = {
      name: "Blocklist",
      dimensions: ["HAS_DOMAIN_FRAGMENT_ID"],
      adjustmentType: "EXCLUSION",
      bidLines: [{ bidAdjustment: 0, volumeControlPriority: "NEUTRAL", domainFragment: "bad.com" }],
      owner: { adGroupId: "ag001" },
    };
    await bidListLogic(BidListInputSchema.parse({ operation: "create", data: input }), ctx, sdk);

    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: docs/api/ttd_partner_portal_api_docs.md:5621-5648 — bidListCreate
    // with input { name, dimensions: [HAS_DOMAIN_FRAGMENT_ID], adjustmentType:
    // EXCLUSION, bidLines: [{ bidAdjustment, volumeControlPriority,
    // domainFragment }], owner: { adGroupId } }, selecting `data { id }` and
    // `userErrors { field message }`.
    expect(gqlQuery(req)).toMatch(/\$input: BidListCreateInput!/);
    expect(gqlQuery(req)).toMatch(/bidListCreate\(input: \$input\)/);
    expect(gqlQuery(req)).toMatch(/data \{ id name \}/);
    expect(gqlQuery(req)).toMatch(/userErrors \{ field message \}/);
    expect(gqlVariables(req)).toEqual({ input });
    expect(remaining()).toBe(LIMIT - 1);
  });

  it("update → bidListUpdate with bidLinesToAdd / bidLinesToRemove", async () => {
    routeGraphql("bidListUpdate", {
      data: { bidListUpdate: { data: { id: "bl1", name: "Blocklist" }, userErrors: [] } },
    });
    const input = {
      id: "bl1",
      bidLinesToAdd: [
        { domainFragment: "a.com", bidAdjustment: 1, volumeControlPriority: "NEUTRAL" },
      ],
      bidLinesToRemove: [{ domainFragment: "b.com" }],
    };
    await bidListLogic(BidListInputSchema.parse({ operation: "update", data: input }), ctx, sdk);
    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: docs/api/ttd_partner_portal_api_docs.md:6061-6083 — bidListUpdate
    // input { id, bidLinesToAdd: [{ domainFragment, bidAdjustment,
    // volumeControlPriority }], bidLinesToRemove: [{ domainFragment }] }.
    expect(gqlQuery(req)).toMatch(/bidListUpdate\(input: \$input\)/);
    expect(gqlVariables(req)).toEqual({ input });
  });

  it("set → bidListSet with the full replacement input", async () => {
    routeGraphql("bidListSet", {
      data: { bidListSet: { data: { id: "bl1", name: "Renamed" }, userErrors: [] } },
    });
    const input = { id: "bl1", name: "Renamed", newOwner: { partnerId: "ptn01" } };
    await bidListLogic(BidListInputSchema.parse({ operation: "set", data: input }), ctx, sdk);
    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: docs/api/ttd_partner_portal_api_docs.md:6006-6029 — bidListSet
    // input { id, name, newOwner: { partnerId } }.
    expect(gqlQuery(req)).toMatch(/bidListSet\(input: \$input\)/);
    expect(gqlVariables(req)).toEqual({ input });
  });

  it("delete → bidListDelete selecting data { wasDeleted } and InSchemaError errors", async () => {
    routeGraphql("bidListDelete", {
      data: { bidListDelete: { data: { wasDeleted: true }, errors: [] } },
    });
    await bidListLogic(
      BidListInputSchema.parse({ operation: "delete", data: { id: "bl1" } }),
      ctx,
      sdk
    );
    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: docs/api/ttd_partner_portal_api_docs.md:6278-6290 — bidListDelete(input:
    // { id }) { data { wasDeleted } errors { ...on InSchemaError { field message } } }.
    expect(gqlQuery(req)).toMatch(/bidListDelete\(input: \$input\)/);
    expect(gqlQuery(req)).toMatch(/data \{ wasDeleted \}/);
    expect(gqlQuery(req)).toMatch(/\.\.\. on InSchemaError \{ field message \}/);
    expect(gqlVariables(req)).toEqual({ input: { id: "bl1" } });
  });

  it("dry_run sends nothing", async () => {
    await bidListLogic(
      BidListInputSchema.parse({ operation: "delete", data: { id: "bl1" }, dry_run: true }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("ttd_bulk_manage_bid_lists batch_update → one bidListUpdate per item", () => {
  it("sends one mutation per item and draws one token each", async () => {
    routeGraphql("bidListUpdate", {
      data: { bidListUpdate: { data: { id: "bl", name: "n" }, userErrors: [] } },
    });
    const items = [
      { id: "bl1", bidLinesToRemove: [{ domainFragment: "x.com" }] },
      { id: "bl2", bidLinesToRemove: [{ domainFragment: "x.com" }] },
    ];
    const out = await bidListBulkLogic(
      BidListBulkInputSchema.parse({ operation: "batch_update", items }),
      ctx,
      sdk
    );
    const m = mutations();
    // basis: docs/api/ttd_partner_portal_api_docs.md:6061-6083 (bidListUpdate
    // input shape). TTD has no multi-input bidListUpdate in the vendored docs.
    expect(m).toHaveLength(2);
    for (const req of m) {
      expectGraphqlRequest(req);
      expect(gqlQuery(req)).toMatch(/bidListUpdate\(input: \$input\)/);
    }
    expect(m.map(gqlVariables)).toEqual(expect.arrayContaining(items.map((input) => ({ input }))));
    expect(out.succeeded).toBe(2);
    expect(remaining()).toBe(LIMIT - 2);
  });

  it("dry_run sends nothing", async () => {
    await bidListBulkLogic(
      BidListBulkInputSchema.parse({
        operation: "batch_update",
        items: [{ id: "bl1" }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("ttd_manage_seed → seedCreate / seedUpdate / advertiserSetDefaultSeed / campaignUpdateSeed", () => {
  it("create → seedCreate(input: { advertiserId, name, targetingData })", async () => {
    routeGraphql("seedCreate", {
      data: { seedCreate: { data: { id: "seed01", name: "1pd seed" }, userErrors: [] } },
    });
    const data = {
      name: "1pd seed",
      targetingData: { firstPartyDataInclusionIds: [572489361, 817405926] },
    };
    await manageSeedLogic(
      ManageSeedInputSchema.parse({ operation: "create", advertiserId: ADV, data }),
      ctx,
      sdk
    );
    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: docs/api/ttd-api-reference-part5.md:96-102 — `seedCreate(input:
    // SeedCreateInput!): PayloadWithErrorsOfSeed!`; platform
    // Python/Seed/CreateSeedGQL.py:153-182 create_seed_gql — seedCreate(input:
    // { advertiserId, name, targetingData: { firstPartyDataInclusionIds } })
    // selecting data { id } and userErrors { field message }.
    expect(gqlQuery(req)).toMatch(/\$input: SeedCreateInput!/);
    expect(gqlQuery(req)).toMatch(/seedCreate\(input: \$input\)/);
    expect(gqlQuery(req)).toMatch(/userErrors \{\s*field\s*message\s*\}/);
    expect(gqlVariables(req)).toEqual({ input: { advertiserId: ADV, ...data } });
    expect(remaining()).toBe(LIMIT - 1);
  });

  it("update → seedUpdate(input: { id, … })", async () => {
    routeGraphql("seedUpdate", {
      data: { seedUpdate: { data: { id: "seed01" }, userErrors: [] } },
    });
    const data = { targetingData: { firstPartyDataInclusionIds: [1, 2] } };
    await manageSeedLogic(
      ManageSeedInputSchema.parse({ operation: "update", seedId: "seed01", data }),
      ctx,
      sdk
    );
    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: platform Python/Seed/CreateSeedGQL.py:212-237 update_seed_gql —
    // seedUpdate(input: { id, targetingData: { firstPartyDataInclusionIds } });
    // docs/api/ttd_partner_portal_api_docs.md:1743-1761 (seedUpdate input { id,
    // advertiserId, name, targetingData }). Type name SeedUpdateInput:
    // unverified (code-only).
    expect(gqlQuery(req)).toMatch(/seedUpdate\(input: \$input\)/);
    expect(gqlVariables(req)).toEqual({ input: { id: "seed01", ...data } });
  });

  it("set_default_advertiser → advertiserSetDefaultSeed(input: { advertiserId, seedId })", async () => {
    routeGraphql("advertiserSetDefaultSeed", {
      data: { advertiserSetDefaultSeed: { data: { id: ADV }, userErrors: [] } },
    });
    await manageSeedLogic(
      ManageSeedInputSchema.parse({
        operation: "set_default_advertiser",
        advertiserId: ADV,
        seedId: "seed01",
      }),
      ctx,
      sdk
    );
    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: platform Python/Seed/CreateSeedGQL.py:185-209 —
    // advertiserSetDefaultSeed(input: { advertiserId: $advertiserId, seedId:
    // $seedId }) { … userErrors { field message } }. Input type name
    // AdvertiserSetDefaultSeedInput: unverified (code-only).
    expect(gqlQuery(req)).toMatch(/advertiserSetDefaultSeed\(input: \$input\)/);
    expect(gqlVariables(req)).toEqual({ input: { advertiserId: ADV, seedId: "seed01" } });
  });

  it("attach_to_campaign → campaignUpdateSeed(input: { campaignId, seedId })", async () => {
    routeGraphql("campaignUpdateSeed", {
      data: { campaignUpdateSeed: { data: { id: "camp001" }, userErrors: [] } },
    });
    await manageSeedLogic(
      ManageSeedInputSchema.parse({
        operation: "attach_to_campaign",
        campaignId: "camp001",
        seedId: "seed01",
      }),
      ctx,
      sdk
    );
    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: docs/api/ttd_partner_portal_api_docs.md:1522-1549 — "a
    // campaignUpdateSeed mutation that attaches a seed to a campaign":
    // campaignUpdateSeed(input: { campaignId, seedId }) { data { id } }. Input
    // type name CampaignUpdateSeedInput: unverified (code-only).
    expect(gqlQuery(req)).toMatch(/campaignUpdateSeed\(input: \$input\)/);
    expect(gqlVariables(req)).toEqual({ input: { campaignId: "camp001", seedId: "seed01" } });
  });

  it("dry_run sends nothing", async () => {
    await manageSeedLogic(
      ManageSeedInputSchema.parse({
        operation: "create",
        advertiserId: ADV,
        data: { name: "x" },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("ttd_execute_entity_report → {adGroup,campaign,advertiser}ReportExecute", () => {
  it("adGroup → adGroupReportExecute(input: { id: $entityId, report: <enum> })", async () => {
    routeGraphql("adGroupReportExecute", {
      data: {
        adGroupReportExecute: {
          data: { id: "rep1", url: "https://reports.example/r.csv", hasSampleData: false },
          userErrors: [],
        },
      },
    });
    const out = await executeEntityReportLogic(
      ExecuteEntityReportInputSchema.parse({
        entityType: "adGroup",
        entityId: "ag001",
        reportType: "AD_FORMAT",
      }),
      ctx,
      sdk
    );
    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: platform Python/Report/GenerateImmediateReportGQL.py:82-118 —
    // `adGroupReportExecute(input: {id: $entityId, report: $reportType})
    // { data { id url hasSampleData } userErrors { field message } }` with
    // `$entityId: ID!`. The sample binds the report type as a variable
    // (`$reportType: AdGroupReportType!`); the tool inlines the enum literal
    // after checking it against /^[A-Z][A-Z0-9_]*$/ — the same GraphQL input.
    expect(gqlQuery(req)).toMatch(/mutation\(\$entityId: ID!\)/);
    expect(gqlQuery(req)).toMatch(
      /adGroupReportExecute\(input: \{ id: \$entityId, report: AD_FORMAT \}\)/
    );
    expect(gqlQuery(req)).toMatch(/data \{ id url hasSampleData \}/);
    expect(gqlQuery(req)).toMatch(/userErrors \{ field message \}/);
    expect(gqlVariables(req)).toEqual({ entityId: "ag001" });
    expect(out.downloadUrl).toBe("https://reports.example/r.csv");
    expect(remaining()).toBe(LIMIT - 1);
  });

  it("campaign → campaignReportExecute", async () => {
    routeGraphql("campaignReportExecute", {
      data: { campaignReportExecute: { data: { id: "rep2", url: "https://r/2" }, userErrors: [] } },
    });
    await executeEntityReportLogic(
      ExecuteEntityReportInputSchema.parse({
        entityType: "campaign",
        entityId: "camp001",
        reportType: "SITE",
      }),
      ctx,
      sdk
    );
    // basis: platform Python/Report/GenerateImmediateReportGQL.py:89-91
    // (mutation_name = "campaignReportExecute").
    expect(gqlQuery(onlyMutation())).toMatch(
      /campaignReportExecute\(input: \{ id: \$entityId, report: SITE \}\)/
    );
  });

  it("an invalid report enum is refused: nothing sent, no token drawn", async () => {
    await expect(
      executeEntityReportLogic(
        ExecuteEntityReportInputSchema.parse({
          entityType: "adGroup",
          entityId: "ag001",
          reportType: "site }) { x",
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(McpError);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing", async () => {
    await executeEntityReportLogic(
      ExecuteEntityReportInputSchema.parse({
        entityType: "advertiser",
        entityId: ADV,
        reportType: "AD_GROUP",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// MyReports — GraphQL
// ─────────────────────────────────────────────────────────────────────────
//
// basis for the mutation NAMES: docs/api/ttd-api-reference-part4.md:205-243
// (My Reports area: `myReportsTemplateCreate`, `myReportsTemplateUpdate`,
// `myReportsTemplateScheduleCreate`, `myReportsReportScheduleUpdate`,
// `myReportsReportExecutionCancel`, `myReportsReportScheduleDelete`). That
// reference gives names and one-line descriptions only — no input types, input
// fields or payload selections — so every input shape below is
// `basis: unverified (code-only)`.

const RESULT_SET = {
  name: "Tab 1",
  reportTypeId: "rt-1",
  fields: [{ columnId: "f-1", columnOrder: 1, includedInPivot: true }],
  metrics: [{ columnId: "m-1", columnOrder: 2, includedInPivot: false }],
};

describe("ttd_create_report_template → myReportsTemplateCreate", () => {
  it("sends the mutation, then reads the newest template for its id", async () => {
    routeGraphql("myReportsTemplateCreate", {
      data: { myReportsTemplateCreate: { data: "ok", errors: [] } },
    });
    routeGraphql("myReportsReportTemplates", {
      data: {
        myReportsReportTemplates: { nodes: [{ id: "tmpl9", name: "Perf", format: "EXCEL" }] },
      },
    });

    const out = await createReportTemplateLogic(
      CreateReportTemplateInputSchema.parse({ name: "Perf", resultSets: [RESULT_SET] }),
      ctx,
      sdk
    );

    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: docs/api/ttd-api-reference-part4.md:205 (mutation name). Input type
    // MyReportsTemplateCreateInput and fields { name, format, resultSets }:
    // unverified (code-only).
    expect(gqlQuery(req)).toMatch(/myReportsTemplateCreate\(input: \$input\)/);
    expect(gqlVariables(req)).toEqual({
      input: { name: "Perf", format: "EXCEL", resultSets: [RESULT_SET] },
    });
    // The follow-up is a query (no write): myReportsReportTemplates(last: 1) —
    // name from docs/api/ttd-api-reference-part4.md:209; args unverified.
    expect(graphqlRequests()).toHaveLength(2);
    expect(gqlQuery(graphqlRequests()[1]!)).toMatch(/myReportsReportTemplates\(last: 1\)/);
    expect(out.templateId).toBe("tmpl9");
    expect(remaining()).toBe(LIMIT - 2);
  });

  it("dry_run sends nothing", async () => {
    await createReportTemplateLogic(
      CreateReportTemplateInputSchema.parse({
        name: "Perf",
        resultSets: [RESULT_SET],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("ttd_update_report_template → myReportsTemplateUpdate", () => {
  it("sends { id, name, resultSets } as $input", async () => {
    routeGraphql("myReportsTemplateUpdate", {
      data: { myReportsTemplateUpdate: { data: "ok", errors: [] } },
    });
    await updateReportTemplateLogic(
      UpdateReportTemplateInputSchema.parse({
        id: "tmpl9",
        name: "Perf v2",
        resultSets: [RESULT_SET],
      }),
      ctx,
      sdk
    );
    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: docs/api/ttd-api-reference-part4.md:213 (mutation name); input
    // fields: unverified (code-only).
    expect(gqlQuery(req)).toMatch(/myReportsTemplateUpdate\(input: \$input\)/);
    expect(gqlVariables(req)).toEqual({
      input: { id: "tmpl9", name: "Perf v2", resultSets: [RESULT_SET] },
    });
    expect(remaining()).toBe(LIMIT - 1);
  });

  it("dry_run sends nothing", async () => {
    await updateReportTemplateLogic(
      UpdateReportTemplateInputSchema.parse({
        id: "tmpl9",
        name: "Perf v2",
        resultSets: [RESULT_SET],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("ttd_create_template_schedule → myReportsTemplateScheduleCreate", () => {
  it("sends the full schedule input with defaults applied and dateFormat uppercased", async () => {
    routeGraphql("myReportsTemplateScheduleCreate", {
      data: { myReportsTemplateScheduleCreate: { data: { scheduleId: "sch1" }, errors: [] } },
    });
    const out = await createTemplateScheduleLogic(
      CreateTemplateScheduleInputSchema.parse({
        templateId: "tmpl9",
        reportName: "Weekly perf",
        startDate: "2026-10-05T00:00:00Z",
        frequency: "WEEKLY",
        dateRange: "LAST7_DAYS",
        reportFilters: [{ reportType: "rt-1", advertiserIds: [ADV] }],
      }),
      ctx,
      sdk
    );
    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: docs/api/ttd-api-reference-part4.md:223 (mutation name); every
    // input field and the enum spellings: unverified (code-only).
    expect(gqlQuery(req)).toMatch(/myReportsTemplateScheduleCreate\(input: \$input\)/);
    expect(gqlVariables(req)).toEqual({
      input: {
        templateId: "tmpl9",
        reportName: "Weekly perf",
        startDate: "2026-10-05T00:00:00Z",
        frequency: "WEEKLY",
        dateRange: "LAST7_DAYS",
        timezone: "UTC",
        format: "EXCEL",
        includeHeaders: true,
        reportFilters: [{ reportType: "rt-1", advertiserIds: [ADV] }],
        suppressTotals: false,
        suppressZeroMeasureRows: false,
        dateFormat: "INTERNATIONAL",
        numericFormat: "US",
      },
    });
    expect(out.scheduleId).toBe("sch1");
    expect(remaining()).toBe(LIMIT - 1);
  });

  it("dry_run sends nothing", async () => {
    await createTemplateScheduleLogic(
      CreateTemplateScheduleInputSchema.parse({
        templateId: "tmpl9",
        reportName: "Weekly perf",
        startDate: "2026-10-05T00:00:00Z",
        frequency: "WEEKLY",
        dateRange: "LAST7_DAYS",
        reportFilters: [{ reportType: "rt-1", advertiserIds: [ADV] }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("ttd_update_report_schedule → myReportsReportScheduleUpdate", () => {
  it("sends { reportScheduleId, status }", async () => {
    routeGraphql("myReportsReportScheduleUpdate", {
      data: { myReportsReportScheduleUpdate: { data: { status: "DISABLED" }, errors: [] } },
    });
    await updateReportScheduleLogic(
      UpdateReportScheduleInputSchema.parse({ scheduleId: "sch1", status: "DISABLED" }),
      ctx,
      sdk
    );
    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: docs/api/ttd-api-reference-part4.md:233 (mutation name); input
    // fields { reportScheduleId, status } and the ACTIVE/DISABLED enum:
    // unverified (code-only).
    expect(gqlQuery(req)).toMatch(/myReportsReportScheduleUpdate\(input: \$input\)/);
    expect(gqlVariables(req)).toEqual({ input: { reportScheduleId: "sch1", status: "DISABLED" } });
    expect(remaining()).toBe(LIMIT - 1);
  });

  it("dry_run sends nothing", async () => {
    await updateReportScheduleLogic(
      UpdateReportScheduleInputSchema.parse({
        scheduleId: "sch1",
        status: "ACTIVE",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("ttd_cancel_report_execution → myReportsReportExecutionCancel", () => {
  it("sends { executionId }", async () => {
    routeGraphql("myReportsReportExecutionCancel", {
      data: { myReportsReportExecutionCancel: { data: { isCancelled: true }, errors: [] } },
    });
    const out = await cancelReportExecutionLogic(
      CancelReportExecutionInputSchema.parse({ executionId: "exec1" }),
      ctx,
      sdk
    );
    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: docs/api/ttd-api-reference-part4.md:237 (mutation name); input
    // field `executionId` and payload `data { isCancelled }`: unverified
    // (code-only).
    expect(gqlQuery(req)).toMatch(/myReportsReportExecutionCancel\(input: \$input\)/);
    expect(gqlVariables(req)).toEqual({ input: { executionId: "exec1" } });
    expect(out.isCancelled).toBe(true);
    expect(remaining()).toBe(LIMIT - 1);
  });

  it("dry_run sends nothing", async () => {
    await cancelReportExecutionLogic(
      CancelReportExecutionInputSchema.parse({ executionId: "exec1", dry_run: true }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("ttd_rerun_report_schedule → myReportsReportScheduleCreate", () => {
  it("sends { singleRunFromExistingScheduleInput: { id } }", async () => {
    routeGraphql("myReportsReportScheduleCreate", {
      data: { myReportsReportScheduleCreate: { data: { id: "exec9" }, errors: [] } },
    });
    await rerunReportScheduleLogic(
      RerunReportScheduleInputSchema.parse({ scheduleId: "sch1" }),
      ctx,
      sdk
    );
    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: unverified (code-only) — `myReportsReportScheduleCreate` is NOT in
    // the vendored My Reports operation list (docs/api/ttd-api-reference-part4.md:193-243),
    // nor is `singleRunFromExistingScheduleInput` in any TTD source here.
    expect(gqlQuery(req)).toMatch(/myReportsReportScheduleCreate\(input: \$input\)/);
    expect(gqlVariables(req)).toEqual({
      input: { singleRunFromExistingScheduleInput: { id: "sch1" } },
    });
    expect(remaining()).toBe(LIMIT - 1);
  });

  it("dry_run sends nothing", async () => {
    await rerunReportScheduleLogic(
      RerunReportScheduleInputSchema.parse({ scheduleId: "sch1", dry_run: true }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// MyReports — REST
// ─────────────────────────────────────────────────────────────────────────
//
// basis for paths and methods: docs/api/ttd-api-reference-part4.md:257
// (`POST /v3/myreports/reportexecution/query/advertisers`), :261
// (`POST /v3/myreports/reportschedule`), :278 (`POST
// /v3/myreports/reportschedule/query`), :282 (`GET …/reportschedule/{scheduleId}`)
// and :286 (`DELETE …/reportschedule/{scheduleId}`).
//
// The schedule BODY is `basis: unverified (code-only)`. The only vendored
// description of it (part4.md:263-272 "Key Request Fields") names
// `TemplateName`, `ReportTemplateId` (string), `DeliverySettings` and
// `Schedule`; the tools send `ReportScheduleName`, `ReportTemplateId` (number),
// `ReportFrequency`, `ScheduleStartDate`, … . Only `ReportTemplateId` matches.
// That summary table may itself be lossy (it calls a schedule's name
// "TemplateName"), so this is recorded, not asserted either way.

const REPORT_DEFAULTS = {
  TimeZone: "UTC",
  ReportDateFormat: "Sortable",
  ReportNumericFormat: "US",
  IncludeHeaders: true,
};

describe("ttd_create_report_schedule → POST /v3/myreports/reportschedule", () => {
  it("posts the schedule config", async () => {
    stub.route({
      method: "POST",
      path: `${V}/myreports/reportschedule`,
      response: { ReportScheduleId: 9001 },
    });
    const out = await createReportScheduleLogic(
      CreateReportScheduleInputSchema.parse({
        reportName: "Daily perf",
        scheduleType: "Daily",
        dateRange: "Yesterday",
        reportTemplateId: 16353,
        scheduleStartDate: "2026-10-02T00:00:00",
        advertiserIds: [ADV],
      }),
      ctx,
      sdk
    );
    const req = onlyRestWrite();
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/myreports/reportschedule`);
    expectRestAuth(req);
    // basis: unverified (code-only) — see the section note above.
    expect(req.body).toEqual({
      ReportScheduleName: "Daily perf",
      ReportTemplateId: 16353,
      ReportFileFormat: "CSV",
      ReportDateRange: "Yesterday",
      ReportFrequency: "Daily",
      ScheduleStartDate: "2026-10-02T00:00:00",
      ...REPORT_DEFAULTS,
      AdvertiserFilters: [ADV],
    });
    expect(out.reportScheduleId).toBe("9001");
    expect(remaining()).toBe(LIMIT - 1);
  });

  it.todo(
    "confirm the POST /v3/myreports/reportschedule body field names against TTD: the vendored " +
      "reference (docs/api/ttd-api-reference-part4.md:263-272) lists TemplateName / DeliverySettings / " +
      "Schedule and a string ReportTemplateId, the tools send ReportScheduleName / ReportFrequency / " +
      "ScheduleStartDate and a numeric ReportTemplateId (ttd_create_report_schedule, ttd_submit_report, " +
      "ttd_get_report)"
  );

  it("dry_run sends nothing", async () => {
    await createReportScheduleLogic(
      CreateReportScheduleInputSchema.parse({
        reportName: "Daily perf",
        scheduleType: "Daily",
        dateRange: "Yesterday",
        reportTemplateId: 16353,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("ttd_submit_report → POST /v3/myreports/reportschedule (Once)", () => {
  it("posts a one-time schedule scoped by AdvertiserFilters", async () => {
    stub.route({
      method: "POST",
      path: `${V}/myreports/reportschedule`,
      response: { ReportScheduleId: 9002 },
    });
    await submitReportLogic(
      SubmitReportInputSchema.parse({
        reportName: "One-off",
        dateRange: "Last7Days",
        reportTemplateId: 16353,
        scheduleStartDate: "2026-10-02T00:00:00",
        advertiserIds: [ADV, "adv2"],
      }),
      ctx,
      sdk
    );
    const req = onlyRestWrite();
    expect(req.url).toBe(`${API}/myreports/reportschedule`);
    expectRestAuth(req);
    // basis: unverified (code-only) — see the section note above.
    expect(req.body).toEqual({
      ReportScheduleName: "One-off",
      ReportTemplateId: 16353,
      ReportFileFormat: "CSV",
      ReportDateRange: "Last7Days",
      ReportFrequency: "Once",
      ScheduleStartDate: "2026-10-02T00:00:00",
      ...REPORT_DEFAULTS,
      AdvertiserFilters: [ADV, "adv2"],
    });
    expect(remaining()).toBe(LIMIT - 1);
  });

  it("an additionalConfig that empties AdvertiserFilters is refused before anything is sent", async () => {
    await expect(
      submitReportLogic(
        SubmitReportInputSchema.parse({
          reportName: "One-off",
          dateRange: "Last7Days",
          reportTemplateId: 16353,
          advertiserIds: [ADV],
          additionalConfig: { AdvertiserFilters: [] },
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/advertiser/);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing", async () => {
    await submitReportLogic(
      SubmitReportInputSchema.parse({
        reportName: "One-off",
        dateRange: "Last7Days",
        reportTemplateId: 16353,
        advertiserIds: [ADV],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("ttd_get_report → POST schedule, then poll the advertiser-scoped execution query", () => {
  it("creates the schedule and polls POST /v3/myreports/reportexecution/query/advertisers", async () => {
    stub.route({
      method: "POST",
      path: `${V}/myreports/reportschedule`,
      response: { ReportScheduleId: 9003 },
    });
    stub.route({
      method: "POST",
      path: `${V}/myreports/reportexecution/query/advertisers`,
      response: {
        Result: [
          {
            ReportExecutionState: "Complete",
            ReportDeliveries: [{ DownloadURL: "https://reports.example/9003.csv" }],
          },
        ],
      },
    });
    const out = await getReportLogic(
      GetReportInputSchema.parse({
        reportName: "Blocking",
        dateRange: "Yesterday",
        reportTemplateId: 16353,
        scheduleStartDate: "2026-10-02T00:00:00",
        advertiserIds: [ADV],
      }),
      ctx,
      sdk
    );

    expect(restRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      `POST ${V}/myreports/reportschedule`,
      `POST ${V}/myreports/reportexecution/query/advertisers`,
    ]);
    const [create, poll] = restRequests();
    expectRestAuth(create!);
    // basis: unverified (code-only) — see the section note above.
    expect(create!.body).toEqual({
      ReportScheduleName: "Blocking",
      ReportTemplateId: 16353,
      ReportFileFormat: "CSV",
      ReportDateRange: "Yesterday",
      ReportFrequency: "Once",
      ScheduleStartDate: "2026-10-02T00:00:00",
      ...REPORT_DEFAULTS,
      AdvertiserFilters: [ADV],
    });
    // basis: docs/api/ttd-api-reference-part4.md:257-259 (Report Executions
    // "that match the Advertisers and filters in the specified query");
    // PageStartIndex / PageSize per docs/api/ttd-api-reference-part5.md:525-532
    // (standard paged query). Field names AdvertiserIds / ReportScheduleIds:
    // unverified (code-only).
    expectRestAuth(poll!);
    expect(poll!.body).toEqual({
      AdvertiserIds: [ADV],
      ReportScheduleIds: [9003],
      PageStartIndex: 0,
      PageSize: 1,
    });
    expect(out.downloadUrl).toBe("https://reports.example/9003.csv");
    expect(remaining()).toBe(LIMIT - 2);
  });
});

describe("ttd_delete_report_schedule → DELETE /v3/myreports/reportschedule/{id}", () => {
  it("confirmed → one DELETE with no body", async () => {
    await deleteReportScheduleLogic(
      DeleteReportScheduleInputSchema.parse({ scheduleId: "9001" }),
      ctx,
      sdk
    );
    const req = onlyRestWrite();
    // basis: docs/api/ttd-api-reference-part4.md:286-288 (`DELETE
    // /v3/myreports/reportschedule/{scheduleId}` "Delete the report schedule").
    expect(req.method).toBe("DELETE");
    expect(req.url).toBe(`${API}/myreports/reportschedule/9001`);
    expect(req.headers["ttd-auth"]).toBe(TEST_TTD_TOKEN);
    expect(req.body).toBeUndefined();
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(remaining()).toBe(LIMIT - 1);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    const out = await deleteReportScheduleLogic(
      DeleteReportScheduleInputSchema.parse({ scheduleId: "9001" }),
      ctx,
      sdk
    );
    expect(out.deleted).toBe(false);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("dry_run sends nothing and asks nothing", async () => {
    await deleteReportScheduleLogic(
      DeleteReportScheduleInputSchema.parse({ scheduleId: "9001", dry_run: true }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
    expect(sdk.elicitInput).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// GraphQL passthrough and bulk jobs
// ─────────────────────────────────────────────────────────────────────────

describe("ttd_graphql_query → the caller's document and variables, verbatim", () => {
  it("a mutation is POSTed as { query, variables } with TTD-GQL-Beta when betaFeatures is set", async () => {
    const query =
      "mutation($input: CampaignUpdateSeedInput!) { campaignUpdateSeed(input: $input) { data { id } } }";
    const variables = { input: { campaignId: "camp001", seedId: "seed01" } };
    routeGraphql("campaignUpdateSeed", {
      data: { campaignUpdateSeed: { data: { id: "camp001" } } },
    });

    await graphqlQueryLogic(
      GraphqlQueryInputSchema.parse({ query, variables, betaFeatures: "feature-x" }),
      ctx,
      sdk
    );

    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: workflows src/ttd_workflows/models/graphqlrequestinput.py —
    // GraphQLRequestInput { request, variables, betaFeatures } where
    // betaFeatures is "passed as TTD-GQL-Beta header"; the { query, variables }
    // body per platform Python/Report/GenerateImmediateReportGQL.py:60-66.
    expect(req.body).toEqual({ query, variables });
    expect(req.headers["ttd-gql-beta"]).toBe("feature-x");
    expect(remaining()).toBe(LIMIT - 1);
  });

  it("without betaFeatures → no TTD-GQL-Beta header", async () => {
    await graphqlQueryLogic(
      GraphqlQueryInputSchema.parse({ query: "mutation { fileUpload { id uploadUrl } }" }),
      ctx,
      sdk
    );
    const req = onlyMutation();
    expect(req.headers["ttd-gql-beta"]).toBeUndefined();
    // No variables → the key is omitted. basis: platform
    // Python/Campaign/Creating/CreateCampaignsBulkGQL.py request_upload —
    // `mutation { fileUpload { id uploadUrl } }` sent with no variables.
    expect(req.body).toEqual({ query: "mutation { fileUpload { id uploadUrl } }" });
  });
});

describe("ttd_graphql_query_bulk → createQueryBulk", () => {
  const QUERY = 'query { partner(id: "ptn01") { thirdPartyData { nodes { id name } } } }';

  it("without variables → createQueryBulk with input { query } only", async () => {
    routeGraphql("createQueryBulk", {
      data: { createQueryBulk: { data: { id: "job1", status: "QUEUED" }, errors: [] } },
    });
    const out = await graphqlQueryBulkLogic(
      GraphqlQueryBulkInputSchema.parse({ query: QUERY }),
      ctx,
      sdk
    );
    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: platform Python/ThirdPartyData/GetAllThirdPartyDataForPartnerBatchedGQL.py:111
    // create_partner_third_party_data_job and
    // Python/FirstPartyData/GetAdvertiserFirstPartyDataBatchedGQL.py:98-120 —
    // `createQueryBulk(input: { query: """…""" }) { errors { ... on
    // MutationError { message field } ... on BulkJobQueryValidationError
    // { message field queryErrors } } data { id } }`; workflows
    // src/ttd_workflows/models/graphqlqueryjobinput.py (a query job is `query`
    // plus an optional callback, nothing else). The tool binds the same input
    // through `$input`; the type name CreateQueryBulkInput and `status` on the
    // returned job: unverified (code-only).
    expect(gqlQuery(req)).toMatch(/createQueryBulk\(input: \$input\)/);
    expect(gqlQuery(req)).toMatch(/\.\.\. on MutationError \{\s*field\s*message\s*\}/);
    expect(gqlQuery(req)).toMatch(
      /\.\.\. on BulkJobQueryValidationError \{\s*field\s*message\s*queryErrors\s*\}/
    );
    expect(gqlVariables(req)).toEqual({ input: { query: QUERY } });
    expect(out.jobId).toBe("job1");
    expect(remaining()).toBe(LIMIT - 1);
  });

  it("with variables → adds queryVariables as a JSON string; betaFeatures → TTD-GQL-Beta", async () => {
    routeGraphql("createQueryBulk", {
      data: { createQueryBulk: { data: { id: "job2", status: "QUEUED" }, errors: [] } },
    });
    const query = "query Advertiser($id: ID!) { advertiser(id: $id) { name } }";
    await graphqlQueryBulkLogic(
      GraphqlQueryBulkInputSchema.parse({
        query,
        variables: [{ id: "adv1" }, { id: "adv2" }],
        betaFeatures: "beta-1",
      }),
      ctx,
      sdk
    );
    const req = onlyMutation();
    // basis: unverified (code-only) — no TTD source shows `queryVariables`.
    expect(gqlVariables(req)).toEqual({
      input: { query, queryVariables: JSON.stringify([{ id: "adv1" }, { id: "adv2" }]) },
    });
    // basis: workflows src/ttd_workflows/models/graphqlqueryjobinput.py
    // (betaFeatures "passed as TTD-GQL-Beta header").
    expect(req.headers["ttd-gql-beta"]).toBe("beta-1");
  });

  it("dry_run sends nothing", async () => {
    await graphqlQueryBulkLogic(
      GraphqlQueryBulkInputSchema.parse({ query: QUERY, dry_run: true }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("ttd_graphql_cancel_bulk_job → cancelBulkJob", () => {
  it("sends { jobId } as $input", async () => {
    routeGraphql("cancelBulkJob", {
      data: { cancelBulkJob: { data: { id: "job1", status: "CANCELLED" }, errors: [] } },
    });
    await graphqlCancelBulkJobLogic(
      GraphqlCancelBulkJobInputSchema.parse({ jobId: "job1" }),
      ctx,
      sdk
    );
    const req = onlyMutation();
    expectGraphqlRequest(req);
    // basis: unverified (code-only) — no TTD source here shows cancelBulkJob
    // or CancelBulkJobInput.
    expect(gqlQuery(req)).toMatch(/cancelBulkJob\(input: \$input\)/);
    expect(gqlVariables(req)).toEqual({ input: { jobId: "job1" } });
    expect(remaining()).toBe(LIMIT - 1);
  });

  it("dry_run sends nothing", async () => {
    await graphqlCancelBulkJobLogic(
      GraphqlCancelBulkJobInputSchema.parse({ jobId: "job1", dry_run: true }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("ttd_graphql_mutation_bulk → createMutationBulk (sandbox only, #231)", () => {
  const MUTATION =
    "mutation UpdateBidList($input: BidListUpdateInput!) { bidListUpdate(input: $input) { data { id } userErrors { field message } } }";
  const INPUTS = [
    { id: "bl1", bidLinesToRemove: [{ domainFragment: "example.com" }] },
    { id: "bl2", bidLinesToRemove: [{ domainFragment: "example.com" }] },
  ];
  // TTD's production GraphQL endpoint per every platform sample (PROD_GQL_URL,
  // e.g. platform Python/Campaign/Creating/CreateCampaignWorkflowREST.py:17).
  const PRODUCTION_GRAPHQL_URL = "https://desk.thetradedesk.com/graphql";

  function useSession(graphqlUrl: string, baseUrl?: string) {
    session.dispose();
    session = createWireSession("ttd-wire-236-bulk", { graphqlUrl, baseUrl });
    sdk = acceptingSdkContext(session.sessionId);
  }

  it("production → refused: nothing sent, no token drawn", async () => {
    vi.stubEnv(MUTATION_BULK_PRODUCTION_OPT_IN, "");
    useSession(PRODUCTION_GRAPHQL_URL);
    await expect(
      graphqlMutationBulkLogic(
        GraphqlMutationBulkInputSchema.parse({ mutation: MUTATION, inputs: INPUTS }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/disabled against production/);
    expect(stub.requests).toHaveLength(0);
    expect(remaining()).toBe(LIMIT);
  });

  it("production dry_run → predicts the refusal and sends nothing", async () => {
    vi.stubEnv(MUTATION_BULK_PRODUCTION_OPT_IN, "");
    useSession(PRODUCTION_GRAPHQL_URL);
    const out = await graphqlMutationBulkLogic(
      GraphqlMutationBulkInputSchema.parse({ mutation: MUTATION, inputs: INPUTS, dry_run: true }),
      ctx,
      sdk
    );
    expect(out.dryRun?.wouldSucceed).toBe(false);
    expect(out.dryRun?.validationErrors[0]?.code).toBe("production_not_enabled");
    expect(stub.requests).toHaveLength(0);
  });

  it("sandbox → POST to ext-api.sb createMutationBulk with one JSON string per input", async () => {
    vi.stubEnv(MUTATION_BULK_PRODUCTION_OPT_IN, "");
    useSession(SANDBOX_GRAPHQL_URL, SANDBOX_REST_BASE_URL);
    routeGraphql(
      "createMutationBulk",
      { data: { createMutationBulk: { data: { id: "mjob1", status: "QUEUED" }, errors: [] } } },
      SANDBOX_GRAPHQL_URL
    );
    const out = await graphqlMutationBulkLogic(
      GraphqlMutationBulkInputSchema.parse({ mutation: MUTATION, inputs: INPUTS }),
      ctx,
      sdk
    );

    // Nothing reaches production.
    expect(stub.requests.every((r) => r.url === SANDBOX_GRAPHQL_URL)).toBe(true);
    const req = onlyMutation(SANDBOX_GRAPHQL_URL);
    // basis: docs/api/TTD_Foundations.md:440 (sandbox GraphQL URL
    // https://ext-api.sb.thetradedesk.com/graphql) and platform
    // Python/Campaign/Creating/CreateCampaignWorkflowREST.py:16
    // (EXTERNAL_SB_GQL_URL, same value); TTD-Auth as on production.
    expectGraphqlRequest(req, SANDBOX_GRAPHQL_URL);
    // basis: unverified (code-only) — no TTD source this repo can reach shows
    // createMutationBulk, CreateMutationBulkInput, `mutation` /
    // `mutationVariables`, or how an entry binds to the mutation's variables.
    // This pins what a sandbox run would send, so that run can confirm it.
    expect(gqlQuery(req)).toMatch(/\$input: CreateMutationBulkInput!/);
    expect(gqlQuery(req)).toMatch(/createMutationBulk\(input: \$input\)/);
    expect(gqlVariables(req)).toEqual({
      input: { mutation: MUTATION, mutationVariables: INPUTS.map((i) => JSON.stringify(i)) },
    });
    expect(out.jobId).toBe("mjob1");
    expect(remaining()).toBe(LIMIT - 1);
  });

  it("production with the operator opt-in → sends the same request to production", async () => {
    vi.stubEnv(MUTATION_BULK_PRODUCTION_OPT_IN, "true");
    useSession(PRODUCTION_GRAPHQL_URL);
    routeGraphql(
      "createMutationBulk",
      { data: { createMutationBulk: { data: { id: "mjob2", status: "QUEUED" }, errors: [] } } },
      PRODUCTION_GRAPHQL_URL
    );
    await graphqlMutationBulkLogic(
      GraphqlMutationBulkInputSchema.parse({ mutation: MUTATION, inputs: INPUTS }),
      ctx,
      sdk
    );
    const req = onlyMutation(PRODUCTION_GRAPHQL_URL);
    expectGraphqlRequest(req, PRODUCTION_GRAPHQL_URL);
    expect(gqlVariables(req)).toEqual({
      input: { mutation: MUTATION, mutationVariables: INPUTS.map((i) => JSON.stringify(i)) },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// REST POST-query reads (non-GET, no write)
// ─────────────────────────────────────────────────────────────────────────

describe("REST POST-query reads", () => {
  it("ttd_list_entities campaign → POST /v3/campaign/query/advertiser with the paged query", async () => {
    stub.route({
      method: "POST",
      path: `${V}/campaign/query/advertiser`,
      response: { Result: [{ CampaignId: "camp001" }], TotalFilteredCount: 1 },
    });
    await listEntitiesLogic(
      ListEntitiesInputSchema.parse({ entityType: "campaign", advertiserId: ADV, pageSize: 10 }),
      ctx,
      sdk
    );
    const req = onlyRestWrite();
    // basis: docs/api/ttd-api-reference-part2.md:339 (`POST
    // /v3/campaign/query/advertiser`); docs/api/ttd-api-reference-part5.md:525-532
    // (paged queries take PageSize + PageStartIndex);
    // docs/api/ttd_partner_portal_api_docs.md:3550 (a query/advertiser body
    // carries "AdvertiserId").
    expect(req.url).toBe(`${API}/campaign/query/advertiser`);
    expectRestAuth(req);
    expect(req.body).toEqual({ AdvertiserId: ADV, PageSize: 10, PageStartIndex: 0 });
    expect(remaining()).toBe(LIMIT - 1);
  });

  it("ttd_check_report_status → GET the schedule's AdvertiserFilters, then POST the execution query", async () => {
    stub.route({
      method: "GET",
      path: `${V}/myreports/reportschedule/9001`,
      response: { ReportScheduleId: 9001, AdvertiserFilters: [ADV] },
    });
    stub.route({
      method: "POST",
      path: `${V}/myreports/reportexecution/query/advertisers`,
      response: { Result: [{ ReportExecutionState: "Pending" }] },
    });
    await checkReportStatusLogic(
      CheckReportStatusInputSchema.parse({ reportScheduleId: "9001" }),
      ctx,
      sdk
    );
    // basis: docs/api/ttd-api-reference-part4.md:282 (GET schedule) and :257
    // (POST execution query); body field names: unverified (code-only).
    expect(restRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET ${V}/myreports/reportschedule/9001`,
      `POST ${V}/myreports/reportexecution/query/advertisers`,
    ]);
    expect(onlyRestWrite().body).toEqual({
      AdvertiserIds: [ADV],
      ReportScheduleIds: [9001],
      PageStartIndex: 0,
      PageSize: 1,
    });
    expect(remaining()).toBe(LIMIT - 2);
  });

  it("ttd_list_report_schedules → POST /v3/myreports/reportschedule/query", async () => {
    stub.route({
      method: "POST",
      path: `${V}/myreports/reportschedule/query`,
      response: { Result: [], TotalFilteredCount: 0 },
    });
    await listReportSchedulesLogic(
      ListReportSchedulesInputSchema.parse({ advertiserIds: [ADV] }),
      ctx,
      sdk
    );
    const req = onlyRestWrite();
    // basis: docs/api/ttd-api-reference-part4.md:278 (path, method);
    // docs/api/ttd-api-reference-part5.md:525-532 (PageSize, PageStartIndex).
    // AdvertiserFilters as [{ Type, Value }]: unverified (code-only) — note the
    // schedule create sends AdvertiserFilters as a plain id array.
    expect(req.url).toBe(`${API}/myreports/reportschedule/query`);
    expectRestAuth(req);
    expect(req.body).toEqual({
      PageSize: 50,
      PageStartIndex: 0,
      AdvertiserFilters: [{ Type: "AdvertiserId", Value: ADV }],
    });
  });
});

// Sanity: the routes this file stubs are the hosts config points at.
describe("wire kit", () => {
  it("REST and GraphQL go to the configured hosts", () => {
    expect(REST_HOST).toBe(new URL(mcpConfig.ttdApiBaseUrl).host);
    expect(GRAPHQL_HOST).toBe(new URL(mcpConfig.ttdGraphqlUrl).host);
    expect(GRAPHQL_PATH).toBe("/graphql");
  });
});
