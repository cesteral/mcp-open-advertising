// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-level test kit (#236 direction). Stubs ONLY the global `fetch` — the
 * transport `fetchWithTimeout` calls — so everything above it (tool logic,
 * services, TikTokHttpClient URL/header/body construction, `executeWithRetry`,
 * the real `RateLimiter`) runs as in production, and a test asserts the
 * requests that would actually leave the process — or that none do.
 */

import { vi } from "vitest";
import pino from "pino";
import { createPlatformRateLimiter, type RateLimiter } from "@cesteral/shared";
import { mcpConfig } from "../../src/config/index.js";
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
}

export interface WireRoute {
  method?: string;
  /** Exact pathname, or a pattern tested against the pathname. */
  path: string | RegExp;
  status?: number;
  /** The `data` of TikTok's `{ code: 0, message: "OK", data }` envelope. */
  data?: unknown;
}

export const TEST_ACCESS_TOKEN = "tiktok-wire-test-token";
export const TEST_ADVERTISER_ID = "7000000000000000001";

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
  /** Every request the code sent, in order. */
  readonly requests: WireRequest[];
  restore(): void;
}

/**
 * Replace `globalThis.fetch` with a recorder that answers in TikTok's envelope.
 * Unmatched requests get `{ code: 0, message: "OK", data: {} }`.
 */
export function installFetchStub(routes: WireRoute[] = []): FetchStub {
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

      const match = [...routes].reverse().find((r) => {
        if (r.method && r.method.toUpperCase() !== req.method) return false;
        return typeof r.path === "string" ? r.path === req.path : r.path.test(req.path);
      });
      return new Response(JSON.stringify({ code: 0, message: "OK", data: match?.data ?? {} }), {
        status: match?.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    });

  return { requests, restore: () => spy.mockRestore() };
}

export interface WireSession {
  sessionId: string;
  services: SessionServices;
  rateLimiter: RateLimiter;
  dispose(): void;
}

/**
 * Register REAL session services (production base URL and API version from
 * config, a real access-token adapter, a fresh real limiter shaped like
 * `src/utils/platform.ts`) under a session id, as the transport does on connect.
 */
export function createWireSession(sessionId = "wire-session"): WireSession {
  const rateLimiter = createPlatformRateLimiter("tiktok", mcpConfig.tiktokRateLimitPerMinute);
  const auth = new TikTokAccessTokenAdapter(
    TEST_ACCESS_TOKEN,
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
    dispose: () => {
      sessionServiceStore.delete(sessionId);
      rateLimiter.destroy();
    },
  };
}
