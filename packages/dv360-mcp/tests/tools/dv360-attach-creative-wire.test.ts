// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire requests of `dv360_attach_creative` (#236, governance-layer #2161): the
 * REAL tool logic over REAL session services (DV360Service, DV360HttpClient,
 * the Google OAuth2 refresh adapter and a real `RateLimiter`), with only
 * `globalThis.fetch` stubbed.
 *
 * Expected shapes come from Google's Discovery document, fetched 2026-11-17:
 *   https://displayvideo.googleapis.com/$discovery/rest?version=v4
 *   revision 20261117 (method paths carry the `v4/` prefix).
 * Method citations are `resources.advertisers.resources.<collection>.methods.<method>`;
 * body citations are `schemas.<Name>`. int64 ids are JSON strings per Discovery.
 * The `Content-Type: application/json` header is code-only, as in
 * dv360-wire-requests.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mcpConfig } from "../../src/config/index.js";
import {
  attachCreativeLogic,
  attachCreativeTool,
  AttachCreativeInputSchema,
  AttachCreativeOutputSchema,
} from "../../src/mcp-server/tools/definitions/attach-creative.tool.js";
import { EffectDryRunResultSchema, McpError } from "@cesteral/shared";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  DV360_HOST,
  TEST_ACCESS_TOKEN,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/wire.js";

const API = "https://displayvideo.googleapis.com/v4";
const ADV = "111";
const LI = "222";
const ctx = { requestId: "wire-req" } as any;

/** A line item as DV360 returns it (passes the vendored generated schema). */
function lineItem(overrides: Record<string, unknown> = {}) {
  return {
    name: `advertisers/${ADV}/lineItems/${LI}`,
    advertiserId: ADV,
    campaignId: "444",
    insertionOrderId: "333",
    lineItemId: LI,
    displayName: `LI ${LI}`,
    lineItemType: "LINE_ITEM_TYPE_DISPLAY_DEFAULT",
    entityStatus: "ENTITY_STATUS_ACTIVE",
    updateTime: "2026-09-01T00:00:00Z",
    flight: { flightDateType: "LINE_ITEM_FLIGHT_DATE_TYPE_INHERITED" },
    budget: {
      budgetAllocationType: "LINE_ITEM_BUDGET_ALLOCATION_TYPE_UNLIMITED",
      budgetUnit: "BUDGET_UNIT_CURRENCY",
    },
    pacing: { pacingPeriod: "PACING_PERIOD_FLIGHT", pacingType: "PACING_TYPE_ASAP" },
    frequencyCap: { unlimited: true },
    partnerRevenueModel: {
      markupType: "PARTNER_REVENUE_MODEL_MARKUP_TYPE_TOTAL_MEDIA_COST_MARKUP",
      markupAmount: "0",
    },
    bidStrategy: { fixedBid: { bidAmountMicros: "1500000" } },
    containsEuPoliticalAds: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    creativeIds: ["900"],
    ...overrides,
  };
}

const IMAGE_INPUT = {
  advertiserId: ADV,
  lineItemId: LI,
  displayName: "Banner 300x250",
  mediaType: "image",
  assetId: "555",
  landingPageUrl: "https://example.com/sale",
  widthPixels: 300,
  heightPixels: 250,
};

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

function apiRequests(): WireRequest[] {
  return stub.to(DV360_HOST);
}

function calls(): string[] {
  return apiRequests().map((r) => `${r.method} ${r.url}`);
}

/** Echo a POST/PATCH body back as the created/updated resource, as DV360 does. */
function echo(extra: Record<string, unknown> = {}) {
  return (req: WireRequest) => ({ ...(req.body as Record<string, unknown>), ...extra });
}

function routeLineItem(current = lineItem()) {
  stub.route({ method: "GET", path: `/v4/advertisers/${ADV}/lineItems/${LI}`, response: current });
  stub.route({ method: "PATCH", path: `/v4/advertisers/${ADV}/lineItems/${LI}`, response: echo() });
}

function routeCreativeCreate(creativeId = "700") {
  stub.route({
    method: "POST",
    path: `/v4/advertisers/${ADV}/creatives`,
    response: echo({
      creativeId,
      advertiserId: ADV,
      name: `advertisers/${ADV}/creatives/${creativeId}`,
    }),
  });
}

describe("dv360_attach_creative → creatives.create, then lineItems.patch creativeIds", () => {
  it("image: reads the line item, creates a PAUSED hosted standard creative, appends its id", async () => {
    routeLineItem();
    routeCreativeCreate("700");

    const out = await attachCreativeLogic(AttachCreativeInputSchema.parse(IMAGE_INPUT), ctx, sdk);

    // The line item is read first (no orphan creative when it is missing), then
    // one create and one patch.
    expect(calls()).toEqual([
      `GET ${API}/advertisers/${ADV}/lineItems/${LI}`,
      `POST ${API}/advertisers/${ADV}/creatives`,
      `PATCH ${API}/advertisers/${ADV}/lineItems/${LI}?updateMask=creativeIds`,
    ]);

    const create = apiRequests()[1]!;
    // basis: `advertisers.creatives.create` — httpMethod POST, flatPath
    // `v4/advertisers/{advertisersId}/creatives`, request $ref Creative.
    // schemas.Creative marks Required: displayName, entityStatus (accepted:
    // ENTITY_STATUS_ACTIVE | ARCHIVED | PAUSED), hostingSource, creativeType,
    // dimensions, assets, exitEvents. HOSTING_SOURCE_HOSTED supports create for
    // CREATIVE_TYPE_STANDARD and CREATIVE_TYPE_VIDEO (their enumDescriptions).
    // schemas.AssetAssociation {asset: Asset{mediaId}, role ASSET_ROLE_MAIN
    // ("the main asset of the creative")}; schemas.Asset.mediaId "can be passed
    // to ... CreateCreative to associate the asset"; schemas.ExitEvent {type
    // EXIT_EVENT_TYPE_DEFAULT, url (Required for DEFAULT)}; schemas.Dimensions
    // {widthPixels, heightPixels} int32.
    expect(create.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(create.headers["content-type"]).toBe("application/json");
    expect(create.body).toEqual({
      displayName: "Banner 300x250",
      entityStatus: "ENTITY_STATUS_PAUSED",
      hostingSource: "HOSTING_SOURCE_HOSTED",
      creativeType: "CREATIVE_TYPE_STANDARD",
      dimensions: { widthPixels: 300, heightPixels: 250 },
      assets: [{ asset: { mediaId: "555" }, role: "ASSET_ROLE_MAIN" }],
      exitEvents: [{ type: "EXIT_EVENT_TYPE_DEFAULT", url: "https://example.com/sale" }],
    });

    const patch = apiRequests()[2]!;
    // basis: `advertisers.lineItems.patch` — PATCH
    // `v4/advertisers/{advertisersId}/lineItems/{lineItemsId}`, query
    // `updateMask` (Required, google-fieldmask), request $ref LineItem.
    // schemas.LineItem.creativeIds: array of int64 strings, "The IDs of the
    // creatives associated with the line item"; schemas.Creative.lineItemIds is
    // output only and says "To associate a creative to a line item, use
    // LineItem.creative_ids instead". Fields outside the mask are ignored, so
    // the merged resource is within the contract.
    expect(patch.query).toEqual({ updateMask: "creativeIds" });
    expect(patch.headers["content-type"]).toBe("application/json");
    expect(patch.body).toEqual({ ...lineItem(), creativeIds: ["900", "700"] });

    expect(out.creativeId).toBe("700");
    expect(out.creativeIds).toEqual(["900", "700"]);
    expect(out.effect).toEqual({
      effectKind: "creative_attached",
      summary: {
        parent_kind: "line_item",
        parent_id: LI,
        asset_type: "image",
        asset_handle: "555",
        created_kind: "creative",
        created_id: "700",
        creative_reused: false,
      },
    });
    expect(() => AttachCreativeOutputSchema.parse(out)).not.toThrow();
    // Every displayvideo call drew one token from `dv360:{advertiserId}`.
    expect(session.rateLimiter.getRemainingTokens(`dv360:${ADV}`)).toBe(
      mcpConfig.dv360RateLimitPerMinute - 3
    );
  });

  it("video: CREATIVE_TYPE_VIDEO with empty dimensions", async () => {
    routeLineItem();
    routeCreativeCreate("701");
    await attachCreativeLogic(
      AttachCreativeInputSchema.parse({
        advertiserId: ADV,
        lineItemId: LI,
        displayName: "Spot 15s",
        mediaType: "video",
        assetId: "556",
        landingPageUrl: "https://example.com/sale",
      }),
      ctx,
      sdk
    );
    // basis: schemas.Creative.dimensions — "Required ... The value of
    // width_pixels and height_pixels defaults to `0` when creative_type is one
    // of: CREATIVE_TYPE_VIDEO ...". Sending it empty: unverified live.
    expect(apiRequests()[1]!.body).toEqual({
      displayName: "Spot 15s",
      entityStatus: "ENTITY_STATUS_PAUSED",
      hostingSource: "HOSTING_SOURCE_HOSTED",
      creativeType: "CREATIVE_TYPE_VIDEO",
      dimensions: {},
      assets: [{ asset: { mediaId: "556" }, role: "ASSET_ROLE_MAIN" }],
      exitEvents: [{ type: "EXIT_EVENT_TYPE_DEFAULT", url: "https://example.com/sale" }],
    });
  });

  it("existingCreativeId: no create, only the line-item patch", async () => {
    routeLineItem();
    const out = await attachCreativeLogic(
      AttachCreativeInputSchema.parse({
        advertiserId: ADV,
        lineItemId: LI,
        displayName: "Banner 300x250",
        mediaType: "image",
        existingCreativeId: "700",
        landingPageUrl: "https://example.com/sale",
      }),
      ctx,
      sdk
    );
    // basis: `advertisers.lineItems.patch` with updateMask creativeIds, as above.
    expect(calls()).toEqual([
      `GET ${API}/advertisers/${ADV}/lineItems/${LI}`,
      `PATCH ${API}/advertisers/${ADV}/lineItems/${LI}?updateMask=creativeIds`,
    ]);
    expect(apiRequests()[1]!.body).toEqual({ ...lineItem(), creativeIds: ["900", "700"] });
    expect(out.effect?.summary).toMatchObject({
      asset_handle: null,
      created_id: "700",
      creative_reused: true,
    });
  });

  it("a creative already on the line item is not added again (no patch)", async () => {
    routeLineItem(lineItem({ creativeIds: ["900", "700"] }));
    const out = await attachCreativeLogic(
      AttachCreativeInputSchema.parse({
        advertiserId: ADV,
        lineItemId: LI,
        displayName: "Banner 300x250",
        mediaType: "image",
        existingCreativeId: "700",
        landingPageUrl: "https://example.com/sale",
      }),
      ctx,
      sdk
    );
    // basis: `advertisers.lineItems.get` — GET
    // `v4/advertisers/{advertisersId}/lineItems/{lineItemsId}`.
    expect(calls()).toEqual([`GET ${API}/advertisers/${ADV}/lineItems/${LI}`]);
    expect(out.creativeIds).toEqual(["900", "700"]);
  });

  it("a patch failure after the create throws an error carrying the new creativeId", async () => {
    stub.route({
      method: "GET",
      path: `/v4/advertisers/${ADV}/lineItems/${LI}`,
      response: lineItem(),
    });
    routeCreativeCreate("702");
    stub.route({
      method: "PATCH",
      path: `/v4/advertisers/${ADV}/lineItems/${LI}`,
      status: 400,
      response: { error: { code: 400, message: "Invalid creative", status: "INVALID_ARGUMENT" } },
    });

    const error = await attachCreativeLogic(
      AttachCreativeInputSchema.parse(IMAGE_INPUT),
      ctx,
      sdk
    ).catch((e: unknown) => e);

    // basis: the create (`advertisers.creatives.create`) went out once; the
    // patch was refused, so no second creative may be created on retry.
    expect(apiRequests().filter((r) => r.method === "POST")).toHaveLength(1);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).message).toMatch(/Creative 702 was created/);
    expect((error as McpError).message).toMatch(/existingCreativeId "702"/);
    expect((error as McpError).data).toMatchObject({
      creativeId: "702",
      lineItemId: LI,
      creativeCreated: true,
    });
  });

  it("a missing line item fails before any creative is created", async () => {
    stub.route({
      method: "GET",
      path: `/v4/advertisers/${ADV}/lineItems/${LI}`,
      status: 404,
      response: { error: { code: 404, message: "Not found", status: "NOT_FOUND" } },
    });
    await expect(
      attachCreativeLogic(AttachCreativeInputSchema.parse(IMAGE_INPUT), ctx, sdk)
    ).rejects.toThrow();
    // basis: `advertisers.creatives.create` (POST) is never sent.
    expect(apiRequests().filter((r) => r.method !== "GET")).toHaveLength(0);
  });

  it("dry_run sends nothing and projects the attach", async () => {
    const out = await attachCreativeLogic(
      AttachCreativeInputSchema.parse({ ...IMAGE_INPUT, dry_run: true }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
    expect(out.creativeId).toBeUndefined();
    expect(out.dryRun).toEqual({
      wouldSucceed: true,
      validationErrors: [],
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect: {
        effectKind: "creative_attached",
        summary: {
          parent_kind: "line_item",
          parent_id: LI,
          asset_type: "image",
          asset_handle: "555",
          created_kind: "creative",
          creative_reused: false,
        },
      },
    });
    expect(out.dispatchedCapability).toEqual({ operation: "create", canonicalEntityKind: null });
    expect(() => EffectDryRunResultSchema.parse(out.dryRun)).not.toThrow();
  });

  it("dry_run reports bad ids and dimensions without sending anything", async () => {
    const out = await attachCreativeLogic(
      AttachCreativeInputSchema.parse({
        ...IMAGE_INPUT,
        lineItemId: "li-x",
        widthPixels: 0,
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
    expect(out.dryRun?.wouldSucceed).toBe(false);
    expect(out.dryRun?.validationErrors.map((e) => e.code)).toEqual([
      "INVALID_ID",
      "INVALID_DIMENSION",
    ]);
  });
});

describe("dv360_attach_creative input rules", () => {
  const base = {
    advertiserId: ADV,
    lineItemId: LI,
    displayName: "C",
    landingPageUrl: "https://example.com",
  };

  it("needs exactly one of assetId or existingCreativeId", () => {
    expect(AttachCreativeInputSchema.safeParse({ ...base, mediaType: "video" }).success).toBe(
      false
    );
    expect(
      AttachCreativeInputSchema.safeParse({
        ...base,
        mediaType: "video",
        assetId: "1",
        existingCreativeId: "2",
      }).success
    ).toBe(false);
  });

  it("a new image needs both dimensions; a video takes none", () => {
    expect(
      AttachCreativeInputSchema.safeParse({ ...base, mediaType: "image", assetId: "1" }).success
    ).toBe(false);
    expect(
      AttachCreativeInputSchema.safeParse({
        ...base,
        mediaType: "image",
        assetId: "1",
        widthPixels: 300,
        heightPixels: 250,
      }).success
    ).toBe(true);
    expect(
      AttachCreativeInputSchema.safeParse({
        ...base,
        mediaType: "video",
        assetId: "1",
        widthPixels: 300,
      }).success
    ).toBe(false);
  });
});

describe("dv360_attach_creative governance annotation", () => {
  it("is an effect-class write keyed on the line item, binding every arg but dry_run", () => {
    expect(attachCreativeTool.annotations.cesteral).toMatchObject({
      kind: "write",
      writeClass: "effect",
      platform: "dv360",
      contractId: "dv360.attach_creative.v1",
      operation: ["create"],
      entityKinds: [],
      entityIdArgs: ["lineItemId"],
      executableArgsExclude: ["dry_run"],
      supportsDryRun: true,
      supportsBeforeAfterSnapshot: false,
      requiresValidation: true,
      requiresSimulation: true,
    });
  });
});
