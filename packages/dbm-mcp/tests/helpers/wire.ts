// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-level test kit (#236) for dbm-mcp.
 *
 * dbm-mcp talks to Google over TWO transports, so a stub of `globalThis.fetch`
 * alone — the layer every other package's wire kit replaces — would not see a
 * single Bid Manager call:
 *
 *   1. The Bid Manager API calls go through the `googleapis` client →
 *      googleapis-common → gaxios 7 → `Gaxios.#getFetch()`, which in Node
 *      (no `window`) dynamically imports **node-fetch v3**, not the global
 *      fetch (node_modules/gaxios/build/cjs/src/gaxios.js `#getFetch`).
 *      node-fetch sends through `(https|http).request` resolved on the
 *      `node:https` module object at call time (node-fetch/src/index.js
 *      `const send = (…https : http).request`). That is the lowest layer the
 *      requests actually reach, so this kit replaces `https.request` there.
 *      Everything above it — BidManagerService, the googleapis method's URL
 *      template and parameter handling, gaxios' serialization and headers,
 *      the OAuth2Client + auth bridge — runs as in production.
 *   2. The shared OAuth2 refresh adapter's token exchange
 *      (`fetchWithTimeout`) and BidManagerService's report download
 *      (`fetch(gcsPath)`) use the global fetch, which is stubbed as elsewhere.
 *
 * Both record into one ordered list, tagged with the transport that carried
 * each request. Nothing reaches the network: an unmatched request on either
 * transport gets `200 {}`.
 */

import https from "node:https";
import { PassThrough, Writable } from "node:stream";
import { vi } from "vitest";
import pino from "pino";
import { createGoogleAuthAdapter } from "@cesteral/shared";
import { mcpConfig } from "../../src/config/index.js";
import { rateLimiter } from "../../src/utils/platform.js";
import {
  createSessionServices,
  sessionServiceStore,
  type SessionServices,
} from "../../src/services/session-services.js";

export interface WireRequest {
  /** Which transport carried it: googleapis/gaxios/node-fetch, or the global fetch. */
  transport: "node:https" | "fetch";
  method: string;
  url: string;
  host: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  /** Parsed JSON body; the raw string when it is not JSON; undefined when empty. */
  body: unknown;
  /** The decoded fields of an `application/x-www-form-urlencoded` body. */
  form?: Record<string, string>;
}

export interface WireRoute {
  method?: string;
  /** Host to match; any host when omitted. */
  host?: string;
  /** Exact pathname, or a pattern tested against the pathname. */
  path: string | RegExp;
  status?: number;
  /** JSON response payload, or a function of the request. */
  response?: unknown | ((req: WireRequest) => unknown);
  /** Raw (non-JSON) response body, e.g. a report CSV. Takes precedence over `response`. */
  rawBody?: string;
  contentType?: string;
}

export const DBM_HOST = "doubleclickbidmanager.googleapis.com";
export const TOKEN_HOST = "oauth2.googleapis.com";
export const TEST_ACCESS_TOKEN = "ya29.dbm-wire-test-token";
export const TEST_CREDENTIALS = {
  type: "oauth2",
  clientId: "dbm-client.apps.googleusercontent.com",
  clientSecret: "dbm-client-secret",
  refreshToken: "1//dbm-refresh-token",
} as const;

function lowerHeaders(headers: unknown): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
  }
  return out;
}

function decode(raw: string, contentType: string | undefined): Pick<WireRequest, "body" | "form"> {
  if (raw === "") return { body: undefined };
  if (contentType?.startsWith("application/x-www-form-urlencoded")) {
    return { body: raw, form: Object.fromEntries(new URLSearchParams(raw).entries()) };
  }
  try {
    return { body: JSON.parse(raw) };
  } catch {
    return { body: raw };
  }
}

export interface WireStub {
  /** Every request, in the order it was sent, across both transports. */
  readonly requests: WireRequest[];
  to(host: string): WireRequest[];
  /** Add a route; later routes take precedence over earlier ones. */
  route(route: WireRoute): void;
  restore(): void;
}

export function installWireStub(routes: WireRoute[] = []): WireStub {
  const table: WireRoute[] = [
    {
      method: "POST",
      host: TOKEN_HOST,
      path: "/token",
      response: { access_token: TEST_ACCESS_TOKEN, expires_in: 3600, token_type: "Bearer" },
    },
    ...routes,
  ];
  const requests: WireRequest[] = [];

  function record(
    transport: WireRequest["transport"],
    method: string,
    url: string,
    headers: Record<string, string>,
    raw: string
  ): { req: WireRequest; match: WireRoute | undefined } {
    const parsed = new URL(url);
    const req: WireRequest = {
      transport,
      method: method.toUpperCase(),
      url,
      host: parsed.host,
      path: parsed.pathname,
      query: Object.fromEntries(parsed.searchParams.entries()),
      headers,
      ...decode(raw, headers["content-type"]),
    };
    requests.push(req);
    const match = [...table].reverse().find((r) => {
      if (r.method && r.method.toUpperCase() !== req.method) return false;
      if (r.host && r.host !== req.host) return false;
      return typeof r.path === "string" ? r.path === req.path : r.path.test(req.path);
    });
    return { req, match };
  }

  function responseOf(req: WireRequest, match: WireRoute | undefined) {
    if (match?.rawBody !== undefined) {
      return {
        status: match.status ?? 200,
        body: match.rawBody,
        contentType: match.contentType ?? "text/plain",
      };
    }
    const payload =
      typeof match?.response === "function"
        ? (match.response as (r: WireRequest) => unknown)(req)
        : (match?.response ?? {});
    return {
      status: match?.status ?? 200,
      body: JSON.stringify(payload),
      contentType: "application/json",
    };
  }

  // Transport 1: node-fetch → https.request (googleapis / gaxios).
  const httpsSpy = vi.spyOn(https, "request").mockImplementation(((
    url: string | URL,
    options: { method?: string; headers?: Record<string, unknown> }
  ) => {
    const chunks: Buffer[] = [];
    const clientRequest = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
    }) as Writable & { setTimeout(): unknown; abort(): void };
    clientRequest.setTimeout = () => clientRequest;
    clientRequest.abort = () => undefined;
    clientRequest.on("finish", () => {
      const headers = lowerHeaders(options.headers);
      const { req, match } = record(
        "node:https",
        options.method ?? "GET",
        String(url),
        headers,
        Buffer.concat(chunks).toString("utf8")
      );
      const res = responseOf(req, match);
      const incoming = Object.assign(new PassThrough(), {
        statusCode: res.status,
        statusMessage: res.status === 200 ? "OK" : "Error",
        headers: { "content-type": res.contentType },
        rawHeaders: ["Content-Type", res.contentType],
      });
      process.nextTick(() => {
        clientRequest.emit("response", incoming);
        incoming.end(res.body);
      });
    });
    return clientRequest;
  }) as unknown as typeof https.request);

  // Transport 2: the global fetch (token exchange, report download).
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const headers = lowerHeaders(init?.headers);
      const raw = init?.body === undefined || init.body === null ? "" : String(init.body);
      const { req, match } = record("fetch", init?.method ?? "GET", url, headers, raw);
      const res = responseOf(req, match);
      return new Response(res.body, {
        status: res.status,
        headers: { "content-type": res.contentType },
      });
    });

  return {
    requests,
    to: (host) => requests.filter((r) => r.host === host),
    route: (r) => table.push(r),
    restore: () => {
      httpsSpy.mockRestore();
      fetchSpy.mockRestore();
    },
  };
}

export interface WireSession {
  sessionId: string;
  services: SessionServices;
  dispose(): void;
}

/**
 * Register REAL session services under a session id, as the transports do:
 * the shared OAuth2 refresh-token adapter (as `createGoogleAuthAdapter`
 * builds it for oauth2 credentials), the googleapis `doubleclickbidmanager`
 * v2 client behind the auth bridge, `mcpConfig`, and the package's REAL
 * process-wide `rateLimiter` (`src/utils/platform.ts`) — the instance both
 * `index.ts` and the HTTP transport hand every session. Its windows are
 * cleared on create and dispose so one test's spent tokens never throttle the
 * next. Call after `installWireStub()`.
 */
export function createWireSession(sessionId = "dbm-wire-session"): WireSession {
  rateLimiter.clear();
  const auth = createGoogleAuthAdapter({ ...TEST_CREDENTIALS }, [
    "https://www.googleapis.com/auth/doubleclickbidmanager",
  ]);
  const services = createSessionServices(auth, mcpConfig, pino({ level: "silent" }), rateLimiter);
  sessionServiceStore.set(sessionId, services);
  return {
    sessionId,
    services,
    dispose: () => {
      sessionServiceStore.delete(sessionId);
      rateLimiter.clear();
    },
  };
}

export { rateLimiter };
