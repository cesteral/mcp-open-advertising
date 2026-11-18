// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-request assertions for the sa360-mcp READ tools (#236), the companion to
 * `sa360-wire-requests.test.ts` (which covers the writes and `sa360_search`).
 * Each test calls the REAL tool logic over REAL session services (real HTTP
 * clients, real OAuth adapter, real `RateLimiter`) with only `globalThis.fetch`
 * stubbed, and asserts the upstream method, URL and body.
 *
 * Vendor sources, Google Discovery documents fetched 2026-11-18:
 *   - v0 https://searchads360.googleapis.com/$discovery/rest?version=v0
 *     (revision 20261116): `customers.listAccessibleCustomers` GET
 *     v0/customers:listAccessibleCustomers; `customers.customColumns.list` GET
 *     v0/customers/{customersId}/customColumns; `customers.searchAds360.search`
 *     POST v0/customers/{customersId}/searchAds360:search;
 *     `searchAds360Fields.search` POST v0/searchAds360Fields:search.
 *   - v2 https://doubleclicksearch.googleapis.com/$discovery/rest?version=v2
 *     (revision 20261116): `reports.get` GET doubleclicksearch/v2/reports/{reportId};
 *     `schemas.Report.files[].url` is the download URL.
 *
 * The query strings themselves (SELECT/FROM/WHERE) are the package's own
 * construction: Discovery defines `query` only as a string, so those assertions
 * pin the query grammar the code emits, not a vendor schema.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getEntityLogic } from "../../src/mcp-server/tools/definitions/get-entity.tool.js";
import { listEntitiesLogic } from "../../src/mcp-server/tools/definitions/list-entities.tool.js";
import { listAccountsLogic } from "../../src/mcp-server/tools/definitions/list-accounts.tool.js";
import { listCustomColumnsLogic } from "../../src/mcp-server/tools/definitions/list-custom-columns.tool.js";
import {
  getInsightsLogic,
  GetInsightsInputSchema,
} from "../../src/mcp-server/tools/definitions/get-insights.tool.js";
import {
  getInsightsBreakdownsLogic,
  GetInsightsBreakdownsInputSchema,
} from "../../src/mcp-server/tools/definitions/get-insights-breakdowns.tool.js";
import { checkReportStatusLogic } from "../../src/mcp-server/tools/definitions/check-report-status.tool.js";
import { downloadReportLogic } from "../../src/mcp-server/tools/definitions/download-report.tool.js";
import { listReportColumnsLogic } from "../../src/mcp-server/tools/definitions/list-report-columns.tool.js";
import {
  installFetchStub,
  createWireSession,
  TEST_ACCESS_TOKEN,
  type FetchStub,
  type WireSession,
} from "../helpers/wire.js";

const V0_HOST = "searchads360.googleapis.com";
const V2_HOST = "www.googleapis.com";
const ctx = { requestId: "read-wire-req" } as any;

let stub: FetchStub;
let session: WireSession;
let sdk: any;

beforeEach(() => {
  stub = installFetchStub();
  session = createWireSession("read-wire-session");
  sdk = { sessionId: session.sessionId };
});

afterEach(() => {
  session.dispose();
  stub.restore();
});

function onlyRequestTo(host: string) {
  const reqs = stub.to(host);
  expect(reqs).toHaveLength(1);
  return reqs[0]!;
}

function expectBearer(req: { headers: Record<string, string> }) {
  expect(req.headers.authorization).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
}

const SEARCH_PATH = "/v0/customers/1234567890/searchAds360:search";

describe("sa360_list_accounts → customers.listAccessibleCustomers", () => {
  it("GET /v0/customers:listAccessibleCustomers with no body", async () => {
    stub.route({
      method: "GET",
      path: "/v0/customers:listAccessibleCustomers",
      response: { resourceNames: ["customers/111", "customers/222"] },
    });

    const out = await listAccountsLogic({} as any, ctx, sdk);

    const req = onlyRequestTo(V0_HOST);
    // basis: v0 discovery `customers.listAccessibleCustomers` — httpMethod GET,
    // flatPath "v0/customers:listAccessibleCustomers", no request schema.
    expect(req.method).toBe("GET");
    expect(req.url).toBe(
      "https://searchads360.googleapis.com/v0/customers:listAccessibleCustomers"
    );
    expect(req.body).toBeUndefined();
    expectBearer(req);
    expect(out.customerIds).toEqual(["111", "222"]);
  });
});

describe("sa360_list_custom_columns → customers.customColumns.list", () => {
  it("GET /v0/customers/{id}/customColumns with no body", async () => {
    stub.route({
      method: "GET",
      path: "/v0/customers/1234567890/customColumns",
      response: { customColumns: [{ id: "7", name: "cc" }] },
    });

    const out = await listCustomColumnsLogic({ customerId: "1234567890" } as any, ctx, sdk);

    const req = onlyRequestTo(V0_HOST);
    // basis: v0 discovery `customers.customColumns.list` — httpMethod GET,
    // flatPath "v0/customers/{customersId}/customColumns".
    expect(req.method).toBe("GET");
    expect(req.url).toBe(
      "https://searchads360.googleapis.com/v0/customers/1234567890/customColumns"
    );
    expect(req.body).toBeUndefined();
    expectBearer(req);
    expect(out.totalCount).toBe(1);
  });
});

describe("sa360_get_entity → customers.searchAds360.search", () => {
  it("POSTs a single-row id query with pageSize 1", async () => {
    stub.route({
      method: "POST",
      path: SEARCH_PATH,
      response: { results: [{ campaign: { id: "9876543210" } }] },
    });

    await getEntityLogic(
      { entityType: "campaign", customerId: "1234567890", entityId: "9876543210" } as any,
      ctx,
      sdk
    );

    const req = onlyRequestTo(V0_HOST);
    // basis: v0 discovery `customers.searchAds360.search` — POST
    // "v0/customers/{customersId}/searchAds360:search"; request body
    // `SearchSearchAds360Request` = { query, pageSize, pageToken, returnTotalResultsCount }.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`https://${V0_HOST}${SEARCH_PATH}`);
    expectBearer(req);
    expect(req.body).toEqual({
      query:
        "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, " +
        "campaign.start_date, campaign.end_date, campaign.campaign_budget, campaign.engine_id, " +
        "campaign.resource_name FROM campaign WHERE campaign.id = 9876543210 LIMIT 1",
      pageSize: 1,
    });
  });
});

describe("sa360_list_entities → customers.searchAds360.search", () => {
  it("POSTs the list query with pageSize, pageToken and returnTotalResultsCount", async () => {
    stub.route({
      method: "POST",
      path: SEARCH_PATH,
      response: { results: [], totalResultsCount: "0" },
    });

    await listEntitiesLogic(
      {
        entityType: "campaign",
        customerId: "1234567890",
        filters: { "campaign.status": "= 'ENABLED'" },
        pageSize: 50,
        pageToken: "tok",
        orderBy: "campaign.id DESC",
      } as any,
      ctx,
      sdk
    );

    const req = onlyRequestTo(V0_HOST);
    // basis: v0 discovery `SearchSearchAds360Request` properties
    // { query, pageSize int32, pageToken, returnTotalResultsCount boolean }.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`https://${V0_HOST}${SEARCH_PATH}`);
    expectBearer(req);
    expect(req.body).toEqual({
      query:
        "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, " +
        "campaign.start_date, campaign.end_date, campaign.campaign_budget, campaign.engine_id, " +
        "campaign.resource_name FROM campaign WHERE campaign.status = 'ENABLED' " +
        "ORDER BY campaign.id DESC",
      pageSize: 50,
      pageToken: "tok",
      returnTotalResultsCount: true,
    });
  });
});

describe("sa360_get_insights → customers.searchAds360.search", () => {
  it("POSTs a metrics query over a custom date window", async () => {
    stub.route({ method: "POST", path: SEARCH_PATH, response: { results: [] } });

    await getInsightsLogic(
      GetInsightsInputSchema.parse({
        customerId: "1234567890",
        entityType: "campaign",
        entityId: "55",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        metrics: ["clicks", "metrics.impressions"],
        pageToken: "p2",
        maxRows: 20,
      }),
      ctx,
      sdk
    );

    const req = onlyRequestTo(V0_HOST);
    // basis: v0 discovery `customers.searchAds360.search` (see above); `query`
    // is a free string, this pins the package's emitted grammar.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`https://${V0_HOST}${SEARCH_PATH}`);
    expectBearer(req);
    expect(req.body).toEqual({
      query:
        "SELECT campaign.id, campaign.name, metrics.clicks, metrics.impressions FROM campaign " +
        "WHERE segments.date BETWEEN '2026-01-01' AND '2026-01-31' AND campaign.id = 55 " +
        "ORDER BY metrics.impressions DESC LIMIT 20",
      pageSize: 20,
      pageToken: "p2",
    });
  });
});

describe("sa360_get_insights_breakdowns → customers.searchAds360.search", () => {
  it("POSTs a segmented query using a preset date range", async () => {
    stub.route({ method: "POST", path: SEARCH_PATH, response: { results: [] } });

    await getInsightsBreakdownsLogic(
      GetInsightsBreakdownsInputSchema.parse({
        customerId: "1234567890",
        entityType: "adGroup",
        dateRange: "LAST_7_DAYS",
        breakdowns: ["device", "segments.date"],
        metrics: ["clicks"],
        maxRows: 10,
      }),
      ctx,
      sdk
    );

    const req = onlyRequestTo(V0_HOST);
    // basis: v0 discovery `customers.searchAds360.search` (see above).
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`https://${V0_HOST}${SEARCH_PATH}`);
    expectBearer(req);
    expect(req.body).toEqual({
      query:
        "SELECT ad_group.id, ad_group.name, segments.device, segments.date, metrics.clicks " +
        "FROM ad_group WHERE segments.date DURING LAST_7_DAYS " +
        "ORDER BY metrics.impressions DESC LIMIT 10",
      pageSize: 10,
    });
  });
});

describe("sa360_list_report_columns → searchAds360Fields.search (live path)", () => {
  it("POSTs a field-metadata query for the requested resource", async () => {
    stub.route({
      method: "POST",
      path: "/v0/searchAds360Fields:search",
      response: { results: [{ name: "campaign.id" }] },
    });

    const out = await listReportColumnsLogic({ resource: "campaign" } as any, ctx, sdk);

    const req = onlyRequestTo(V0_HOST);
    // basis: v0 discovery `searchAds360Fields.search` — POST
    // "v0/searchAds360Fields:search", body `SearchSearchAds360FieldsRequest`
    // = { query, pageSize, pageToken }.
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://searchads360.googleapis.com/v0/searchAds360Fields:search");
    expectBearer(req);
    expect(req.body).toEqual({
      query:
        "SELECT name, category, data_type, selectable, filterable, sortable " +
        "FROM searchAds360Fields WHERE name LIKE 'campaign.%' LIMIT 1000",
      pageSize: 1000,
    });
    expect(out.source).toBe("live");
  });
});

describe("sa360_check_report_status → doubleclicksearch reports.get (v2)", () => {
  it("GET /doubleclicksearch/v2/reports/{reportId} with the id percent-encoded", async () => {
    stub.route({
      method: "GET",
      path: /\/reports\//,
      response: { id: "abc123", isReportReady: true, rowCount: 3, files: [] },
    });

    await checkReportStatusLogic({ reportId: "abc123" } as any, ctx, sdk);

    const req = onlyRequestTo(V2_HOST);
    // basis: v2 discovery `reports.get` — httpMethod GET, flatPath
    // "doubleclicksearch/v2/reports/{reportId}".
    expect(req.method).toBe("GET");
    expect(req.url).toBe("https://www.googleapis.com/doubleclicksearch/v2/reports/abc123");
    expect(req.body).toBeUndefined();
    expectBearer(req);
  });

  it("encodes a hostile reportId so it cannot leave the reports path", async () => {
    stub.route({ method: "GET", path: /\/reports\//, response: { id: "x", isReportReady: false } });

    await checkReportStatusLogic({ reportId: "../files/0#" } as any, ctx, sdk);

    // basis: same flatPath; `{reportId}` is a single path segment, so "/" and
    // "#" must be encoded.
    expect(onlyRequestTo(V2_HOST).url).toBe(
      "https://www.googleapis.com/doubleclicksearch/v2/reports/..%2Ffiles%2F0%23"
    );
  });
});

describe("sa360_download_report → GET of a report file URL (v2)", () => {
  it("GETs the file URL as given with the bearer token", async () => {
    const downloadUrl = "https://www.googleapis.com/doubleclicksearch/v2/reports/abc123/files/0";
    stub.route({ method: "GET", path: /\/files\/0$/, response: "campaign,clicks\nA,1\n" });

    await downloadReportLogic({ downloadUrl } as any, ctx, sdk);

    const req = onlyRequestTo(V2_HOST);
    // basis: v2 discovery `reports.getFile` — httpMethod GET, flatPath
    // "doubleclicksearch/v2/reports/{reportId}/files/{reportFragment}", and
    // `schemas.Report.files[].url` ("Use this url to download the report file").
    expect(req.method).toBe("GET");
    expect(req.url).toBe(downloadUrl);
    expect(req.body).toBeUndefined();
    expectBearer(req);
  });
});

describe("read tools: one upstream call per invocation, through the real limiter", () => {
  it("a tool call consumes from the session's limiter (not a bypass)", async () => {
    const consume = vi.spyOn(session.rateLimiter, "consume");
    stub.route({ method: "POST", path: SEARCH_PATH, response: { results: [{ campaign: {} }] } });

    await getEntityLogic(
      { entityType: "campaign", customerId: "1234567890", entityId: "1" } as any,
      ctx,
      sdk
    );

    expect(consume).toHaveBeenCalledWith("sa360:1234567890");
  });
});
