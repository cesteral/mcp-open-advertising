// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-request assertions for every amazon-dsp-mcp tool that issues a non-GET
 * upstream request (#236). Each test calls the REAL tool logic over REAL
 * session services (AmazonDspService, AmazonDspV1Service,
 * AmazonDspReportingService, AmazonDspHttpClient, the LwA refresh-token
 * adapter and the package's real module-level `RateLimiter`), with only
 * `globalThis.fetch` stubbed, and asserts the full request: HTTP method, URL
 * (+ query), the headers that route it, and the exact body.
 *
 * Vendor sources — github.com/amzn/ads-advanced-tools-docs, commit
 * e25aace0ec07997c113dac48f333298472243558 (fetched 2026-09-30):
 *   - `unified-campaign-management-migration-skills/api-specs/unified-api-dsp.json`
 *     ("Amazon Ads API DSP Merged", OAS 3.0) — cited as `unified-api-dsp.json
 *     <operationId>`: request schema, `required`, min/maxItems and header
 *     parameters (`ClientIdHeader` = Amazon-Ads-ClientId, `AccountIdHeader` =
 *     Amazon-Ads-AccountId); `components.securitySchemes.OAuth2` tokenUrl.
 *   - `postman/Amazon_Ads_Unified_API.postman_collection.json` — cited as
 *     `Unified Postman "<request name>"`.
 *   - `postman/Amazon_Ads_API.postman_collection.json` — cited as `Postman
 *     "<folder>/<request name>"` (DSP reports, Creative asset library, Auth).
 *
 * The legacy entity surface (`/dsp/orders`, `/dsp/lineItems`, `/dsp/targets`,
 * `/dsp/creativeAssociations`, and their PUT updates / `{state}` archives) is
 * absent from every one of those sources, and Amazon's reference site is
 * egress-blocked here: those expectations are `basis: unverified (code-only)`.
 * The vendor media types they send come from AMAZON_DSP_ENTITY_CONTRACT; the
 * 2026-05-15 live run (docs/plans/2026-05-15-amazon-dsp-live-test-findings.md
 * #4) saw POST /dsp/orders rejected with 403 under every media type tried, so
 * no write on this surface has ever been observed to succeed.
 *
 * Rate limiting: `/dsp/*` reads draw 1 from `amazon_dsp:read`, creates /
 * updates / status PUTs / archives and the asset upload draw 3 from
 * `amazon_dsp:write`; each report submit and status poll draws 1 from
 * `amazon_dsp:reporting`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Report status is polled at `amazonDspReportPollIntervalMs` (2 s by default),
// read from config at import; 1 ms keeps the get_report tests from sleeping.
// Timing only — no request changes.
vi.hoisted(() => {
  process.env.AMAZON_DSP_REPORT_POLL_INTERVAL_MS = "1";
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
  createCommitmentLogic,
  CreateCommitmentInputSchema,
} from "../../src/mcp-server/tools/definitions/create-commitment.tool.js";
import {
  updateCommitmentLogic,
  UpdateCommitmentInputSchema,
} from "../../src/mcp-server/tools/definitions/update-commitment.tool.js";
import {
  getCommitmentLogic,
  GetCommitmentInputSchema,
} from "../../src/mcp-server/tools/definitions/get-commitment.tool.js";
import {
  getCommitmentsLogic,
  GetCommitmentsInputSchema,
} from "../../src/mcp-server/tools/definitions/get-commitments.tool.js";
import {
  getCampaignForecastLogic,
  GetCampaignForecastInputSchema,
} from "../../src/mcp-server/tools/definitions/get-campaign-forecast.tool.js";
import {
  getCommitmentSpendLogic,
  GetCommitmentSpendInputSchema,
} from "../../src/mcp-server/tools/definitions/get-commitment-spend.tool.js";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  rateLimiter,
  ADS_HOST,
  LWA_TOKEN_HOST,
  TEST_ACCESS_TOKEN,
  TEST_CREDENTIALS,
  TEST_PROFILE_ID,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/wire.js";

const API = mcpConfig.amazonDspApiBaseUrl;
const PROFILE = TEST_PROFILE_ID;
const LIMIT = mcpConfig.amazonDspRateLimitPerMinute;
const ctx = { requestId: "wire-req" } as any;

const ORDERS = "application/vnd.dsporders.v2.2+json";
const LINE_ITEMS = "application/vnd.dsplineitems.v3.1+json";

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

function apiRequests(): WireRequest[] {
  return stub.to(ADS_HOST);
}

function writes(): WireRequest[] {
  return apiRequests().filter((r) => r.method !== "GET");
}

function onlyWrite(): WireRequest {
  const w = writes();
  expect(w).toHaveLength(1);
  return w[0]!;
}

function remaining(bucket: "read" | "write" | "reporting"): number {
  return rateLimiter.getRemainingTokens(`amazon_dsp:${bucket}`);
}

/**
 * basis: Bearer token + `Amazon-Advertising-API-Scope` (profile) +
 * `Amazon-Advertising-API-ClientId` — the header set of every request in
 * Postman "Creative asset library/*" (and "Reporting/DSP report/*", which
 * omits Scope). For `/dsp/*` itself: unverified (code-only).
 */
function expectLegacyHeaders(req: WireRequest) {
  expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  expect(req.headers["amazon-advertising-api-scope"]).toBe(PROFILE);
  expect(req.headers["amazon-advertising-api-clientid"]).toBe(TEST_CREDENTIALS.appId);
  expect(req.headers["amazon-ads-clientid"]).toBeUndefined();
}

/**
 * basis: unified-api-dsp.json — every commitments / forecast / spend
 * operation declares `ClientIdHeader` (name Amazon-Ads-ClientId, required),
 * request body `application/json`; OAuth2 bearer security. The legacy
 * Amazon-Advertising-API-ClientId must not stand in for it. (The Unified
 * Postman requests also send Amazon-Advertising-API-Scope on some of these and
 * not others; the spec does not declare it, so it is left unasserted.)
 */
function expectV1Headers(req: WireRequest) {
  expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  expect(req.headers["amazon-ads-clientid"]).toBe(TEST_CREDENTIALS.appId);
  expect(req.headers["amazon-advertising-api-clientid"]).toBeUndefined();
  expect(req.headers["content-type"]).toBe("application/json");
}

/** Route GET /dsp/{collection}/{id} to an entity with that id. */
function routeEntityReads(collection: string, idField: string, extra: Record<string, unknown>) {
  stub.route({
    method: "GET",
    path: new RegExp(`^/dsp/${collection}/[^/]+$`),
    response: (req: WireRequest) => ({ [idField]: req.path.split("/").pop(), ...extra }),
  });
}

describe("LwA refresh-token exchange", () => {
  it("POSTs the refresh grant form to api.amazon.com/auth/o2/token, once per session", async () => {
    stub.route({ method: "POST", path: "/dsp/orders", response: { orderId: "o1" } });
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "order",
        profileId: PROFILE,
        data: { name: "A", advertiserId: "adv1" },
      }),
      ctx,
      sdk
    );
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "order",
        profileId: PROFILE,
        data: { name: "B", advertiserId: "adv1" },
      }),
      ctx,
      sdk
    );
    const token = stub.to(LWA_TOKEN_HOST);
    // basis: unified-api-dsp.json components.securitySchemes.OAuth2 tokenUrl
    // https://api.amazon.com/auth/o2/token; Postman "Auth/Access token from
    // refresh token" — urlencoded grant_type=refresh_token, refresh_token,
    // client_id, client_secret.
    expect(token).toHaveLength(1);
    expect(token[0]!.method).toBe("POST");
    expect(token[0]!.url).toBe("https://api.amazon.com/auth/o2/token");
    expect(token[0]!.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(token[0]!.form).toEqual({
      grant_type: "refresh_token",
      client_id: TEST_CREDENTIALS.appId,
      client_secret: TEST_CREDENTIALS.appSecret,
      refresh_token: TEST_CREDENTIALS.refreshToken,
    });
  });
});

describe("amazon_dsp_create_entity → POST /dsp/{collection}", () => {
  it("order → POST /dsp/orders with the vendor media type and the caller's object", async () => {
    stub.route({
      method: "POST",
      path: "/dsp/orders",
      response: { orderId: "581234", name: "Autumn", state: "PAUSED" },
    });
    const data = {
      name: "Autumn",
      advertiserId: "adv-1",
      startDateTime: "2026-10-01T00:00:00Z",
      endDateTime: "2026-10-31T23:59:59Z",
      budget: 5000,
    };
    const out = await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "order", profileId: PROFILE, data }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: unverified (code-only) — see the file header. Body = the caller's
    // object, unwrapped; Content-Type / Accept = contract createMediaType.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/dsp/orders`);
    expectLegacyHeaders(req);
    expect(req.headers["content-type"]).toBe(ORDERS);
    expect(req.headers["accept"]).toBe(ORDERS);
    expect(req.body).toEqual(data);
    expect(out.entity.orderId).toBe("581234");
    expect(apiRequests()).toHaveLength(1);
    expect(remaining("write")).toBe(LIMIT - 3);
    expect(remaining("read")).toBe(LIMIT);
  });

  it("lineItem → POST /dsp/lineItems with its own media type", async () => {
    stub.route({ method: "POST", path: "/dsp/lineItems", response: { lineItemId: "li1" } });
    const data = {
      name: "LI",
      orderId: "581234",
      advertiserId: "adv-1",
      budget: { budgetType: "DAILY", budget: 100 },
    };
    await createEntityLogic(
      CreateEntityInputSchema.parse({ entityType: "lineItem", profileId: PROFILE, data }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: unverified (code-only).
    expect(req.url).toBe(`${API}/dsp/lineItems`);
    expect(req.headers["content-type"]).toBe(LINE_ITEMS);
    expect(req.headers["accept"]).toBe(LINE_ITEMS);
    expect(req.body).toEqual(data);
  });

  it("creativeAssociation → POST /dsp/creativeAssociations as plain JSON (no media type declared)", async () => {
    const data = { lineItemId: "li1", creativeId: "cr1" };
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "creativeAssociation",
        profileId: PROFILE,
        data,
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: unverified (code-only).
    expect(req.url).toBe(`${API}/dsp/creativeAssociations`);
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.headers["accept"]).toBeUndefined();
    expect(req.body).toEqual(data);
  });

  it("dry_run sends nothing", async () => {
    await createEntityLogic(
      CreateEntityInputSchema.parse({
        entityType: "order",
        profileId: PROFILE,
        data: { name: "Autumn", advertiserId: "adv-1" },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
  });
});

describe("amazon_dsp_update_entity → PUT /dsp/{collection}/{id}", () => {
  it("pre-state GET, then PUT the patch with the vendor media type", async () => {
    routeEntityReads("lineItems", "lineItemId", { name: "LI", state: "ENABLED" });
    stub.route({
      method: "PUT",
      path: "/dsp/lineItems/li%2F1",
      response: { lineItemId: "li/1", name: "LI v2", state: "ENABLED" },
    });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "lineItem",
        profileId: PROFILE,
        entityId: "li/1",
        data: { name: "LI v2" },
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: unverified (code-only). The id is one encoded path segment.
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(`${API}/dsp/lineItems/li%2F1`);
    expectLegacyHeaders(req);
    expect(req.headers["content-type"]).toBe(LINE_ITEMS);
    expect(req.headers["accept"]).toBe(LINE_ITEMS);
    expect(req.body).toEqual({ name: "LI v2" });
    expect(apiRequests().map((r) => r.method)).toEqual(["GET", "PUT"]);
    expect(remaining("read")).toBe(LIMIT - 1);
    expect(remaining("write")).toBe(LIMIT - 3);
  });

  it("dry_run sends no PUT", async () => {
    routeEntityReads("orders", "orderId", { name: "Autumn", state: "ENABLED" });
    await updateEntityLogic(
      UpdateEntityInputSchema.parse({
        entityType: "order",
        profileId: PROFILE,
        entityId: "581234",
        data: { name: "x" },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(0);
  });
});

describe("amazon_dsp_delete_entity → PUT /dsp/{collection}/{id} {state: ARCHIVED}", () => {
  it("one archive PUT per id after one confirmation", async () => {
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "order",
        profileId: PROFILE,
        entityIds: ["581234", "581235"],
      }),
      ctx,
      sdk
    );
    // basis: unverified (code-only) — no DELETE endpoint on this surface; the
    // `state` enum is itself unverified (fleet review amazon-dsp #9).
    const w = writes();
    expect(w.map((r) => `${r.method} ${r.url}`)).toEqual([
      `PUT ${API}/dsp/orders/581234`,
      `PUT ${API}/dsp/orders/581235`,
    ]);
    for (const req of w) {
      expectLegacyHeaders(req);
      expect(req.headers["content-type"]).toBe(ORDERS);
      expect(req.body).toEqual({ state: "ARCHIVED" });
    }
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(remaining("write")).toBe(LIMIT - 6);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "order",
        profileId: PROFILE,
        entityIds: ["581234"],
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });

  it("dry_run sends nothing and does not prompt", async () => {
    await deleteEntityLogic(
      DeleteEntityInputSchema.parse({
        entityType: "order",
        profileId: PROFILE,
        entityIds: ["581234"],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(sdk.elicitInput).not.toHaveBeenCalled();
    expect(stub.requests).toHaveLength(0);
  });
});

describe("amazon_dsp_bulk_update_status → PUT /dsp/{collection}/{id} {state}", () => {
  it("one PUT per id carrying only the target state", async () => {
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "lineItem",
        profileId: PROFILE,
        entityIds: ["li1", "li2"],
        operationStatus: "PAUSED",
      }),
      ctx,
      sdk
    );
    // basis: unverified (code-only).
    const w = writes();
    expect(w.map((r) => `${r.method} ${r.url}`).sort()).toEqual([
      `PUT ${API}/dsp/lineItems/li1`,
      `PUT ${API}/dsp/lineItems/li2`,
    ]);
    for (const req of w) {
      expect(req.headers["content-type"]).toBe(LINE_ITEMS);
      expect(req.body).toEqual({ state: "PAUSED" });
    }
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(remaining("write")).toBe(LIMIT - 6);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "lineItem",
        profileId: PROFILE,
        entityIds: ["li1"],
        operationStatus: "PAUSED",
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await bulkUpdateStatusLogic(
      BulkUpdateStatusInputSchema.parse({
        entityType: "lineItem",
        profileId: PROFILE,
        entityIds: ["li1"],
        operationStatus: "PAUSED",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("amazon_dsp_bulk_create_entities → one POST /dsp/{collection} per item", () => {
  it("POSTs each item as its own body", async () => {
    stub.route({ method: "POST", path: "/dsp/orders", response: { orderId: "o" } });
    const items = [
      { name: "A", advertiserId: "adv-1" },
      { name: "B", advertiserId: "adv-1" },
    ];
    const out = await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({ entityType: "order", profileId: PROFILE, items }),
      ctx,
      sdk
    );
    // basis: unverified (code-only) — no batch create on this surface.
    const w = writes();
    expect(w).toHaveLength(2);
    for (const req of w) {
      expect(req.method).toBe("POST");
      expect(req.url).toBe(`${API}/dsp/orders`);
      expect(req.headers["content-type"]).toBe(ORDERS);
    }
    expect(w.map((r) => r.body)).toEqual(expect.arrayContaining(items));
    expect(out.successCount).toBe(2);
    expect(remaining("write")).toBe(LIMIT - 6);
  });

  it("dry_run sends nothing", async () => {
    await bulkCreateEntitiesLogic(
      BulkCreateEntitiesInputSchema.parse({
        entityType: "order",
        profileId: PROFILE,
        items: [{ name: "A", advertiserId: "adv-1" }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("amazon_dsp_bulk_update_entities → one PUT /dsp/{collection}/{id} per item", () => {
  it("PUTs each item's patch after one confirmation", async () => {
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "order",
        profileId: PROFILE,
        items: [
          { entityId: "581234", data: { budget: 7000 } },
          { entityId: "581235", data: { name: "Renamed" } },
        ],
      }),
      ctx,
      sdk
    );
    // basis: unverified (code-only).
    const w = writes();
    expect(w.map((r) => `${r.method} ${r.url} ${JSON.stringify(r.body)}`).sort()).toEqual([
      `PUT ${API}/dsp/orders/581234 {"budget":7000}`,
      `PUT ${API}/dsp/orders/581235 {"name":"Renamed"}`,
    ]);
    // A budget change is a sensitive field: one confirmation for the batch.
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(remaining("write")).toBe(LIMIT - 6);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "order",
        profileId: PROFILE,
        items: [{ entityId: "581234", data: { budget: 7000 } }],
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await bulkUpdateEntitiesLogic(
      BulkUpdateEntitiesInputSchema.parse({
        entityType: "order",
        profileId: PROFILE,
        items: [{ entityId: "581234", data: { budget: 7000 } }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("amazon_dsp_adjust_bids → GET then PUT /dsp/lineItems/{id} {bidding}", () => {
  it("keeps the current bidding fields and replaces bidAmount", async () => {
    routeEntityReads("lineItems", "lineItemId", {
      bidding: { bidOptimization: "AUTO", bidAmount: 1.1 },
    });
    const out = await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        profileId: PROFILE,
        adjustments: [
          { lineItemId: "li1", bidAmount: 1.5 },
          { lineItemId: "li2", bidAmount: 0.9 },
        ],
      }),
      ctx,
      sdk
    );
    // basis: unverified (code-only).
    expect(apiRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /dsp/lineItems/li1",
      "PUT /dsp/lineItems/li1",
      "GET /dsp/lineItems/li2",
      "PUT /dsp/lineItems/li2",
    ]);
    const w = writes();
    for (const req of w) {
      expectLegacyHeaders(req);
      expect(req.headers["content-type"]).toBe(LINE_ITEMS);
    }
    expect(w.map((r) => r.body)).toEqual([
      { bidding: { bidOptimization: "AUTO", bidAmount: 1.5 } },
      { bidding: { bidOptimization: "AUTO", bidAmount: 0.9 } },
    ]);
    expect(out.results.map((r) => r.previousBid)).toEqual([1.1, 1.1]);
    expect(sdk.elicitInput).toHaveBeenCalledTimes(1);
    expect(remaining("read")).toBe(LIMIT - 2);
    expect(remaining("write")).toBe(LIMIT - 6);
  });

  it("sends nothing when the confirmation is declined", async () => {
    sdk.elicitInput.mockResolvedValueOnce({ action: "decline" });
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        profileId: PROFILE,
        adjustments: [{ lineItemId: "li1", bidAmount: 1.5 }],
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });

  it("dry_run sends nothing", async () => {
    await adjustBidsLogic(
      AdjustBidsInputSchema.parse({
        profileId: PROFILE,
        adjustments: [{ lineItemId: "li1", bidAmount: 1.5 }],
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("amazon_dsp_duplicate_entity → GET the source, POST /dsp/{collection} the stripped copy", () => {
  it("strips the id and timestamps, forces state PAUSED, applies options", async () => {
    stub.route({
      method: "GET",
      path: "/dsp/orders/581234",
      response: {
        orderId: "581234",
        name: "Autumn",
        advertiserId: "adv-1",
        state: "ENABLED",
        budget: 5000,
        creationDate: "2026-09-01T00:00:00Z",
        lastUpdatedDate: "2026-09-02T00:00:00Z",
      },
    });
    stub.route({
      method: "POST",
      path: "/dsp/orders",
      response: { orderId: "581299", name: "Autumn (copy)", state: "PAUSED" },
    });
    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "order",
        profileId: PROFILE,
        entityId: "581234",
        options: { name: "Autumn (copy)" },
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: unverified (code-only) — no copy endpoint on this surface.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/dsp/orders`);
    expect(req.headers["content-type"]).toBe(ORDERS);
    expect(req.body).toEqual({
      name: "Autumn (copy)",
      advertiserId: "adv-1",
      state: "PAUSED",
      budget: 5000,
    });
    expect(remaining("read")).toBe(LIMIT - 1);
    expect(remaining("write")).toBe(LIMIT - 3);
  });

  it("dry_run sends no POST", async () => {
    routeEntityReads("orders", "orderId", { name: "Autumn", state: "ENABLED" });
    await duplicateEntityLogic(
      DuplicateEntityInputSchema.parse({
        entityType: "order",
        profileId: PROFILE,
        entityId: "581234",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes()).toHaveLength(0);
  });
});

describe("amazon_dsp_upload_video → POST /assets/upload, PUT the presigned URL, POST /assets/register", () => {
  it("sends the three-step Creative Asset Library flow", async () => {
    const bytes = Buffer.from("mp4-bytes", "latin1");
    const presigned = "https://asset-upload.s3.amazonaws.com/u/abc?X-Amz-Signature=sig";
    stub.route({
      method: "GET",
      host: "cdn.example.com",
      path: "/spot.mp4",
      rawBody: bytes,
      contentType: "video/mp4",
    });
    stub.route({ method: "POST", path: "/assets/upload", response: { url: presigned } });
    stub.route({
      method: "PUT",
      host: "asset-upload.s3.amazonaws.com",
      path: "/u/abc",
      rawBody: "",
    });
    stub.route({
      method: "POST",
      path: "/assets/register",
      response: { assetId: "amzn1.assetlibrary.asset1.abc", versionId: "version_v1" },
    });

    const out = await uploadVideoLogic(
      UploadVideoInputSchema.parse({
        name: "Autumn spot",
        mediaUrl: "https://cdn.example.com/spot.mp4",
        asinList: ["B07R7V6KS8"],
      }),
      ctx,
      sdk
    );

    expect(
      stub.requests.filter((r) => r.host !== LWA_TOKEN_HOST).map((r) => `${r.method} ${r.url}`)
    ).toEqual([
      "GET https://cdn.example.com/spot.mp4",
      `POST ${API}/assets/upload`,
      `PUT ${presigned}`,
      `POST ${API}/assets/register`,
    ]);
    const [upload, register] = writes();
    // basis: Postman "Creative asset library/Create URL" — POST
    // {{api_url}}/assets/upload, Bearer + Scope + ClientId. The body key
    // (`fileName`) and the JSON Content-Type / missing Accept: unverified
    // (code-only) — see the todo below.
    expectLegacyHeaders(upload!);
    expect(upload!.body).toEqual({ fileName: "spot.mp4" });
    // The presigned PUT carries the raw bytes and no Amazon auth headers.
    const put = stub.requests.find((r) => r.method === "PUT")!;
    expect(put.headers["authorization"]).toBeUndefined();
    expect(put.headers["content-type"]).toBe("video/mp4");
    expect(put.rawBody!.toString("latin1")).toBe("mp4-bytes");
    // basis: Postman "Creative asset library/Register asset" — POST
    // {{api_url}}/assets/register, body { url: {{uploadUrl}}, name, asinList,
    // assetType: "VIDEO", … }. `registrationContext.programName` and the JSON
    // Content-Type: unverified (code-only).
    expectLegacyHeaders(register!);
    expect(register!.body).toEqual({
      url: presigned,
      name: "Autumn spot",
      assetType: "VIDEO",
      registrationContext: { programName: "AMAZON_DSP" },
      asinList: ["B07R7V6KS8"],
    });
    expect(out.assetId).toBe("amzn1.assetlibrary.asset1.abc");
    // One 3-token consume covers all three upstream calls.
    expect(remaining("write")).toBe(LIMIT - 3);
  });

  // basis: Postman "Creative asset library/Create URL" sends body
  // `{ "filename": "myfile.mov" }` (lower-case n) and `Accept:
  // application/vnd.sbadresource.v4+json` on both /assets/upload and
  // /assets/register; uploadCreativeAsset sends `fileName` with
  // `Content-Type: application/json` and no Accept (its comment cites the
  // community python-amazon-ad-api client, not an amzn source). Amazon's
  // reference is unreachable here, so which spelling the gateway accepts is
  // unverified — not changed. Reported on #236.
  it.todo(
    "amazon_dsp_upload_video sends /assets/upload `filename` and the sbadresource Accept per Amazon's Postman collection, or a primary source confirms `fileName` — reported on #236"
  );

  it("dry_run downloads and uploads nothing", async () => {
    await uploadVideoLogic(
      UploadVideoInputSchema.parse({
        name: "Autumn spot",
        mediaUrl: "https://cdn.example.com/spot.mp4",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("DSP reports v3 → POST /accounts/{accountId}/dsp/reports", () => {
  const reportBody = {
    startDate: "2026-09-01",
    endDate: "2026-09-07",
    type: "CAMPAIGN",
    timeUnit: "DAILY",
    dimensions: ["ORDER", "LINE_ITEM"],
    metrics: ["impressions", "totalCost"],
  };

  function expectReportSubmit(req: WireRequest, body: Record<string, unknown>) {
    // basis: Postman "Reporting/DSP report/Request DSP report" — POST
    // {{api_url}}/accounts/{{dspAccountId}}/dsp/reports, Content-Type
    // application/json, Accept application/vnd.dspcreatereports.v3+json,
    // Bearer + Amazon-Advertising-API-ClientId; body startDate/endDate
    // (YYYY-MM-DD), type, dimensions[], metrics[]. `timeUnit` and the Scope
    // header: unverified (code-only) — see the todo below.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/accounts/adv%2F9/dsp/reports`);
    expectLegacyHeaders(req);
    expect(req.headers["content-type"]).toBe("application/json");
    expect(req.headers["accept"]).toBe("application/vnd.dspcreatereports.v3+json");
    expect(req.body).toEqual(body);
  }

  it("amazon_dsp_submit_report sends one POST", async () => {
    stub.route({
      method: "POST",
      path: /\/dsp\/reports$/,
      response: { reportId: "rep-1", status: "IN_PROGRESS" },
    });
    const out = await submitReportLogic(
      SubmitReportInputSchema.parse({
        accountId: "adv/9",
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        type: "CAMPAIGN",
        dimensions: ["ORDER", "LINE_ITEM"],
        metrics: ["impressions", "totalCost"],
      }),
      ctx,
      sdk
    );
    expectReportSubmit(onlyWrite(), reportBody);
    expect(out.taskId).toBe("rep-1");
    expect(remaining("reporting")).toBe(LIMIT - 1);
  });

  it("amazon_dsp_get_report submits, polls GET …/dsp/reports/{id}, then downloads the location", async () => {
    stub.route({
      method: "POST",
      path: /\/dsp\/reports$/,
      response: { reportId: "rep-1", status: "IN_PROGRESS" },
    });
    stub.route({
      method: "GET",
      path: /\/dsp\/reports\/rep-1$/,
      response: {
        reportId: "rep-1",
        status: "SUCCESS",
        location: "https://corvo-reports.s3.amazonaws.com/rep-1.json",
      },
    });
    stub.route({
      method: "GET",
      host: "corvo-reports.s3.amazonaws.com",
      path: "/rep-1.json",
      rawBody: JSON.stringify([{ impressions: 10, totalCost: 1.5 }]),
      contentType: "application/json",
    });
    await getReportLogic(
      GetReportInputSchema.parse({
        accountId: "adv/9",
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        type: "CAMPAIGN",
        dimensions: ["ORDER", "LINE_ITEM"],
        metrics: ["impressions", "totalCost"],
      }),
      ctx,
      sdk
    );
    expectReportSubmit(onlyWrite(), reportBody);
    // basis: Postman "Reporting/DSP report/DSP report status" — GET
    // …/dsp/reports/:reportId, Accept application/vnd.dspgetreports.v3+json.
    const poll = apiRequests().find((r) => r.method === "GET")!;
    expect(poll.url).toBe(`${API}/accounts/adv%2F9/dsp/reports/rep-1`);
    expect(poll.headers["accept"]).toBe("application/vnd.dspgetreports.v3+json");
    expect(
      stub.requests.filter((r) => r.host !== LWA_TOKEN_HOST).map((r) => `${r.method} ${r.host}`)
    ).toEqual([`POST ${ADS_HOST}`, `GET ${ADS_HOST}`, "GET corvo-reports.s3.amazonaws.com"]);
    // The presigned download carries no Amazon credentials.
    const download = stub.to("corvo-reports.s3.amazonaws.com")[0]!;
    expect(download.headers["authorization"]).toBeUndefined();
    expect(remaining("reporting")).toBe(LIMIT - 2);
  });

  it("amazon_dsp_get_report_breakdowns appends the breakdowns to dimensions", async () => {
    stub.route({
      method: "POST",
      path: /\/dsp\/reports$/,
      response: { reportId: "rep-2", status: "IN_PROGRESS" },
    });
    stub.route({
      method: "GET",
      path: /\/dsp\/reports\/rep-2$/,
      response: { reportId: "rep-2", status: "SUCCESS", location: "https://s3.amazonaws.com/r2" },
    });
    stub.route({
      method: "GET",
      host: "s3.amazonaws.com",
      path: "/r2",
      rawBody: "[]",
      contentType: "application/json",
    });
    await getReportBreakdownsLogic(
      GetReportBreakdownsInputSchema.parse({
        accountId: "adv/9",
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        type: "CAMPAIGN",
        dimensions: ["ORDER"],
        breakdowns: ["LINE_ITEM", "CREATIVE"],
        metrics: ["impressions"],
      }),
      ctx,
      sdk
    );
    // basis: as for submit; Postman's CAMPAIGN example uses dimensions
    // ["ORDER","LINE_ITEM","CREATIVE"].
    expectReportSubmit(onlyWrite(), {
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      type: "CAMPAIGN",
      timeUnit: "DAILY",
      dimensions: ["ORDER", "LINE_ITEM", "CREATIVE"],
      metrics: ["impressions"],
    });
  });

  // basis: no Postman "Request DSP report" example carries `timeUnit`
  // (AMAZON_DSP_REPORTING_CONTRACT.notes says so), and the 2026-05-15 live run
  // (findings #3a) saw this endpoint reject unknown body properties with 400
  // REQUEST_BODY_UNKNOWN_PROPERTY. submitReport always sends `timeUnit`
  // (default DAILY). Whether Amazon accepts it: unverified — not changed.
  // Reported on #236.
  it.todo(
    "amazon_dsp_submit_report / get_report send `timeUnit` only once a source shows the v3 DSP report body accepts it — reported on #236"
  );

  it("submit dry_run sends nothing", async () => {
    await submitReportLogic(
      SubmitReportInputSchema.parse({
        accountId: "adv-9",
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        type: "CAMPAIGN",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });
});

describe("Ads API v1 commitments / forecasts (unified-api-dsp.json)", () => {
  const commitment = {
    commitmentName: "Sample commitmentName",
    committedSpend: 3,
    currencyCode: "USD",
    dealIds: ["example-deal-ids"],
    endDateTime: "2026-05-25T15:59:00Z",
    fulfillmentLevel: "LEVEL_5",
    spendCalculationMode: "MANAGER_ACCOUNT",
    startDateTime: "2026-05-17T16:00:00Z",
  };

  it("amazon_dsp_create_commitment → POST /adsApi/v1/create/commitments/dsp {commitments:[…]}", async () => {
    stub.route({
      method: "POST",
      path: "/adsApi/v1/create/commitments/dsp",
      response: { success: [{ index: 0, commitment: { commitmentId: "C1", ...commitment } }] },
    });
    const out = await createCommitmentLogic(
      CreateCommitmentInputSchema.parse({ profileId: PROFILE, data: commitment }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: unified-api-dsp.json DSPCreateCommitment — body
    // DSPCreateCommitmentRequest { commitments: DSPCommitmentCreate[1..1000] }
    // (required); DSPCommitmentCreate required commitmentName, committedSpend,
    // currencyCode, endDateTime, fulfillmentLevel, spendCalculationMode,
    // startDateTime. Values from Unified Postman "Create commitments".
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/adsApi/v1/create/commitments/dsp`);
    expectV1Headers(req);
    expect(req.body).toEqual({ commitments: [commitment] });
    expect(out.commitment?.commitmentId).toBe("C1");
  });

  it("create dry_run sends nothing", async () => {
    await createCommitmentLogic(
      CreateCommitmentInputSchema.parse({ profileId: PROFILE, data: commitment, dry_run: true }),
      ctx,
      sdk
    );
    expect(stub.requests).toHaveLength(0);
  });

  it("amazon_dsp_update_commitment → retrieve (pre-state), then POST /adsApi/v1/update/commitments/dsp", async () => {
    stub.route({
      method: "POST",
      path: "/adsApi/v1/retrieve/commitments/dsp",
      response: { success: [{ index: 0, commitment: { commitmentId: "C1", ...commitment } }] },
    });
    stub.route({
      method: "POST",
      path: "/adsApi/v1/update/commitments/dsp",
      response: {
        success: [
          { index: 0, commitment: { commitmentId: "C1", ...commitment, committedSpend: 5 } },
        ],
      },
    });
    await updateCommitmentLogic(
      UpdateCommitmentInputSchema.parse({
        profileId: PROFILE,
        commitmentId: "C1",
        data: { committedSpend: 5 },
      }),
      ctx,
      sdk
    );
    expect(writes().map((r) => r.path)).toEqual([
      "/adsApi/v1/retrieve/commitments/dsp",
      "/adsApi/v1/update/commitments/dsp",
    ]);
    const [pre, req] = writes();
    // basis: unified-api-dsp.json DSPRetrieveCommitment — body
    // { commitmentIds: string[1..1000] } (required).
    expectV1Headers(pre!);
    expect(pre!.body).toEqual({ commitmentIds: ["C1"] });
    // basis: unified-api-dsp.json DSPUpdateCommitment — body
    // { commitments: DSPCommitmentUpdate[1..1000] }; DSPCommitmentUpdate
    // required commitmentId, carried from the top-level tool input.
    expect(req!.url).toBe(`${API}/adsApi/v1/update/commitments/dsp`);
    expectV1Headers(req!);
    expect(req!.body).toEqual({ commitments: [{ committedSpend: 5, commitmentId: "C1" }] });
  });

  it("update dry_run sends only the pre-state retrieve", async () => {
    stub.route({
      method: "POST",
      path: "/adsApi/v1/retrieve/commitments/dsp",
      response: { success: [{ index: 0, commitment: { commitmentId: "C1", ...commitment } }] },
    });
    await updateCommitmentLogic(
      UpdateCommitmentInputSchema.parse({
        profileId: PROFILE,
        commitmentId: "C1",
        data: { committedSpend: 5 },
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(writes().map((r) => r.path)).toEqual(["/adsApi/v1/retrieve/commitments/dsp"]);
  });

  it("amazon_dsp_get_commitment / get_commitments → POST /adsApi/v1/retrieve/commitments/dsp", async () => {
    stub.route({
      method: "POST",
      path: "/adsApi/v1/retrieve/commitments/dsp",
      response: { success: [{ index: 0, commitment: { commitmentId: "C1", ...commitment } }] },
    });
    await getCommitmentLogic(
      GetCommitmentInputSchema.parse({ profileId: PROFILE, commitmentId: "C1" }),
      ctx,
      sdk
    );
    await getCommitmentsLogic(
      GetCommitmentsInputSchema.parse({ profileId: PROFILE, commitmentIds: ["C1", "C2"] }),
      ctx,
      sdk
    );
    // basis: unified-api-dsp.json DSPRetrieveCommitment; Unified Postman "Get
    // Commitments" body { commitmentIds: ["…"] }.
    const w = writes();
    expect(w).toHaveLength(2);
    for (const req of w) {
      expect(req.url).toBe(`${API}/adsApi/v1/retrieve/commitments/dsp`);
      expectV1Headers(req);
    }
    expect(w.map((r) => r.body)).toEqual([
      { commitmentIds: ["C1"] },
      { commitmentIds: ["C1", "C2"] },
    ]);
  });

  it("amazon_dsp_get_campaign_forecast → POST /adsApi/v1/retrieve/campaignForecasts/dsp with Amazon-Ads-AccountId", async () => {
    const description = {
      campaignId: "example-campaign-id",
      flightIds: ["example-flight-ids"],
      enabledFeatures: { curve: true, metrics: { allMetrics: true }, campaignSettingsCache: false },
    };
    await getCampaignForecastLogic(
      GetCampaignForecastInputSchema.parse({
        profileId: PROFILE,
        accountId: "adv-9",
        campaignForecastDescriptions: [description],
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: unified-api-dsp.json DSPRetrieveCampaignForecast — parameters
    // AccountIdHeader (Amazon-Ads-AccountId, required) + ClientIdHeader; body
    // { campaignForecastDescriptions: DSPCampaignForecastDescription[1..1] },
    // campaignId required. Values from Unified Postman "Retrieve campaign
    // forecast".
    expect(req.url).toBe(`${API}/adsApi/v1/retrieve/campaignForecasts/dsp`);
    expectV1Headers(req);
    expect(req.headers["amazon-ads-accountid"]).toBe("adv-9");
    expect(req.body).toEqual({ campaignForecastDescriptions: [description] });
  });

  it("amazon_dsp_get_commitment_spend → POST /adsApi/v1/retrieve/commitmentSpends/dsp", async () => {
    await getCommitmentSpendLogic(
      GetCommitmentSpendInputSchema.parse({
        profileId: PROFILE,
        commitmentIds: [{ commitmentId: "D6CPS18D84E1PBBF7S9GL3GZ" }],
      }),
      ctx,
      sdk
    );
    const req = onlyWrite();
    // basis: unified-api-dsp.json DSPRetrieveCommitmentSpend — body
    // { commitmentIds: DSPCommitmentSpendIdentifier[1..1] } (commitmentId
    // required); Unified Postman "Retrieve commitment spend".
    expect(req.url).toBe(`${API}/adsApi/v1/retrieve/commitmentSpends/dsp`);
    expectV1Headers(req);
    expect(req.body).toEqual({ commitmentIds: [{ commitmentId: "D6CPS18D84E1PBBF7S9GL3GZ" }] });
  });

  // AmazonDspV1Service holds no RateLimiter: none of the six v1 calls
  // (list / retrieve / create / update commitments, forecast, spend) draws a
  // limiter token, unlike every `/dsp/*` and reporting call.
  it.todo(
    "Ads API v1 commitment / forecast / spend calls draw limiter tokens — reported on #236, not fixed here"
  );
});
