// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-request assertions for every msads-mcp write tool (#236). Each test
 * calls the REAL tool logic over REAL session services (MsAdsService,
 * MsAdsReportingService, MsAdsHttpClient, the access-token adapter and a real
 * `RateLimiter`), with only `globalThis.fetch` stubbed, and asserts the full
 * request: HTTP method, URL, auth headers and the exact JSON body.
 *
 * Expected shapes come from MicrosoftDocs/Advertising (GitHub, default branch,
 * fetched 2026-09-25), `advertising/bingads-13/<service>/<operation>.md`:
 * the "Request Url" section (HTTP verb fence + production URL) and the
 * "Request Body Elements" table / "Request JSON" template. The file cited on
 * each assertion is relative to `advertising/bingads-13/`. `msads-request-bodies.test.ts`
 * asserts the same routes one layer up (the object handed to a mocked
 * MsAdsHttpClient); this file asserts what is serialized onto the wire.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpError } from "@cesteral/shared";
import { createEntityLogic } from "../../src/mcp-server/tools/definitions/create-entity.tool.js";
import { updateEntityLogic } from "../../src/mcp-server/tools/definitions/update-entity.tool.js";
import { deleteEntityLogic } from "../../src/mcp-server/tools/definitions/delete-entity.tool.js";
import { duplicateEntityLogic } from "../../src/mcp-server/tools/definitions/duplicate-entity.tool.js";
import { bulkCreateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-create-entities.tool.js";
import { bulkUpdateEntitiesLogic } from "../../src/mcp-server/tools/definitions/bulk-update-entities.tool.js";
import { bulkUpdateStatusLogic } from "../../src/mcp-server/tools/definitions/bulk-update-status.tool.js";
import { adjustBidsLogic } from "../../src/mcp-server/tools/definitions/adjust-bids.tool.js";
import { manageAdExtensionsLogic } from "../../src/mcp-server/tools/definitions/manage-ad-extensions.tool.js";
import { manageCriterionsLogic } from "../../src/mcp-server/tools/definitions/manage-criterions.tool.js";
import { importFromGoogleLogic } from "../../src/mcp-server/tools/definitions/import-from-google.tool.js";
import {
  submitReportLogic,
  SubmitReportInputSchema,
} from "../../src/mcp-server/tools/definitions/submit-report.tool.js";
import { createReportScheduleLogic } from "../../src/mcp-server/tools/definitions/create-report-schedule.tool.js";
import { deleteReportScheduleLogic } from "../../src/mcp-server/tools/definitions/delete-report-schedule.tool.js";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  CAMPAIGN_HOST,
  REPORTING_HOST,
  TEST_CREDENTIALS,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../testkit/wire.js";

const CM = "https://campaign.api.bingads.microsoft.com/CampaignManagement/v13";
const REPORTING = "https://reporting.api.bingads.microsoft.com/Reporting/v13";
const ctx = { requestId: "wire-req" } as any;

let stub: FetchStub;
let session: WireSession;
let sdk: ReturnType<typeof acceptingSdkContext>;

beforeEach(async () => {
  stub = installFetchStub();
  session = await createWireSession();
  stub.requests.length = 0; // drop the session's User/Query validation call
  sdk = acceptingSdkContext(session.sessionId);
});

afterEach(() => {
  session.dispose();
  stub.restore();
});

/** Campaign Management requests that are not `…/Query…` reads. */
function campaignWrites(): WireRequest[] {
  return stub.writes().filter((r) => r.host === CAMPAIGN_HOST);
}

function onlyCampaignWrite(): WireRequest {
  const writes = campaignWrites();
  expect(writes).toHaveLength(1);
  return writes[0]!;
}

function campaignRequest(method: string, path: string): WireRequest | undefined {
  return stub.requests.find(
    (r) => r.host === CAMPAIGN_HOST && r.method === method && r.path === path
  );
}

/**
 * basis: campaign-management-service/includes/request-header-rest.md —
 * Authorization ("prefixed with Bearer "), CustomerAccountId, CustomerId, DeveloperToken.
 */
function expectAuthHeaders(req: WireRequest) {
  expect(req.headers["authorization"]).toBe(`Bearer ${TEST_CREDENTIALS.accessToken}`);
  expect(req.headers["developertoken"]).toBe(TEST_CREDENTIALS.developerToken);
  expect(req.headers["customerid"]).toBe(TEST_CREDENTIALS.customerId);
  expect(req.headers["customeraccountid"]).toBe(TEST_CREDENTIALS.accountId);
  expect(req.headers["content-type"]).toBe("application/json");
}

describe("msads_create_entity", () => {
  it("campaign → POST /Campaigns { AccountId, Campaigns }", async () => {
    stub.route({
      method: "POST",
      path: "/CampaignManagement/v13/Campaigns",
      response: { CampaignIds: [111], PartialErrors: [] },
    });
    const data = {
      AccountId: 900,
      Campaigns: [
        {
          Name: "Autumn",
          BudgetType: "DailyBudgetStandard",
          DailyBudget: 50,
          Status: "Paused",
          TimeZone: "BrusselsCopenhagenMadridParis",
        },
      ],
    };
    const out = await createEntityLogic({ entityType: "campaign", data, dry_run: false }, ctx, sdk);

    const req = onlyCampaignWrite();
    // basis: campaign-management-service/addcampaigns.md — Request Url `POST
    // https://campaign.api.bingads.microsoft.com/CampaignManagement/v13/Campaigns`;
    // Request Body Elements AccountId (long), Campaigns (Campaign array).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${CM}/Campaigns`);
    expectAuthHeaders(req);
    expect(req.body).toEqual(data);
    expect(out.result).toEqual({ CampaignIds: [111], PartialErrors: [] });
    // The write drew on the REAL limiter's per-user bucket, keyed by the
    // GetUser `User.Id` the adapter validated.
    expect(
      session.rateLimiter.getRemainingTokens(`msads:user:${TEST_CREDENTIALS.userId}:write`)
    ).toBe(session.rateLimiter.getRemainingTokens("msads:user:untouched:write") - 3);
  });

  it("keyword → POST /Keywords { AdGroupId, Keywords }", async () => {
    stub.route({
      method: "POST",
      path: "/CampaignManagement/v13/Keywords",
      response: { KeywordIds: [8], PartialErrors: [] },
    });
    const data = {
      AdGroupId: 30,
      Keywords: [{ Text: "running shoes", MatchType: "Phrase", Bid: { Amount: 0.5 } }],
    };
    await createEntityLogic({ entityType: "keyword", data, dry_run: false }, ctx, sdk);

    const req = onlyCampaignWrite();
    // basis: campaign-management-service/addkeywords.md — `POST …/v13/Keywords`;
    // body AdGroupId, Keywords; bid.md — Bid is `{ "Amount": double }`.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${CM}/Keywords`);
    expect(req.body).toEqual(data);
  });
});

describe("msads_update_entity", () => {
  it("adGroup → PUT /AdGroups { CampaignId, AdGroups: [{ Id, … }] }", async () => {
    stub.route({
      method: "POST",
      path: "/CampaignManagement/v13/AdGroups/QueryByIds",
      response: { AdGroups: [{ Id: 1, Name: "AG", Status: "Active" }] },
    });
    stub.route({
      method: "PUT",
      path: "/CampaignManagement/v13/AdGroups",
      response: { PartialErrors: [] },
    });

    await updateEntityLogic(
      {
        entityType: "adGroup",
        entityId: "1",
        campaignId: "20",
        data: { CpcBid: { Amount: 1.5 } },
        dry_run: false,
      },
      ctx,
      sdk
    );

    const req = onlyCampaignWrite();
    // basis: campaign-management-service/updateadgroups.md — `PUT …/v13/AdGroups`;
    // body AdGroups (AdGroup array), CampaignId (long); bid.md `{ Amount }`.
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`${CM}/AdGroups`);
    expectAuthHeaders(req);
    expect(req.body).toEqual({ CampaignId: 20, AdGroups: [{ Id: 1, CpcBid: { Amount: 1.5 } }] });

    // The pre-read: getadgroupsbyids.md — `POST …/v13/AdGroups/QueryByIds`,
    // body AdGroupIds (long array), CampaignId (long).
    expect(campaignRequest("POST", "/CampaignManagement/v13/AdGroups/QueryByIds")?.body).toEqual({
      AdGroupIds: [1],
      CampaignId: 20,
    });
  });

  it("budget (no parent) → PUT /Budgets { Budgets: [{ Id, … }] }", async () => {
    stub.route({
      method: "PUT",
      path: "/CampaignManagement/v13/Budgets",
      response: { PartialErrors: [] },
    });
    await updateEntityLogic(
      { entityType: "budget", entityId: "77", data: { Amount: 40 }, dry_run: false },
      ctx,
      sdk
    );
    const req = onlyCampaignWrite();
    // basis: campaign-management-service/updatebudgets.md — `PUT …/v13/Budgets`;
    // the only body element is Budgets (Budget array).
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`${CM}/Budgets`);
    expect(req.body).toEqual({ Budgets: [{ Id: 77, Amount: 40 }] });
  });
});

describe("msads_delete_entity", () => {
  it("adGroup → DELETE /AdGroups { AdGroupIds, CampaignId }", async () => {
    stub.route({
      method: "DELETE",
      path: "/CampaignManagement/v13/AdGroups",
      response: { PartialErrors: [] },
    });
    const out = await deleteEntityLogic(
      {
        entityType: "adGroup",
        entityIds: ["1", "2"],
        additionalParams: { CampaignId: 20 },
        dry_run: false,
      },
      ctx,
      sdk
    );

    const req = onlyCampaignWrite();
    // basis: campaign-management-service/deleteadgroups.md — `DELETE …/v13/AdGroups`;
    // body AdGroupIds (long array), CampaignId (long).
    expect(req.method).toBe("DELETE");
    expect(req.url).toBe(`${CM}/AdGroups`);
    expectAuthHeaders(req);
    expect(req.body).toEqual({ AdGroupIds: [1, 2], CampaignId: 20 });
    expect(out.deletedCount).toBe(2);
  });

  it("campaign → DELETE /Campaigns { CampaignIds, AccountId }", async () => {
    await deleteEntityLogic(
      {
        entityType: "campaign",
        entityIds: ["5"],
        additionalParams: { AccountId: 900 },
        dry_run: false,
      },
      ctx,
      sdk
    );
    const req = onlyCampaignWrite();
    // basis: campaign-management-service/deletecampaigns.md — `DELETE …/v13/Campaigns`;
    // body AccountId (long), CampaignIds (long array).
    expect(req.method).toBe("DELETE");
    expect(req.url).toBe(`${CM}/Campaigns`);
    expect(req.body).toEqual({ CampaignIds: [5], AccountId: 900 });
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await deleteEntityLogic({ entityType: "label", entityIds: ["1"], dry_run: false }, ctx, sdk);
    expect(campaignWrites()).toHaveLength(0);
  });
});

describe("msads_duplicate_entity", () => {
  it("campaign → reads by id, then POST /Campaigns with the copy forced Paused", async () => {
    stub.route({
      method: "POST",
      path: "/CampaignManagement/v13/Campaigns/QueryByIds",
      response: {
        Campaigns: [
          {
            Id: 7,
            Name: "Source",
            Status: "Active",
            BudgetType: "DailyBudgetStandard",
            DailyBudget: 20,
            TimeZone: "BrusselsCopenhagenMadridParis",
          },
        ],
      },
    });
    stub.route({
      method: "POST",
      path: "/CampaignManagement/v13/Campaigns",
      response: { CampaignIds: [8], PartialErrors: [] },
    });

    await duplicateEntityLogic(
      {
        entityType: "campaign",
        accountId: "900",
        entityId: "7",
        options: { Name: "Source (copy)" },
        dry_run: false,
      },
      ctx,
      sdk
    );

    // basis: campaign-management-service/getcampaignsbyids.md — `POST
    // …/v13/Campaigns/QueryByIds`; body AccountId, CampaignIds, CampaignType
    // (optional; defaults to Search only, so every type is requested).
    expect(campaignRequest("POST", "/CampaignManagement/v13/Campaigns/QueryByIds")?.body).toEqual({
      CampaignIds: [7],
      CampaignType: "Search, Shopping, DynamicSearchAds, Audience, Hotel, PerformanceMax, App",
      AccountId: 900,
    });

    const req = onlyCampaignWrite();
    // basis: addcampaigns.md — `POST …/v13/Campaigns` { AccountId, Campaigns };
    // campaignstatus.md — `Paused` is a settable CampaignStatus. The source Id
    // is not sent (Add assigns a new one).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${CM}/Campaigns`);
    expect(req.body).toEqual({
      AccountId: 900,
      Campaigns: [
        {
          Name: "Source (copy)",
          Status: "Paused",
          BudgetType: "DailyBudgetStandard",
          DailyBudget: 20,
          TimeZone: "BrusselsCopenhagenMadridParis",
        },
      ],
    });
  });
});

describe("msads_bulk_create_entities", () => {
  it("ad → POST /Ads { AdGroupId, Ads }, chunked at the documented 50 ads per call", async () => {
    stub.route({
      method: "POST",
      path: "/CampaignManagement/v13/Ads",
      response: (req: WireRequest) => ({
        AdIds: ((req.body as { Ads: unknown[] }).Ads ?? []).map((_, i) => 1000 + i),
        PartialErrors: [],
      }),
    });
    const items = Array.from({ length: 51 }, (_, i) => ({
      Type: "ResponsiveSearch",
      FinalUrls: [`https://example.com/${i}`],
    }));

    const out = await bulkCreateEntitiesLogic(
      { entityType: "ad", adGroupId: "30", items, dry_run: false } as any,
      ctx,
      sdk
    );

    const writes = campaignWrites();
    // basis: campaign-management-service/addads.md — `POST …/v13/Ads`; body
    // AdGroupId (long), Ads: "An array of up to 50 ads".
    expect(writes.map((r) => [r.method, r.url])).toEqual([
      ["POST", `${CM}/Ads`],
      ["POST", `${CM}/Ads`],
    ]);
    expect(writes[0]!.body).toEqual({ AdGroupId: 30, Ads: items.slice(0, 50) });
    expect(writes[1]!.body).toEqual({ AdGroupId: 30, Ads: items.slice(50) });
    expectAuthHeaders(writes[0]!);
    expect(out.results).toHaveLength(51);
    expect(out.results.every((r) => r.success === true)).toBe(true);
  });
});

describe("msads_bulk_update_entities", () => {
  it("keyword → PUT /Keywords { AdGroupId, Keywords }", async () => {
    stub.route({
      method: "PUT",
      path: "/CampaignManagement/v13/Keywords",
      response: { PartialErrors: [] },
    });
    await bulkUpdateEntitiesLogic(
      {
        entityType: "keyword",
        adGroupId: "30",
        items: [
          { Id: 8, Bid: { Amount: 0.75 } },
          { Id: 9, Status: "Paused" },
        ],
        dry_run: false,
      } as any,
      ctx,
      sdk
    );
    const req = onlyCampaignWrite();
    // basis: campaign-management-service/updatekeywords.md — `PUT …/v13/Keywords`;
    // body AdGroupId (long), Keywords (Keyword array).
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`${CM}/Keywords`);
    expect(req.body).toEqual({
      AdGroupId: 30,
      Keywords: [
        { Id: 8, Bid: { Amount: 0.75 } },
        { Id: 9, Status: "Paused" },
      ],
    });
  });
});

describe("msads_bulk_update_status", () => {
  it("campaign → one PUT /Campaigns { AccountId, Campaigns: [{ Id, Status }] } per id", async () => {
    stub.route({
      method: "PUT",
      path: "/CampaignManagement/v13/Campaigns",
      response: { PartialErrors: [] },
    });
    await bulkUpdateStatusLogic(
      {
        entityType: "campaign",
        accountId: "900",
        entityIds: ["1", "2"],
        status: "Paused",
        dry_run: false,
      } as any,
      ctx,
      sdk
    );
    const writes = campaignWrites();
    // basis: campaign-management-service/updatecampaigns.md — `PUT …/v13/Campaigns`;
    // body AccountId, Campaigns; campaignstatus.md — `Paused`.
    expect(writes.every((r) => r.method === "PUT" && r.url === `${CM}/Campaigns`)).toBe(true);
    expect(writes.map((r) => r.body)).toEqual(
      expect.arrayContaining([
        { AccountId: 900, Campaigns: [{ Id: 1, Status: "Paused" }] },
        { AccountId: 900, Campaigns: [{ Id: 2, Status: "Paused" }] },
      ])
    );
    expect(writes).toHaveLength(2);
  });
});

describe("msads_adjust_bids", () => {
  it("keyword → reads by id, then PUT /Keywords with a minimal { Id, Bid: { Amount } } patch", async () => {
    stub.route({
      method: "POST",
      path: "/CampaignManagement/v13/Keywords/QueryByIds",
      response: {
        Keywords: [{ Id: 8, Text: "shoes", Bid: { Amount: 0.5 }, EditorialStatus: "Active" }],
      },
    });
    stub.route({
      method: "PUT",
      path: "/CampaignManagement/v13/Keywords",
      response: { PartialErrors: [] },
    });

    const out = await adjustBidsLogic(
      {
        entityType: "keyword",
        scope: { adGroupId: "30" },
        adjustments: [{ entityId: "8", bidField: "Bid", newBid: 1.25 }],
        dry_run: false,
      } as any,
      ctx,
      sdk
    );

    // basis: campaign-management-service/getkeywordsbyids.md — `POST
    // …/v13/Keywords/QueryByIds`; body AdGroupId, KeywordIds.
    expect(campaignRequest("POST", "/CampaignManagement/v13/Keywords/QueryByIds")?.body).toEqual({
      KeywordIds: [8],
      AdGroupId: 30,
    });
    const req = onlyCampaignWrite();
    // basis: updatekeywords.md — `PUT …/v13/Keywords` { AdGroupId, Keywords };
    // bid.md — `{ "Amount": double }`; update semantics leave omitted fields unchanged.
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`${CM}/Keywords`);
    expect(req.body).toEqual({ AdGroupId: 30, Keywords: [{ Id: 8, Bid: { Amount: 1.25 } }] });
    expect(out.confirmed).toBe(true);
  });

  it("adGroup → PUT /AdGroups { CampaignId, AdGroups: [{ Id, CpcBid: { Amount } }] }", async () => {
    stub.route({
      method: "POST",
      path: "/CampaignManagement/v13/AdGroups/QueryByIds",
      response: { AdGroups: [{ Id: 4, Name: "AG", CpcBid: { Amount: 1 } }] },
    });
    await adjustBidsLogic(
      {
        entityType: "adGroup",
        scope: { campaignId: "20" },
        adjustments: [{ entityId: "4", bidField: "CpcBid", newBid: 2 }],
        dry_run: false,
      } as any,
      ctx,
      sdk
    );
    const req = onlyCampaignWrite();
    // basis: updateadgroups.md — `PUT …/v13/AdGroups` { AdGroups, CampaignId };
    // adgroup.md CpcBid is a Bid (`bid.md`: `{ Amount }`).
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`${CM}/AdGroups`);
    expect(req.body).toEqual({ CampaignId: 20, AdGroups: [{ Id: 4, CpcBid: { Amount: 2 } }] });
  });
});

describe("msads_manage_ad_extensions", () => {
  const associations = {
    AccountId: 900,
    AssociationType: "Campaign",
    AdExtensionIdToEntityIdAssociations: [{ AdExtensionId: 1, EntityId: 10 }],
  };

  it("setAssociations → POST /AdExtensionsAssociations/Set", async () => {
    await manageAdExtensionsLogic(
      { operation: "setAssociations", data: associations, dry_run: false },
      ctx,
      sdk
    );
    const req = onlyCampaignWrite();
    // basis: campaign-management-service/setadextensionsassociations.md — `POST
    // …/v13/AdExtensionsAssociations/Set`; body AccountId,
    // AdExtensionIdToEntityIdAssociations [{ AdExtensionId, EntityId }], AssociationType.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${CM}/AdExtensionsAssociations/Set`);
    expectAuthHeaders(req);
    expect(req.body).toEqual(associations);
  });

  it("deleteAssociations → DELETE /AdExtensionsAssociations", async () => {
    await manageAdExtensionsLogic(
      { operation: "deleteAssociations", data: associations, dry_run: false },
      ctx,
      sdk
    );
    const req = onlyCampaignWrite();
    // basis: campaign-management-service/deleteadextensionsassociations.md — `DELETE
    // …/v13/AdExtensionsAssociations`; same three body elements as Set.
    expect(req.method).toBe("DELETE");
    expect(req.url).toBe(`${CM}/AdExtensionsAssociations`);
    expect(req.body).toEqual(associations);
  });

  it("getAssociations → POST /AdExtensionsAssociations/Query", async () => {
    const data = {
      AccountId: 900,
      AdExtensionType: "SitelinkAdExtension",
      AssociationType: "Campaign",
      EntityIds: [10],
    };
    await manageAdExtensionsLogic({ operation: "getAssociations", data, dry_run: false }, ctx, sdk);
    const req = campaignRequest("POST", "/CampaignManagement/v13/AdExtensionsAssociations/Query");
    // basis: campaign-management-service/getadextensionsassociations.md — `POST
    // …/v13/AdExtensionsAssociations/Query`; body AccountId, AdExtensionType,
    // AssociationType, EntityIds.
    expect(req?.url).toBe(`${CM}/AdExtensionsAssociations/Query`);
    expect(req?.body).toEqual(data);
  });
});

describe("msads_manage_criterions", () => {
  const criterion = {
    Type: "BiddableCampaignCriterion",
    CampaignId: 10,
    Criterion: { Type: "LocationCriterion", LocationId: 190 },
  };

  it("add (campaign) → POST /CampaignCriterions { CampaignCriterions, CriterionType }", async () => {
    stub.route({
      method: "POST",
      path: "/CampaignManagement/v13/CampaignCriterions",
      response: { CampaignCriterionIds: [55], NestedPartialErrors: [] },
    });
    const data = { CampaignCriterions: [criterion], CriterionType: "Targets" };
    await manageCriterionsLogic(
      { operation: "add", entityLevel: "campaign", data, dry_run: false },
      ctx,
      sdk
    );
    const req = onlyCampaignWrite();
    // basis: campaign-management-service/addcampaigncriterions.md — `POST
    // …/v13/CampaignCriterions`; body CampaignCriterions, CriterionType.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${CM}/CampaignCriterions`);
    expect(req.body).toEqual(data);
  });

  it("update (adGroup) → PUT /AdGroupCriterions { AdGroupCriterions, CriterionType }", async () => {
    const data = {
      AdGroupCriterions: [{ Id: 3, Type: "BiddableAdGroupCriterion", AdGroupId: 30 }],
      CriterionType: "Targets",
    };
    await manageCriterionsLogic(
      { operation: "update", entityLevel: "adGroup", data, dry_run: false },
      ctx,
      sdk
    );
    const req = onlyCampaignWrite();
    // basis: campaign-management-service/updateadgroupcriterions.md — `PUT
    // …/v13/AdGroupCriterions`; body AdGroupCriterions, CriterionType.
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`${CM}/AdGroupCriterions`);
    expect(req.body).toEqual(data);
  });

  it("delete (campaign) → DELETE /CampaignCriterions { CampaignCriterionIds, CampaignId, CriterionType }", async () => {
    const data = { CampaignCriterionIds: [55], CampaignId: 10, CriterionType: "Targets" };
    await manageCriterionsLogic(
      { operation: "delete", entityLevel: "campaign", data, dry_run: false },
      ctx,
      sdk
    );
    const req = onlyCampaignWrite();
    // basis: campaign-management-service/deletecampaigncriterions.md — `DELETE
    // …/v13/CampaignCriterions`; body CampaignCriterionIds, CampaignId, CriterionType.
    expect(req.method).toBe("DELETE");
    expect(req.url).toBe(`${CM}/CampaignCriterions`);
    expect(req.body).toEqual(data);
  });

  it("getByAdGroup → POST /AdGroupCriterions/QueryByIds", async () => {
    // getadgroupcriterionsbyids.md CriterionType: "The Targets and Audience
    // values are not allowed for this operation" — request one type, e.g. Location.
    const data = { AdGroupCriterionIds: [3], AdGroupId: 30, CriterionType: "Location" };
    await manageCriterionsLogic(
      { operation: "getByAdGroup", entityLevel: "adGroup", data, dry_run: false },
      ctx,
      sdk
    );
    // basis: campaign-management-service/getadgroupcriterionsbyids.md — `POST
    // …/v13/AdGroupCriterions/QueryByIds`; body AdGroupCriterionIds, AdGroupId, CriterionType.
    expect(
      campaignRequest("POST", "/CampaignManagement/v13/AdGroupCriterions/QueryByIds")?.body
    ).toEqual(data);
  });
});

describe("msads_import_from_google", () => {
  it("create → POST /ImportJobs { ImportJobs }", async () => {
    stub.route({
      method: "POST",
      path: "/CampaignManagement/v13/ImportJobs",
      response: { ImportJobIds: [42], PartialErrors: [] },
    });
    const data = {
      ImportJobs: [
        {
          Type: "GoogleImportJob",
          Name: "Nightly import",
          GoogleAccountId: 1234567890,
          CredentialId: "cred-1",
          // frequency.md — Type "Auto" (Microsoft Advertising schedules it).
          Frequency: { Type: "Auto" },
        },
      ],
    };
    await importFromGoogleLogic({ operation: "create", data, dry_run: false }, ctx, sdk);
    const req = onlyCampaignWrite();
    // basis: campaign-management-service/addimportjobs.md — `POST …/v13/ImportJobs`;
    // the only body element is ImportJobs (ImportJob array).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${CM}/ImportJobs`);
    expectAuthHeaders(req);
    expect(req.body).toEqual(data);
  });

  it("getStatus → POST /ImportJobs/QueryByIds { ImportJobIds, ImportType }", async () => {
    const data = { ImportJobIds: [42], ImportType: "GoogleImportJob" };
    await importFromGoogleLogic({ operation: "getStatus", data, dry_run: false }, ctx, sdk);
    // basis: campaign-management-service/getimportjobsbyids.md — `POST
    // …/v13/ImportJobs/QueryByIds`; body ImportJobIds, ImportType.
    expect(campaignRequest("POST", "/CampaignManagement/v13/ImportJobs/QueryByIds")?.body).toEqual(
      data
    );
  });

  it("getResults → POST /ImportResults/Query { ImportJobIds, ImportType }", async () => {
    const data = { ImportJobIds: [42], ImportType: "GoogleImportJob" };
    await importFromGoogleLogic({ operation: "getResults", data, dry_run: false }, ctx, sdk);
    // basis: campaign-management-service/getimportresults.md — `POST
    // …/v13/ImportResults/Query`; body ImportJobIds, ImportType (PageInfo optional).
    expect(campaignRequest("POST", "/CampaignManagement/v13/ImportResults/Query")?.body).toEqual(
      data
    );
  });
});

describe("msads_submit_report", () => {
  it("POST Reporting/v13/GenerateReport/Submit { ReportRequest: { Type, … } }", async () => {
    stub.route({
      method: "POST",
      path: "/Reporting/v13/GenerateReport/Submit",
      response: { ReportRequestId: "30000000123456789" },
    });

    const out = await submitReportLogic(
      SubmitReportInputSchema.parse({
        reportType: "CampaignPerformanceReportRequest",
        accountId: "900",
        columns: ["TimePeriod", "CampaignId", "Impressions", "Clicks"],
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        aggregation: "Weekly",
      }),
      ctx,
      sdk
    );

    const reqs = stub.requests.filter((r) => r.host === REPORTING_HOST);
    expect(reqs).toHaveLength(1);
    const req = reqs[0]!;
    // basis: reporting-service/submitgeneratereport.md — Request Url `POST
    // https://reporting.api.bingads.microsoft.com/Reporting/v13/GenerateReport/Submit`;
    // the only body element is ReportRequest, whose JSON carries `Type` (the
    // concrete *ReportRequest name) beside its fields.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${REPORTING}/GenerateReport/Submit`);
    expectAuthHeaders(req);
    // basis: reporting-service/reportrequest.md (Format, ReportName ≤ 200 chars,
    // ReturnOnlyCompleteData boolean), reportformat.md (`Csv`),
    // reportaggregation.md (`Weekly`), campaignperformancereportrequest.md
    // (Aggregation, Columns, Scope { AccountIds }, Time { CustomDateRangeStart /
    // CustomDateRangeEnd: { Day, Month, Year } }).
    expect(req.body).toEqual({
      ReportRequest: {
        Type: "CampaignPerformanceReportRequest",
        ReportName: expect.stringMatching(/^CampaignPerformanceReportRequest_\d+$/),
        Format: "Csv",
        ReturnOnlyCompleteData: false,
        Aggregation: "Weekly",
        Columns: ["TimePeriod", "CampaignId", "Impressions", "Clicks"],
        Scope: { AccountIds: [900] },
        Time: {
          CustomDateRangeStart: { Year: 2026, Month: 9, Day: 1 },
          CustomDateRangeEnd: { Year: 2026, Month: 9, Day: 7 },
        },
      },
    });
    expect(((req.body as any).ReportRequest.ReportName as string).length).toBeLessThanOrEqual(200);
    expect(out.reportRequestId).toBe("30000000123456789");
  });

  // MsAdsReportingService.buildReportRequest sends `Filter` as the caller's
  // ARRAY of filter objects; submitgeneratereport.md / campaignperformancereportfilter.md
  // document `Filter` as a single object (e.g. { "AccountStatus": …, "DeviceType": … }).
  // No tool passes `filters` today (neither submit_report nor get_report
  // exposes it), so the mismatch is unreachable from the MCP surface; left
  // unasserted rather than pinning a known-wrong shape. Reported in #236.
  it.todo("sends ReportRequest.Filter as the documented single *ReportFilter object");
});

describe("report schedule tools make no upstream request", () => {
  // basis: reporting-service/ — the v13 Reporting service's operations are
  // SubmitGenerateReport and PollGenerateReport only; there is no schedule
  // resource, so both tools refuse without touching the network.
  it("msads_create_report_schedule throws and sends nothing", async () => {
    await expect(
      createReportScheduleLogic(
        {
          reportType: "CampaignPerformanceReportRequest",
          accountId: "900",
          columns: ["Clicks"],
          dry_run: false,
        } as any,
        ctx,
        sdk
      )
    ).rejects.toBeInstanceOf(McpError);
    expect(stub.requests).toHaveLength(0);
  });

  it("msads_delete_report_schedule throws and sends nothing", async () => {
    await expect(
      deleteReportScheduleLogic({ scheduleId: "1", dry_run: false } as any, ctx, sdk)
    ).rejects.toBeInstanceOf(McpError);
    expect(stub.requests).toHaveLength(0);
  });
});
