// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-level test kit (#236). Stubs ONLY the global `fetch` — the transport
 * `fetchWithTimeout` calls — so everything above it (tool logic, services,
 * TikTokHttpClient URL/header/body construction, `executeWithRetry`, the real
 * access-token adapter and the package's real `RateLimiter`) runs as in
 * production, and a test asserts the requests that would actually leave the
 * process — or that none do.
 *
 * A test against a mocked TikTokService / TikTokHttpClient can only prove the
 * code agrees with itself; this records what business-api.tiktok.com would
 * receive.
 */

import { vi } from "vitest";
import pino from "pino";
import { mcpConfig } from "../../src/config/index.js";
import { rateLimiter } from "../../src/utils/platform.js";
import { TikTokAccessTokenAdapter } from "../../src/auth/tiktok-auth-adapter.js";
import {
  createSessionServices,
  sessionServiceStore,
  type SessionServices,
} from "../../src/services/session-services.js";

export interface WireRequest {
  method: string;
  url: string;
  host: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  /** Parsed JSON body; the raw string when it is not JSON; undefined when absent. */
  body: unknown;
  /** The body exactly as handed to fetch, as bytes (multipart uploads). */
  rawBody?: Buffer;
}

export interface WireRoute {
  method?: string;
  /** Host to match; any host when omitted. */
  host?: string;
  /** Exact pathname, or a pattern tested against the pathname. */
  path: string | RegExp;
  status?: number;
  /**
   * The `data` of TikTok's `{ code: 0, message: "OK", data }` envelope, or a
   * function of the request returning it.
   */
  data?: unknown | ((req: WireRequest) => unknown);
  /** Raw (non-envelope) response body, e.g. media bytes. Takes precedence over `data`. */
  rawBody?: Uint8Array | string;
  /** Content type for `rawBody`. */
  contentType?: string;
}

export const TIKTOK_HOST = "business-api.tiktok.com";
export const TEST_ACCESS_TOKEN = "tiktok-wire-test-token";
export const TEST_ADVERTISER_ID = "7000000000000000001";

function headersToRecord(headers: RequestInit["headers"]): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(new Headers(headers).entries());
}

function toBuffer(body: RequestInit["body"]): Buffer | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(new Uint8Array(body));
  return Buffer.from(String(body), "utf8");
}

function parseBody(raw: Buffer | undefined): unknown {
  if (raw === undefined) return undefined;
  const text = raw.toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface FetchStub {
  /** Every request the code sent, in order. */
  readonly requests: WireRequest[];
  /** Requests to a given host. */
  to(host: string): WireRequest[];
  /** Add a route; later routes take precedence over earlier ones. */
  route(route: WireRoute): void;
  restore(): void;
}

/**
 * Replace `globalThis.fetch` with a recorder that answers in TikTok's envelope.
 * Unmatched requests get `{ code: 0, message: "OK", data: {} }`.
 */
export function installFetchStub(routes: WireRoute[] = []): FetchStub {
  const table: WireRoute[] = [...routes];
  const requests: WireRequest[] = [];
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const parsed = new URL(url);
      const rawBody = toBuffer(init?.body);
      const req: WireRequest = {
        method: (init?.method ?? "GET").toUpperCase(),
        url,
        host: parsed.host,
        path: parsed.pathname,
        query: Object.fromEntries(parsed.searchParams.entries()),
        headers: headersToRecord(init?.headers),
        body: parseBody(rawBody),
        rawBody,
      };
      requests.push(req);

      const match = [...table].reverse().find((r) => {
        if (r.method && r.method.toUpperCase() !== req.method) return false;
        if (r.host && r.host !== req.host) return false;
        return typeof r.path === "string" ? r.path === req.path : r.path.test(req.path);
      });
      if (match?.rawBody !== undefined) {
        return new Response(match.rawBody, {
          status: match.status ?? 200,
          headers: { "content-type": match.contentType ?? "application/octet-stream" },
        });
      }
      const data =
        typeof match?.data === "function"
          ? (match.data as (r: WireRequest) => unknown)(req)
          : (match?.data ?? {});
      return new Response(JSON.stringify({ code: 0, message: "OK", data }), {
        status: match?.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    });

  return {
    requests,
    to: (host) => requests.filter((r) => r.host === host),
    route: (r) => table.push(r),
    restore: () => spy.mockRestore(),
  };
}

export interface WireSession {
  sessionId: string;
  services: SessionServices;
  rateLimiter: typeof rateLimiter;
  /**
   * The limiter key this session's CRUD calls draw on
   * (`tiktok:token:{quotaClient}`, one per access token — rate-limit-keys.ts).
   */
  quotaKey: string;
  dispose(): void;
}

/**
 * Register REAL session services (production base URL and API version from
 * config, a real access-token adapter) under a session id, as the transport
 * does on connect, on the package's REAL process-wide `rateLimiter`
 * (`src/utils/platform.ts`). It must be that instance, not a fresh one: the
 * bulk-capacity pre-check (`tools/utils/bulk-capacity.ts`) reads the module
 * limiter, so a session on any other limiter would be checked against a bucket
 * it never spends. Its windows are cleared on create and dispose so one test's
 * spent tokens never throttle the next.
 */
export function createWireSession(
  sessionId = "wire-session",
  accessToken = TEST_ACCESS_TOKEN
): WireSession {
  rateLimiter.clear();
  const auth = new TikTokAccessTokenAdapter(
    accessToken,
    TEST_ADVERTISER_ID,
    mcpConfig.tiktokApiBaseUrl,
    mcpConfig.tiktokApiVersion
  );
  const services = createSessionServices(
    auth,
    {
      baseUrl: mcpConfig.tiktokApiBaseUrl,
      reportPollIntervalMs: mcpConfig.tiktokReportPollIntervalMs,
      reportMaxPollAttempts: mcpConfig.tiktokReportMaxPollAttempts,
      apiVersion: mcpConfig.tiktokApiVersion,
    },
    pino({ level: "silent" }),
    rateLimiter
  );
  sessionServiceStore.set(sessionId, services);
  return {
    sessionId,
    services,
    rateLimiter,
    quotaKey: services.tiktokService.bulkCapacityBucket([1]).key,
    dispose: () => {
      sessionServiceStore.delete(sessionId);
      rateLimiter.clear();
    },
  };
}

/** An sdkContext whose client accepts every confirmation prompt. */
export function acceptingSdkContext(sessionId: string) {
  return {
    sessionId,
    elicitInput: vi.fn().mockResolvedValue({ action: "accept", content: { confirm: true } }),
  };
}

export { rateLimiter };
