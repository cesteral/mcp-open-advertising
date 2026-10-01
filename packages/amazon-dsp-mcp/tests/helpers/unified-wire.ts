// Copyright (c) Cesteral AB. Licensed under the Apache License, Version 2.0.
// See LICENSE.md in the project root for full license terms.

/**
 * Wire-level test kit for the Unified API entity surface (#234), modelled on
 * packages/gads-mcp/tests/helpers/wire.ts. Stubs ONLY `globalThis.fetch` —
 * the transport `fetchWithTimeout` calls — so everything above it (tool
 * logic, AmazonDspService, AmazonDspHttpClient's URL/header/body
 * construction, `executeWithRetry`, the real LwA refresh-token adapter, the
 * package's real `RateLimiter`) runs as in production, and the tests assert
 * the request that would actually leave the process.
 *
 * The Unified routes answer with the response shapes unified-api-dsp.json
 * declares (amzn/ads-advanced-tools-docs @
 * e25aace0ec07997c113dac48f333298472243558): `query/*` → 200
 * `DSP<Entity>SuccessResponse` `{ <resource>: [...], nextToken? }`; every
 * write → 207 `DSP<Entity>MultiStatusResponse`
 * `{ success: [{ index, <item> }], error: [] }`.
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
}

export interface WireRoute {
  method?: string;
  host?: string;
  /** Exact pathname, or a pattern tested against the pathname. */
  path: string | RegExp;
  status?: number;
  response?: unknown | ((req: WireRequest) => unknown);
}

export const LWA_TOKEN_HOST = "api.amazon.com";
export const ADS_HOST = "advertising-api.amazon.com";
export const TEST_ACCESS_TOKEN = "Atza|amazon-dsp-unified-wire-token";
export const TEST_PROFILE_ID = "1234567890";
export const TEST_ACCOUNT_ID = "5550001112223";
export const TEST_CREDENTIALS = {
  appId: "amzn1.application-oa2-client.unified-wire",
  appSecret: "unified-wire-secret",
  refreshToken: "Atzr|unified-wire-refresh",
} as const;

/** Unified resource → [multi-status item key, id field] (unified-api-dsp.json). */
export const UNIFIED_ITEM: Record<string, [string, string]> = {
  campaigns: ["campaign", "campaignId"],
  adGroups: ["adGroup", "adGroupId"],
  ads: ["ad", "adId"],
  targets: ["target", "targetId"],
  adAssociations: ["adAssociation", "adAssociationId"],
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

/**
 * Default Unified answer: a query echoes the id filter as entities carrying
 * `seed` fields; a write echoes item 0 as the 207 success entry, with a
 * minted id on create.
 */
export function unifiedResponder(seed: Record<string, unknown> = {}) {
  return (req: WireRequest): unknown => {
    const [, , , action, resource] = req.path.split("/");
    const [itemKey, idField] = UNIFIED_ITEM[resource] ?? ["item", "id"];
    const body = (req.body ?? {}) as Record<string, any>;
    if (action === "query") {
      const idFilter = Object.keys(body).find((k) => k === `${idField}Filter`);
      const ids: string[] = idFilter ? body[idFilter].include : [];
      return { [resource]: ids.map((id) => ({ [idField]: id, ...seed })) };
    }
    if (action === "delete") {
      const ids: string[] = body[`${idField}s`] ?? [];
      return {
        success: ids.map((id, index) => ({
          index,
          [itemKey]: { [idField]: id, state: "ARCHIVED" },
        })),
        error: [],
      };
    }
    const item = (body[resource] ?? [])[0] ?? {};
    return {
      success: [
        {
          index: 0,
          [itemKey]: action === "create" ? { [idField]: `new-${resource}-1`, ...item } : item,
        },
      ],
      error: [],
    };
  };
}

export interface FetchStub {
  readonly requests: WireRequest[];
  /** Requests to the Amazon Ads API host (LwA token exchange excluded). */
  api(): WireRequest[];
  route(route: WireRoute): void;
  restore(): void;
}

/**
 * Replace `globalThis.fetch` with a recorder. LwA's token endpoint and every
 * `/adsApi/v1/*` path are pre-routed; unmatched requests get `200 {}`.
 */
export function installFetchStub(routes: WireRoute[] = []): FetchStub {
  const table: WireRoute[] = [
    {
      method: "POST",
      host: LWA_TOKEN_HOST,
      path: "/auth/o2/token",
      response: { access_token: TEST_ACCESS_TOKEN, expires_in: 3600, token_type: "bearer" },
    },
    {
      method: "POST",
      host: ADS_HOST,
      path: /^\/adsApi\/v1\/(query|create|update|delete)\//,
      response: unifiedResponder(),
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
        body: parseBody(init?.body as BodyInit | null | undefined),
      };
      requests.push(req);

      const match = [...table].reverse().find((r) => {
        if (r.method && r.method.toUpperCase() !== req.method) return false;
        if (r.host && r.host !== req.host) return false;
        return typeof r.path === "string" ? r.path === req.path : r.path.test(req.path);
      });
      const payload =
        typeof match?.response === "function"
          ? (match.response as (r: WireRequest) => unknown)(req)
          : (match?.response ?? {});
      const status =
        match?.status ?? (/^\/adsApi\/v1\/(create|update|delete)\//.test(req.path) ? 207 : 200);
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    });

  return {
    requests,
    api: () => requests.filter((r) => r.host === ADS_HOST),
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
 * Register REAL session services under a session id, as the transport does on
 * connect: the configured production base URL, the real LwA refresh-token
 * adapter, and the package's real module-level limiter (the one `index.ts`
 * hands the transport and the bulk-capacity pre-check reads), cleared first
 * so one test's spent tokens never throttle the next. Call after
 * `installFetchStub()`.
 */
export function createWireSession(sessionId = "amazon-dsp-unified-wire"): WireSession {
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
      reportPollIntervalMs: 1,
      reportMaxPollAttempts: 1,
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
