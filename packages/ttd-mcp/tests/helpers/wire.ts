// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-level test kit (#236). Stubs ONLY the global `fetch` — the transport
 * `fetchWithTimeout` calls — so everything above it (tool logic, TtdService /
 * TtdReportingService, TtdHttpClient's URL/header/body construction,
 * `executeWithRetry`, the real direct-token auth adapter and the package's real
 * module `RateLimiter`) runs as in production, and a test asserts the requests
 * that would actually leave the process — or that none do.
 *
 * A test against a mocked TtdService / TtdHttpClient can only prove the code
 * agrees with itself; this records what api.thetradedesk.com and the GraphQL
 * endpoint would receive.
 */

import { vi } from "vitest";
import pino from "pino";
import { mcpConfig } from "../../src/config/index.js";
import { rateLimiter } from "../../src/utils/platform.js";
import { TtdDirectTokenAuthAdapter } from "../../src/auth/ttd-auth-adapter.js";
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
  /** The body exactly as handed to fetch, as bytes (media uploads). */
  rawBody?: Buffer;
}

export interface WireRoute {
  method?: string;
  /** Host to match; any host when omitted. */
  host?: string;
  /** Exact pathname, or a pattern tested against the pathname. */
  path: string | RegExp;
  /** Extra predicate, e.g. to tell GraphQL operations on the one `/graphql` path apart. */
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

export const REST_BASE_URL = mcpConfig.ttdApiBaseUrl;
export const GRAPHQL_URL = mcpConfig.ttdGraphqlUrl;
export const REST_HOST = new URL(REST_BASE_URL).host;
export const REST_PREFIX = new URL(REST_BASE_URL).pathname.replace(/\/$/, "");
export const GRAPHQL_HOST = new URL(GRAPHQL_URL).host;
export const GRAPHQL_PATH = new URL(GRAPHQL_URL).pathname;
/** TTD's Partner Sandbox GraphQL endpoint (Foundations §7; sandbox-guard.ts). */
export const SANDBOX_GRAPHQL_URL = "https://ext-api.sb.thetradedesk.com/graphql";
export const SANDBOX_REST_BASE_URL = "https://ext-api.sb.thetradedesk.com/v3";
export const TEST_TTD_TOKEN = "ttd-wire-test-token";

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
 * Replace `globalThis.fetch` with a recorder. TTD REST answers with the bare
 * entity / page JSON and GraphQL with `{ data, errors? }` — no envelope — so a
 * route's `response` is the whole body. Unmatched requests get `{}` with 200.
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
    restore: () => spy.mockRestore(),
  };
}

/** The GraphQL document a request carries (`{ query, variables }` body). */
export function gqlQuery(req: WireRequest): string {
  const body = req.body as { query?: unknown } | undefined;
  return typeof body?.query === "string" ? body.query : "";
}

/** The GraphQL variables a request carries. */
export function gqlVariables(req: WireRequest): unknown {
  return (req.body as { variables?: unknown } | undefined)?.variables;
}

/** A route predicate: the GraphQL document names `operation` (a field such as `bidListCreate`). */
export function gqlOperation(operation: string): (req: WireRequest) => boolean {
  const pattern = new RegExp(`\\b${operation}\\s*[({]`);
  return (req) => pattern.test(gqlQuery(req));
}

export interface WireSession {
  sessionId: string;
  services: SessionServices;
  rateLimiter: typeof rateLimiter;
  /**
   * The limiter key every call of this session draws on
   * (`ttd:client:{quotaClient}`, one per TTD token — rate-limit-keys.ts).
   */
  quotaKey: string;
  dispose(): void;
}

export interface WireSessionOptions {
  token?: string;
  baseUrl?: string;
  graphqlUrl?: string;
}

/**
 * Register REAL session services (base URLs from config, a real
 * `TtdDirectTokenAuthAdapter`) under a session id, as the transport does on
 * connect, on the package's REAL process-wide `rateLimiter`
 * (`src/utils/platform.ts`). It must be that instance, not a fresh one: the
 * transport hands the module limiter to `createSessionServices`, and a session
 * on any other limiter would not show the draws production makes. Its windows
 * are cleared on create and dispose so one test's spent tokens never throttle
 * the next.
 *
 * Report polling uses a 1 ms interval (timing only; config's
 * `ttdReportPollIntervalMs` has a 1000 ms floor).
 */
export function createWireSession(
  sessionId = "wire-session",
  options: WireSessionOptions = {}
): WireSession {
  rateLimiter.clear();
  const graphqlUrl = options.graphqlUrl ?? GRAPHQL_URL;
  const auth = new TtdDirectTokenAuthAdapter(options.token ?? TEST_TTD_TOKEN, graphqlUrl);
  const services = createSessionServices(
    auth,
    {
      baseUrl: options.baseUrl ?? REST_BASE_URL,
      graphqlUrl,
      reportPollIntervalMs: 1,
      reportMaxPollAttempts: 3,
    },
    pino({ level: "silent" }),
    rateLimiter
  );
  sessionServiceStore.set(sessionId, services);
  return {
    sessionId,
    services,
    rateLimiter,
    quotaKey: services.ttdService.bulkCapacityCheck("probe", 1, [1]).buckets[0]!.key,
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
