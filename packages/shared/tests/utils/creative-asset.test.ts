// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * The creative-asset resolver (cesteral/mcp-open-advertising#363).
 *
 * The control plane's resolver contract (governance-layer #2161): POST
 * `{origin}/api/connector/media-assets/{assetId}` with the call's decision
 * token and `{ executableArgs }`; a `303` carries a 5-minute storage URL, any
 * other status is a refusal `{ reasonCode }`. These tests stub `fetch` only and
 * assert what the connector sends, what it refuses, and that nothing it fetched
 * from is ever echoed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTROL_PLANE_URL_ENV,
  CreativeAssetRefSchema,
  McpError,
  checkCreativeAssetLimits,
  resolveCreativeAsset,
  runWithRawToolArgs,
  runWithRequestContext,
  type CreativeAssetRef,
} from "../../src/index.js";

const ORIGIN = "https://app.example.test";
const ASSET_ID = "3f1c9a7e-5b2d-4c8e-9a41-2d7f0e6b1c55";
const STORAGE_URL = "https://storage.example.test/signed/obj?X-Signature=SECRET-SIGNATURE";
const BYTES = Buffer.from("png-bytes-0123456789");
const TOKEN = "header.payload.signature";

const asset: CreativeAssetRef = {
  source: "cesteral_media_library",
  assetId: ASSET_ID,
  filename: "spring-promo.png",
  contentType: "image/png",
  sizeBytes: BYTES.length,
};
const LIMITS = {
  platform: "Test",
  allowedContentTypes: ["image/png", "image/jpeg"],
  maxBytes: 1024,
};
const RAW_ARGS = { adAccountId: "act_1", asset, dry_run: false, __internal: "x" };

interface Call {
  url: string;
  init: RequestInit;
}
let calls: Call[];
let resolver: () => Response;
let storage: () => Response;

function run<T>(fn: () => Promise<T>, token: string | null = TOKEN): Promise<T> {
  return runWithRequestContext(
    { requestId: "r1", timestamp: new Date().toISOString(), decisionToken: token ?? undefined },
    () => runWithRawToolArgs(RAW_ARGS, fn)
  );
}

function resolve(overrides: Partial<Parameters<typeof resolveCreativeAsset>[0]> = {}) {
  return resolveCreativeAsset({
    asset,
    executableArgsExclude: ["dry_run"],
    parsedArgs: {},
    limits: LIMITS,
    ...overrides,
  });
}

function see303(): Response {
  return new Response(null, { status: 303, headers: { location: STORAGE_URL } });
}
function bytesResponse(body: Buffer = BYTES, type = "image/png"): Response {
  return new Response(body, { status: 200, headers: { "content-type": type } });
}
function refusalResponse(status: number, reasonCode: string): Response {
  return new Response(JSON.stringify({ reasonCode }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  calls = [];
  resolver = see303;
  storage = () => bytesResponse();
  process.env[CONTROL_PLANE_URL_ENV] = ORIGIN;
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    return url.startsWith(ORIGIN) ? resolver() : storage();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env[CONTROL_PLANE_URL_ENV];
});

describe("resolveCreativeAsset: success", () => {
  it("posts the token and the canonicalized args, then fetches the 303 location", async () => {
    const out = await run(() => resolve());

    expect(calls).toHaveLength(2);
    const [post, get] = calls;
    expect(post!.url).toBe(`${ORIGIN}/api/connector/media-assets/${ASSET_ID}`);
    expect(post!.init.method).toBe("POST");
    expect(post!.init.redirect).toBe("manual");
    const headers = new Headers(post!.init.headers);
    expect(headers.get("x-cesteral-decision-token")).toBe(TOKEN);
    expect(headers.get("content-type")).toBe("application/json");
    // The raw wire args minus the excluded field and the `__`-prefixed one:
    // exactly what the verifier hashed against the token's actionHash.
    expect(JSON.parse(post!.init.body as string)).toEqual({
      executableArgs: { adAccountId: "act_1", asset },
    });

    expect(get!.url).toBe(STORAGE_URL);
    expect(new Headers(get!.init.headers).get("x-cesteral-decision-token")).toBeNull();
    expect(new Headers(get!.init.headers).get("authorization")).toBeNull();

    expect(out.buffer.equals(BYTES)).toBe(true);
    expect(out.contentType).toBe("image/png");
    expect(out.filename).toBe("spring-promo.png");
  });

  it("falls back to the parsed args when raw capture is not installed", async () => {
    await runWithRequestContext({ requestId: "r1", timestamp: "t", decisionToken: TOKEN }, () =>
      resolve({ parsedArgs: { adAccountId: "act_9", asset } })
    );
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      executableArgs: { adAccountId: "act_9", asset },
    });
  });

  it("accepts a content type with parameters and different case", async () => {
    storage = () => bytesResponse(BYTES, "IMAGE/PNG; charset=binary");
    await expect(run(() => resolve())).resolves.toBeDefined();
  });
});

describe("resolveCreativeAsset: refusals fail the write and fetch nothing", () => {
  const classes: Array<[number, string, number]> = [
    [400, "BAD_ASSET_ID", -32602],
    [400, "BAD_REQUEST", -32602],
    [401, "MISSING_TOKEN", -32006],
    [401, "EXPIRED", -32006],
    [401, "INVALID_SIGNATURE", -32006],
    [401, "WRONG_AUDIENCE", -32006],
    [403, "UNKNOWN_TENANT", -32005],
    [403, "ACTION_HASH_MISMATCH", -32005],
    [403, "ASSET_NOT_NAMED", -32005],
    [404, "ASSET_NOT_FOUND", -32001],
    [409, "ASSET_CHANGED", -32002],
    [413, "BODY_TOO_LARGE", -32602],
    [503, "SECRET_UNCONFIGURED", -32000],
    [500, "INTERNAL_ERROR", -32000],
    [502, "SIGNING_FAILED", -32000],
  ];

  it.each(classes)("%i %s", async (status, reasonCode, code) => {
    resolver = () => refusalResponse(status, reasonCode);
    const err = await run(() => resolve()).catch((e) => e);

    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).code).toBe(code);
    expect((err as McpError).data?.reasonCode).toBe(reasonCode);
    expect((err as McpError).message).toContain(reasonCode);
    expect((err as McpError).message).toContain("nothing was uploaded");
    // Only the resolver was asked; no storage fetch followed.
    expect(calls).toHaveLength(1);
  });

  it("treats a 200 as a refusal, not as bytes", async () => {
    resolver = () => new Response(BYTES, { status: 200 });
    const err = await run(() => resolve()).catch((e) => e);
    expect(err).toBeInstanceOf(McpError);
    expect(calls).toHaveLength(1);
  });

  it("keeps an unparseable refusal body from leaking into the message", async () => {
    resolver = () => new Response("<html>secret</html>", { status: 403 });
    const err = (await run(() => resolve()).catch((e) => e)) as McpError;
    expect(err.data?.reasonCode).toBe("RESOLVER_REFUSED");
    expect(err.message).not.toContain("secret");
  });

  it("refuses an unreachable control plane", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("connect ECONNREFUSED app.example.test");
    });
    const err = (await run(() => resolve()).catch((e) => e)) as McpError;
    expect(err.data?.reasonCode).toBe("RESOLVER_UNREACHABLE");
  });

  it.each([
    ["no location", () => new Response(null, { status: 303 })],
    [
      "an http storage location",
      () =>
        new Response(null, { status: 303, headers: { location: "http://storage.example.test/x" } }),
    ],
    [
      "a location with credentials",
      () =>
        new Response(null, {
          status: 303,
          headers: { location: "https://u:p@storage.example.test/x" },
        }),
    ],
  ])("refuses a 303 with %s", async (_name, make) => {
    resolver = make;
    const err = (await run(() => resolve()).catch((e) => e)) as McpError;
    expect(err.data?.reasonCode).toBe("BAD_RESOLVER_RESPONSE");
    expect(calls).toHaveLength(1);
  });
});

describe("resolveCreativeAsset: no decision token", () => {
  it("refuses before any network call", async () => {
    const err = (await run(() => resolve(), null).catch((e) => e)) as McpError;
    expect(err).toBeInstanceOf(McpError);
    expect(err.code).toBe(-32006);
    expect(err.data?.reasonCode).toBe("MISSING_TOKEN");
    expect(calls).toHaveLength(0);
  });

  it("refuses outside any request context", async () => {
    const err = (await resolve().catch((e) => e)) as McpError;
    expect(err.data?.reasonCode).toBe("MISSING_TOKEN");
    expect(calls).toHaveLength(0);
  });
});

describe("resolveCreativeAsset: the bytes must be the asset that was named", () => {
  it("refuses a content type that differs", async () => {
    storage = () => bytesResponse(BYTES, "image/jpeg");
    const err = (await run(() => resolve()).catch((e) => e)) as McpError;
    expect(err.data?.reasonCode).toBe("ASSET_CONTENT_TYPE_MISMATCH");
    expect(err.code).toBe(-32002);
  });

  it("refuses fewer bytes than sizeBytes", async () => {
    storage = () => bytesResponse(BYTES.subarray(0, 5));
    const err = (await run(() => resolve()).catch((e) => e)) as McpError;
    expect(err.data?.reasonCode).toBe("ASSET_SIZE_MISMATCH");
  });

  it("refuses more bytes than sizeBytes, without buffering the rest", async () => {
    storage = () => bytesResponse(Buffer.concat([BYTES, Buffer.from("extra")]));
    const err = (await run(() => resolve()).catch((e) => e)) as McpError;
    expect(err.data?.reasonCode).toBe("ASSET_SIZE_MISMATCH");
  });

  it("refuses when storage refuses", async () => {
    storage = () => new Response("denied", { status: 403 });
    const err = (await run(() => resolve()).catch((e) => e)) as McpError;
    expect(err.data?.reasonCode).toBe("STORAGE_FETCH_FAILED");
  });
});

describe("resolveCreativeAsset: platform limits are checked before anything is fetched", () => {
  it("refuses a content type the platform does not take", async () => {
    const gif = { ...asset, contentType: "image/gif" };
    const err = (await run(() => resolve({ asset: gif })).catch((e) => e)) as McpError;
    expect(err.data?.reasonCode).toBe("ASSET_CONTENT_TYPE_UNSUPPORTED");
    expect(calls).toHaveLength(0);
  });

  it("refuses an asset over the platform's size limit", async () => {
    const big = { ...asset, sizeBytes: 2048 };
    const err = (await run(() => resolve({ asset: big })).catch((e) => e)) as McpError;
    expect(err.data?.reasonCode).toBe("ASSET_TOO_LARGE");
    expect(calls).toHaveLength(0);
  });
});

describe("resolveCreativeAsset: configuration", () => {
  it.each([
    ["unset", undefined],
    ["not a URL", "not a url"],
    ["plain http on a real host", "http://app.example.test"],
    ["with credentials", "https://u:p@app.example.test"],
  ])("refuses a control-plane URL that is %s", async (_n, value) => {
    if (value === undefined) delete process.env[CONTROL_PLANE_URL_ENV];
    else process.env[CONTROL_PLANE_URL_ENV] = value;
    const err = (await run(() => resolve()).catch((e) => e)) as McpError;
    expect(err.data?.reasonCode).toBe("RESOLVER_UNCONFIGURED");
    expect(calls).toHaveLength(0);
  });
});

describe("resolveCreativeAsset: the storage URL is never echoed", () => {
  it("appears in no error message or data, whatever fails after the 303", async () => {
    storage = () => {
      throw new Error(`fetch failed for ${STORAGE_URL}`);
    };
    const err = (await run(() => resolve()).catch((e) => e)) as McpError;
    expect(err.data?.reasonCode).toBe("STORAGE_FETCH_FAILED");
    const everything = JSON.stringify({ m: err.message, d: err.data });
    expect(everything).not.toContain("SECRET-SIGNATURE");
    expect(everything).not.toContain("storage.example.test");
  });

  it("is not part of what a success returns", async () => {
    const out = await run(() => resolve());
    expect(JSON.stringify({ ...out, buffer: undefined })).not.toContain("storage.example.test");
  });
});

describe("asset reference schema and dry-run limit check", () => {
  it("accepts the contract shape", () => {
    expect(CreativeAssetRefSchema.safeParse(asset).success).toBe(true);
  });

  it.each([
    ["another source", { ...asset, source: "dropbox" }],
    ["a non-uuid id", { ...asset, assetId: "123" }],
    ["a URL field", { ...asset, url: "https://x.test/a.png" }],
    ["a missing field", { ...asset, sizeBytes: undefined }],
    ["a fractional size", { ...asset, sizeBytes: 1.5 }],
  ])("refuses %s", (_n, value) => {
    expect(CreativeAssetRefSchema.safeParse(value).success).toBe(false);
  });

  it("reports limit misses without any I/O", () => {
    const errors = checkCreativeAssetLimits(
      { ...asset, contentType: "image/gif", sizeBytes: 5000 },
      LIMITS
    );
    expect(errors.map((e) => e.code).sort()).toEqual([
      "ASSET_CONTENT_TYPE_UNSUPPORTED",
      "ASSET_TOO_LARGE",
    ]);
    expect(calls).toHaveLength(0);
  });
});
