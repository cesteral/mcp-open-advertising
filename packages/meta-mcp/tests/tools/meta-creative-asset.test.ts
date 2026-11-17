// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * meta-mcp upload tools with a media-library `asset` argument
 * (cesteral/mcp-open-advertising#363). Real tool logic over real session
 * services; only `fetch` is stubbed. The control plane's resolver and its
 * storage URL are two extra stubbed hosts: the tests assert that the asset is
 * resolved only when really executing, with this call's decision token and the
 * canonicalized args, that the platform receives the fetched bytes, and that
 * every refusal leaves the platform untouched.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CONTROL_PLANE_URL_ENV, runWithRawToolArgs, runWithRequestContext } from "@cesteral/shared";
import {
  uploadImageLogic,
  UploadImageInputSchema,
} from "../../src/mcp-server/tools/definitions/upload-image.tool.js";
import {
  uploadVideoLogic,
  UploadVideoInputSchema,
} from "../../src/mcp-server/tools/definitions/upload-video.tool.js";
import {
  installFetchStub,
  createWireSession,
  acceptingSdkContext,
  GRAPH_HOST,
  type FetchStub,
  type WireRequest,
  type WireSession,
} from "../helpers/wire.js";

const ACT = "act_1234567890";

const ORIGIN = "https://app.example.test";
const STORAGE_HOST = "storage.example.test";
const STORAGE_URL = `https://${STORAGE_HOST}/signed/obj?X-Signature=SECRET-SIGNATURE`;
const ASSET_ID = "3f1c9a7e-5b2d-4c8e-9a41-2d7f0e6b1c55";
const TOKEN = "header.payload.signature";
const ctx = { requestId: "asset-req" } as any;

let stub: FetchStub;
let session: WireSession;
let sdk: ReturnType<typeof acceptingSdkContext>;
let inner: typeof fetch;
let resolverCalls: Array<{ url: string; init: RequestInit }>;
let resolver: () => Response;
let storageBody: Buffer;
let storageType: string;

beforeEach(async () => {
  stub = installFetchStub();
  session = await createWireSession();
  sdk = acceptingSdkContext(session.sessionId);
  process.env[CONTROL_PLANE_URL_ENV] = ORIGIN;
  resolverCalls = [];
  resolver = () => new Response(null, { status: 303, headers: { location: STORAGE_URL } });
  inner = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(ORIGIN)) {
      resolverCalls.push({ url, init: init ?? {} });
      return resolver();
    }
    if (new URL(url).host === STORAGE_HOST) {
      resolverCalls.push({ url, init: init ?? {} });
      return new Response(storageBody, { status: 200, headers: { "content-type": storageType } });
    }
    return inner(input as any, init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = inner;
  delete process.env[CONTROL_PLANE_URL_ENV];
  session.dispose();
  stub.restore();
});

function assetRef(contentType: string, bytes: Buffer, filename: string) {
  return {
    source: "cesteral_media_library" as const,
    assetId: ASSET_ID,
    filename,
    contentType,
    sizeBytes: bytes.length,
  };
}

/** Run a tool the way the factory does: token on the request, raw args captured. */
function asCall<T>(
  raw: Record<string, unknown>,
  fn: () => Promise<T>,
  token: string | null = TOKEN
) {
  return runWithRequestContext(
    {
      requestId: "asset-req",
      timestamp: new Date().toISOString(),
      decisionToken: token ?? undefined,
    },
    () => runWithRawToolArgs(raw, fn)
  );
}

/** The platform-side uploads: every Graph POST except session validation. */
function uploads(): WireRequest[] {
  return stub.to(GRAPH_HOST).filter((r) => r.method === "POST");
}

describe("meta_upload_image with an `asset` argument", () => {
  const BYTES = Buffer.from("png-bytes-0123");
  const asset = assetRef("image/png", BYTES, "spring-promo.png");
  const raw = { adAccountId: ACT, asset };

  beforeEach(() => {
    storageBody = BYTES;
    storageType = "image/png";
    stub.route({
      method: "POST",
      path: /\/adimages$/,
      response: {
        images: { "spring-promo.png": { hash: "abc123", url: "https://scontent.example/abc" } },
      },
    });
  });

  function input(extra: Record<string, unknown> = {}) {
    return UploadImageInputSchema.parse({ ...raw, ...extra });
  }

  it("resolves the asset with this call's token, then uploads the fetched bytes", async () => {
    const out = await asCall(raw, () => uploadImageLogic(input(), ctx, sdk));

    const post = resolverCalls[0]!;
    expect(post.url).toBe(`${ORIGIN}/api/connector/media-assets/${ASSET_ID}`);
    expect(new Headers(post.init.headers).get("x-cesteral-decision-token")).toBe(TOKEN);
    expect(JSON.parse(post.init.body as string)).toEqual({ executableArgs: raw });
    expect(resolverCalls[1]!.url).toBe(STORAGE_URL);

    const sent = uploads();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.rawBody!.toString("latin1")).toContain(BYTES.toString("latin1"));
    // The response carries the platform's ids, never a fetch location.
    expect(JSON.stringify(out)).not.toContain("SECRET-SIGNATURE");
    expect(JSON.stringify(out)).not.toContain(STORAGE_HOST);
    expect(out.imageHash === "abc123").toBe(true);
  });

  it("dry_run resolves nothing, fetches nothing and uploads nothing", async () => {
    const out = await asCall({ ...raw, dry_run: true }, () =>
      uploadImageLogic(input({ dry_run: true }), ctx, sdk)
    );
    expect(out.dryRun?.wouldSucceed).toBe(true);
    expect(resolverCalls).toHaveLength(0);
    expect(uploads()).toHaveLength(0);
  });

  it("dry_run refuses an asset the platform would reject, still without any call", async () => {
    const bad = { ...asset, contentType: "application/pdf" };
    const out = await asCall({ ...raw, asset: bad, dry_run: true }, () =>
      uploadImageLogic(input({ asset: bad, dry_run: true }), ctx, sdk)
    );
    expect(out.dryRun?.wouldSucceed).toBe(false);
    expect(out.dryRun?.validationErrors.map((e: any) => e.code)).toContain(
      "ASSET_CONTENT_TYPE_UNSUPPORTED"
    );
    expect(resolverCalls).toHaveLength(0);
  });

  it("refuses when no decision token arrived, and uploads nothing", async () => {
    await expect(asCall(raw, () => uploadImageLogic(input(), ctx, sdk), null)).rejects.toThrow(
      /no decision token/
    );
    expect(resolverCalls).toHaveLength(0);
    expect(uploads()).toHaveLength(0);
  });

  it("refuses with the resolver's reason code, and uploads nothing", async () => {
    resolver = () =>
      new Response(JSON.stringify({ reasonCode: "ACTION_HASH_MISMATCH" }), { status: 403 });
    await expect(asCall(raw, () => uploadImageLogic(input(), ctx, sdk))).rejects.toThrow(
      /ACTION_HASH_MISMATCH/
    );
    expect(resolverCalls).toHaveLength(1);
    expect(uploads()).toHaveLength(0);
  });

  it("refuses fetched bytes whose size differs from the reference", async () => {
    storageBody = Buffer.concat([BYTES, Buffer.from("x")]);
    await expect(asCall(raw, () => uploadImageLogic(input(), ctx, sdk))).rejects.toThrow(
      /ASSET_SIZE_MISMATCH|differs from its reference/
    );
    expect(uploads()).toHaveLength(0);
  });

  it("refuses fetched bytes whose content type differs from the reference", async () => {
    storageType = "application/octet-stream";
    await expect(asCall(raw, () => uploadImageLogic(input(), ctx, sdk))).rejects.toThrow(
      /differs from its reference/
    );
    expect(uploads()).toHaveLength(0);
  });

  it("takes exactly one of mediaUrl or asset", () => {
    expect(
      UploadImageInputSchema.safeParse({ ...raw, mediaUrl: "https://cdn.example.com/a" }).success
    ).toBe(false);
    const { asset: _asset, ...noAsset } = raw;
    expect(UploadImageInputSchema.safeParse(noAsset).success).toBe(false);
    expect(
      UploadImageInputSchema.safeParse({ ...noAsset, mediaUrl: "https://cdn.example.com/a" })
        .success
    ).toBe(true);
  });
});

describe("meta_upload_video with an `asset` argument", () => {
  const BYTES = Buffer.from("mp4-bytes-0123");
  const asset = assetRef("video/mp4", BYTES, "spot.mp4");
  const raw = { adAccountId: ACT, asset };

  beforeEach(() => {
    storageBody = BYTES;
    storageType = "video/mp4";
    stub.route({ method: "POST", path: /\/advideos$/, response: { id: "8801" } });
    stub.route({
      method: "GET",
      path: /\/8801$/,
      response: { id: "8801", status: { video_status: "ready", processing_progress: 100 } },
    });
  });

  function input(extra: Record<string, unknown> = {}) {
    return UploadVideoInputSchema.parse({ ...raw, ...extra });
  }

  it("resolves the asset with this call's token, then uploads the fetched bytes", async () => {
    const out = await asCall(raw, () => uploadVideoLogic(input(), ctx, sdk));

    const post = resolverCalls[0]!;
    expect(post.url).toBe(`${ORIGIN}/api/connector/media-assets/${ASSET_ID}`);
    expect(new Headers(post.init.headers).get("x-cesteral-decision-token")).toBe(TOKEN);
    expect(JSON.parse(post.init.body as string)).toEqual({ executableArgs: raw });
    expect(resolverCalls[1]!.url).toBe(STORAGE_URL);

    const sent = uploads();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.rawBody!.toString("latin1")).toContain(BYTES.toString("latin1"));
    // The response carries the platform's ids, never a fetch location.
    expect(JSON.stringify(out)).not.toContain("SECRET-SIGNATURE");
    expect(JSON.stringify(out)).not.toContain(STORAGE_HOST);
    expect(out.videoId === "8801").toBe(true);
  });

  it("dry_run resolves nothing, fetches nothing and uploads nothing", async () => {
    const out = await asCall({ ...raw, dry_run: true }, () =>
      uploadVideoLogic(input({ dry_run: true }), ctx, sdk)
    );
    expect(out.dryRun?.wouldSucceed).toBe(true);
    expect(resolverCalls).toHaveLength(0);
    expect(uploads()).toHaveLength(0);
  });

  it("dry_run refuses an asset the platform would reject, still without any call", async () => {
    const bad = { ...asset, contentType: "application/pdf" };
    const out = await asCall({ ...raw, asset: bad, dry_run: true }, () =>
      uploadVideoLogic(input({ asset: bad, dry_run: true }), ctx, sdk)
    );
    expect(out.dryRun?.wouldSucceed).toBe(false);
    expect(out.dryRun?.validationErrors.map((e: any) => e.code)).toContain(
      "ASSET_CONTENT_TYPE_UNSUPPORTED"
    );
    expect(resolverCalls).toHaveLength(0);
  });

  it("refuses when no decision token arrived, and uploads nothing", async () => {
    await expect(asCall(raw, () => uploadVideoLogic(input(), ctx, sdk), null)).rejects.toThrow(
      /no decision token/
    );
    expect(resolverCalls).toHaveLength(0);
    expect(uploads()).toHaveLength(0);
  });

  it("refuses with the resolver's reason code, and uploads nothing", async () => {
    resolver = () =>
      new Response(JSON.stringify({ reasonCode: "ACTION_HASH_MISMATCH" }), { status: 403 });
    await expect(asCall(raw, () => uploadVideoLogic(input(), ctx, sdk))).rejects.toThrow(
      /ACTION_HASH_MISMATCH/
    );
    expect(resolverCalls).toHaveLength(1);
    expect(uploads()).toHaveLength(0);
  });

  it("refuses fetched bytes whose size differs from the reference", async () => {
    storageBody = Buffer.concat([BYTES, Buffer.from("x")]);
    await expect(asCall(raw, () => uploadVideoLogic(input(), ctx, sdk))).rejects.toThrow(
      /ASSET_SIZE_MISMATCH|differs from its reference/
    );
    expect(uploads()).toHaveLength(0);
  });

  it("refuses fetched bytes whose content type differs from the reference", async () => {
    storageType = "application/octet-stream";
    await expect(asCall(raw, () => uploadVideoLogic(input(), ctx, sdk))).rejects.toThrow(
      /differs from its reference/
    );
    expect(uploads()).toHaveLength(0);
  });

  it("takes exactly one of mediaUrl or asset", () => {
    expect(
      UploadVideoInputSchema.safeParse({ ...raw, mediaUrl: "https://cdn.example.com/a" }).success
    ).toBe(false);
    const { asset: _asset, ...noAsset } = raw;
    expect(UploadVideoInputSchema.safeParse(noAsset).success).toBe(false);
    expect(
      UploadVideoInputSchema.safeParse({ ...noAsset, mediaUrl: "https://cdn.example.com/a" })
        .success
    ).toBe(true);
  });
});

describe("meta_upload_video with an asset", () => {
  it("makes no HEAD request: the reference states its own size", async () => {
    const BYTES = Buffer.from("mp4-bytes-0123");
    storageBody = BYTES;
    storageType = "video/mp4";
    stub.route({ method: "POST", path: /\/advideos$/, response: { id: "8801" } });
    stub.route({
      method: "GET",
      path: /\/8801$/,
      response: { id: "8801", status: { video_status: "ready", processing_progress: 100 } },
    });
    const raw = { adAccountId: ACT, asset: assetRef("video/mp4", BYTES, "spot.mp4") };
    await asCall(raw, () => uploadVideoLogic(UploadVideoInputSchema.parse(raw), ctx, sdk));
    expect(stub.requests.filter((r) => r.method === "HEAD")).toHaveLength(0);
  });
});
