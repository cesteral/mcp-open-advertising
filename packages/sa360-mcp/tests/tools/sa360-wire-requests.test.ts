// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-request assertions for every sa360-mcp tool that issues a non-GET
 * upstream request (#236). Each test calls the REAL tool logic over REAL
 * session services (real HTTP clients, real OAuth refresh adapter, real
 * `RateLimiter`), with only `globalThis.fetch` stubbed, and asserts the full
 * request: method, URL and the exact JSON body.
 *
 * Expected shapes come from Google's Discovery documents, fetched 2026-09-25:
 *   - v2: https://doubleclicksearch.googleapis.com/$discovery/rest?version=v2
 *         (revision 20260922) — `resources.conversion.methods.insert|update`,
 *         `resources.reports.methods.request`, `schemas.ConversionList`,
 *         `schemas.Conversion`, `schemas.ReportRequest`.
 *   - v0: https://searchads360.googleapis.com/$discovery/rest?version=v0
 *         (revision 20260820) — `customers.searchAds360.search`,
 *         `searchAds360Fields.search` and their request schemas (the v0 schema
 *         set is also vendored at `src/generated/openapi.json`).
 *
 * Hosts: Discovery gives v2's rootUrl as `https://doubleclicksearch.googleapis.com/`;
 * this package uses the legacy `https://www.googleapis.com/doubleclicksearch/v2`
 * root (platform-facts.json `sa360.legacy_api_version`, status `unverified`). The
 * `/doubleclicksearch/v2/...` path is the same under both roots, so the path is
 * vendor-sourced and the host is the configured default.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { insertConversionsLogic } from "../../src/mcp-server/tools/definitions/insert-conversions.tool.js";
import { updateConversionsLogic } from "../../src/mcp-server/tools/definitions/update-conversions.tool.js";
import {
  submitReportLogic,
  SubmitReportInputSchema,
} from "../../src/mcp-server/tools/definitions/submit-report.tool.js";
import {
  sa360SearchLogic,
  SA360SearchInputSchema,
} from "../../src/mcp-server/tools/definitions/gaql-search.tool.js";
import {
  searchFieldsLogic,
  SearchFieldsInputSchema,
} from "../../src/mcp-server/tools/definitions/search-fields.tool.js";
import {
  installFetchStub,
  createWireSession,
  GOOGLE_TOKEN_URL,
  TEST_ACCESS_TOKEN,
  type FetchStub,
  type WireSession,
} from "../helpers/wire.js";

const V2_HOST = "www.googleapis.com";
const V0_HOST = "searchads360.googleapis.com";
const ctx = { requestId: "wire-req" } as any;

let stub: FetchStub;
let session: WireSession;
let sdk: any;

beforeEach(() => {
  stub = installFetchStub();
  session = createWireSession();
  sdk = {
    sessionId: session.sessionId,
    elicitInput: vi.fn().mockResolvedValue({ action: "accept", content: { confirm: true } }),
  };
});

afterEach(() => {
  session.dispose();
  stub.restore();
});

/** The single request that reached `host`; fails if there were zero or several. */
function onlyRequestTo(host: string) {
  const reqs = stub.to(host);
  expect(reqs).toHaveLength(1);
  return reqs[0]!;
}

function expectBearer(req: { headers: Record<string, string> }) {
  expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  expect(req.headers["content-type"]).toBe("application/json");
}

describe("OAuth: the real refresh-token adapter exchanges before the API call", () => {
  it("POSTs grant_type=refresh_token to Google's token endpoint", async () => {
    await searchFieldsLogic(
      SearchFieldsInputSchema.parse({ query: "SELECT name FROM searchAds360Fields" }),
      ctx,
      sdk
    );
    const token = stub.requests.find((r) => r.url === GOOGLE_TOKEN_URL);
    expect(token?.method).toBe("POST");
    // basis: Google OAuth 2.0 refresh flow (RFC 6749 §6 form parameters).
    expect(new URLSearchParams(String(token?.body)).get("grant_type")).toBe("refresh_token");
  });
});

describe("sa360_insert_conversions → doubleclicksearch.conversion.insert", () => {
  it("POST /doubleclicksearch/v2/conversion with a ConversionList body", async () => {
    stub.route({
      method: "POST",
      path: "/doubleclicksearch/v2/conversion",
      response: {
        kind: "doubleclicksearch#conversionList",
        conversion: [{ conversionId: "order-1" }],
      },
    });

    const out = await insertConversionsLogic(
      {
        agencyId: "20100000000000932",
        advertiserId: "21700000000011523",
        conversions: [
          {
            clickId: "COiYmPDTv7kCFcP0KgodOzQAAA",
            conversionId: "order-1",
            conversionTimestamp: "1700000000000",
            revenueMicros: "10000000",
            currencyCode: "USD",
            quantityMillis: "1000",
            segmentationType: "FLOODLIGHT",
            segmentationId: "26258",
            type: "TRANSACTION",
            customMetric: [{ name: "margin", value: 2.5 }],
          },
        ],
        dry_run: false,
      },
      ctx,
      sdk
    );

    const req = onlyRequestTo(V2_HOST);
    // basis: v2 discovery `conversion.insert` — httpMethod POST,
    // path "doubleclicksearch/v2/conversion", request $ref ConversionList.
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://www.googleapis.com/doubleclicksearch/v2/conversion");
    expectBearer(req);
    // basis: v2 discovery `schemas.ConversionList` = { kind, conversion[] }, where
    // `kind` is "the fixed string doubleclicksearch#conversionList"; each item's
    // keys are `schemas.Conversion` properties (agencyId/advertiserId int64
    // strings, conversionTimestamp "epoch millis UTC" string, revenueMicros
    // string, quantityMillis int64 string, segmentationId int64 string,
    // customMetric[] = CustomMetric { name: string, value: double }).
    expect(req.body).toEqual({
      kind: "doubleclicksearch#conversionList",
      conversion: [
        {
          agencyId: "20100000000000932",
          advertiserId: "21700000000011523",
          clickId: "COiYmPDTv7kCFcP0KgodOzQAAA",
          conversionId: "order-1",
          conversionTimestamp: "1700000000000",
          revenueMicros: "10000000",
          currencyCode: "USD",
          quantityMillis: "1000",
          segmentationType: "FLOODLIGHT",
          segmentationId: "26258",
          type: "TRANSACTION",
          customMetric: [{ name: "margin", value: 2.5 }],
        },
      ],
    });
    expect(out.insertedCount).toBe(1);
    // The v2 call spent a token on the v2 bucket of the REAL limiter.
    expect(session.rateLimiter.getRemainingTokens("sa360:v2:21700000000011523")).toBeLessThan(
      session.rateLimiter.getRemainingTokens("sa360:v2:untouched")
    );
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await insertConversionsLogic(
      {
        agencyId: "1",
        advertiserId: "2",
        conversions: [
          {
            clickId: "c",
            conversionId: "o",
            conversionTimestamp: "1700000000000",
            segmentationType: "FLOODLIGHT",
            segmentationId: "3",
          },
        ],
        dry_run: false,
      },
      ctx,
      sdk
    );
    expect(stub.to(V2_HOST)).toHaveLength(0);
  });
});

describe("sa360_update_conversions → doubleclicksearch.conversion.update", () => {
  it("PUT /doubleclicksearch/v2/conversion with a ConversionList body", async () => {
    stub.route({
      method: "PUT",
      path: "/doubleclicksearch/v2/conversion",
      response: { conversion: [{ conversionId: "order-1" }] },
    });

    await updateConversionsLogic(
      {
        agencyId: "20100000000000932",
        advertiserId: "21700000000011523",
        conversions: [
          {
            clickId: "COiYmPDTv7kCFcP0KgodOzQAAA",
            conversionId: "order-1",
            conversionTimestamp: "1700000000000",
            segmentationType: "FLOODLIGHT",
            segmentationName: "Purchase",
            state: "REMOVED",
            customDimension: [{ name: "channel", value: "store" }],
          },
        ],
        dry_run: false,
      } as any,
      ctx,
      sdk
    );

    const req = onlyRequestTo(V2_HOST);
    // basis: v2 discovery `conversion.update` — httpMethod PUT,
    // path "doubleclicksearch/v2/conversion", request $ref ConversionList.
    expect(req.method).toBe("PUT");
    expect(req.url).toBe("https://www.googleapis.com/doubleclicksearch/v2/conversion");
    expectBearer(req);
    // basis: v2 discovery `schemas.ConversionList` / `schemas.Conversion`
    // (`state` "either ACTIVE or REMOVED"; `segmentationName` "friendly
    // segmentation identifier"; customDimension[] = { name, value } strings).
    expect(req.body).toEqual({
      kind: "doubleclicksearch#conversionList",
      conversion: [
        {
          agencyId: "20100000000000932",
          advertiserId: "21700000000011523",
          clickId: "COiYmPDTv7kCFcP0KgodOzQAAA",
          conversionId: "order-1",
          conversionTimestamp: "1700000000000",
          segmentationType: "FLOODLIGHT",
          segmentationName: "Purchase",
          state: "REMOVED",
          customDimension: [{ name: "channel", value: "store" }],
        },
      ],
    });
  });
});

describe("sa360_submit_report → doubleclicksearch.reports.request", () => {
  it("POST /doubleclicksearch/v2/reports with a ReportRequest body", async () => {
    stub.route({
      method: "POST",
      path: "/doubleclicksearch/v2/reports",
      response: { kind: "doubleclicksearch#report", id: "AAAnOdc9I_GnxAB0", isReportReady: false },
    });

    const out = await submitReportLogic(
      SubmitReportInputSchema.parse({
        agencyId: "20100000000000932",
        advertiserId: "21700000000011523",
        reportType: "campaign",
        columns: [{ columnName: "campaignId" }, { columnName: "clicks", headerText: "Clicks" }],
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        filters: [
          { column: { columnName: "campaignStatus" }, operator: "equals", values: ["Active"] },
        ],
        includeRemovedEntities: false,
      }),
      ctx,
      sdk
    );

    const req = onlyRequestTo(V2_HOST);
    // basis: v2 discovery `reports.request` — httpMethod POST,
    // path "doubleclicksearch/v2/reports", request $ref ReportRequest.
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://www.googleapis.com/doubleclicksearch/v2/reports");
    expectBearer(req);
    // basis: v2 discovery `schemas.ReportRequest`:
    //   reportType, statisticsCurrency, downloadFormat, maxRowsPerFile are
    //   annotated required for `doubleclicksearch.reports.request`;
    //   statisticsCurrency ∈ usd|agency|advertiser|account; downloadFormat
    //   "csv or tsv"; maxRowsPerFile "Acceptable values are 1000000 to
    //   100000000"; columns[] = ReportApiColumnSpec { columnName, headerText };
    //   timeRange { startDate, endDate } "YYYY-MM-DD"; reportScope { agencyId,
    //   advertiserId } int64 strings; filters[] { column: ReportApiColumnSpec,
    //   operator, values[] }; includeRemovedEntities boolean.
    expect(req.body).toEqual({
      reportType: "campaign",
      columns: [{ columnName: "campaignId" }, { columnName: "clicks", headerText: "Clicks" }],
      timeRange: { startDate: "2026-09-01", endDate: "2026-09-07" },
      statisticsCurrency: "agency",
      reportScope: { agencyId: "20100000000000932", advertiserId: "21700000000011523" },
      maxRowsPerFile: 10000000,
      downloadFormat: "csv",
      filters: [
        { column: { columnName: "campaignStatus" }, operator: "equals", values: ["Active"] },
      ],
      includeRemovedEntities: false,
    });
    expect(out.reportId).toBe("AAAnOdc9I_GnxAB0");
  });

  it("dry_run sends no request", async () => {
    await submitReportLogic(
      SubmitReportInputSchema.parse({
        agencyId: "1",
        reportType: "campaign",
        columns: [{ columnName: "clicks" }],
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

// The two read tools below are not writes, but they issue non-GET (POST)
// requests, so their bodies are asserted the same way.

describe("sa360_search → customers.searchAds360.search", () => {
  it("POST /v0/customers/{id}/searchAds360:search with a SearchSearchAds360Request", async () => {
    stub.route({
      method: "POST",
      path: "/v0/customers/1234567890/searchAds360:search",
      response: { results: [{ campaign: { id: "1" } }], totalResultsCount: "1" },
    });

    await sa360SearchLogic(
      SA360SearchInputSchema.parse({
        customerId: "1234567890",
        query: "SELECT campaign.id FROM campaign",
        pageToken: "next-page",
        mode: "rows",
        maxRows: 25,
      }),
      ctx,
      sdk
    );

    const req = onlyRequestTo(V0_HOST);
    // basis: v0 discovery `customers.searchAds360.search` — httpMethod POST,
    // flatPath "v0/customers/{customersId}/searchAds360:search".
    expect(req.method).toBe("POST");
    expect(req.url).toBe(
      "https://searchads360.googleapis.com/v0/customers/1234567890/searchAds360:search"
    );
    expectBearer(req);
    // basis: unverified (code-only) — the `login-customer-id` header is not in
    // the Discovery document (it is documented on the SA360 site, unreachable here).
    expect(req.headers["login-customer-id"]).toBe("1112223333");
    // basis: v0 discovery `SearchSearchAds360Request` properties
    // { query, pageSize int32, pageToken, returnTotalResultsCount boolean }.
    expect(req.body).toEqual({
      query: "SELECT campaign.id FROM campaign",
      pageSize: 25,
      pageToken: "next-page",
      returnTotalResultsCount: true,
    });
  });
});

describe("sa360_search_fields → searchAds360Fields.search", () => {
  it("POST /v0/searchAds360Fields:search with a SearchSearchAds360FieldsRequest", async () => {
    stub.route({
      method: "POST",
      path: "/v0/searchAds360Fields:search",
      response: { results: [{ name: "campaign.id" }], totalResultsCount: "1" },
    });

    await searchFieldsLogic(
      SearchFieldsInputSchema.parse({
        query: "SELECT name FROM searchAds360Fields WHERE name LIKE 'campaign.%'",
      }),
      ctx,
      sdk
    );

    const req = onlyRequestTo(V0_HOST);
    // basis: v0 discovery `searchAds360Fields.search` — httpMethod POST,
    // flatPath "v0/searchAds360Fields:search".
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://searchads360.googleapis.com/v0/searchAds360Fields:search");
    // basis: v0 discovery `SearchSearchAds360FieldsRequest` = { query, pageSize, pageToken }
    // (no returnTotalResultsCount on this request).
    expect(req.body).toEqual({
      query: "SELECT name FROM searchAds360Fields WHERE name LIKE 'campaign.%'",
      pageSize: 100,
    });
  });
});
