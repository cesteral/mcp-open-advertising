// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-level test kit (#236). Stubs ONLY the global `fetch` — the transport
 * `fetchWithTimeout` calls — so everything above it (tool logic,
 * PinterestService, PinterestReportingService, PinterestHttpClient's
 * URL/header/body construction, `executeWithRetry`, the real access-token
 * adapter and the package's real `RateLimiter`) runs as in production, and the
 * test asserts the request that would actually leave the process.
 *
 * A test against a mocked PinterestHttpClient can only prove the code agrees
 * with itself about the path and the object it hands the client; this records
 * what api.pinterest.com would receive.
 */

import { vi } from "vitest";
import pino from "pino";
import { mcpConfig } from "../../src/config/index.js";
import { rateLimiter } from "../../src/utils/platform.js";
import { PinterestAccessTokenAdapter } from "../../src/auth/pinterest-auth-adapter.js";
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
  /** JSON response payload (serialized), or a function of the request. */
  response?: unknown | ((req: WireRequest) => unknown);
  /** Raw (non-JSON) response body, e.g. video bytes or a CSV. Takes precedence over `response`. */
  rawBody?: Uint8Array | string;
  /** Content type for `rawBody`. */
  contentType?: string;
}

export const PINTEREST_HOST = "api.pinterest.com";
export const TEST_ACCESS_TOKEN = "pina_wire-test-token";
export const AD_ACCOUNT_ID = "549755885175";

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
  /** Every request the code sent, in order (the adapter's validation call included). */
  readonly requests: WireRequest[];
  /** Requests to a given host. */
  to(host: string): WireRequest[];
  /** Add a route; later routes take precedence over earlier ones. */
  route(route: WireRoute): void;
  restore(): void;
}

/**
 * Replace `globalThis.fetch` with a recorder. Unmatched requests get `200 {}`.
 * `GET /v5/user_account` is pre-routed so the real access-token adapter's
 * `validate()` succeeds.
 */
export function installFetchStub(routes: WireRoute[] = []): FetchStub {
  const table: WireRoute[] = [
    {
      method: "GET",
      host: PINTEREST_HOST,
      path: "/v5/user_account",
      response: { username: "wire-user", account_type: "BUSINESS" },
    },
    ...routes,
  ];
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
      const payload =
        typeof match?.response === "function"
          ? (match.response as (r: WireRequest) => unknown)(req)
          : (match?.response ?? {});
      return new Response(JSON.stringify(payload), {
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
  dispose(): void;
}

/**
 * Register REAL session services under a session id, as the HTTP transport's
 * `createSessionForAuth` does on connect: the real access-token adapter
 * (validated once, as the auth strategy does), the production base URL and
 * API version from config, and the package's REAL process-wide `rateLimiter`
 * (`src/utils/platform.ts`). It must be that instance, not a fresh one: the
 * bulk-capacity pre-check (`tools/utils/bulk-capacity.ts`) reads the module
 * limiter, so a session on any other limiter would be checked against a bucket
 * it never spends. Its windows are cleared on create and dispose so one test's
 * spent tokens never throttle the next.
 *
 * The report poll interval is 1 ms instead of the configured 2 s so the
 * submit → poll → download chain does not sleep; it changes timing only, not
 * any request. Call after `installFetchStub()`.
 */
export async function createWireSession(
  sessionId = "pinterest-wire-session"
): Promise<WireSession> {
  rateLimiter.clear();
  const auth = new PinterestAccessTokenAdapter(
    TEST_ACCESS_TOKEN,
    AD_ACCOUNT_ID,
    mcpConfig.pinterestApiBaseUrl
  );
  await auth.validate();
  const services = createSessionServices(
    auth,
    {
      baseUrl: mcpConfig.pinterestApiBaseUrl,
      apiVersion: mcpConfig.pinterestApiVersion,
      reportPollIntervalMs: 1,
      reportMaxPollAttempts: mcpConfig.pinterestReportMaxPollAttempts,
    },
    pino({ level: "silent" }),
    rateLimiter
  );
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

/** An sdkContext whose client accepts every confirmation prompt. */
export function acceptingSdkContext(sessionId: string) {
  return {
    sessionId,
    elicitInput: vi.fn().mockResolvedValue({ action: "accept", content: { confirm: true } }),
  };
}

export { rateLimiter };
