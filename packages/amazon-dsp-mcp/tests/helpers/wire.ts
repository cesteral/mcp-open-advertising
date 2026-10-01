// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-level test kit (#236). Stubs ONLY the global `fetch` — the transport
 * `fetchWithTimeout` calls — so everything above it (tool logic,
 * AmazonDspService / AmazonDspV1Service / AmazonDspReportingService,
 * AmazonDspHttpClient's URL/header/body construction, `executeWithRetry`, the
 * real LwA refresh-token adapter and the package's real `RateLimiter`) runs as
 * in production, and the test asserts the request that would actually leave
 * the process.
 *
 * A test against a mocked AmazonDspHttpClient can only prove the code agrees
 * with itself; this records what advertising-api.amazon.com would receive.
 */

import { vi } from "vitest";
import pino from "pino";
import { mcpConfig } from "../../src/config/index.js";
import { rateLimiter } from "../../src/utils/platform.js";
import { AmazonDspRefreshTokenAdapter } from "../../src/auth/amazon-dsp-auth-adapter.js";
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
  /** The decoded fields of an `application/x-www-form-urlencoded` body. */
  form?: Record<string, string>;
  /** The body exactly as handed to fetch, as bytes (media uploads). */
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
  /** Raw (non-JSON) response body, e.g. media bytes. Takes precedence over `response`. */
  rawBody?: Uint8Array | string;
  /** Content type for `rawBody`. */
  contentType?: string;
}

export const LWA_TOKEN_HOST = "api.amazon.com";
export const ADS_HOST = new URL(mcpConfig.amazonDspApiBaseUrl).host;
export const TEST_ACCESS_TOKEN = "Atza|amazon-dsp-wire-test-token";
export const TEST_PROFILE_ID = "1234567890123456";

export const TEST_CREDENTIALS = {
  appId: "amzn1.application-oa2-client.wire",
  appSecret: "amzn1.oa2-cs.v1.wire-secret",
  refreshToken: "Atzr|wire-refresh-token",
} as const;

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
  /** Every request the code sent, in order (token exchange included). */
  readonly requests: WireRequest[];
  /** Requests to a given host. */
  to(host: string): WireRequest[];
  /** Add a route; later routes take precedence over earlier ones. */
  route(route: WireRoute): void;
  restore(): void;
}

/**
 * Replace `globalThis.fetch` with a recorder. Unmatched requests get `200 {}`.
 * The LwA token endpoint is pre-routed so the real refresh-token adapter works.
 */
export function installFetchStub(routes: WireRoute[] = []): FetchStub {
  const table: WireRoute[] = [
    {
      method: "POST",
      host: LWA_TOKEN_HOST,
      path: "/auth/o2/token",
      response: { access_token: TEST_ACCESS_TOKEN, expires_in: 3600, token_type: "bearer" },
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
      const headers = headersToRecord(init?.headers);
      const req: WireRequest = {
        method: (init?.method ?? "GET").toUpperCase(),
        url,
        host: parsed.host,
        path: parsed.pathname,
        query: Object.fromEntries(parsed.searchParams.entries()),
        headers,
        body: parseBody(rawBody),
        rawBody,
      };
      if (rawBody && headers["content-type"] === "application/x-www-form-urlencoded") {
        req.form = Object.fromEntries(new URLSearchParams(rawBody.toString("utf8")).entries());
      }
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
 * Register REAL session services under a session id, as stdio `index.ts` does
 * for the LwA refresh flow: the real refresh-token adapter (profile scope and
 * client id from the app credentials), the production base URL from config,
 * and the package's REAL process-wide `rateLimiter` (`src/utils/platform.ts`).
 * It must be that instance, not a fresh one: the bulk-capacity pre-check
 * (`tools/utils/bulk-capacity.ts`) reads the module limiter, so a session on
 * any other limiter would be checked against a bucket it never spends. Its
 * windows are cleared on create and dispose so one test's spent tokens never
 * throttle the next. Call after `installFetchStub()`.
 */
export function createWireSession(sessionId = "amazon-dsp-wire-session"): WireSession {
  rateLimiter.clear();
  const auth = new AmazonDspRefreshTokenAdapter(
    { ...TEST_CREDENTIALS },
    TEST_PROFILE_ID,
    mcpConfig.amazonDspApiBaseUrl
  );
  const services = createSessionServices(
    auth,
    {
      baseUrl: mcpConfig.amazonDspApiBaseUrl,
      reportPollIntervalMs: mcpConfig.amazonDspReportPollIntervalMs,
      reportMaxPollAttempts: mcpConfig.amazonDspReportMaxPollAttempts,
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
