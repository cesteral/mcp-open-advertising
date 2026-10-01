// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-level test kit (#236). Stubs ONLY the global `fetch` — the transport
 * `fetchWithTimeout` calls — so everything above it (tool logic,
 * LinkedInService, LinkedInHttpClient's URL / Rest.li query / header / body
 * construction, `executeWithRetry`, the real access-token adapter and the
 * package's real module `RateLimiter`) runs as in production, and a test
 * asserts the requests that would actually leave the process — or that none do.
 *
 * A test against a mocked LinkedInService / LinkedInHttpClient can only prove
 * the code agrees with itself; this records what api.linkedin.com would
 * receive. Nothing here has been exercised against LinkedIn.
 */

import { vi } from "vitest";
import pino from "pino";
import { mcpConfig } from "../../src/config/index.js";
import { rateLimiter } from "../../src/utils/platform.js";
import { LinkedInAccessTokenAdapter } from "../../src/auth/linkedin-auth-adapter.js";
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
  /** The raw query string after `?` (Rest.li 2.0 encoding must be asserted verbatim). */
  rawQuery: string;
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
  /** Extra predicate on the request. */
  match?: (req: WireRequest) => boolean;
  status?: number;
  /** JSON response payload (serialized), or a function of the request. */
  response?: unknown | ((req: WireRequest) => unknown);
  /**
   * Raw (non-JSON) response body, e.g. media bytes, or `""` for an empty body
   * (a Rest.li CREATE answers 201 with no body). Takes precedence over `response`.
   */
  rawBody?: Uint8Array | string;
  /** Content type for `rawBody`. */
  contentType?: string;
  /** Extra response headers, e.g. `x-restli-id`. */
  headers?: Record<string, string>;
}

export const API_BASE_URL = mcpConfig.linkedinApiBaseUrl;
export const API_HOST = new URL(API_BASE_URL).host;
export const API_VERSION = mcpConfig.linkedinApiVersion;
export const TEST_ACCESS_TOKEN = "linkedin-wire-test-token";

/** Statuses whose Response may not carry a body (fetch spec "null body status"). */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

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
 * Replace `globalThis.fetch` with a recorder. LinkedIn answers with the bare
 * entity / collection JSON (no envelope), so a route's `response` is the whole
 * body. Unmatched requests get `{}` with 200.
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
        rawQuery: parsed.search.replace(/^\?/, ""),
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
      const status = match?.status ?? 200;
      if (NULL_BODY_STATUSES.has(status)) {
        return new Response(null, { status, headers: { ...match?.headers } });
      }
      if (match?.rawBody !== undefined) {
        return new Response(match.rawBody, {
          status,
          headers: {
            ...(match.contentType ? { "content-type": match.contentType } : {}),
            ...match.headers,
          },
        });
      }
      const payload =
        typeof match?.response === "function"
          ? (match.response as (r: WireRequest) => unknown)(req)
          : (match?.response ?? {});
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json", ...match?.headers },
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
  dispose(): void;
}

/**
 * Register REAL session services (base URL and `LinkedIn-Version` from config,
 * a real `LinkedInAccessTokenAdapter`) under a session id, as the transport
 * does on connect, on the package's REAL process-wide `rateLimiter`
 * (`src/utils/platform.ts`). It must be that instance: the bulk-capacity
 * pre-check (`tools/utils/bulk-capacity.ts`) reads the module limiter, so a
 * session on any other limiter would be checked against a bucket it never
 * spends. Its windows are cleared on create and dispose so one test's spent
 * tokens never throttle the next.
 */
export function createWireSession(sessionId = "wire-session"): WireSession {
  rateLimiter.clear();
  const auth = new LinkedInAccessTokenAdapter(TEST_ACCESS_TOKEN, API_BASE_URL, API_VERSION);
  const services = createSessionServices(
    auth,
    { baseUrl: API_BASE_URL, apiVersion: API_VERSION },
    pino({ level: "silent" }),
    rateLimiter
  );
  sessionServiceStore.set(sessionId, services);
  return {
    sessionId,
    services,
    rateLimiter,
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
