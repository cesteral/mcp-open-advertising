// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire requests of `gads_attach_creative` (#236, governance-layer #2161): the
 * REAL tool logic over REAL session services (GAdsService, GAdsHttpClient, the
 * refresh-token adapter, a real `RateLimiter`) with only `fetch` stubbed.
 *
 * Expected shapes come from Google's Discovery document,
 *   https://googleads.googleapis.com/$discovery/rest?version=v26
 *   revision 20261110 (read 2026-11-17; the revision gads-wire-requests.test.ts
 *   cites). Schema names drop the `GoogleAdsGoogleadsV26` prefix.
 * Header names (`developer-token`, `login-customer-id`) are not described by
 * the Discovery document: `basis: unverified (code-only)`, as in
 * gads-wire-requests.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mcpConfig } from "../../src/config/index.js";
import {
  attachCreativeLogic,
  attachCreativeTool,
  AttachCreativeInputSchema,
  AttachCreativeOutputSchema,
} from "../../src/mcp-server/tools/definitions/attach-creative.tool.js";
import { EffectDryRunResultSchema } from "@cesteral/shared";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  GADS_HOST,
  TEST_ACCESS_TOKEN,
  TEST_CREDENTIALS,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/wire.js";

/** Discovery rootUrl `https://googleads.googleapis.com/` + path prefix `v26/`. */
const API = "https://googleads.googleapis.com/v26";
const CID = "1234567890";
const AD_GROUP = "9876543210";
const ASSET = `customers/${CID}/assets/42`;
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

function apiRequests(): WireRequest[] {
  return stub.to(GADS_HOST);
}

function routeAdGroupAdsMutate(response: unknown) {
  stub.route({
    method: "POST",
    host: GADS_HOST,
    path: `/v26/customers/${CID}/adGroupAds:mutate`,
    response,
  });
}

const input = {
  customerId: CID,
  adGroupId: AD_GROUP,
  name: "Banner 300x250",
  imageAssetResourceName: ASSET,
  finalUrl: "https://example.com/sale",
};

describe("gads_attach_creative → customers.adGroupAds.mutate create", () => {
  it("one POST with a PAUSED AdGroupAd whose image ad references the asset", async () => {
    routeAdGroupAdsMutate({
      results: [{ resourceName: `customers/${CID}/adGroupAds/${AD_GROUP}~555` }],
    });
    const out = await attachCreativeLogic(AttachCreativeInputSchema.parse(input), ctx, sdk);

    const reqs = apiRequests();
    expect(reqs).toHaveLength(1);
    const req = reqs[0]!;
    // basis: discovery `customers.adGroupAds.mutate` — httpMethod POST, path
    // `v26/customers/{+customerId}/adGroupAds:mutate`;
    // `Services__MutateAdGroupAdsRequest.operations[]`, each
    // `Services__AdGroupAdOperation.create` a `Resources__AdGroupAd`
    // { adGroup (resource name), status enum (… ENABLED | PAUSED | REMOVED),
    // ad `Resources__Ad` }. `Resources__Ad` has `name` ("currently only
    // supported for … ImageAd …"), `finalUrls` (string[]) and `imageAd`
    // `Common__ImageAdInfo`, whose `imageAsset` is `Common__AdImageAsset`
    // { asset: string (the asset resource name) }.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/customers/${CID}/adGroupAds:mutate`);
    // basis: unverified (code-only) for the developer-token / login-customer-id names.
    expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(req.headers["developer-token"]).toBe(TEST_CREDENTIALS.developerToken);
    expect(req.headers["login-customer-id"]).toBe(TEST_CREDENTIALS.loginCustomerId);
    expect(req.body).toEqual({
      operations: [
        {
          create: {
            adGroup: `customers/${CID}/adGroups/${AD_GROUP}`,
            status: "PAUSED",
            ad: {
              name: "Banner 300x250",
              finalUrls: ["https://example.com/sale"],
              imageAd: { imageAsset: { asset: ASSET } },
            },
          },
        },
      ],
    });

    // basis: `Services__MutateAdGroupAdResult` { resourceName, adGroupAd }.
    expect(out.resourceName).toBe(`customers/${CID}/adGroupAds/${AD_GROUP}~555`);
    expect(out.adId).toBe("555");
    expect(out.effect).toEqual({
      effectKind: "creative_attached",
      summary: {
        parent_kind: "ad_group",
        parent_id: AD_GROUP,
        asset_type: "image",
        asset_handle: ASSET,
        created_kind: "ad",
        created_id: `customers/${CID}/adGroupAds/${AD_GROUP}~555`,
        status: "PAUSED",
      },
    });
    expect(() => AttachCreativeOutputSchema.parse(out)).not.toThrow();
    // One mutate draws one token from the customer's bucket.
    expect(session.rateLimiter.getRemainingTokens(`gads:${CID}`)).toBe(
      mcpConfig.gadsRateLimitPerMinute - 1
    );
  });

  it("dry_run sends nothing and projects the attach", async () => {
    const out = await attachCreativeLogic(
      AttachCreativeInputSchema.parse({ ...input, dry_run: true }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
    expect(out.resourceName).toBeUndefined();
    expect(out.dryRun).toEqual({
      wouldSucceed: true,
      validationErrors: [],
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect: {
        effectKind: "creative_attached",
        summary: {
          parent_kind: "ad_group",
          parent_id: AD_GROUP,
          asset_type: "image",
          asset_handle: ASSET,
          created_kind: "ad",
          status: "PAUSED",
        },
      },
    });
    expect(out.dispatchedCapability).toEqual({ operation: "create", canonicalEntityKind: null });
    expect(() => EffectDryRunResultSchema.parse(out.dryRun)).not.toThrow();
  });

  it("dry_run reports an asset of another customer and a non-numeric ad group", async () => {
    const out = await attachCreativeLogic(
      AttachCreativeInputSchema.parse({
        ...input,
        adGroupId: "ag-1",
        imageAssetResourceName: "customers/1111111111/assets/42",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
    expect(out.dryRun?.wouldSucceed).toBe(false);
    expect(out.dryRun?.validationErrors.map((e) => e.code)).toEqual([
      "INVALID_AD_GROUP_ID",
      "ASSET_CUSTOMER_MISMATCH",
    ]);
  });

  it("a mutate response with no ad group ad resource name is an error, not a silent success", async () => {
    routeAdGroupAdsMutate({ results: [{}] });
    await expect(
      attachCreativeLogic(AttachCreativeInputSchema.parse(input), ctx, sdk)
    ).rejects.toThrow(/no ad group ad resource name/);
  });
});

describe("gads_attach_creative input rules", () => {
  it("refuses a dashed customer id and a missing final URL", () => {
    expect(
      AttachCreativeInputSchema.safeParse({ ...input, customerId: "123-456-7890" }).success
    ).toBe(false);
    const { finalUrl: _finalUrl, ...noUrl } = input;
    expect(AttachCreativeInputSchema.safeParse(noUrl).success).toBe(false);
  });
});

describe("gads_attach_creative governance annotation", () => {
  it("is an effect-class write keyed on the ad group, binding every arg but dry_run", () => {
    expect(attachCreativeTool.annotations.cesteral).toMatchObject({
      kind: "write",
      writeClass: "effect",
      platform: "google_ads",
      contractId: "google_ads.attach_creative.v1",
      operation: ["create"],
      entityKinds: [],
      entityIdArgs: ["adGroupId"],
      executableArgsExclude: ["dry_run"],
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
    });
  });
});
