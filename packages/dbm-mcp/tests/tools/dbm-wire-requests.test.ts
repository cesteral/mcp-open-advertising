// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-request assertions for every dbm-mcp tool (#236). All six tools send
 * non-GET requests: each one creates a saved query (POST), runs it (POST),
 * polls the report (GET), downloads the report file, then deletes the saved
 * query (DELETE). Each test calls the REAL tool logic over REAL session
 * services — BidManagerService, the googleapis `doubleclickbidmanager` v2
 * client behind the auth bridge, the shared OAuth2 refresh adapter and the
 * package's real module-level `RateLimiter` — and asserts every request that
 * leaves the process: method, URL (+ query) and exact body.
 *
 * Transport: the googleapis client does not use the global fetch; see
 * `tests/helpers/wire.ts` for why the stub sits at `node:https`'s `request`
 * for API calls and at `globalThis.fetch` for the token exchange and the
 * report download.
 *
 * Vendor source: Google's Discovery document for Bid Manager v2,
 *   https://doubleclickbidmanager.googleapis.com/$discovery/rest?version=v2
 *   revision 20260923 (fetched 2026-09-30), rootUrl
 *   https://doubleclickbidmanager.googleapis.com/, servicePath v2/.
 * Cited as `discovery <resource>.<method>` (httpMethod, path, request /
 * parameters) and `discovery schemas.<Name>`. v2 is the version dbm-mcp pins
 * (platform-facts `dbm.api_version`). The Discovery document types
 * `Parameters.groupBys` / `metrics` and `FilterPair.type` as plain strings
 * with no enum, so the FILTER_* / METRIC_* names themselves are checked
 * against the package's generated catalogs, not against this source.
 *
 * Rate limiting: queries.create, queries.run and every queries.reports.get
 * draw 1 token each from `bidmanager:global`; queries.delete deliberately does
 * not (BidManagerService.deleteQueryBestEffort) and the report download is not
 * an API call.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Report polling sleeps `reportPollInitialDelayMs` (5 s by default) before the
// first status read; config is read at import. Timing only — no request
// changes.
vi.hoisted(() => {
  process.env.REPORT_POLL_INITIAL_DELAY_MS = "1";
  process.env.REPORT_POLL_MAX_DELAY_MS = "1";
});

import pino from "pino";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { mcpConfig } from "../../src/config/index.js";
import { createMcpServer } from "../../src/mcp-server/server.js";
import {
  getCampaignDeliveryLogic,
  GetCampaignDeliveryInputSchema,
} from "../../src/mcp-server/tools/definitions/get-campaign-delivery.tool.js";
import {
  getPerformanceMetricsLogic,
  GetPerformanceMetricsInputSchema,
} from "../../src/mcp-server/tools/definitions/get-performance-metrics.tool.js";
import {
  getHistoricalMetricsLogic,
  GetHistoricalMetricsInputSchema,
} from "../../src/mcp-server/tools/definitions/get-historical-metrics.tool.js";
import {
  getPacingStatusLogic,
  GetPacingStatusInputSchema,
} from "../../src/mcp-server/tools/definitions/get-pacing-status.tool.js";
import {
  runCustomQueryLogic,
  RunCustomQueryInputSchema,
} from "../../src/mcp-server/tools/definitions/run-custom-query.tool.js";
import {
  installWireStub,
  createWireSession,
  rateLimiter,
  DBM_HOST,
  TOKEN_HOST,
  TEST_ACCESS_TOKEN,
  TEST_CREDENTIALS,
  type WireRequest,
  type WireStub,
  type WireSession,
} from "../helpers/wire.js";

const API = `https://${DBM_HOST}/v2`;
const QUERY_ID = "1234567";
const REPORT_ID = "7654321";
const REPORT_URL = "https://storage.googleapis.com/dbm-reports/report-7654321.csv";
const ctx = { requestId: "wire-req" } as any;

/** The metric set the four fixed-shape tools request. */
const DELIVERY_METRICS = [
  "METRIC_IMPRESSIONS",
  "METRIC_CLICKS",
  "METRIC_TOTAL_MEDIA_COST_ADVERTISER",
  "METRIC_TOTAL_CONVERSIONS",
  "METRIC_REVENUE_ADVERTISER",
];

let stub: WireStub;
let session: WireSession;

/** Route a report chain that completes on the first poll. */
function routeReportChain(csv = "Date,Impressions,Clicks\n2026/09/01,100,4\n") {
  stub.route({ method: "POST", path: "/v2/queries", response: { queryId: QUERY_ID } });
  stub.route({
    method: "POST",
    path: `/v2/queries/${QUERY_ID}:run`,
    response: { key: { queryId: QUERY_ID, reportId: REPORT_ID } },
  });
  stub.route({
    method: "GET",
    path: `/v2/queries/${QUERY_ID}/reports/${REPORT_ID}`,
    response: {
      key: { queryId: QUERY_ID, reportId: REPORT_ID },
      metadata: { status: { state: "DONE", format: "CSV" }, googleCloudStoragePath: REPORT_URL },
    },
  });
  stub.route({
    method: "GET",
    host: "storage.googleapis.com",
    path: "/dbm-reports/report-7654321.csv",
    rawBody: csv,
    contentType: "text/csv",
  });
  stub.route({ method: "DELETE", path: `/v2/queries/${QUERY_ID}`, response: {} });
}

beforeEach(() => {
  stub = installWireStub();
  session = createWireSession();
});

afterEach(() => {
  session.dispose();
  stub.restore();
});

function sdk() {
  return { sessionId: session.sessionId } as any;
}

function apiRequests(): WireRequest[] {
  return stub.to(DBM_HOST);
}

/** basis: discovery `auth.oauth2` — OAuth 2.0 bearer; googleapis sends JSON. */
function expectAuth(req: WireRequest) {
  expect(req.transport).toBe("node:https");
  expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
}

/**
 * Assert the full five-call chain and return the queries.create body.
 *
 * basis:
 * - discovery queries.create — POST `queries`, request `$ref: Query`.
 * - discovery queries.run — POST `queries/{queryId}:run`, request
 *   `RunQueryRequest` (optional; only `dataRange`), query param
 *   `synchronous` (default false — "not recommended"): neither is sent.
 * - discovery queries.reports.get — GET `queries/{queryId}/reports/{reportId}`.
 * - discovery queries.delete — DELETE `queries/{queryId}`, "Deletes an
 *   existing query as well as its generated reports", so it must come after
 *   the download.
 * - The download is the `googleCloudStoragePath` from
 *   schemas.ReportMetadata — a signed URL, fetched with no credentials.
 */
function expectChain(): Record<string, unknown> {
  expect(stub.requests.map((r) => `${r.transport} ${r.method} ${r.url}`)).toEqual([
    `fetch POST https://${TOKEN_HOST}/token`,
    `node:https POST ${API}/queries`,
    `node:https POST ${API}/queries/${QUERY_ID}:run`,
    `node:https GET ${API}/queries/${QUERY_ID}/reports/${REPORT_ID}`,
    `fetch GET ${REPORT_URL}`,
    `node:https DELETE ${API}/queries/${QUERY_ID}`,
  ]);
  const [create, run, , del] = apiRequests();
  for (const req of apiRequests()) expectAuth(req);
  expect(create!.headers["content-type"]).toBe("application/json");
  expect(run!.body).toBeUndefined();
  expect(run!.query).toEqual({});
  expect(del!.body).toBeUndefined();
  const download = stub.to("storage.googleapis.com")[0]!;
  expect(download.headers["authorization"]).toBeUndefined();
  // One token each for create, run and the single status poll.
  expect(rateLimiter.getRemainingTokens("bidmanager:global")).toBe(
    mcpConfig.rateLimitPerMinute - 3
  );
  return create!.body as Record<string, unknown>;
}

/** basis: discovery schemas.Query / QueryMetadata / DataRange / Date / Parameters / FilterPair. */
function queryBody(
  title: string,
  dataRange: Record<string, unknown>,
  params: Record<string, unknown>
): Record<string, unknown> {
  return { metadata: { title, dataRange, format: "CSV" }, params };
}

describe("OAuth2 refresh-token exchange (shared adapter, global fetch)", () => {
  it("POSTs the refresh grant form to oauth2.googleapis.com/token once", async () => {
    routeReportChain();
    await getCampaignDeliveryLogic(
      GetCampaignDeliveryInputSchema.parse({
        advertiserId: "111",
        campaignId: "222",
        startDate: "2026-09-01",
        endDate: "2026-09-07",
      }),
      ctx,
      sdk()
    );
    const token = stub.to(TOKEN_HOST);
    // basis: Google OAuth 2.0 token endpoint (discovery `auth.oauth2`;
    // grant_type=refresh_token form) — same shape gads-mcp's wire tests pin.
    expect(token).toHaveLength(1);
    expect(token[0]!.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(token[0]!.form).toEqual({
      grant_type: "refresh_token",
      client_id: TEST_CREDENTIALS.clientId,
      client_secret: TEST_CREDENTIALS.clientSecret,
      refresh_token: TEST_CREDENTIALS.refreshToken,
    });
  });
});

describe("dbm_get_campaign_delivery", () => {
  it("creates a CUSTOM_DATES STANDARD query filtered to the advertiser and campaign", async () => {
    routeReportChain();
    const out = await getCampaignDeliveryLogic(
      GetCampaignDeliveryInputSchema.parse({
        advertiserId: "111",
        campaignId: "222",
        startDate: "2026-09-01",
        endDate: "2026-09-07",
      }),
      ctx,
      sdk()
    );
    const body = expectChain();
    // basis: discovery schemas.DataRange.range enum includes CUSTOM_DATES;
    // customStartDate / customEndDate are schemas.Date {year, month, day}
    // (int32); schemas.QueryMetadata.format enum includes CSV;
    // schemas.Parameters.type enum includes STANDARD; filters are
    // schemas.FilterPair {type, value}.
    expect(body).toEqual(
      queryBody(
        "Delivery metrics for campaign 222",
        {
          range: "CUSTOM_DATES",
          customStartDate: { year: 2026, month: 9, day: 1 },
          customEndDate: { year: 2026, month: 9, day: 7 },
        },
        {
          type: "STANDARD",
          groupBys: ["FILTER_DATE", "FILTER_MEDIA_PLAN", "FILTER_ADVERTISER_CURRENCY"],
          metrics: DELIVERY_METRICS,
          filters: [
            { type: "FILTER_ADVERTISER", value: "111" },
            { type: "FILTER_MEDIA_PLAN", value: "222" },
          ],
        }
      )
    );
    expect(out.metrics.impressions).toBe(100);
  });

  it("still deletes the saved query when the run is rejected, and polls nothing", async () => {
    routeReportChain();
    stub.route({
      method: "POST",
      path: `/v2/queries/${QUERY_ID}:run`,
      status: 400,
      response: { error: { code: 400, message: "Invalid query", status: "INVALID_ARGUMENT" } },
    });
    await expect(
      getCampaignDeliveryLogic(
        GetCampaignDeliveryInputSchema.parse({
          advertiserId: "111",
          campaignId: "222",
          startDate: "2026-09-01",
          endDate: "2026-09-07",
        }),
        ctx,
        sdk()
      )
    ).rejects.toThrow();
    // basis: discovery queries.delete (see expectChain). A failed POST run
    // is not retried (classifyReportError: non-idempotent POST).
    expect(apiRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /v2/queries",
      `POST /v2/queries/${QUERY_ID}:run`,
      `DELETE /v2/queries/${QUERY_ID}`,
    ]);
  });
});

describe("dbm_get_performance_metrics", () => {
  it("sends the same delivery query", async () => {
    routeReportChain();
    await getPerformanceMetricsLogic(
      GetPerformanceMetricsInputSchema.parse({
        advertiserId: "111",
        campaignId: "222",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      }),
      ctx,
      sdk()
    );
    const body = expectChain();
    // basis: as for dbm_get_campaign_delivery.
    expect(body).toEqual(
      queryBody(
        "Delivery metrics for campaign 222",
        {
          range: "CUSTOM_DATES",
          customStartDate: { year: 2026, month: 8, day: 1 },
          customEndDate: { year: 2026, month: 8, day: 31 },
        },
        {
          type: "STANDARD",
          groupBys: ["FILTER_DATE", "FILTER_MEDIA_PLAN", "FILTER_ADVERTISER_CURRENCY"],
          metrics: DELIVERY_METRICS,
          filters: [
            { type: "FILTER_ADVERTISER", value: "111" },
            { type: "FILTER_MEDIA_PLAN", value: "222" },
          ],
        }
      )
    );
  });
});

describe("dbm_get_historical_metrics", () => {
  it("groups by the granularity's time dimension (weekly → FILTER_WEEK)", async () => {
    routeReportChain("Week,Impressions\n2026/09/01 - 2026/09/07,100\n");
    await getHistoricalMetricsLogic(
      GetHistoricalMetricsInputSchema.parse({
        advertiserId: "111",
        campaignId: "222",
        startDate: "2026-07-01",
        endDate: "2026-09-30",
        granularity: "weekly",
      }),
      ctx,
      sdk()
    );
    const body = expectChain();
    // basis: discovery schemas (see above); the FILTER_WEEK name is from
    // src/generated/filters.ts (Discovery does not enumerate filters).
    expect(body).toEqual(
      queryBody(
        "Historical metrics for campaign 222",
        {
          range: "CUSTOM_DATES",
          customStartDate: { year: 2026, month: 7, day: 1 },
          customEndDate: { year: 2026, month: 9, day: 30 },
        },
        {
          type: "STANDARD",
          groupBys: ["FILTER_WEEK", "FILTER_MEDIA_PLAN", "FILTER_ADVERTISER_CURRENCY"],
          metrics: DELIVERY_METRICS,
          filters: [
            { type: "FILTER_ADVERTISER", value: "111" },
            { type: "FILTER_MEDIA_PLAN", value: "222" },
          ],
        }
      )
    );
  });
});

describe("dbm_get_pacing_status", () => {
  it("queries the flight's delivery up to the flight end (a flight already over)", async () => {
    routeReportChain();
    await getPacingStatusLogic(
      GetPacingStatusInputSchema.parse({
        advertiserId: "111",
        campaignId: "222",
        budgetTotal: 1000,
        flightStartDate: "2026-01-01",
        flightEndDate: "2026-01-31",
      }),
      ctx,
      sdk()
    );
    const body = expectChain();
    // basis: as for dbm_get_campaign_delivery; the range ends at
    // min(today, flightEndDate).
    expect(body).toEqual(
      queryBody(
        "Delivery metrics for campaign 222",
        {
          range: "CUSTOM_DATES",
          customStartDate: { year: 2026, month: 1, day: 1 },
          customEndDate: { year: 2026, month: 1, day: 31 },
        },
        {
          type: "STANDARD",
          groupBys: ["FILTER_DATE", "FILTER_MEDIA_PLAN", "FILTER_ADVERTISER_CURRENCY"],
          metrics: DELIVERY_METRICS,
          filters: [
            { type: "FILTER_ADVERTISER", value: "111" },
            { type: "FILTER_MEDIA_PLAN", value: "222" },
          ],
        }
      )
    );
  });
});

describe("dbm_run_custom_query", () => {
  it("preset range → DataRange {range} with no custom dates", async () => {
    routeReportChain();
    const out = await runCustomQueryLogic(
      RunCustomQueryInputSchema.parse({
        reportType: "STANDARD",
        groupBys: ["FILTER_DATE", "FILTER_ADVERTISER"],
        metrics: ["METRIC_IMPRESSIONS", "METRIC_CLICKS"],
        filters: [{ type: "FILTER_ADVERTISER", value: "111" }],
        dateRange: { preset: "LAST_7_DAYS" },
      }),
      ctx,
      sdk()
    );
    const body = expectChain();
    // basis: discovery schemas.DataRange.range enum includes LAST_7_DAYS;
    // customStartDate / customEndDate are only meaningful with CUSTOM_DATES
    // and are omitted. The title is a timestamp (not asserted literally).
    expect(body).toEqual(
      queryBody(
        expect.stringMatching(/^Custom query - \d{4}-\d{2}-\d{2}T/) as unknown as string,
        { range: "LAST_7_DAYS" },
        {
          type: "STANDARD",
          groupBys: ["FILTER_DATE", "FILTER_ADVERTISER"],
          metrics: ["METRIC_IMPRESSIONS", "METRIC_CLICKS"],
          filters: [{ type: "FILTER_ADVERTISER", value: "111" }],
        }
      )
    );
    expect(out.queryId).toBe(QUERY_ID);
    expect(out.reportId).toBe(REPORT_ID);
  });

  it("custom dates → DataRange CUSTOM_DATES with Date objects", async () => {
    routeReportChain();
    await runCustomQueryLogic(
      RunCustomQueryInputSchema.parse({
        reportType: "STANDARD",
        groupBys: ["FILTER_DATE"],
        metrics: ["METRIC_IMPRESSIONS"],
        dateRange: { startDate: "2026-02-01", endDate: "2026-02-28" },
      }),
      ctx,
      sdk()
    );
    const body = expectChain();
    expect((body.metadata as { dataRange: unknown }).dataRange).toEqual({
      range: "CUSTOM_DATES",
      customStartDate: { year: 2026, month: 2, day: 1 },
      customEndDate: { year: 2026, month: 2, day: 28 },
    });
    // No `filters` given → the key is absent, not an empty list.
    expect(body.params).toEqual({
      type: "STANDARD",
      groupBys: ["FILTER_DATE"],
      metrics: ["METRIC_IMPRESSIONS"],
    });
  });

  it("sends nothing when the logic's strict validation rejects the query", async () => {
    // Unparsed on purpose: the input schema's own refinement would reject this
    // before the logic ran; this pins the logic-level guard behind it.
    await expect(
      runCustomQueryLogic(
        {
          reportType: "STANDARD",
          groupBys: ["FILTER_NOT_A_REAL_DIMENSION"],
          metrics: ["METRIC_IMPRESSIONS"],
          dateRange: { preset: "LAST_7_DAYS" },
          strictValidation: true,
        } as any,
        ctx,
        sdk()
      )
    ).rejects.toMatchObject({ code: -32602 });
    expect(stub.requests).toHaveLength(0);
  });
});

describe("dbm_run_custom_query_async (over the MCP SDK, task-augmented)", () => {
  it("sends the same five-call chain from the background task", async () => {
    routeReportChain();
    const server = await createMcpServer(pino({ level: "silent" }), session.sessionId);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "wire-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    try {
      const stream = client.experimental.tasks.callToolStream(
        {
          name: "dbm_run_custom_query_async",
          arguments: {
            reportType: "STANDARD",
            groupBys: ["FILTER_DATE"],
            metrics: ["METRIC_IMPRESSIONS"],
            dateRange: { preset: "LAST_30_DAYS" },
          },
        },
        CallToolResultSchema,
        { task: { ttl: 60_000 } }
      );
      let result: { isError?: boolean } | undefined;
      for await (const message of stream) {
        if (message.type === "result") result = message.result as { isError?: boolean };
        if (message.type === "error") throw message.error;
      }
      expect(result?.isError).not.toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
    const body = expectChain();
    // basis: as for dbm_run_custom_query.
    expect(body.params).toEqual({
      type: "STANDARD",
      groupBys: ["FILTER_DATE"],
      metrics: ["METRIC_IMPRESSIONS"],
    });
    expect((body.metadata as { dataRange: unknown }).dataRange).toEqual({
      range: "LAST_30_DAYS",
    });
  });
});
