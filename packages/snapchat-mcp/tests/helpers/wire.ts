// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-level test kit (#236). Stubs ONLY the global `fetch` — the transport
 * `fetchWithTimeout` calls — so everything above it (tool logic,
 * SnapchatService / SnapchatReportingService, SnapchatHttpClient's URL /
 * header / body construction, `executeWithRetry`, the real
 * `SnapchatAccessTokenAdapter` and the package's real module `RateLimiter`)
 * runs as in production, and a test asserts the requests that would actually
 * leave the process — or that none do.
 *
 * The media source download of the upload tools (`downloadFileToBuffer`) also
 * goes through `fetch`, so it is answered by a route here too rather than by
 * mocking the shared helper.
 *
 * Mirrors packages/ttd-mcp/tests/helpers/wire.ts.
 */

import { vi } from "vitest";
import pino from "pino";
import { mcpConfig } from "../../src/config/index.js";
import { rateLimiter } from "../../src/utils/platform.js";
import { SnapchatAccessTokenAdapter } from "../../src/auth/snapchat-auth-adapter.js";
import {
  createSessionServices,
  sessionServiceStore,
  type SessionServices,
} from "../../src/services/session-services.js";
import {
  snapchatQuotaKey,
  snapchatReportingQuotaKey,
} from "../../src/services/snapchat/rate-limit-keys.js";

export interface WireRequest {
  method: string;
  url: string;
  host: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  /** Parsed JSON body; the raw string when it is not JSON; undefined when absent. */
  body: unknown;
  /** The body exactly as handed to fetch, as bytes (media uploads). */
  rawBody?: Buffer;
}

export interface WireRoute {
  method?: string;
  /** Host to match; any host when omitted. */
  host?: string;
  /** Exact pathname, or a pattern tested against the pathname. */
  path: string | RegExp;
  /** Extra predicate. */
  match?: (req: WireRequest) => boolean;
  status?: number;
  /** JSON response payload (serialized), or a function of the request. */
  response?: unknown | ((req: WireRequest) => unknown);
  /** Raw (non-JSON) response body, e.g. media bytes. Takes precedence over `response`. */
  rawBody?: Uint8Array | string;
  /** Content type for `rawBody`. */
  contentType?: string;
  /** Extra response headers. */
  headers?: Record<string, string>;
}

/** `mcpConfig.snapchatApiBaseUrl` (platform-facts `snapchat.api_base`, unverified). */
export const API_BASE_URL = mcpConfig.snapchatApiBaseUrl;
export const API_HOST = new URL(API_BASE_URL).host;
export const TEST_SNAPCHAT_TOKEN = "snap-wire-test-token";
/** The Snap user `/v1/me` reports for the test token; the limiter keys on it. */
export const TEST_SNAP_USER = "3b8f2c1e-0000-4000-8000-0000000002e6";

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
  /** Forget the requests recorded so far (e.g. the session's `/v1/me` validation). */
  reset(): void;
  restore(): void;
}

/**
 * Replace `globalThis.fetch` with a recorder. A route's `response` is the
 * whole body (Snap's `{ request_status, <collection>: [...] }` envelope).
 * Unmatched requests get `{}` with 200.
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
        const pathOk = typeof r.path === "string" ? r.path === req.path : r.path.test(req.path);
        if (!pathOk) return false;
        return r.match ? r.match(req) : true;
      });
      if (match?.rawBody !== undefined) {
        return new Response(match.rawBody, {
          status: match.status ?? 200,
          headers: {
            "content-type": match.contentType ?? "application/octet-stream",
            ...match.headers,
          },
        });
      }
      const payload =
        typeof match?.response === "function"
          ? (match.response as (r: WireRequest) => unknown)(req)
          : (match?.response ?? {});
      return new Response(JSON.stringify(payload), {
        status: match?.status ?? 200,
        headers: { "content-type": "application/json", ...match?.headers },
      });
    });

  return {
    requests,
    to: (host) => requests.filter((r) => r.host === host),
    route: (r) => table.push(r),
    reset: () => {
      requests.length = 0;
    },
    restore: () => spy.mockRestore(),
  };
}

export interface WireSession {
  sessionId: string;
  adAccountId: string;
  services: SessionServices;
  rateLimiter: typeof rateLimiter;
  /** The entity bucket every entity / media call draws on (`snapchat:user:{id}`). */
  quotaKey: string;
  /** The reporting bucket stats submits and polls draw on (`...:reporting`). */
  reportingQuotaKey: string;
  dispose(): void;
}

/**
 * Register REAL session services under a session id, as the HTTP transport
 * does on connect: a real `SnapchatAccessTokenAdapter` validated against
 * `GET /v1/me` (answered by `stub`), `createSessionServices`, the session
 * store, and the package's REAL process-wide `rateLimiter`
 * (`src/utils/platform.ts`) — the instance the transport hands every session
 * and the bulk capacity pre-check reads. Its windows are cleared on create and
 * dispose so one test's spent tokens never throttle the next, and the
 * validation request is dropped from `stub.requests`.
 *
 * Report polling uses a 1 ms interval (timing only).
 */
export async function createWireSession(
  stub: FetchStub,
  adAccountId: string,
  sessionId = "snapchat-wire-session"
): Promise<WireSession> {
  rateLimiter.clear();
  stub.route({
    method: "GET",
    host: API_HOST,
    path: "/v1/me",
    response: { request_status: "SUCCESS", me: { id: TEST_SNAP_USER, display_name: "Wire" } },
  });
  const auth = new SnapchatAccessTokenAdapter(TEST_SNAPCHAT_TOKEN, adAccountId, API_BASE_URL);
  await auth.validate();
  const services = createSessionServices(
    auth,
    { baseUrl: API_BASE_URL, reportPollIntervalMs: 1, reportMaxPollAttempts: 3 },
    pino({ level: "silent" }),
    rateLimiter
  );
  sessionServiceStore.set(sessionId, services);
  stub.reset();
  return {
    sessionId,
    adAccountId,
    services,
    rateLimiter,
    quotaKey: snapchatQuotaKey(auth),
    reportingQuotaKey: snapchatReportingQuotaKey(auth),
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
