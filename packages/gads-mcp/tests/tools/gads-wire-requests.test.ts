// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-request assertions for every gads-mcp tool that issues a non-GET
 * upstream request (#236). Each test calls the REAL tool logic over REAL
 * session services (GAdsService, GAdsHttpClient, the refresh-token adapter and
 * a real `RateLimiter`), with only `globalThis.fetch` stubbed, and asserts the
 * full request: HTTP method, URL and the exact JSON body.
 *
 * Expected shapes come from Google's Discovery document, fetched 2026-09-30:
 *   https://googleads.googleapis.com/$discovery/rest?version=v25
 *   revision 20260929 (re-checked on the move from v23 to v25), rootUrl `https://googleads.googleapis.com/`.
 * Schema names below drop the `GoogleAdsGoogleadsV25` prefix (the same
 * convention as `tests/fixtures/google-ads-discovery-extract.json`).
 * Every `:mutate` method is `httpMethod: POST`, path
 * `v25/customers/{+customerId}/<collection>:mutate`, request
 * `Services__Mutate<Collection>Request` = { operations[], partialFailure,
 * validateOnly, responseContentType }, each operation one of
 * `create` / `update` (+ `updateMask`, format `google-fieldmask`) / `remove`
 * (a resource-name string).
 *
 * Request headers (`developer-token`, `login-customer-id`) are not described
 * by the Discovery document, and the Google Ads REST auth guide
 * (developers.google.com) is unreachable from this repo's egress policy, so
 * those assertions are `basis: unverified (code-only)`.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
  removeEntityLogic,
  RemoveEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/remove-entity.tool.js";
import {
  duplicateEntityLogic,
  DuplicateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/duplicate-entity.tool.js";
import {
  bulkMutateLogic,
  BulkMutateInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-mutate.tool.js";
import {
  bulkCreateEntitiesLogic,
  BulkCreateEntitiesInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import {
  bulkUpdateStatusLogic,
  BulkUpdateStatusInputSchema,
} from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import {
  adjustBidsLogic,
  AdjustBidsInputSchema,
} from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";
import {
  validateEntityLogic,
  ValidateEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/validate-entity.tool.js";
import {
  uploadImageLogic,
  UploadImageInputSchema,
} from "../../src/mcp-server/tools/definitions/upload-image.tool.js";
import {
  uploadVideoLogic,
  UploadVideoInputSchema,
} from "../../src/mcp-server/tools/definitions/upload-video.tool.js";
import {
  gaqlSearchLogic,
  GAQLSearchInputSchema,
} from "../../src/mcp-server/tools/definitions/gaql-search.tool.js";
import {
  getEntityLogic,
  GetEntityInputSchema,
} from "../../src/mcp-server/tools/definitions/get-entity.tool.js";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  GADS_HOST,
  GOOGLE_TOKEN_URL,
  TEST_ACCESS_TOKEN,
  TEST_CREDENTIALS,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/wire.js";

/** Discovery rootUrl `https://googleads.googleapis.com/` + path prefix `v25/`. */
const API = "https://googleads.googleapis.com/v25";
const CID = "1234567890";
const ctx = { requestId: "wire-req" } as any;

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

/** Every request to the Google Ads API host (OAuth exchange excluded). */
function apiRequests(): WireRequest[] {
  return stub.to(GADS_HOST);
}

/** `:mutate` requests that would execute (i.e. not `validateOnly`). */
function executingMutates(): WireRequest[] {
  return apiRequests().filter(
    (r) =>
      r.path.endsWith(":mutate") && (r.body as { validateOnly?: boolean })?.validateOnly !== true
  );
}

function onlyExecutingMutate(): WireRequest {
  const writes = executingMutates();
  expect(writes).toHaveLength(1);
  return writes[0]!;
}

function searches(): WireRequest[] {
  return apiRequests().filter((r) => r.path.endsWith("/googleAds:search"));
}

/**
 * basis: Authorization is the OAuth2 bearer from the refresh exchange;
 * `developer-token` / `login-customer-id` header names — unverified (code-only),
 * see the file header.
 */
function expectGAdsHeaders(req: WireRequest) {
  expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  expect(req.headers["developer-token"]).toBe(TEST_CREDENTIALS.developerToken);
  expect(req.headers["login-customer-id"]).toBe(TEST_CREDENTIALS.loginCustomerId);
  expect(req.headers["content-type"]).toBe("application/json");
}

/** Every Google Ads call drew one token from the REAL limiter's `gads:{customerId}` bucket. */
function expectOneTokenPerApiCall() {
  expect(session.rateLimiter.getRemainingTokens(`gads:${CID}`)).toBe(
    mcpConfig.gadsRateLimitPerMinute - apiRequests().length
  );
}

function routeSearch(results: unknown[]) {
  stub.route({
    method: "POST",
    host: GADS_HOST,
    path: `/v25/customers/${CID}/googleAds:search`,
    response: { results },
  });
}

function routeMutate(collection: string, response: unknown) {
  stub.route({
    method: "POST",
    host: GADS_HOST,
    path: `/v25/customers/${CID}/${collection}:mutate`,
    response,
  });
}

describe("OAuth: the real refresh-token adapter exchanges before the API call", () => {
  it("POSTs grant_type=refresh_token to Google's token endpoint", async () => {
    await gaqlSearchLogic(
      GAQLSearchInputSchema.parse({ customerId: CID, query: "SELECT campaign.id FROM campaign" }),
      ctx,
      sdk
    );
    const token = stub.requests.find((r) => r.url === GOOGLE_TOKEN_URL);
    expect(token?.method).toBe("POST");
    // basis: Google OAuth 2.0 refresh flow (RFC 6749 §6 form parameters).
    const form = new URLSearchParams(String(token?.body));
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe(TEST_CREDENTIALS.refreshToken);
    expect(form.get("client_id")).toBe(TEST_CREDENTIALS.clientId);
  });
});

describe("gads_create_entity → customers.<collection>.mutate (create)", () => {
  it("campaign → POST …/campaigns:mutate { operations: [{ create }] }", async () => {
    routeMutate("campaigns", { results: [{ resourceName: `customers/${CID}/campaigns/555` }] });
    routeSearch([{ campaign: { id: "555", name: "Autumn", status: "PAUSED" } }]);
    const data = {
      name: "Autumn",
      status: "PAUSED",
      advertisingChannelType: "SEARCH",
      campaignBudget: `customers/${CID}/campaignBudgets/444`,
      manualCpc: {},
      containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    };

    const out = await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "campaign", customerId: CID, data }),
      ctx,
      sdk
    );

    const req = onlyExecutingMutate();
    // basis: discovery `customers.campaigns.mutate` — httpMethod POST, path
    // `v25/customers/{+customerId}/campaigns:mutate`; request
    // `Services__MutateCampaignsRequest.operations[]` of `Services__CampaignOperation`,
    // whose `create` is a `Resources__Campaign` ("No resource name is expected").
    // Field names/enums from `Resources__Campaign`: name, status (PAUSED),
    // advertisingChannelType (SEARCH), campaignBudget ("resource name of the
    // campaign budget"), manualCpc ($ref Common__ManualCpc), containsEuPoliticalAdvertising.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/customers/${CID}/campaigns:mutate`);
    expectGAdsHeaders(req);
    expect(req.body).toEqual({ operations: [{ create: data }] });
    // The created id is read back from `Services__MutateCampaignResult.resourceName`.
    expect(out.after?.platformEntityId).toBe("555");
    expectOneTokenPerApiCall();
  });

  it("campaignBudget → POST …/campaignBudgets:mutate", async () => {
    routeMutate("campaignBudgets", {
      results: [{ resourceName: `customers/${CID}/campaignBudgets/444` }],
    });
    const data = { name: "Autumn budget", amountMicros: "50000000", deliveryMethod: "STANDARD" };

    await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "campaignBudget", customerId: CID, data }),
      ctx,
      sdk
    );

    const req = onlyExecutingMutate();
    // basis: discovery `customers.campaignBudgets.mutate` — POST
    // `v25/customers/{+customerId}/campaignBudgets:mutate`; `Resources__CampaignBudget`
    // amountMicros (int64 → JSON string), deliveryMethod enum STANDARD.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/customers/${CID}/campaignBudgets:mutate`);
    expect(req.body).toEqual({ operations: [{ create: data }] });
  });

  it("dry_run sends only a validateOnly mutate — nothing executes", async () => {
    const data = { name: "Autumn", status: "PAUSED", advertisingChannelType: "SEARCH" };
    const out = await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "campaign",
        customerId: CID,
        data,
        dry_run: true,
      }),
      ctx,
      sdk
    );

    expect(executingMutates()).toHaveLength(0);
    const [validate] = apiRequests();
    // basis: `Services__MutateCampaignsRequest.validateOnly` — "If true, the
    // request is validated but not executed."
    expect(validate?.url).toBe(`${API}/customers/${CID}/campaigns:mutate`);
    expect(validate?.body).toEqual({ operations: [{ create: data }], validateOnly: true });
    expect(out.dryRun?.wouldSucceed).toBe(true);
  });
});

describe("gads_update_entity → customers.<collection>.mutate (update + updateMask)", () => {
  it("adGroup → POST …/adGroups:mutate { operations: [{ update: { resourceName, … }, updateMask }] }", async () => {
    routeMutate("adGroups", { results: [{ resourceName: `customers/${CID}/adGroups/777` }] });
    routeSearch([{ adGroup: { id: "777", name: "AG", status: "ENABLED" } }]);

    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "adGroup",
        customerId: CID,
        entityId: "777",
        data: { status: "PAUSED", name: "AG renamed" },
        updateMask: "status,name",
      }),
      ctx,
      sdk
    );

    const req = onlyExecutingMutate();
    // basis: discovery `customers.adGroups.mutate` — POST
    // `v25/customers/{+customerId}/adGroups:mutate`; `Services__AdGroupOperation`
    // `update` ("expected to have a valid resource name") + `updateMask`
    // (format google-fieldmask → proto3 JSON: comma-separated lowerCamelCase
    // paths). `Resources__AdGroup.resourceName` has the form
    // `customers/{customer_id}/adGroups/{ad_group_id}`.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/customers/${CID}/adGroups:mutate`);
    expectGAdsHeaders(req);
    expect(req.body).toEqual({
      operations: [
        {
          update: {
            status: "PAUSED",
            name: "AG renamed",
            resourceName: `customers/${CID}/adGroups/777`,
          },
          updateMask: "status,name",
        },
      ],
    });
    // before + after snapshot reads bracket the write.
    expect(searches()).toHaveLength(2);
    expectOneTokenPerApiCall();
  });

  it("dry_run sends a validateOnly update and executes nothing", async () => {
    routeSearch([{ adGroup: { id: "777", name: "AG", status: "ENABLED" } }]);
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "adGroup",
        customerId: CID,
        entityId: "777",
        data: { status: "PAUSED" },
        updateMask: "status",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(executingMutates()).toHaveLength(0);
    const validate = apiRequests().find((r) => r.path.endsWith(":mutate"));
    // basis: `Services__MutateAdGroupsRequest.validateOnly`.
    expect(validate?.body).toEqual({
      operations: [
        {
          update: { status: "PAUSED", resourceName: `customers/${CID}/adGroups/777` },
          updateMask: "status",
        },
      ],
      validateOnly: true,
    });
  });
});

describe("gads_remove_entity → customers.<collection>.mutate (remove)", () => {
  it("campaign → POST …/campaigns:mutate { operations: [{ remove: resourceName }] }", async () => {
    routeMutate("campaigns", { results: [{ resourceName: `customers/${CID}/campaigns/888` }] });
    routeSearch([{ campaign: { id: "888", name: "Old", status: "REMOVED" } }]);

    const out = await removeEntityLogic(
      RemoveEntityInputSchema.parse({ entityType: "campaign", customerId: CID, entityId: "888" }),
      ctx,
      sdk
    );

    const req = onlyExecutingMutate();
    // basis: discovery `Services__CampaignOperation.remove` — "A resource name
    // for the removed campaign is expected, in this format:
    // `customers/{customer_id}/campaigns/{campaign_id}`".
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/customers/${CID}/campaigns:mutate`);
    expectGAdsHeaders(req);
    expect(req.body).toEqual({ operations: [{ remove: `customers/${CID}/campaigns/888` }] });
    expect(out.confirmed).toBe(true);
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
  });

  it("keyword → composite resource name adGroupCriteria/{adGroupId}~{criterionId}", async () => {
    await removeEntityLogic(
      RemoveEntityInputSchema.parse({
        entityType: "keyword",
        customerId: CID,
        entityId: "777~999",
      }),
      ctx,
      sdk
    );
    const req = onlyExecutingMutate();
    // basis: discovery `customers.adGroupCriteria.mutate` (POST
    // `…/adGroupCriteria:mutate`); `Services__AdGroupCriterionOperation.remove`
    // format `customers/{customer_id}/adGroupCriteria/{ad_group_id}~{criterion_id}`.
    expect(req.url).toBe(`${API}/customers/${CID}/adGroupCriteria:mutate`);
    expect(req.body).toEqual({
      operations: [{ remove: `customers/${CID}/adGroupCriteria/777~999` }],
    });
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    const out = await removeEntityLogic(
      RemoveEntityInputSchema.parse({ entityType: "campaign", customerId: CID, entityId: "888" }),
      ctx,
      sdk
    );
    expect(out.confirmed).toBe(false);
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends only a validateOnly remove, with no confirmation prompt", async () => {
    routeSearch([{ campaign: { id: "888", name: "Old", status: "ENABLED" } }]);
    await removeEntityLogic(
      RemoveEntityInputSchema.parse({
        entityType: "campaign",
        customerId: CID,
        entityId: "888",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(executingMutates()).toHaveLength(0);
    const validate = apiRequests().find((r) => r.path.endsWith(":mutate"));
    expect(validate?.body).toEqual({
      operations: [{ remove: `customers/${CID}/campaigns/888` }],
      validateOnly: true,
    });
  });
});

describe("gads_duplicate_entity → googleAds.search then campaigns.mutate (create)", () => {
  const SOURCE = {
    resourceName: `customers/${CID}/campaigns/321`,
    id: "321",
    name: "Source",
    status: "PAUSED",
    advertisingChannelType: "SEARCH",
    // Far-future dates, so the copy keeps them whatever today is.
    startDateTime: "2099-10-01 00:00:00",
    endDateTime: "2099-12-31 23:59:59",
    containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    campaignBudget: `customers/${CID}/campaignBudgets/444`,
    // `biddingStrategyType` is output only; the scheme is `Common__TargetCpa`
    // (targetCpaMicros int64 → JSON string).
    biddingStrategyType: "TARGET_CPA",
    targetCpa: { targetCpaMicros: "2500000" },
  };

  it("creates the copy without the server-assigned id / resourceName", async () => {
    routeSearch([{ campaign: SOURCE }]);
    routeMutate("campaigns", { results: [{ resourceName: `customers/${CID}/campaigns/322` }] });

    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "campaign",
        customerId: CID,
        entityId: "321",
        options: { name: "Source (copy)" },
      }),
      ctx,
      sdk
    );

    // The source read: `customers.googleAds.search` — POST, body is a
    // `Services__SearchGoogleAdsRequest` carrying only `query` (no `pageSize`:
    // "Google Ads API returns a PAGE_SIZE_NOT_SUPPORTED error if this field is set").
    const [read] = searches();
    expect(read?.url).toBe(`${API}/customers/${CID}/googleAds:search`);
    expect(Object.keys(read?.body as object)).toEqual(["query"]);
    expect((read?.body as { query: string }).query).toMatch(
      /FROM campaign WHERE campaign\.id = 321\b/
    );
    // basis: unverified (code-only) — GAQL selectability of these fields;
    // names are the snake_case of the Discovery `Resources__Campaign` properties.
    expect((read?.body as { query: string }).query).toMatch(
      /campaign\.bidding_strategy_type, campaign\.bidding_strategy, .*campaign\.target_cpa\.target_cpa_micros/
    );

    const req = onlyExecutingMutate();
    // basis: `Services__CampaignOperation.create` — "No resource name is
    // expected for the new campaign"; `Resources__Campaign.id` is "Output only".
    // Every other key is a writable `Resources__Campaign` field (startDateTime /
    // endDateTime "yyyy-MM-dd HH:mm:ss", containsEuPoliticalAdvertising enum).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/customers/${CID}/campaigns:mutate`);
    expect(req.body).toEqual({
      operations: [
        {
          create: {
            name: "Source (copy)",
            status: "PAUSED",
            advertisingChannelType: "SEARCH",
            containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
            campaignBudget: `customers/${CID}/campaignBudgets/444`,
            // basis: `Resources__Campaign.targetCpa` ("Standard Target CPA
            // bidding strategy"); `biddingStrategyType` is "Output only" and not sent.
            targetCpa: { targetCpaMicros: "2500000" },
            startDateTime: "2099-10-01 00:00:00",
            endDateTime: "2099-12-31 23:59:59",
          },
        },
      ],
    });
    expectOneTokenPerApiCall();
  });

  it("an ENABLED source is copied with status PAUSED, overriding options.status", async () => {
    routeSearch([{ campaign: { ...SOURCE, status: "ENABLED" } }]);
    routeMutate("campaigns", { results: [{ resourceName: `customers/${CID}/campaigns/323` }] });

    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "campaign",
        customerId: CID,
        entityId: "321",
        options: { status: "ENABLED" },
      }),
      ctx,
      sdk
    );

    // basis: `Resources__Campaign.status` (CampaignStatus: ENABLED | PAUSED |
    // REMOVED) — "When a new campaign is added, the status defaults to ENABLED",
    // so the copy's PAUSED status must be sent explicitly.
    const req = onlyExecutingMutate();
    const create = (req.body as { operations: Array<{ create: Record<string, unknown> }> })
      .operations[0]?.create;
    expect(create?.status).toBe("PAUSED");
    expectOneTokenPerApiCall();
  });

  it("omits a past start and reports it; refuses a past end with nothing created", async () => {
    routeSearch([{ campaign: { ...SOURCE, startDateTime: "2001-01-01 00:00:00" } }]);
    routeMutate("campaigns", { results: [{ resourceName: `customers/${CID}/campaigns/324` }] });
    const result = await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "campaign",
        customerId: CID,
        entityId: "321",
      }),
      ctx,
      sdk
    );
    const create = (
      onlyExecutingMutate().body as { operations: Array<{ create: Record<string, unknown> }> }
    ).operations[0]?.create;
    expect(create).not.toHaveProperty("startDateTime");
    expect(result.copyAdjustments?.[0]).toMatch(/startDateTime omitted/);

    // Later routes take precedence: the next read returns an ended source.
    const mutatesBefore = executingMutates().length;
    routeSearch([{ campaign: { ...SOURCE, endDateTime: "2001-12-31 23:59:59" } }]);
    await expect(
      duplicateEntityLogic(
        DuplicateEntityInputSchema.parse({
          entityType: "campaign",
          customerId: CID,
          entityId: "321",
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/may already have passed/);
    expect(executingMutates()).toHaveLength(mutatesBefore);
  });

  it("dry_run reads the source and sends only a validateOnly create", async () => {
    routeSearch([{ campaign: SOURCE }]);
    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "campaign",
        customerId: CID,
        entityId: "321",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(executingMutates()).toHaveLength(0);
    const validate = apiRequests().find((r) => r.path.endsWith(":mutate"));
    expect((validate?.body as { validateOnly?: boolean }).validateOnly).toBe(true);
  });
});

describe("gads_bulk_mutate → customers.<collection>.mutate (mixed operations)", () => {
  const operations = [
    { create: { name: "New AG", campaign: `customers/${CID}/campaigns/555`, status: "PAUSED" } },
    {
      update: { resourceName: `customers/${CID}/adGroups/777`, cpcBidMicros: "2000000" },
      updateMask: "cpcBidMicros",
    },
    { remove: `customers/${CID}/adGroups/778` },
  ];

  it("partialFailure: true → { operations, partialFailure: true }", async () => {
    routeMutate("adGroups", { results: [{ resourceName: "a" }, { resourceName: "b" }, {}] });
    await bulkMutateLogic(
      BulkMutateInputSchema.parse({
        entityType: "adGroup",
        customerId: CID,
        operations,
        partialFailure: true,
      }),
      ctx,
      sdk
    );
    const req = onlyExecutingMutate();
    // basis: discovery `Services__MutateAdGroupsRequest` — operations[] of
    // `Services__AdGroupOperation` (create | update+updateMask | remove), and
    // `partialFailure` ("If true, successful operations will be carried out and
    // invalid operations will return errors").
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/customers/${CID}/adGroups:mutate`);
    expectGAdsHeaders(req);
    expect(req.body).toEqual({ operations, partialFailure: true });
    expectOneTokenPerApiCall();
  });

  it("default (atomic) omits partialFailure — the API default is false", async () => {
    await bulkMutateLogic(
      BulkMutateInputSchema.parse({ entityType: "adGroup", customerId: CID, operations }),
      ctx,
      sdk
    );
    // basis: `partialFailure` — "If false, all operations will be carried out in
    // one transaction if and only if they are all valid. Default is false."
    expect(onlyExecutingMutate().body).toEqual({ operations });
  });

  it("dry_run sends nothing", async () => {
    await bulkMutateLogic(
      BulkMutateInputSchema.parse({
        entityType: "adGroup",
        customerId: CID,
        operations,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("gads_bulk_create_entities → customers.<collection>.mutate (creates, partialFailure)", () => {
  const items = [
    {
      adGroup: `customers/${CID}/adGroups/777`,
      status: "ENABLED",
      keyword: { text: "running shoes", matchType: "PHRASE" },
    },
    {
      adGroup: `customers/${CID}/adGroups/777`,
      status: "PAUSED",
      keyword: { text: "trail shoes", matchType: "EXACT" },
    },
  ];

  it("keyword → POST …/adGroupCriteria:mutate { operations: [{ create }…], partialFailure: true }", async () => {
    routeMutate("adGroupCriteria", {
      results: [
        { resourceName: `customers/${CID}/adGroupCriteria/777~1` },
        { resourceName: `customers/${CID}/adGroupCriteria/777~2` },
      ],
    });
    const out = await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({ entityType: "keyword", customerId: CID, items }),
      ctx,
      sdk
    );
    const req = onlyExecutingMutate();
    // basis: discovery `customers.adGroupCriteria.mutate` — POST
    // `…/adGroupCriteria:mutate`; `Resources__AdGroupCriterion` adGroup (resource
    // name), status enum, keyword `Common__KeywordInfo` { text, matchType PHRASE|EXACT };
    // `partialFailure: true` as above.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/customers/${CID}/adGroupCriteria:mutate`);
    expect(req.body).toEqual({
      operations: items.map((create) => ({ create })),
      partialFailure: true,
    });
    expect(out.successCount).toBe(2);
    expectOneTokenPerApiCall();
  });

  it("dry_run sends nothing", async () => {
    await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({
        entityType: "keyword",
        customerId: CID,
        items,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("gads_bulk_update_status → customers.<collection>.mutate", () => {
  it("ad PAUSED → update { resourceName adGroupAds/{adGroupId}~{adId}, status } + updateMask status", async () => {
    routeMutate("adGroupAds", {
      results: [
        { resourceName: `customers/${CID}/adGroupAds/777~1` },
        { resourceName: `customers/${CID}/adGroupAds/777~2` },
      ],
    });
    const out = await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "ad",
        customerId: CID,
        entityIds: ["777~1", "777~2"],
        status: "PAUSED",
      }),
      ctx,
      sdk
    );
    const req = onlyExecutingMutate();
    // basis: discovery `customers.adGroupAds.mutate` — POST `…/adGroupAds:mutate`;
    // `Resources__AdGroupAd.resourceName` form
    // `customers/{customer_id}/adGroupAds/{ad_group_id}~{ad_id}`, `status` enum
    // PAUSED; `Services__AdGroupAdOperation.update` + `updateMask`.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/customers/${CID}/adGroupAds:mutate`);
    expectGAdsHeaders(req);
    expect(req.body).toEqual({
      operations: [
        {
          update: { resourceName: `customers/${CID}/adGroupAds/777~1`, status: "PAUSED" },
          updateMask: "status",
        },
        {
          update: { resourceName: `customers/${CID}/adGroupAds/777~2`, status: "PAUSED" },
          updateMask: "status",
        },
      ],
      partialFailure: true,
    });
    expect(out.successCount).toBe(2);
  });

  it("campaign REMOVED → remove operations (REMOVED is not a settable status)", async () => {
    routeMutate("campaigns", { results: [{ resourceName: `customers/${CID}/campaigns/5` }] });
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        customerId: CID,
        entityIds: ["5"],
        status: "REMOVED",
      }),
      ctx,
      sdk
    );
    // basis: `Services__CampaignOperation.remove` resource-name form, as above.
    expect(onlyExecutingMutate().body).toEqual({
      operations: [{ remove: `customers/${CID}/campaigns/5` }],
      partialFailure: true,
    });
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "campaign",
        customerId: CID,
        entityIds: ["5"],
        status: "PAUSED",
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
        customerId: CID,
        entityIds: ["5"],
        status: "PAUSED",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("gads_adjust_bids → googleAds.search (read) then adGroups.mutate (update)", () => {
  it("writes only the changed bid field, masked by updateMask", async () => {
    routeSearch([{ adGroup: { id: "777", name: "AG", cpcBidMicros: "1000000" } }]);
    routeMutate("adGroups", { results: [{ resourceName: `customers/${CID}/adGroups/777` }] });

    const out = await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        customerId: CID,
        adjustments: [{ adGroupId: "777", cpcBidMicros: "1500000" }],
      }),
      ctx,
      sdk
    );

    const req = onlyExecutingMutate();
    // basis: discovery `customers.adGroups.mutate` — POST `…/adGroups:mutate`;
    // `Resources__AdGroup.cpcBidMicros` (int64 → JSON string); updateMask
    // google-fieldmask in lowerCamelCase.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/customers/${CID}/adGroups:mutate`);
    expectGAdsHeaders(req);
    expect(req.body).toEqual({
      operations: [
        {
          update: { cpcBidMicros: "1500000", resourceName: `customers/${CID}/adGroups/777` },
          updateMask: "cpcBidMicros",
        },
      ],
    });
    expect(out.results[0]).toMatchObject({
      success: true,
      previousCpcBidMicros: "1000000",
      newCpcBidMicros: "1500000",
    });
    // One GAQL read + one mutate, both on the REAL limiter.
    expect(searches()).toHaveLength(1);
    expectOneTokenPerApiCall();
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        customerId: CID,
        adjustments: [{ adGroupId: "777", cpcBidMicros: "1500000" }],
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        customerId: CID,
        adjustments: [{ adGroupId: "777", cpmBidMicros: "3000000" }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("gads_validate_entity → customers.<collection>.mutate with validateOnly", () => {
  it("create mode → { operations: [{ create }], validateOnly: true } and nothing executes", async () => {
    const data = { name: "Budget", amountMicros: "1000000" };
    const out = await validateEntityLogic(
      ValidateEntityInputSchema.parse({
        entityType: "campaignBudget",
        customerId: CID,
        mode: "create",
        data,
      }),
      ctx,
      sdk
    );
    expect(executingMutates()).toHaveLength(0);
    const [req] = apiRequests();
    // basis: discovery `customers.campaignBudgets.mutate` + request
    // `validateOnly` — "the request is validated but not executed".
    expect(req?.method).toBe("POST");
    expect(req?.url).toBe(`${API}/customers/${CID}/campaignBudgets:mutate`);
    expect(req?.body).toEqual({ operations: [{ create: data }], validateOnly: true });
    expect(out.valid).toBe(true);
  });
});

describe("gads_upload_image → download, then assets.mutate (create ImageAsset)", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  it("POSTs base64 imageAsset.data + mimeType IMAGE_PNG", async () => {
    stub.route({
      method: "GET",
      host: "cdn.example.com",
      path: "/banner.png",
      rawBody: PNG,
      contentType: "image/png",
    });
    routeMutate("assets", { results: [{ resourceName: `customers/${CID}/assets/42` }] });

    const out = await uploadImageLogic(
      UploadImageInputSchema.parse({
        customerId: CID,
        name: "Banner",
        mediaUrl: "https://cdn.example.com/banner.png",
      }),
      ctx,
      sdk
    );

    // The media download must not carry the Google bearer token to a third-party host.
    const download = stub.to("cdn.example.com");
    expect(download).toHaveLength(1);
    expect(download[0]!.headers["authorization"]).toBeUndefined();

    const req = onlyExecutingMutate();
    // basis: discovery `customers.assets.mutate` — POST
    // `v25/customers/{+customerId}/assets:mutate`; `Services__AssetOperation.create`
    // is a `Resources__Asset` { name, type enum IMAGE, imageAsset }, and
    // `Common__ImageAsset.data` is `format: byte` (base64; "This field is mutate
    // only"), `mimeType` enum IMAGE_PNG. Note the Discovery document flags
    // `Asset.type` and `Asset.imageAsset` as "Output only" while calling
    // `imageAsset.data` mutate-only — internally inconsistent; the shape matches
    // Google's own image-asset examples, so it is asserted, not reported.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/customers/${CID}/assets:mutate`);
    expectGAdsHeaders(req);
    expect(req.body).toEqual({
      operations: [
        {
          create: {
            name: "Banner",
            type: "IMAGE",
            imageAsset: { data: Buffer.from(PNG).toString("base64"), mimeType: "IMAGE_PNG" },
          },
        },
      ],
    });
    expect(out.resourceName).toBe(`customers/${CID}/assets/42`);
  });

  it("dry_run downloads nothing and sends nothing", async () => {
    await uploadImageLogic(
      UploadImageInputSchema.parse({
        customerId: CID,
        name: "Banner",
        mediaUrl: "https://cdn.example.com/banner.png",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("gads_upload_video → assets.mutate (create YouTubeVideoAsset)", () => {
  it("POSTs youtubeVideoAsset { youtubeVideoId, youtubeVideoTitle }", async () => {
    routeMutate("assets", { results: [{ resourceName: `customers/${CID}/assets/43` }] });
    await uploadVideoLogic(
      UploadVideoInputSchema.parse({
        customerId: CID,
        name: "Launch video",
        youtubeVideoId: "dQw4w9WgXcQ",
      }),
      ctx,
      sdk
    );
    const req = onlyExecutingMutate();
    // basis: discovery `customers.assets.mutate` (POST `…/assets:mutate`);
    // `Resources__Asset.youtubeVideoAsset` ("Immutable. A YouTube video asset.")
    // → `Common__YoutubeVideoAsset` { youtubeVideoId ("the 11 character string"),
    // youtubeVideoTitle }; `type` enum YOUTUBE_VIDEO.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/customers/${CID}/assets:mutate`);
    expect(req.body).toEqual({
      operations: [
        {
          create: {
            name: "Launch video",
            type: "YOUTUBE_VIDEO",
            youtubeVideoAsset: { youtubeVideoId: "dQw4w9WgXcQ", youtubeVideoTitle: "Launch video" },
          },
        },
      ],
    });
  });

  it("dry_run sends nothing", async () => {
    await uploadVideoLogic(
      UploadVideoInputSchema.parse({
        customerId: CID,
        name: "Launch video",
        youtubeVideoId: "dQw4w9WgXcQ",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("reads are POSTs too: customers.googleAds.search", () => {
  it("gads_gaql_search → { query } only, then { query, pageToken } — never pageSize", async () => {
    const query = "SELECT campaign.id, campaign.name FROM campaign";
    stub.route({
      method: "POST",
      host: GADS_HOST,
      path: `/v25/customers/${CID}/googleAds:search`,
      response: (req) =>
        (req.body as { pageToken?: string }).pageToken
          ? { results: [{ campaign: { id: "2" } }] }
          : { results: [{ campaign: { id: "1" } }], nextPageToken: "page-2" },
    });

    await gaqlSearchLogic(GAQLSearchInputSchema.parse({ customerId: CID, query }), ctx, sdk);

    const reqs = searches();
    // basis: discovery `customers.googleAds.search` — POST
    // `v25/customers/{+customerId}/googleAds:search`, request
    // `Services__SearchGoogleAdsRequest` { query (required), pageToken ("Use
    // the value obtained from next_page_token"), … }; `pageSize` — "Google Ads
    // API returns a PAGE_SIZE_NOT_SUPPORTED error if this field is set".
    expect(reqs[0]?.method).toBe("POST");
    expect(reqs[0]?.url).toBe(`${API}/customers/${CID}/googleAds:search`);
    expectGAdsHeaders(reqs[0]!);
    expect(reqs[0]?.body).toEqual({ query });
    expect(reqs[1]?.body).toEqual({ query, pageToken: "page-2" });
    for (const r of reqs) expect(r.body).not.toHaveProperty("pageSize");
  });

  it("gads_get_entity → { query } selecting the entity by id", async () => {
    routeSearch([{ campaign: { id: "555", name: "C" } }]);
    await getEntityLogic(
      GetEntityInputSchema.parse({ entityType: "campaign", customerId: CID, entityId: "555" }),
      ctx,
      sdk
    );
    const [req] = searches();
    expect(req?.url).toBe(`${API}/customers/${CID}/googleAds:search`);
    // basis: `Services__SearchGoogleAdsRequest` — `query` is the only key sent.
    expect(Object.keys(req?.body as object)).toEqual(["query"]);
    // basis: unverified (code-only) — the GAQL text itself is authored here.
    expect((req?.body as { query: string }).query).toMatch(
      /^SELECT .+ FROM campaign WHERE campaign\.id = 555 LIMIT 1\b/
    );
  });
});
