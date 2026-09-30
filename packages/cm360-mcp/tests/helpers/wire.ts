// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-level test kit (#236). Stubs ONLY the global `fetch` — the transport
 * `fetchWithTimeout` calls — so everything above it (tool logic, CM360Service,
 * CM360ReportingService, CM360HttpClient's URL/header/body construction,
 * `executeWithRetry`, the real Google OAuth2 refresh adapter, the package's
 * real `RateLimiter`) runs as in production, and the test asserts the request
 * that would actually leave the process.
 *
 * A test against a mocked CM360HttpClient can only prove the code agrees with
 * itself about the path and the object it hands the client; this records what
 * dfareporting would receive.
 */

import { vi } from "vitest";
import pino from "pino";
import {
  createGoogleAuthAdapter,
  getCredentialFingerprint,
  type OAuth2RefreshCredentials,
} from "@cesteral/shared";
import { mcpConfig } from "../../src/config/index.js";
import { rateLimiter } from "../../src/utils/platform.js";
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

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const CM360_HOST = "dfareporting.googleapis.com";
export const TEST_ACCESS_TOKEN = "ya29.cm360-wire-test-token";

export const TEST_CREDENTIALS: OAuth2RefreshCredentials = {
  type: "oauth2",
  clientId: "client-id.apps.googleusercontent.com",
  clientSecret: "client-secret",
  refreshToken: "1//refresh-token",
};

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
  /** Requests to a given host. */
  to(host: string): WireRequest[];
  /** Add a route; later routes take precedence over earlier ones. */
  route(route: WireRoute): void;
  restore(): void;
}

/**
 * Replace `globalThis.fetch` with a recorder. Unmatched requests get `200 {}`.
 * Google's OAuth2 token endpoint is pre-routed so the real refresh-token
 * adapter works.
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

export interface WireSession {
  sessionId: string;
  services: SessionServices;
  /** The limiter key every call of this session draws on. */
  rateLimitKey: string;
  dispose(): void;
}

/**
 * Register REAL session services under a session id, as the transport does on
 * connect: the production base URL from config, the real Google OAuth2
 * refresh adapter, the session's credential fingerprint (which keys the
 * per-user quota bucket), and the package's REAL process-wide `rateLimiter`
 * (`src/utils/platform.ts`). It must be that instance, not a fresh one: the
 * bulk-capacity pre-check (`utils/bulk-capacity.ts`) reads the module
 * limiter, so a session on any other limiter would be checked against a
 * bucket it never spends. Its windows are cleared on create and dispose so
 * one test's spent tokens never throttle the next. Call after `installFetchStub()`.
 */
export async function createWireSession(sessionId = "cm360-wire-session"): Promise<WireSession> {
  rateLimiter.clear();
  const auth = createGoogleAuthAdapter(TEST_CREDENTIALS, [
    "https://www.googleapis.com/auth/dfareporting",
    "https://www.googleapis.com/auth/dfatrafficking",
  ]);
  // As the transport does: validate on session creation (one token exchange).
  await auth.validate();
  const services = createSessionServices(
    auth,
    { baseUrl: mcpConfig.cm360ApiBaseUrl },
    pino({ level: "silent" }),
    rateLimiter,
    getCredentialFingerprint(TEST_CREDENTIALS)
  );
  sessionServiceStore.set(sessionId, services);
  return {
    sessionId,
    services,
    rateLimitKey: `cm360:user:${services.cm360Service.quotaUser}`,
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
