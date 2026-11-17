// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Creative-asset references (cesteral/mcp-open-advertising#363).
 *
 * A governed creative push names its media instead of linking it:
 *
 *   asset: { source: "cesteral_media_library", assetId, filename, contentType, sizeBytes }
 *
 * The call carries no URL, because its arguments are frozen into an approval
 * and hashed into the decision token's `actionHash`; a signed URL frozen there
 * expired within the hour and sat at rest as a credential. The connector turns
 * the reference into bytes when it really executes the call, by asking the
 * control plane's resolver with the call's own decision token:
 *
 *   POST {control plane}/api/connector/media-assets/{assetId}
 *   X-Cesteral-Decision-Token: <token received on this tools/call>
 *   { "executableArgs": <canonicalized executable args the verifier checked> }
 *
 * A `303` answers with a storage URL that lives five minutes; the bytes are
 * fetched from it at once and the URL is never stored, logged or returned. Any
 * other status is a refusal carrying `{ reasonCode }`: the write fails with it
 * and nothing is uploaded. Nothing here is ever called on a `dry_run`.
 *
 * The control-plane origin is operator configuration (`CESTERAL_CONTROL_PLANE_URL`),
 * never a tool argument: the decision token is sent there, so a caller must not
 * be able to choose where.
 */

import { z } from "zod";
import { canonicalizeExecutableArgs } from "@cesteral/contract-hash";
import { McpError, JsonRpcErrorCode } from "../mcp-errors.js";
import { getRawToolArgs } from "../mcp/raw-tool-args.js";
import { getRequestContext } from "../observability/request-context.js";
import type { RequestContext } from "../observability/request-context.js";
import type { DryRunValidationError } from "../../types/dry-run-result.js";
import { fetchWithTimeout } from "./fetch-with-timeout.js";

/** The only `source` an asset reference may name today. */
export const CREATIVE_ASSET_SOURCE = "cesteral_media_library" as const;

/** Environment variable naming the control-plane origin (e.g. `https://app.cesteral.com`). */
export const CONTROL_PLANE_URL_ENV = "CESTERAL_CONTROL_PLANE_URL";

const RESOLVER_TIMEOUT_MS = 30_000;
const STORAGE_FETCH_TIMEOUT_MS = 300_000;

export const CreativeAssetRefSchema = z
  .object({
    source: z
      .literal(CREATIVE_ASSET_SOURCE)
      .describe('Where the asset lives. Always "cesteral_media_library" today.'),
    assetId: z
      .string()
      .uuid()
      .describe("The asset's id (a UUID) in the calling tenant's media library."),
    filename: z.string().min(1).describe("The asset's original filename."),
    contentType: z.string().min(1).describe("The MIME type stored with the asset, e.g. image/png."),
    sizeBytes: z.number().int().nonnegative().describe("The stored byte length of the asset."),
  })
  .strict()
  .describe(
    "A reference to a media-library asset. The connector resolves it to bytes when the call executes; no URL is carried."
  );

export type CreativeAssetRef = z.infer<typeof CreativeAssetRefSchema>;

/** What one platform's upload endpoint accepts. */
export interface CreativeAssetPlatformLimits {
  /** Lower-case MIME types the platform accepts. */
  allowedContentTypes: readonly string[];
  maxBytes: number;
  /** Platform name for messages, e.g. "Meta". */
  platform: string;
}

function mediaType(value: string): string {
  return (value.split(";")[0] ?? "").trim().toLowerCase();
}

/**
 * Check an asset reference against a platform's limits without fetching
 * anything. Used by `dry_run` and again before the fetch of a real execute.
 */
export function checkCreativeAssetLimits(
  asset: CreativeAssetRef,
  limits: CreativeAssetPlatformLimits
): DryRunValidationError[] {
  const errors: DryRunValidationError[] = [];
  if (!limits.allowedContentTypes.includes(mediaType(asset.contentType))) {
    errors.push({
      code: "ASSET_CONTENT_TYPE_UNSUPPORTED",
      message: `${limits.platform} does not accept ${asset.contentType} here; accepted: ${limits.allowedContentTypes.join(", ")}`,
      field: "asset.contentType",
    });
  }
  if (asset.sizeBytes > limits.maxBytes) {
    errors.push({
      code: "ASSET_TOO_LARGE",
      message: `${limits.platform} accepts at most ${limits.maxBytes} bytes here; the asset is ${asset.sizeBytes}`,
      field: "asset.sizeBytes",
    });
  }
  return errors;
}

export interface ResolveCreativeAssetOptions {
  asset: CreativeAssetRef;
  /** This tool's `annotations.cesteral.executableArgsExclude`. */
  executableArgsExclude: readonly string[];
  /**
   * The parsed tool input. Only a fallback for the raw wire arguments, which the
   * verifier hashes; a parsed object can carry schema defaults the minter never
   * saw, in which case the control plane refuses with ACTION_HASH_MISMATCH.
   */
  parsedArgs: unknown;
  limits: CreativeAssetPlatformLimits;
  context?: RequestContext;
}

export interface ResolvedCreativeAsset {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

const REASON_STATUS: Record<number, JsonRpcErrorCode> = {
  400: JsonRpcErrorCode.InvalidParams,
  401: JsonRpcErrorCode.Unauthorized,
  403: JsonRpcErrorCode.Forbidden,
  404: JsonRpcErrorCode.NotFound,
  409: JsonRpcErrorCode.Conflict,
  413: JsonRpcErrorCode.InvalidParams,
  503: JsonRpcErrorCode.ServiceUnavailable,
};

function refusal(reasonCode: string, httpStatus?: number): McpError {
  const code =
    (httpStatus !== undefined ? REASON_STATUS[httpStatus] : undefined) ??
    (httpStatus !== undefined && httpStatus >= 500
      ? JsonRpcErrorCode.ServiceUnavailable
      : JsonRpcErrorCode.InternalError);
  return new McpError(
    code,
    `Creative asset could not be resolved (${reasonCode}); nothing was uploaded.`,
    { reasonCode, ...(httpStatus !== undefined ? { httpStatus } : {}) }
  );
}

function unconfigured(why: string): McpError {
  return new McpError(
    JsonRpcErrorCode.ServiceUnavailable,
    `Creative asset cannot be resolved: ${CONTROL_PLANE_URL_ENV} ${why}; nothing was uploaded.`,
    { reasonCode: "RESOLVER_UNCONFIGURED" }
  );
}

function controlPlaneOrigin(): URL {
  const raw = process.env[CONTROL_PLANE_URL_ENV]?.trim();
  if (!raw) throw unconfigured("is not configured on this server");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw unconfigured("is not a valid URL");
  }
  // The decision token travels in a header to this origin: plain http is
  // allowed only for a loopback development control plane.
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const schemeOk = url.protocol === "https:" || (loopback && url.protocol === "http:");
  if (url.username || url.password || !schemeOk) {
    throw unconfigured("must be an https origin without credentials");
  }
  return url;
}

async function readReasonCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { reasonCode?: unknown };
    if (typeof body?.reasonCode === "string" && /^[A-Z_]{1,64}$/.test(body.reasonCode)) {
      return body.reasonCode;
    }
  } catch {
    // fall through
  }
  return "RESOLVER_REFUSED";
}

/** Read a body, giving up as soon as it passes `limit` bytes. */
async function readCapped(response: Response, limit: number): Promise<Buffer | null> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

/**
 * Turn an asset reference into bytes by calling the control plane's resolver
 * with this call's decision token. Call only when really executing.
 *
 * Fails closed: no token, no configured control plane, a platform-limit miss,
 * any refusal, or fetched bytes that differ from the reference all throw and
 * leave nothing uploaded. The storage URL is used once and appears in no error,
 * log line or return value.
 */
export async function resolveCreativeAsset(
  options: ResolveCreativeAssetOptions
): Promise<ResolvedCreativeAsset> {
  const { asset, limits, context } = options;

  // 1. Refuse what the platform would reject, before any network call.
  const limitErrors = checkCreativeAssetLimits(asset, limits);
  if (limitErrors.length > 0) {
    throw new McpError(
      JsonRpcErrorCode.InvalidParams,
      `${limitErrors.map((e) => e.message).join("; ")}; nothing was uploaded.`,
      { reasonCode: limitErrors[0]!.code }
    );
  }

  // 2. The call's own decision token is the only credential the resolver takes.
  const token = getRequestContext()?.decisionToken ?? context?.decisionToken;
  if (!token) {
    throw new McpError(
      JsonRpcErrorCode.Unauthorized,
      "Creative asset cannot be resolved: this call carries no decision token. An asset reference can only be executed on a governed call; nothing was uploaded.",
      { reasonCode: "MISSING_TOKEN" }
    );
  }

  const origin = controlPlaneOrigin();

  // 3. The executable args are the raw wire arguments the verifier checked.
  const rawArgs = getRawToolArgs();
  const executableArgs = canonicalizeExecutableArgs({
    rawArgs: rawArgs !== undefined ? rawArgs : options.parsedArgs,
    exclude: [...options.executableArgsExclude],
  });

  const resolverUrl = new URL(
    `/api/connector/media-assets/${encodeURIComponent(asset.assetId)}`,
    origin
  );
  const resolverResponse = await fetchWithTimeout(resolverUrl.href, RESOLVER_TIMEOUT_MS, context, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      "X-Cesteral-Decision-Token": token,
    },
    body: JSON.stringify({ executableArgs }),
  }).catch(() => {
    throw new McpError(
      JsonRpcErrorCode.ServiceUnavailable,
      "Creative asset cannot be resolved: the control plane did not answer; nothing was uploaded.",
      { reasonCode: "RESOLVER_UNREACHABLE" }
    );
  });

  if (resolverResponse.status !== 303) {
    throw refusal(await readReasonCode(resolverResponse), resolverResponse.status);
  }

  // 4. Fetch the bytes at once. The location is never kept, logged or echoed.
  const location = resolverResponse.headers.get("location");
  let storageUrl: URL | undefined;
  try {
    storageUrl = location ? new URL(location, resolverUrl) : undefined;
  } catch {
    storageUrl = undefined;
  }
  const storageSchemeOk =
    storageUrl?.protocol === "https:" ||
    (origin.protocol === "http:" && storageUrl?.protocol === "http:");
  if (!storageUrl || storageUrl.username || storageUrl.password || !storageSchemeOk) {
    throw refusal("BAD_RESOLVER_RESPONSE");
  }

  let bytes: Buffer | null;
  let fetchedType: string;
  try {
    // No credential header: the storage URL is the credential.
    const storageResponse = await fetchWithTimeout(
      storageUrl.href,
      STORAGE_FETCH_TIMEOUT_MS,
      undefined,
      { method: "GET", redirect: "error" }
    );
    if (!storageResponse.ok) {
      throw new Error("storage refused");
    }
    fetchedType = mediaType(storageResponse.headers.get("content-type") ?? "");
    bytes = await readCapped(storageResponse, asset.sizeBytes);
  } catch {
    // The caught error may quote the URL; say only that the fetch failed.
    throw refusal("STORAGE_FETCH_FAILED");
  }

  // 5. The fetched bytes must be the asset that was approved.
  if (fetchedType !== mediaType(asset.contentType)) {
    throw new McpError(
      JsonRpcErrorCode.Conflict,
      `Creative asset differs from its reference: the stored content type is not ${asset.contentType}; nothing was uploaded.`,
      { reasonCode: "ASSET_CONTENT_TYPE_MISMATCH" }
    );
  }
  if (bytes === null || bytes.length !== asset.sizeBytes) {
    throw new McpError(
      JsonRpcErrorCode.Conflict,
      `Creative asset differs from its reference: the fetched size is not ${asset.sizeBytes} bytes; nothing was uploaded.`,
      { reasonCode: "ASSET_SIZE_MISMATCH" }
    );
  }

  return { buffer: bytes, contentType: asset.contentType, filename: asset.filename };
}
