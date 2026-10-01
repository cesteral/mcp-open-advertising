// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-level test kit (#236). Stubs ONLY the global `fetch` — the transport
 * `fetchWithTimeout` calls — so everything above it (tool logic, MsAdsService,
 * MsAdsHttpClient's URL/header/body construction, `executeWithRetry`, the real
 * access-token adapter, a real `RateLimiter`) runs as in production, and the
 * test asserts the request that would actually leave the process.
 *
 * A test against a mocked `MsAdsHttpClient` can only prove the code agrees with
 * itself about the path and the object it hands the client; this records the
 * method, URL, headers and serialized body Microsoft Advertising would receive.
 */

import { vi } from "vitest";
import pino from "pino";
import { createPlatformRateLimiter, type RateLimiter } from "@cesteral/shared";
import { mcpConfig } from "../../src/config/index.js";
import { MsAdsAccessTokenAdapter } from "../../src/auth/msads-auth-adapter.js";
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

export const CAMPAIGN_HOST = "campaign.api.bingads.microsoft.com";
export const REPORTING_HOST = "reporting.api.bingads.microsoft.com";
export const CUSTOMER_HOST = "clientcenter.api.bingads.microsoft.com";

export const TEST_CREDENTIALS = {
  accessToken: "EwBwA-wire-test-token",
  developerToken: "DEV-TOKEN-1",
  customerId: "123456",
  accountId: "900",
  userId: 555,
} as const;

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
  /** Requests whose method is not a Microsoft "read" (POST …/Query*, GenerateReport/Poll excluded). */
  writes(): WireRequest[];
  /** Add a route; later routes take precedence over earlier ones. */
  route(route: WireRoute): void;
  restore(): void;
}

/** Microsoft Ads v13 JSON reads are POSTs to a `…/Query…` path (plus Account/Query). */
export function isMsAdsReadPath(path: string): boolean {
  return /\/Query[A-Za-z]*$/.test(path) || path.endsWith("/GenerateReport/Poll");
}

/**
 * Replace `globalThis.fetch` with a recorder. Unmatched requests get `200 {}`.
 * Customer Management `User/Query` (session validation) and `Account/Query`
 * (account currency) are pre-routed.
 */
export function installFetchStub(routes: WireRoute[] = []): FetchStub {
  const table: WireRoute[] = [
    {
      method: "POST",
      path: "/CustomerManagement/v13/User/Query",
      // basis: customer-management-service/getuser.md Response JSON ({ User: { Id }, CustomerRoles }).
      response: { User: { Id: TEST_CREDENTIALS.userId }, CustomerRoles: [] },
    },
    {
      method: "POST",
      path: "/CustomerManagement/v13/Account/Query",
      response: { Account: { Id: Number(TEST_CREDENTIALS.accountId), CurrencyCode: "EUR" } },
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
    writes: () => requests.filter((r) => !isMsAdsReadPath(r.path)),
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
 * Register REAL session services under a session id, as the transport does on
 * connect: production base URLs from config, the real access-token adapter
 * (validated over the stub, so the per-user quota key carries a real UserId),
 * and a fresh instance of the package's real limiter (`msads:*` at the
 * configured per-minute limit) so one test's spent tokens never throttle the next.
 * Call after `installFetchStub()`.
 */
export async function createWireSession(sessionId = "wire-session"): Promise<WireSession> {
  const rateLimiter = createPlatformRateLimiter("msads", mcpConfig.msadsRateLimitPerMinute);
  const auth = new MsAdsAccessTokenAdapter(
    TEST_CREDENTIALS.accessToken,
    TEST_CREDENTIALS.developerToken,
    TEST_CREDENTIALS.customerId,
    TEST_CREDENTIALS.accountId,
    mcpConfig.msadsCustomerApiBaseUrl
  );
  await auth.validate();
  const services = createSessionServices(
    auth,
    {
      campaignApiBaseUrl: mcpConfig.msadsCampaignApiBaseUrl,
      reportingApiBaseUrl: mcpConfig.msadsReportingApiBaseUrl,
      customerApiBaseUrl: mcpConfig.msadsCustomerApiBaseUrl,
      reportPollIntervalMs: mcpConfig.msadsReportPollIntervalMs,
      reportMaxPollAttempts: mcpConfig.msadsReportMaxPollAttempts,
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

/** An sdkContext whose client accepts every confirmation prompt. */
export function acceptingSdkContext(sessionId: string) {
  return {
    sessionId,
    elicitInput: vi.fn().mockResolvedValue({ action: "accept", content: { confirm: true } }),
  };
}
