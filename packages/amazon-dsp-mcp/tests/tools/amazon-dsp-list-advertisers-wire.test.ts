// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-request assertions for the advertiser-account listing and the session
 * validation call, both on `POST /adsApi/v1/query/advertiserAccounts`
 * (`QueryAdvertiserAccount`). Calls the REAL tool logic / auth adapter over
 * REAL session services, with only `globalThis.fetch` stubbed, and asserts
 * the exact upstream method, URL, headers and body.
 *
 * basis: Amazon Ads API v1, AdvertiserAccounts API 3.0 (OpenAPI), read
 * 2026-11-13 from
 *   https://advertising.amazon.com/API/docs/en-us/api-spec-v1-advertiseraccounts
 *   https://d1y2lf8k3vrkfu.cloudfront.net/openapi/en-us/dest/AmazonAdsAPIALLAdvertiserAccountsContract_prod_3p.json
 * Operation `QueryAdvertiserAccount`: parameters = [`Amazon-Ads-ClientId`
 * (required)] only; body `QueryAdvertiserAccountRequest` { advertiserAccountIdFilter,
 * isGlobalAccountFilter { include: [boolean] (exactly 1) }, maxResults (10..100,
 * default 100), nextToken }; 200 `{ advertiserAccounts: [...], nextToken? }`.
 * Behaviour (omitted isGlobalAccountFilter = global only; empty page may carry
 * a nextToken) from the QueryAdvertiserAccount developer guide,
 *   https://advertising.amazon.com/API/docs/en-us/guides/account-management/query-advertiser-accounts
 * The DSP advertiser ID as the `Amazon-Ads-AccountId` value: "Getting started
 * with Amazon Ads API v1", https://advertising.amazon.com/API/docs/en-us/reference/amazon-ads/getting-started
 * The replaced `GET /dsp/advertisers` is deprecated by the release note of
 * 2026-07-20, https://advertising.amazon.com/API/docs/en-us/release-notes/index
 *
 * Nothing here has been exercised against Amazon; this proves the code sends
 * what the documentation describes, not that Amazon accepts it.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mcpConfig } from "../../src/config/index.js";
import { AmazonDspRefreshTokenAdapter } from "../../src/auth/amazon-dsp-auth-adapter.js";
import { listAdvertisersLogic } from "../../src/mcp-server/tools/definitions/list-advertisers.tool.js";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  TEST_ACCESS_TOKEN,
  TEST_CREDENTIALS,
  TEST_PROFILE_ID,
  ADS_HOST,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/unified-wire.js";

const ENDPOINT = `https://${ADS_HOST}/adsApi/v1/query/advertiserAccounts`;
const ctx = { requestId: "list-advertisers-wire-req" } as any;

/** The developer guide's "Retrieve all global accounts" response (Example 1), trimmed. */
const GLOBAL_ACCOUNTS_RESPONSE = {
  advertiserAccounts: [
    {
      advertiserAccountId: "amzn1.ads-account.g.26eqvvnjl03bvzcsjv6yp81xl",
      alternateIds: [
        { dspAdvertiserId: "581500279506501059", region: "EU" },
        { dspAdvertiserId: "581500279506501055", region: "NA" },
        { countryCode: "US", entityId: "ENTITYTEST123", profileId: "1034391974246256" },
      ],
      currencyCode: "USD",
      displayName: "My Global Account",
      isGlobalAccount: true,
    },
  ],
};

let stub: FetchStub;
let session: WireSession;
let sdk: ReturnType<typeof acceptingSdkContext>;

beforeEach(() => {
  stub = installFetchStub([
    {
      method: "POST",
      host: ADS_HOST,
      path: "/adsApi/v1/query/advertiserAccounts",
      response: GLOBAL_ACCOUNTS_RESPONSE,
    },
  ]);
  session = createWireSession();
  sdk = acceptingSdkContext(session.sessionId);
});

afterEach(() => {
  session.dispose();
  stub.restore();
});

function apiRequests(): WireRequest[] {
  return stub.api();
}

/** QueryAdvertiserAccount declares only ClientIdHeader: no account header, no scope header. */
function expectAdvertiserAccountsHeaders(req: WireRequest): void {
  expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  expect(req.headers["amazon-ads-clientid"]).toBe(TEST_CREDENTIALS.appId);
  expect(req.headers["content-type"]).toBe("application/json");
  expect(req.headers["amazon-ads-accountid"]).toBeUndefined();
  expect(req.headers["amazon-advertising-api-scope"]).toBeUndefined();
  expect(req.headers["amazon-advertising-api-clientid"]).toBeUndefined();
}

describe("amazon_dsp_list_advertisers — POST /adsApi/v1/query/advertiserAccounts", () => {
  it("sends an empty body by default (Amazon then returns global accounts only)", async () => {
    // basis: developer guide "Example 1: Retrieve all global accounts" (`-d '{}'`) and
    // "Default filter behavior" (omitting isGlobalAccountFilter = include: [true]).
    const result = await listAdvertisersLogic({}, ctx, sdk);

    const [req, ...rest] = apiRequests();
    expect(rest).toEqual([]);
    expect(req.method).toBe("POST");
    expect(req.url).toBe(ENDPOINT);
    expect(req.body).toEqual({});
    expectAdvertiserAccountsHeaders(req);

    expect(result.advertiserAccounts).toEqual(GLOBAL_ACCOUNTS_RESPONSE.advertiserAccounts);
    expect(result.count).toBe(1);
    expect(result.pagination.nextCursor).toBeNull();
  });

  it("filters non-global accounts, caps the page and resumes with nextToken", async () => {
    // basis: QueryAdvertiserAccountRequest — isGlobalAccountFilter { include: [false] } for
    // non-global accounts (developer guide Example 2 / Pagination example), maxResults 10..100, nextToken.
    stub.route({
      method: "POST",
      host: ADS_HOST,
      path: "/adsApi/v1/query/advertiserAccounts",
      response: {
        advertiserAccounts: [],
        nextToken: "eyJsYXN0UmV0dXJuZWRWYWx1ZSI6...",
      },
    });

    const result = await listAdvertisersLogic(
      { isGlobalAccount: false, pageSize: 10, nextToken: "tok-1" },
      ctx,
      sdk
    );

    const [req] = apiRequests();
    expect(req.body).toEqual({
      isGlobalAccountFilter: { include: [false] },
      maxResults: 10,
      nextToken: "tok-1",
    });
    expectAdvertiserAccountsHeaders(req);

    // basis: developer guide, Pagination — "advertiserAccounts: [] with a valid nextToken" is
    // expected; keep iterating until no nextToken.
    expect(result.count).toBe(0);
    expect(result.pagination.nextCursor).toBe("eyJsYXN0UmV0dXJuZWRWYWx1ZSI6...");
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextPageInputKey).toBe("nextToken");
  });

  it("never calls the deprecated GET /dsp/advertisers", async () => {
    // basis: release note 2026-07-20 — /dsp/advertisers deprecated; HTTP 404 from July 2027.
    await listAdvertisersLogic({}, ctx, sdk);
    expect(apiRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /adsApi/v1/query/advertiserAccounts",
    ]);
  });
});

describe("session validation — POST /adsApi/v1/query/advertiserAccounts", () => {
  it("validates the token with a minimal query and uses the first display name as user id", async () => {
    // basis: QueryAdvertiserAccountRequest.maxResults minimum is 10, so the cheapest legal
    // validation body is { maxResults: 10 }; Amazon-Ads-ClientId is the only declared header.
    const adapter = new AmazonDspRefreshTokenAdapter(
      { ...TEST_CREDENTIALS },
      TEST_PROFILE_ID,
      mcpConfig.amazonDspApiBaseUrl
    );

    await adapter.validate();

    const [req, ...rest] = apiRequests();
    expect(rest).toEqual([]);
    expect(req.method).toBe("POST");
    expect(req.url).toBe(ENDPOINT);
    expect(req.body).toEqual({ maxResults: 10 });
    expectAdvertiserAccountsHeaders(req);
    expect(adapter.userId).toBe("My Global Account");
  });
});
