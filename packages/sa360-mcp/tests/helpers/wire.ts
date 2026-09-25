// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-level test kit (#236). Stubs ONLY the global `fetch` — the transport
 * `fetchWithTimeout` calls — so everything above it (tool logic, services, the
 * HTTP clients' URL/header/body construction, `executeWithRetry`, the real
 * OAuth adapter, the real `RateLimiter`) runs as in production, and the test
 * asserts the request that would actually leave the process.
 *
 * A test against a self-authored service mock can only prove the code agrees
 * with itself; this records what the platform would receive.
 */

import { vi } from "vitest";
import pino from "pino";
import {
  createPlatformRateLimiter,
  PLATFORM_RATE_LIMIT_MAX_WAIT_MS,
  PLATFORM_RATE_LIMIT_WINDOW_MS,
  type RateLimiter,
} from "@cesteral/shared";
import { mcpConfig } from "../../src/config/index.js";
import { SA360RefreshTokenAuthAdapter } from "../../src/auth/sa360-auth-adapter.js";
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
}

export interface WireRoute {
  method?: string;
  /** Exact pathname, or a pattern tested against the pathname. */
  path: string | RegExp;
  status?: number;
  response?: unknown | ((req: WireRequest) => unknown);
}

/** Google's OAuth2 token endpoint — the adapter's refresh-token exchange. */
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const TEST_ACCESS_TOKEN = "ya29.wire-test-token";

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(new Headers(headers).entries());
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (body === undefined || body === null) return undefined;
  const text = typeof body === "string" ? body : String(body);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface FetchStub {
  /** Every request the code sent, in order (token exchange included). */
  readonly requests: WireRequest[];
  /** Requests to a given host (e.g. the platform API, excluding OAuth). */
  to(host: string): WireRequest[];
  /** Add a route; later routes take precedence over earlier ones. */
  route(route: WireRoute): void;
  restore(): void;
}

/**
 * Replace `globalThis.fetch` with a recorder. Unmatched requests get `200 {}`.
 * The Google token endpoint is pre-routed so the real refresh-token adapter works.
 */
export function installFetchStub(routes: WireRoute[] = []): FetchStub {
  const table: WireRoute[] = [
    {
      method: "POST",
      path: "/token",
      response: { access_token: TEST_ACCESS_TOKEN, expires_in: 3600, token_type: "Bearer" },
    },
    ...routes,
  ];
  const requests: WireRequest[] = [];

  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const parsed = new URL(url);
      const req: WireRequest = {
        method: (init?.method ?? "GET").toUpperCase(),
        url,
        host: parsed.host,
        path: parsed.pathname,
        query: Object.fromEntries(parsed.searchParams.entries()),
        headers: headersToRecord(init?.headers),
        body: parseBody(init?.body),
      };
      requests.push(req);

      const match = [...table].reverse().find((r) => {
        if (r.method && r.method.toUpperCase() !== req.method) return false;
        return typeof r.path === "string" ? r.path === req.path : r.path.test(req.path);
      });
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

/**
 * The package's real limiter shape (`src/utils/platform.ts`): `sa360:*` at the
 * configured v0 limit, `sa360:v2:*` at the v2 limit. A fresh instance per test
 * so one test's spent tokens never throttle the next.
 */
export function createSa360TestRateLimiter(): RateLimiter {
  const limiter = createPlatformRateLimiter("sa360", mcpConfig.sa360RateLimitPerMinute);
  limiter.configure(
    "sa360:v2:*",
    mcpConfig.sa360V2RateLimitPerMinute,
    PLATFORM_RATE_LIMIT_WINDOW_MS,
    { maxWaitMs: PLATFORM_RATE_LIMIT_MAX_WAIT_MS }
  );
  return limiter;
}

export interface WireSession {
  sessionId: string;
  services: SessionServices;
  rateLimiter: RateLimiter;
  dispose(): void;
}

/**
 * Register REAL session services (production base URLs from config, real OAuth
 * adapter, real limiter) under a session id, as the transport does on connect.
 */
export function createWireSession(sessionId = "wire-session"): WireSession {
  const rateLimiter = createSa360TestRateLimiter();
  const auth = new SA360RefreshTokenAuthAdapter({
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
    loginCustomerId: "1112223333",
  });
  const services = createSessionServices(
    auth,
    { baseUrl: mcpConfig.sa360ApiBaseUrl, v2BaseUrl: mcpConfig.sa360V2ApiBaseUrl },
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
      rateLimiter.destroy();
    },
  };
}
