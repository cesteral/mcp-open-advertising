// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire requests of `meta_attach_creative` (#236, governance-layer #2161): the
 * REAL tool logic over REAL session services with only `fetch` stubbed.
 *
 * Expected shapes come from Meta's machine-readable Marketing API specs
 * (https://github.com/facebook/facebook-business-sdk-codegen, commit
 * 8420be6d5752c568a4f01dd608fa3cce6b2db960, the same commit
 * meta-wire-requests.test.ts cites): `AdAccount.json`, `AdCreative.json`,
 * `AdCreativeObjectStorySpec.json`, `AdCreativeLinkData.json`,
 * `AdCreativeVideoData.json` and `enum_types.json`. The form encoding (objects
 * JSON-encoded) is code-only, as in meta-wire-requests.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mcpConfig } from "../../src/config/index.js";
import {
  attachCreativeLogic,
  attachCreativeTool,
  AttachCreativeInputSchema,
  AttachCreativeOutputSchema,
} from "../../src/mcp-server/tools/definitions/attach-creative.tool.js";
import { META_WRITE_TOKENS } from "../../src/services/meta/meta-service.js";
import { EffectDryRunResultSchema } from "@cesteral/shared";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  rateLimiter,
  GRAPH_HOST,
  TEST_ACCESS_TOKEN,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/wire.js";

const API = mcpConfig.metaApiBaseUrl;
const ACT = "act_1234567890";
const AD_SET = "120200000000002";
const PAGE = "104000000000001";
const ctx = { requestId: "wire-req" } as any;
const ACCOUNT_KEY = `meta:user:10150000000000001:account:${ACT}`;

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
  return stub.to(GRAPH_HOST).filter((r) => !r.path.endsWith("/me"));
}

function onlyWrite(): WireRequest {
  const writes = apiRequests().filter((r) => r.method !== "GET");
  expect(writes).toHaveLength(1);
  return writes[0]!;
}

describe("meta_attach_creative → AdAccount.json POST ads, creative inline", () => {
  it("image: one POST /act_{id}/ads, status PAUSED, link_data with the image hash", async () => {
    stub.route({ method: "POST", path: /\/ads$/, response: { id: "120200000000077" } });
    const out = await attachCreativeLogic(
      AttachCreativeInputSchema.parse({
        adAccountId: ACT,
        adSetId: AD_SET,
        name: "Banner ad",
        pageId: PAGE,
        imageHash: "abc123",
        link: "https://example.com/sale",
        message: "Thirty percent off",
        headline: "Sale",
        description: "This week only",
        callToActionType: "SHOP_NOW",
      }),
      ctx,
      sdk
    );

    const req = onlyWrite();
    // basis: AdAccount.json apis[POST ads] (return Ad) — name string REQUIRED,
    // creative `AdCreative` REQUIRED, adset_id unsigned int, status
    // `adaccountads_status_enum_param` (ACTIVE|ARCHIVED|DELETED|PAUSED).
    // AdCreative.json fields `name`, `object_story_spec`
    // (AdCreativeObjectStorySpec: `page_id` string, `link_data`
    // AdCreativeLinkData). AdCreativeLinkData.json fields `image_hash`, `link`,
    // `message`, `name`, `description`, `call_to_action`.
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${API}/${ACT}/ads`);
    expect(req.headers["authorization"]).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(req.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(req.form).toEqual({
      name: "Banner ad",
      adset_id: AD_SET,
      status: "PAUSED",
      creative: JSON.stringify({
        name: "Banner ad",
        object_story_spec: {
          page_id: PAGE,
          link_data: {
            image_hash: "abc123",
            link: "https://example.com/sale",
            message: "Thirty percent off",
            name: "Sale",
            description: "This week only",
            call_to_action: { type: "SHOP_NOW", value: { link: "https://example.com/sale" } },
          },
        },
      }),
    });

    expect(out.adId).toBe("120200000000077");
    expect(out.effect).toEqual({
      effectKind: "creative_attached",
      summary: {
        parent_kind: "ad_set",
        parent_id: AD_SET,
        asset_type: "image",
        asset_handle: "abc123",
        created_kind: "ad",
        created_id: "120200000000077",
        status: "PAUSED",
      },
    });
    expect(() => AttachCreativeOutputSchema.parse(out)).not.toThrow();
    // A create draws META_WRITE_TOKENS from the named account's bucket.
    expect(rateLimiter.getRemainingTokens(ACCOUNT_KEY)).toBe(
      mcpConfig.metaRateLimitPerMinute - META_WRITE_TOKENS
    );
  });

  it("video: video_data with the video id, thumbnail and a call to action carrying the link", async () => {
    stub.route({ method: "POST", path: /\/ads$/, response: { id: "120200000000078" } });
    await attachCreativeLogic(
      AttachCreativeInputSchema.parse({
        adAccountId: ACT,
        adSetId: AD_SET,
        name: "Video ad",
        pageId: PAGE,
        videoId: "1203000000000005",
        thumbnailImageHash: "thumb1",
        link: "https://example.com/sale",
        headline: "Sale",
        description: "This week only",
      }),
      ctx,
      sdk
    );

    // basis: AdCreativeObjectStorySpec.json field `video_data`
    // (AdCreativeVideoData). AdCreativeVideoData.json fields `video_id`,
    // `image_hash` / `image_url` (thumbnail), `title`, `link_description`,
    // `message`, `call_to_action` (AdCreativeLinkDataCallToAction: type +
    // value.link). video_data has no `link` field, so the link travels in the
    // call to action.
    const req = onlyWrite();
    expect(req.url).toBe(`${API}/${ACT}/ads`);
    expect(JSON.parse(req.form!.creative!)).toEqual({
      name: "Video ad",
      object_story_spec: {
        page_id: PAGE,
        video_data: {
          video_id: "1203000000000005",
          image_hash: "thumb1",
          title: "Sale",
          link_description: "This week only",
          call_to_action: { type: "LEARN_MORE", value: { link: "https://example.com/sale" } },
        },
      },
    });
    expect(req.form!.status).toBe("PAUSED");
  });

  it("dry_run sends nothing and projects the attach", async () => {
    const out = await attachCreativeLogic(
      AttachCreativeInputSchema.parse({
        adAccountId: ACT,
        adSetId: AD_SET,
        name: "Banner ad",
        pageId: PAGE,
        imageHash: "abc123",
        link: "https://example.com/sale",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
    expect(out.adId).toBeUndefined();
    expect(out.dryRun).toEqual({
      wouldSucceed: true,
      validationErrors: [],
      validationSource: "symbolic",
      expectedEffectSource: "symbolic",
      expectedEffect: {
        effectKind: "creative_attached",
        summary: {
          parent_kind: "ad_set",
          parent_id: AD_SET,
          asset_type: "image",
          asset_handle: "abc123",
          created_kind: "ad",
          status: "PAUSED",
        },
      },
    });
    expect(out.dispatchedCapability).toEqual({ operation: "create", canonicalEntityKind: null });
    expect(() => EffectDryRunResultSchema.parse(out.dryRun)).not.toThrow();
  });

  it("dry_run reports a non-numeric ad set id without sending anything", async () => {
    const out = await attachCreativeLogic(
      AttachCreativeInputSchema.parse({
        adAccountId: ACT,
        adSetId: "not-an-id",
        name: "Banner ad",
        pageId: PAGE,
        imageHash: "abc123",
        link: "https://example.com/sale",
        dry_run: true,
      }),
      ctx,
      sdk
    );
    expect(apiRequests()).toHaveLength(0);
    expect(out.dryRun?.wouldSucceed).toBe(false);
    expect(out.dryRun?.validationErrors.map((e) => e.code)).toEqual(["INVALID_AD_SET_ID"]);
  });

  it("an ad create that returns no id is an error, not a silent success", async () => {
    stub.route({ method: "POST", path: /\/ads$/, response: {} });
    await expect(
      attachCreativeLogic(
        AttachCreativeInputSchema.parse({
          adAccountId: ACT,
          adSetId: AD_SET,
          name: "Banner ad",
          pageId: PAGE,
          imageHash: "abc123",
          link: "https://example.com/sale",
        }),
        ctx,
        sdk
      )
    ).rejects.toThrow(/no ad id/);
  });
});

describe("meta_attach_creative input rules", () => {
  const base = {
    adAccountId: ACT,
    adSetId: AD_SET,
    name: "Ad",
    pageId: PAGE,
    link: "https://example.com",
  };

  it("needs exactly one of imageHash or videoId", () => {
    expect(AttachCreativeInputSchema.safeParse(base).success).toBe(false);
    expect(
      AttachCreativeInputSchema.safeParse({ ...base, imageHash: "a", videoId: "1" }).success
    ).toBe(false);
  });

  it("a video needs exactly one thumbnail; an image takes none", () => {
    expect(AttachCreativeInputSchema.safeParse({ ...base, videoId: "1" }).success).toBe(false);
    expect(
      AttachCreativeInputSchema.safeParse({ ...base, videoId: "1", thumbnailImageHash: "t" })
        .success
    ).toBe(true);
    expect(
      AttachCreativeInputSchema.safeParse({ ...base, imageHash: "a", thumbnailImageHash: "t" })
        .success
    ).toBe(false);
  });
});

describe("meta_attach_creative governance annotation", () => {
  it("is an effect-class write keyed on the ad set, binding every arg but dry_run", () => {
    expect(attachCreativeTool.annotations.cesteral).toMatchObject({
      kind: "write",
      writeClass: "effect",
      contractId: "meta.attach_creative.v1",
      operation: ["create"],
      entityKinds: [],
      entityIdArgs: ["adSetId"],
      executableArgsExclude: ["dry_run"],
      supportsBeforeAfterSnapshot: false,
    });
  });
});
