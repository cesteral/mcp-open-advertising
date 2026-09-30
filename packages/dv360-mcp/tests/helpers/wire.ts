// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-level test kit (#236). Stubs ONLY the global `fetch` — the transport
 * `fetchWithTimeout` calls — so everything above it (tool logic, DV360Service,
 * TargetingService, DV360HttpClient's URL/header/body construction,
 * `executeWithRetry`, the real Google OAuth2 refresh adapter, a real
 * `RateLimiter`) runs as in production, and the test asserts the request that
 * would actually leave the process.
 *
 * A test against a mocked DV360Service / DV360HttpClient can only prove the
 * code agrees with itself about the path and the object it hands the client;
 * this records what displayvideo.googleapis.com would receive.
 */

import { vi } from "vitest";
import pino from "pino";
import {
  createGoogleAuthAdapter,
  createPlatformRateLimiter,
  type OAuth2RefreshCredentials,
  type RateLimiter,
} from "@cesteral/shared";
import { mcpConfig } from "../../src/config/index.js";
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
  /** The body exactly as handed to fetch, as bytes (multipart / media uploads). */
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
  /** Raw (non-JSON) response body, e.g. image bytes. Takes precedence over `response`. */
  rawBody?: Uint8Array | string;
  /** Content type for `rawBody`. */
  contentType?: string;
}

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const DV360_HOST = "displayvideo.googleapis.com";
export const TEST_ACCESS_TOKEN = "ya29.dv360-wire-test-token";

export const TEST_CREDENTIALS: OAuth2RefreshCredentials = {
  type: "oauth2",
  clientId: "client-id.apps.googleusercontent.com",
  clientSecret: "client-secret",
  refreshToken: "1//refresh-token",
};

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
 * Google's OAuth2 token endpoint is pre-routed so the real refresh-token
 * adapter works.
 */
export function installFetchStub(routes: WireRoute[] = []): FetchStub {
  const table: WireRoute[] = [
    {
      method: "POST",
      host: "oauth2.googleapis.com",
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
  rateLimiter: RateLimiter;
  dispose(): void;
}

/**
 * Register REAL session services under a session id, as the transport's
 * `createSessionForAuth` does on connect: the real Google OAuth2 refresh
 * adapter (validated once, as the transport does), the production base URL
 * from config, and a fresh instance of the package's real limiter (`dv360:*`
 * at the configured per-minute limit, the shape `src/utils/platform.ts`
 * builds). A fresh instance is faithful here because every bulk-capacity
 * pre-check reads the SESSION's limiter (`DV360Service.bulkCapacityChecks`),
 * and it keeps one test's spent tokens from throttling the next. Call after
 * `installFetchStub()`.
 */
export async function createWireSession(sessionId = "dv360-wire-session"): Promise<WireSession> {
  const rateLimiter = createPlatformRateLimiter("dv360", mcpConfig.dv360RateLimitPerMinute);
  const auth = createGoogleAuthAdapter(TEST_CREDENTIALS, [
    "https://www.googleapis.com/auth/display-video",
  ]);
  await auth.validate();
  const services = createSessionServices(
    auth,
    { baseUrl: mcpConfig.dv360ApiBaseUrl },
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

/** An sdkContext whose client accepts every confirmation prompt. */
export function acceptingSdkContext(sessionId: string) {
  return {
    sessionId,
    elicitInput: vi.fn().mockResolvedValue({ action: "accept", content: { confirm: true } }),
  };
}
