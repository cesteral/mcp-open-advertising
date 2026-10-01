// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-request assertions for every cm360-mcp tool that issues a non-GET
 * upstream request (#236). Each test calls the REAL tool logic over REAL
 * session services (CM360Service, CM360ReportingService, CM360HttpClient, the
 * Google OAuth2 refresh adapter and the package's real `RateLimiter`), with
 * only `globalThis.fetch` stubbed, and asserts the full request: HTTP method,
 * URL (+ query) and the exact JSON body.
 *
 * Expected shapes come from Google's Discovery document, fetched 2026-09-30:
 *   https://dfareporting.googleapis.com/$discovery/rest?version=v5
 *   revision 20260721, rootUrl `https://dfareporting.googleapis.com/`,
 *   servicePath `dfareporting/v5/` (the version platform-facts.json
 *   `cm360.api_version` pins). `src/generated/types.ts` vendors its schemas.
 * Method citations are `resources.<collection>.methods.<method>` (httpMethod,
 * flatPath, parameters, request $ref); body citations are `schemas.<Name>`.
 *
 * The `Content-Type: application/json` header on JSON bodies is not described
 * by the Discovery document: `basis: unverified (code-only)`.
 *
 * validate_entity, get_pacing_status and the list/get/check/download tools
 * send only GETs (or nothing) and are out of scope here.
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
  createReportScheduleLogic,
  CreateReportScheduleInputSchema,
} from "../../src/mcp-server/tools/definitions/create-report-schedule.tool.js";
import {
  deleteReportScheduleLogic,
  DeleteReportScheduleInputSchema,
} from "../../src/mcp-server/tools/definitions/delete-report-schedule.tool.js";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  rateLimiter,
  CM360_HOST,
  GOOGLE_TOKEN_URL,
  TEST_ACCESS_TOKEN,
  TEST_CREDENTIALS,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/wire.js";

/** Discovery rootUrl + servicePath. */
const API = "https://dfareporting.googleapis.com/dfareporting/v5";
const PID = "123456";
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

/** Every request to dfareporting (OAuth exchange excluded). */
function apiRequests(): WireRequest[] {
  return stub.to(CM360_HOST);
}

function writes(): WireRequest[] {
  return apiRequests().filter((r) => r.method !== "GET");
}

function onlyWrite(): WireRequest {
  const w = writes();
  expect(w).toHaveLength(1);
  return w[0]!;
}

/** basis: the bearer from the refresh exchange; Content-Type — unverified (code-only). */
function expectJsonAuth(req: WireRequest) {
  expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  expect(req.headers["content-type"]).toBe("application/json");
}

/** Every dfareporting call drew one token from the REAL per-user limiter bucket. */
function expectOneTokenPerApiCall() {
  expect(rateLimiter.getRemainingTokens(session.rateLimitKey)).toBe(
    mcpConfig.cm360RateLimitPerMinute - apiRequests().length
  );
}

describe("OAuth: the real Google refresh adapter exchanges on session creation", () => {
  it("POSTs grant_type=refresh_token to Google's token endpoint", () => {
    const token = stub.requests.find((r) => r.url === GOOGLE_TOKEN_URL);
    expect(token?.method).toBe("POST");
    // basis: Google OAuth 2.0 refresh flow (RFC 6749 §6 form parameters).
    const form = new URLSearchParams(String(token?.body));
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe(TEST_CREDENTIALS.refreshToken);
  });
});

describe("cm360_create_entity → <collection>.insert", () => {
  it("campaign → POST userprofiles/{profileId}/campaigns with the Campaign body", async () => {
    const data = {
      name: "Autumn",
      advertiserId: "2001",
      startDate: "2026-10-01",
      endDate: "2026-12-31",
      archived: false,
    };
    stub.route({
      method: "POST",
      path: `/dfareporting/v5/userprofiles/${PID}/campaigns`,
      response: { ...data, id: "901", kind: "dfareporting#campaign" },
    });

    const out = await createEntityLogic(
      CreateEntityInputSchema.parse({ profileId: PID, entityType: "campaign", data }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: `campaigns.insert` — httpMethod POST, flatPath
    // `userprofiles/{userprofilesId}/campaigns`, request $ref Campaign.
    // `schemas.Campaign`: name (string), advertiserId (int64 → string),
    // startDate / endDate (format date), archived (boolean).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/userprofiles/${PID}/campaigns`);
    expectJsonAuth(req);
    expect(req.body).toEqual(data);
    expect(out.entity.id).toBe("901");
    expectOneTokenPerApiCall();
  });

  it("floodlightActivity → POST userprofiles/{profileId}/floodlightActivities", async () => {
    const data = {
      name: "Purchase",
      floodlightActivityGroupId: "3001",
      countingMethod: "TRANSACTIONS_COUNTING",
      expectedUrl: "https://shop.example.com/thanks",
    };
    await createEntityLogic(
      CreateEntityInputSchema.parse({ profileId: PID, entityType: "floodlightActivity", data }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `floodlightActivities.insert` — POST
    // `userprofiles/{userprofilesId}/floodlightActivities`, request FloodlightActivity
    // (floodlightActivityGroupId int64, countingMethod enum TRANSACTIONS_COUNTING).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/userprofiles/${PID}/floodlightActivities`);
    expect(req.body).toEqual(data);
  });

  it("floodlightConfiguration → refused before sending: v5 has no floodlightConfigurations.insert", async () => {
    // basis: `resources.floodlightConfigurations.methods` = { get, list, patch,
    // update } — there is no `insert`, so a POST to the collection has no method.
    await expect(
      createEntityLogic(
        CreateEntityInputSchema.parse({
          profileId: PID,
          entityType: "floodlightConfiguration",
          data: { advertiserId: "2001" },
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/floodlightConfigurations\.insert/);
    expect(apiRequests()).toHaveLength(0);

    // Dry-run parity: the same request must not be predicted to succeed.
    const dry = await createEntityLogic(
      CreateEntityInputSchema.parse({
        profileId: PID,
        entityType: "floodlightConfiguration",
        data: { advertiserId: "2001" },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(dry.dryRun?.wouldSucceed).toBe(false);
    expect(dry.dryRun?.validationErrors.map((e) => e.code)).toContain("CREATE_NOT_SUPPORTED");
  });

  it("dry_run sends nothing", async () => {
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        profileId: PID,
        entityType: "campaign",
        data: { name: "Autumn" },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("cm360_update_entity → <collection>.patch", () => {
  it("campaign → PATCH userprofiles/{profileId}/campaigns?id={id} with only the changed fields", async () => {
    stub.route({
      method: "GET",
      path: `/dfareporting/v5/userprofiles/${PID}/campaigns/555`,
      response: { id: "555", name: "Old", archived: false, advertiserId: "2001" },
    });
    stub.route({
      method: "PATCH",
      path: `/dfareporting/v5/userprofiles/${PID}/campaigns`,
      response: { id: "555", name: "New", archived: false, advertiserId: "2001" },
    });

    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        profileId: PID,
        entityType: "campaign",
        entityId: "555",
        data: { name: "New" },
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: `campaigns.patch` — httpMethod PATCH, flatPath
    // `userprofiles/{userprofilesId}/campaigns`, parameter `id` (location query,
    // required: "Required. Campaign ID."), request $ref Campaign; "This method
    // supports patch semantics". The body echoes `id` (Campaign.id, int64 string).
    expect(req.method).toBe("PATCH");
    expect(req.url).toBe(`${API}/userprofiles/${PID}/campaigns?id=555`);
    expect(req.query).toEqual({ id: "555" });
    expectJsonAuth(req);
    expect(req.body).toEqual({ name: "New", id: "555" });
    // The pre-read: `campaigns.get` — GET `userprofiles/{profileId}/campaigns/{id}`.
    expect(apiRequests()[0]).toMatchObject({
      method: "GET",
      url: `${API}/userprofiles/${PID}/campaigns/555`,
    });
    expectOneTokenPerApiCall();
  });

  it("dry_run reads the entity and sends no PATCH", async () => {
    stub.route({
      method: "GET",
      path: `/dfareporting/v5/userprofiles/${PID}/campaigns/555`,
      response: { id: "555", name: "Old", archived: false },
    });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        profileId: PID,
        entityType: "campaign",
        entityId: "555",
        data: { archived: true },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(0);
  });
});

describe("cm360_delete_entity → floodlightActivities.delete", () => {
  it("DELETE userprofiles/{profileId}/floodlightActivities/{id}, no body", async () => {
    const out = await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        profileId: PID,
        entityType: "floodlightActivity",
        entityId: "777",
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `floodlightActivities.delete` — httpMethod DELETE, flatPath
    // `userprofiles/{userprofilesId}/floodlightActivities/{floodlightActivitiesId}`,
    // no request body. It is the only `delete` among the eight entity collections.
    expect(req.method).toBe("DELETE");
    expect(req.url).toBe(`${API}/userprofiles/${PID}/floodlightActivities/777`);
    expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(req.body).toBeUndefined();
    expect(out.deleted).toBe(true);
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expectOneTokenPerApiCall();
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        profileId: PID,
        entityType: "floodlightActivity",
        entityId: "777",
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing and does not prompt", async () => {
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        profileId: PID,
        entityType: "floodlightActivity",
        entityId: "777",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("cm360_bulk_update_status → <collection>.get then <collection>.update (PUT)", () => {
  // cm360 #11: only campaign, ad, creative and placement have a status
  // mapping; the schema used to offer every entity type, which the logic then
  // refused.
  it("offers only the four entity types with a status mapping", () => {
    for (const entityType of ["advertiser", "site", "floodlightActivity"]) {
      expect(
        BulkUpdateStatusInputSchema.safeParse({
          profileId: PID,
          entityType,
          entityIds: ["1"],
          status: "ARCHIVED",
        }).success
      ).toBe(false);
    }
    for (const entityType of ["campaign", "ad", "creative", "placement"]) {
      expect(
        BulkUpdateStatusInputSchema.safeParse({
          profileId: PID,
          entityType,
          entityIds: ["1"],
          status: "ARCHIVED",
        }).success
      ).toBe(true);
    }
  });

  it("campaign ARCHIVED → PUT the whole entity just read, with archived: true", async () => {
    const current = {
      id: "1",
      name: "C1",
      advertiserId: "2001",
      startDate: "2026-10-01",
      endDate: "2026-12-31",
      archived: false,
      kind: "dfareporting#campaign",
    };
    stub.route({
      method: "GET",
      path: `/dfareporting/v5/userprofiles/${PID}/campaigns/1`,
      response: current,
    });

    const out = await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        profileId: PID,
        entityType: "campaign",
        entityIds: ["1"],
        status: "ARCHIVED",
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: `campaigns.update` — httpMethod PUT, flatPath
    // `userprofiles/{userprofilesId}/campaigns` (no id parameter: the entity is
    // identified by the body), request $ref Campaign; `schemas.Campaign.archived`
    // boolean ("Whether this campaign has been archived").
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`${API}/userprofiles/${PID}/campaigns`);
    expectJsonAuth(req);
    expect(req.body).toEqual({ ...current, archived: true });
    expect(out.updated).toBe(1);
    expectOneTokenPerApiCall();
  });

  it("placement PAUSED → activeStatus PLACEMENT_STATUS_INACTIVE", async () => {
    const current = { id: "2", name: "P", activeStatus: "PLACEMENT_STATUS_ACTIVE" };
    stub.route({
      method: "GET",
      path: `/dfareporting/v5/userprofiles/${PID}/placements/2`,
      response: current,
    });
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        profileId: PID,
        entityType: "placement",
        entityIds: ["2"],
        status: "PAUSED",
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `placements.update` — PUT `userprofiles/{userprofilesId}/placements`;
    // `schemas.Placement.activeStatus` enum includes PLACEMENT_STATUS_INACTIVE.
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`${API}/userprofiles/${PID}/placements`);
    expect(req.body).toEqual({ ...current, activeStatus: "PLACEMENT_STATUS_INACTIVE" });
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        profileId: PID,
        entityType: "campaign",
        entityIds: ["1"],
        status: "ARCHIVED",
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        profileId: PID,
        entityType: "campaign",
        entityIds: ["1"],
        status: "ARCHIVED",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("cm360_bulk_create_entities → one <collection>.insert per item", () => {
  const items = [
    { name: "Ad A", campaignId: "901", type: "AD_SERVING_STANDARD_AD", active: false },
    { name: "Ad B", campaignId: "901", type: "AD_SERVING_STANDARD_AD", active: false },
  ];

  it("ad → POST userprofiles/{profileId}/ads once per item, body = the item", async () => {
    const out = await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({ profileId: PID, entityType: "ad", items }),
      ctx,
      sdk
    );
    const reqs = writes();
    expect(reqs).toHaveLength(2);
    for (const req of reqs) {
      // basis: `ads.insert` — POST `userprofiles/{userprofilesId}/ads`, request
      // $ref Ad (`schemas.Ad` name, campaignId int64, type enum
      // AD_SERVING_STANDARD_AD, active boolean). CM360 has no batch insert.
      expect(req.method).toBe("POST");
      expect(req.url).toBe(`${API}/userprofiles/${PID}/ads`);
      expectJsonAuth(req);
    }
    // Items run concurrently, so match bodies irrespective of order.
    expect(reqs.map((r) => r.body)).toEqual(expect.arrayContaining(items));
    expect(out.created).toBe(2);
    expectOneTokenPerApiCall();
  });

  it("dry_run sends nothing", async () => {
    await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({
        profileId: PID,
        entityType: "ad",
        items,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("cm360_bulk_update_entities → one <collection>.patch per item", () => {
  const items = [
    { entityId: "11", data: { name: "Creative 11" } },
    { entityId: "12", data: { active: false } },
  ];

  it("creative → PATCH userprofiles/{profileId}/creatives?id={id} per item", async () => {
    const out = await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({ profileId: PID, entityType: "creative", items }),
      ctx,
      sdk
    );
    const reqs = writes();
    expect(reqs).toHaveLength(2);
    // basis: `creatives.patch` — httpMethod PATCH, flatPath
    // `userprofiles/{userprofilesId}/creatives`, parameter `id` (query, required),
    // request $ref Creative (`schemas.Creative.name`, `.active` boolean).
    for (const req of reqs) {
      expect(req.method).toBe("PATCH");
      expectJsonAuth(req);
    }
    const byId = Object.fromEntries(reqs.map((r) => [r.query.id, r]));
    expect(byId["11"]?.url).toBe(`${API}/userprofiles/${PID}/creatives?id=11`);
    expect(byId["11"]?.body).toEqual({ name: "Creative 11", id: "11" });
    expect(byId["12"]?.url).toBe(`${API}/userprofiles/${PID}/creatives?id=12`);
    expect(byId["12"]?.body).toEqual({ active: false, id: "12" });
    expect(out.updated).toBe(2);
    expectOneTokenPerApiCall();
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({ profileId: PID, entityType: "creative", items }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        profileId: PID,
        entityType: "creative",
        items,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

const CRITERIA = {
  dateRange: { startDate: "2026-09-01", endDate: "2026-09-07" },
  dimensions: [{ name: "campaign" }],
  metricNames: ["impressions", "clicks"],
};

function routeReportRun(reportId: string, fileId: string) {
  stub.route({
    method: "POST",
    path: `/dfareporting/v5/userprofiles/${PID}/reports`,
    response: (req: WireRequest) => ({ ...(req.body as object), id: reportId }),
  });
  stub.route({
    method: "POST",
    path: `/dfareporting/v5/userprofiles/${PID}/reports/${reportId}/run`,
    response: { id: fileId, reportId, status: "PROCESSING" },
  });
  stub.route({
    method: "GET",
    path: `/dfareporting/v5/userprofiles/${PID}/reports/${reportId}/files/${fileId}`,
    response: {
      id: fileId,
      reportId,
      status: "REPORT_AVAILABLE",
      urls: { apiUrl: `${API}/reports/${reportId}/files/${fileId}?alt=media` },
    },
  });
}

/**
 * basis: `reports.insert` — POST `userprofiles/{profileId}/reports`, request
 * $ref Report; then `reports.run` — POST
 * `userprofiles/{profileId}/reports/{reportId}/run`, no request body, optional
 * `synchronous` query (not sent: the run is asynchronous).
 */
function expectInsertThenRun(reportId: string, expectedReport: unknown) {
  const [insert, run] = writes();
  expect(insert?.method).toBe("POST");
  expect(insert?.url).toBe(`${API}/userprofiles/${PID}/reports`);
  expectJsonAuth(insert!);
  expect(insert?.body).toEqual(expectedReport);
  expect(run?.method).toBe("POST");
  expect(run?.url).toBe(`${API}/userprofiles/${PID}/reports/${reportId}/run`);
  expect(run?.body).toBeUndefined();
  expect(writes()).toHaveLength(2);
}

describe("cm360_submit_report → reports.insert then reports.run", () => {
  it("POSTs the Report (criteria for STANDARD, additionalConfig at top level), then runs it", async () => {
    routeReportRun("71", "81");
    const out = await submitReportLogic(
      SubmitReportInputSchema.parse({
        profileId: PID,
        name: "Weekly delivery",
        type: "STANDARD",
        criteria: CRITERIA,
        additionalConfig: { format: "CSV" },
      }),
      ctx,
      sdk
    );
    // basis: `schemas.Report` — name, type enum STANDARD, format ("CSV"),
    // criteria ("The report criteria for a report of type STANDARD") with
    // dateRange (`DateRange` startDate/endDate format date), dimensions
    // (`SortedDimension[]` { name }), metricNames (string[]).
    expectInsertThenRun("71", {
      format: "CSV",
      name: "Weekly delivery",
      type: "STANDARD",
      criteria: CRITERIA,
    });
    expect(out).toMatchObject({ reportId: "71", fileId: "81" });
    expectOneTokenPerApiCall();
  });

  it("FLOODLIGHT puts its criteria under floodlightCriteria", async () => {
    routeReportRun("72", "82");
    const floodlightCriteria = {
      dateRange: { relativeDateRange: "LAST_7_DAYS" },
      floodlightConfigId: { dimensionName: "floodlightConfigId", value: "5001" },
      dimensions: [{ name: "activity" }],
      metricNames: ["totalConversions"],
    };
    await submitReportLogic(
      SubmitReportInputSchema.parse({
        profileId: PID,
        name: "Conversions",
        type: "FLOODLIGHT",
        floodlightCriteria,
      }),
      ctx,
      sdk
    );
    // basis: `schemas.Report.floodlightCriteria` — "The report criteria for a
    // report of type FLOODLIGHT"; DateRange.relativeDateRange enum LAST_7_DAYS.
    expectInsertThenRun("72", { name: "Conversions", type: "FLOODLIGHT", floodlightCriteria });
  });

  it("dry_run sends nothing", async () => {
    await submitReportLogic(
      SubmitReportInputSchema.parse({
        profileId: PID,
        name: "Weekly delivery",
        type: "STANDARD",
        criteria: CRITERIA,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("cm360_get_report → reports.insert, reports.run, then reports.files.get", () => {
  it("POSTs the Report, runs it, and polls the file", async () => {
    routeReportRun("73", "83");
    const out = await getReportLogic(
      GetReportInputSchema.parse({
        profileId: PID,
        name: "Delivery now",
        type: "STANDARD",
        criteria: CRITERIA,
      }),
      ctx,
      sdk
    );
    expectInsertThenRun("73", { name: "Delivery now", type: "STANDARD", criteria: CRITERIA });
    // basis: `reports.files.get` — GET
    // `userprofiles/{profileId}/reports/{reportId}/files/{fileId}`; `schemas.File.status`
    // enum REPORT_AVAILABLE, `File.urls.apiUrl`.
    const poll = apiRequests().filter((r) => r.method === "GET");
    expect(poll[0]?.url).toBe(`${API}/userprofiles/${PID}/reports/73/files/83`);
    expect(out.downloadUrl).toBe(`${API}/reports/73/files/83?alt=media`);
    expectOneTokenPerApiCall();
  }, 15_000);
});

describe("cm360_get_report_breakdowns → reports.insert with merged dimensions", () => {
  it("appends breakdown dimensions not already in criteria.dimensions", async () => {
    routeReportRun("74", "84");
    await getReportBreakdownsLogic(
      GetReportBreakdownsInputSchema.parse({
        profileId: PID,
        name: "By date and campaign",
        type: "STANDARD",
        criteria: CRITERIA,
        breakdownDimensions: ["campaign", "date"],
      }),
      ctx,
      sdk
    );
    // basis: `schemas.Report.criteria.dimensions` — SortedDimension[] ({ name }).
    expectInsertThenRun("74", {
      name: "By date and campaign",
      type: "STANDARD",
      criteria: { ...CRITERIA, dimensions: [{ name: "campaign" }, { name: "date" }] },
    });
  }, 15_000);
});

describe("cm360_create_report_schedule → reports.insert with schedule", () => {
  const schedule = {
    active: true,
    every: 1,
    repeats: "WEEKLY",
    repeatsOnWeekDays: ["MONDAY"],
    startDate: "2026-10-05",
    expirationDate: "2026-12-28",
  };
  const criteria = {
    dateRange: { relativeDateRange: "LAST_7_DAYS" },
    dimensions: [{ name: "campaign" }],
    metricNames: ["impressions"],
  };

  it("POSTs one Report carrying schedule + delivery; nothing is run", async () => {
    routeReportRun("75", "85");
    const delivery = { emailOwner: true, emailOwnerDeliveryType: "LINK" };
    const out = await createReportScheduleLogic(
      CreateReportScheduleInputSchema.parse({
        profileId: PID,
        name: "Weekly",
        type: "STANDARD",
        schedule,
        criteria,
        delivery,
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `reports.insert` (POST `userprofiles/{profileId}/reports`, request
    // Report); `schemas.Report.schedule` { active boolean, every int32, repeats,
    // repeatsOnWeekDays enum[], startDate / expirationDate format date } —
    // "Can only be set if the report's 'dateRange' is a relative date range";
    // `schemas.Report.delivery` { emailOwner, emailOwnerDeliveryType }.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/userprofiles/${PID}/reports`);
    expectJsonAuth(req);
    expect(req.body).toEqual({ name: "Weekly", type: "STANDARD", criteria, schedule, delivery });
    expect(out.reportId).toBe("75");
    expectOneTokenPerApiCall();
  });

  it("dry_run sends nothing", async () => {
    await createReportScheduleLogic(
      CreateReportScheduleInputSchema.parse({
        profileId: PID,
        name: "Weekly",
        type: "STANDARD",
        schedule,
        criteria,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("cm360_delete_report_schedule → reports.delete", () => {
  it("DELETE userprofiles/{profileId}/reports/{reportId}, no body", async () => {
    await deleteReportScheduleLogic(
      DeleteReportScheduleInputSchema.parse({ profileId: PID, reportId: "75" }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: `reports.delete` — httpMethod DELETE, flatPath
    // `userprofiles/{profileId}/reports/{reportId}`, no request body.
    expect(req.method).toBe("DELETE");
    expect(req.url).toBe(`${API}/userprofiles/${PID}/reports/75`);
    expect(req.body).toBeUndefined();
    expectOneTokenPerApiCall();
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await deleteReportScheduleLogic(
      DeleteReportScheduleInputSchema.parse({ profileId: PID, reportId: "75" }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await deleteReportScheduleLogic(
      DeleteReportScheduleInputSchema.parse({ profileId: PID, reportId: "75", dry_run: true }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});
