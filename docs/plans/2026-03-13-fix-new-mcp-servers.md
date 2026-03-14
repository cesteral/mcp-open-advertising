# Fix New MCP Servers (Pinterest, Snapchat, Amazon DSP) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all copy-pasted TikTok API integration code in the three new MCP servers with correct platform-specific API endpoints, auth flows, entity mappings, and prompt/resource content.

**Architecture:** Each of the three servers (pinterest-mcp, snapchat-mcp, amazon-dsp-mcp) follows the `BearerAuthStrategyBase` pattern from `@cesteral/shared`. The auth adapter, HTTP client, entity mapping, services, prompts, and resources all need platform-specific implementations. The shared transport/session/tool-registration infrastructure remains unchanged — only the platform integration layer changes.

**Tech Stack:** TypeScript, Hono, `@cesteral/shared` (`BearerAuthStrategyBase`, `RateLimiter`, `SessionServiceStore`, `registerToolsFromDefinitions`, `formatErrorForMcp`), Zod, Pino, Vitest

---

## Background: What Went Wrong

All three servers were scaffolded by copy-pasting `tiktok-mcp` and renaming identifiers. The TikTok-specific API wiring was never replaced:

| What's wrong | All three servers |
|---|---|
| Token validation endpoint | `/open_api/v1.3/user/info/` (TikTok) |
| Token refresh endpoint | `/open_api/v1.3/oauth2/access_token/` (TikTok) |
| Response envelope parsing | `{ code: 0, data: {...} }` (TikTok shape) |
| Entity paths | `/open_api/v1.3/campaign/get/` etc. (TikTok) |
| Entity field names | `campaign_name`, `objective_type`, `budget_mode` (TikTok) |
| Prompt objectives/fields | TikTok enum values and field names |
| Test file names | `tiktok-auth-adapter.test.ts` etc. |

Additionally, Amazon DSP has a fundamentally different auth model (Login with Amazon / LwA) that requires deeper changes than just endpoint swapping.

---

## Correct API Specifications

### Pinterest Ads API v5

- **Base URL:** `https://api.pinterest.com`
- **Token validation:** `GET /v5/user_account` → `{ username, account_type }` (plain JSON, no `code` field)
- **Token refresh:** `POST https://api.pinterest.com/v5/oauth/token`
  - Content-Type: `application/x-www-form-urlencoded`
  - Auth: HTTP Basic with `client_id:client_secret`
  - Body: `grant_type=refresh_token&refresh_token={token}&scope=ads:read,ads:write`
  - Response: `{ access_token, token_type, expires_in, refresh_token?, refresh_token_expires_in, scope }`
- **Ad Accounts:** `GET /v5/ad_accounts`  → `{ items: [...], bookmark: "..." }`
- **Campaigns:**
  - List: `GET /v5/ad_accounts/{ad_account_id}/campaigns?bookmark=...&page_size=...` → `{ items: [...], bookmark }`
  - Create: `POST /v5/ad_accounts/{ad_account_id}/campaigns` body: array of campaign objects
  - Update: `PATCH /v5/ad_accounts/{ad_account_id}/campaigns` body: array (include `id` field)
  - Delete: `DELETE /v5/ad_accounts/{ad_account_id}/campaigns?campaign_ids={id1},{id2}`
  - Status update: `PATCH /v5/ad_accounts/{ad_account_id}/campaigns` (set `status` field)
  - Fields: `id`, `name`, `status` (`ACTIVE`/`PAUSED`/`ARCHIVED`), `objective_type`, `daily_spend_cap`, `lifetime_spend_cap`
  - Objectives: `AWARENESS`, `CONSIDERATION`, `VIDEO_VIEW`, `CATALOG_SALES`, `CONVERSIONS`, `APP_INSTALL`, `SHOPPING`
- **Ad Groups:** `GET/POST/PATCH /v5/ad_accounts/{ad_account_id}/ad_groups`
  - Delete: `DELETE /v5/ad_accounts/{ad_account_id}/ad_groups?ad_group_ids={id1}`
  - Fields: `id`, `name`, `status`, `campaign_id`, `budget_in_micro_currency`, `pacing_delivery_type`, `bid_strategy_type`, `targeting_spec`
- **Ads:** `GET/POST/PATCH /v5/ad_accounts/{ad_account_id}/ads`
  - Delete: `DELETE /v5/ad_accounts/{ad_account_id}/ads?ad_ids={id1}`
  - Fields: `id`, `name`, `status`, `ad_group_id`, `creative_type`, `pin_id`
- **Creatives (Pins):** `GET /v5/pins/{pin_id}`, `POST /v5/pins`
  - Fields: `id`, `title`, `description`, `media`, `link`
- **Pagination:** cursor-based via `bookmark` param (not page number)
- **Budget units:** micro-currency (1 USD = 1,000,000 micro). `daily_spend_cap` and `budget_in_micro_currency`

### Snapchat Ads API v1

- **Base URL:** `https://adsapi.snapchat.com/v1`
- **Token validation:** `GET /v1/me` → `{ request_status: "SUCCESS", me: { id, display_name, email } }`
- **Token refresh:** `POST https://accounts.snapchat.com/login/oauth2/access_token`
  - Content-Type: `application/x-www-form-urlencoded`
  - Body: `grant_type=refresh_token&client_id={id}&client_secret={secret}&refresh_token={token}`
  - Response: `{ access_token, token_type, expires_in, refresh_token, scope }`
- **Organizations:** `GET /v1/me/organizations` → `{ request_status: "SUCCESS", organizations: [{ organization: {...} }] }`
- **Ad Accounts:** `GET /v1/organizations/{org_id}/adaccounts` → `{ adaccounts: [{ adaccount: {...} }] }`
- **Campaigns:**
  - List: `GET /v1/adaccounts/{ad_account_id}/campaigns` → `{ campaigns: [{ campaign: {...} }] }`
  - Create: `POST /v1/adaccounts/{ad_account_id}/campaigns` body: `{ campaigns: [{...}] }`
  - Update: `PUT /v1/campaigns/{campaign_id}` body: `{ campaigns: [{...}] }`
  - Delete: `DELETE /v1/campaigns/{campaign_id}`
  - Fields: `id`, `name`, `status` (`ACTIVE`/`PAUSED`), `ad_account_id`, `daily_budget_micro`, `lifetime_spend_cap_micro`, `objective`, `start_time`, `end_time`
  - Objectives: `AWARENESS`, `APP_INSTALLS`, `DRIVE_REPLAY`, `LEAD_GENERATION`, `WEBSITE_CONVERSIONS`, `PRODUCT_CATALOG_SALES`, `VIDEO_VIEWS`
- **Ad Squads** (= Ad Groups):
  - List: `GET /v1/campaigns/{campaign_id}/adsquads`
  - Create: `POST /v1/adaccounts/{ad_account_id}/adsquads`
  - Update: `PUT /v1/adsquads/{ad_squad_id}`
  - Delete: `DELETE /v1/adsquads/{ad_squad_id}`
  - Fields: `id`, `name`, `status`, `campaign_id`, `daily_budget_micro`, `bid_micro`, `optimization_goal`, `placement`, `targeting`
- **Ads:**
  - List: `GET /v1/adsquads/{ad_squad_id}/ads`
  - Create: `POST /v1/adaccounts/{ad_account_id}/ads`
  - Update: `PUT /v1/ads/{ad_id}`
  - Delete: `DELETE /v1/ads/{ad_id}`
  - Fields: `id`, `name`, `status`, `ad_squad_id`, `creative_id`, `type`
- **Creatives:**
  - List: `GET /v1/adaccounts/{ad_account_id}/creatives`
  - Create: `POST /v1/adaccounts/{ad_account_id}/creatives`
  - Update: `PUT /v1/creatives/{creative_id}`
  - Fields: `id`, `name`, `ad_account_id`, `type`, `brand_name`, `headline`, `call_to_action`
- **Response envelope:** All endpoints: `{ request_status: "SUCCESS"|"FAILED", request_id: "...", <entity_type>s: [{ sub_request_status, <entity_type>: {...} }] }`
- **Pagination:** `{ paging: { next_link?: "...", cursor?: "..." } }`
- **Budget units:** micro-currency (1 USD = 1,000,000 micro)

### Amazon DSP API

- **Base URL:** `https://advertising-api.amazon.com`
- **Auth model:** Login with Amazon (LwA) OAuth2 — fundamentally different from bearer token pattern
  - Token endpoint: `POST https://api.amazon.com/auth/o2/token`
  - Body (refresh grant): `grant_type=refresh_token&client_id={id}&client_secret={secret}&refresh_token={token}`
  - Body (client credentials): `grant_type=client_credentials&client_id={id}&client_secret={secret}&scope=advertising::campaign_management`
  - Response: `{ access_token, token_type, expires_in, refresh_token }` (standard OAuth2, NO `code` field)
  - Required headers on all API calls: `Amazon-Advertising-API-ClientId: {client_id}`, `Amazon-Advertising-API-Scope: {entity_id}` (DSP entity/profile ID)
- **Auth validation:** `GET /dsp/advertisers?startIndex=0&count=1` → `{ advertisers: [...], totalResults: N }`
- **Entity terminology differs from TikTok:**
  - "Orders" = Campaigns
  - "Line Items" = Ad Groups
  - "Creatives" = Creatives/Ads
- **Orders** (campaigns):
  - List: `GET /dsp/orders?advertiserId={id}&startIndex=0&count=10` → `{ orders: [...], totalResults: N }`
  - Create: `POST /dsp/orders` body: `{ orders: [{...}] }`
  - Update: `PUT /dsp/orders/{orderId}` body: `{...}`
  - Deactivate: `PUT /dsp/orders/{orderId}` with `{ status: "ARCHIVED" }` (no DELETE endpoint)
  - Fields: `orderId`, `name`, `advertiserId`, `budget`, `startDate`, `endDate`, `status` (`DELIVERING`/`PAUSED`/`ARCHIVED`)
- **Line Items** (ad groups):
  - List: `GET /dsp/lineItems?orderId={id}&startIndex=0&count=10`
  - Create: `POST /dsp/lineItems`
  - Update: `PUT /dsp/lineItems/{lineItemId}`
  - Fields: `lineItemId`, `name`, `orderId`, `budget`, `bidding`, `status`, `targetingCriteria`
- **Creatives:**
  - List: `GET /dsp/creatives?advertiserId={id}`
  - Create: `POST /dsp/creatives`
  - Update: `PUT /dsp/creatives/{creativeId}`
  - Fields: `creativeId`, `name`, `advertiserId`, `creativeType` (`IMAGE`/`VIDEO`/`RICH_MEDIA`), `clickThroughUrl`
- **Pagination:** `startIndex` + `count` query params (offset-based), response includes `totalResults`

---

## Phase 1: Pinterest API Migration

### Task 1: Fix Pinterest auth adapter — response types and validation endpoint

**Files:**
- Modify: `packages/pinterest-mcp/src/auth/pinterest-auth-adapter.ts`

**Context:** The adapter currently calls `/open_api/v1.3/user/info/` (TikTok endpoint) and checks `data.code !== 0` (TikTok envelope). Pinterest v5 uses `GET /v5/user_account` which returns `{ username, account_type }` with standard HTTP status codes.

**Step 1: Write a failing test**

File: `packages/pinterest-mcp/tests/auth/pinterest-auth-adapter.test.ts` (rename from `tiktok-auth-adapter.test.ts`)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PinterestAccessTokenAdapter } from "../../src/auth/pinterest-auth-adapter.js";

const mockFetch = vi.fn();
vi.mock("@cesteral/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cesteral/shared")>();
  return { ...actual, fetchWithTimeout: mockFetch };
});

describe("PinterestAccessTokenAdapter", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("validates by calling GET /v5/user_account (not TikTok endpoint)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ username: "test_user", account_type: "BUSINESS" }),
    });
    const adapter = new PinterestAccessTokenAdapter("token123", "act_123", "https://api.pinterest.com");
    await adapter.validate();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.pinterest.com/v5/user_account",
      expect.any(Number),
      undefined,
      expect.objectContaining({ method: "GET" })
    );
    expect(adapter.userId).toBe("test_user");
  });

  it("throws on HTTP error without checking code field", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized", text: async () => "" });
    const adapter = new PinterestAccessTokenAdapter("bad_token", "act_123", "https://api.pinterest.com");
    await expect(adapter.validate()).rejects.toThrow("401");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/pinterest-mcp && pnpm run test -- --reporter=verbose 2>&1 | head -40
```
Expected: FAIL — adapter calls wrong URL.

**Step 3: Update auth adapter**

In `packages/pinterest-mcp/src/auth/pinterest-auth-adapter.ts`:

1. Replace `PinterestUserInfoResponse` interface:
```typescript
// OLD:
interface PinterestUserInfoResponse {
  code: number;
  message: string;
  data?: { display_name?: string; email?: string; };
}

// NEW:
interface PinterestUserAccountResponse {
  username: string;
  account_type: string;
}
```

2. Replace validation call in `PinterestAccessTokenAdapter.validate()` (line 74-103):
```typescript
const response = await fetchWithTimeout(
  `${this.baseUrl}/v5/user_account`,  // was: /open_api/v1.3/user/info/
  10_000,
  undefined,
  { method: "GET", headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" } }
);

if (!response.ok) {
  const errorBody = await response.text().catch(() => "");
  throw new Error(`Pinterest token validation HTTP error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`);
}

const data = (await response.json()) as PinterestUserAccountResponse;
// No code check — Pinterest v5 uses HTTP status codes only
this._userId = data.username ?? "unknown";
this.validated = true;
```

3. Same fix in `PinterestRefreshTokenAdapter.validate()` (line 167-195) — same URL and same removal of `data.code !== 0` check, read `data.username` instead.

4. Update the doc comment on line 10: `Validates tokens by calling GET /v5/user_account.`

**Step 4: Run test to verify it passes**

```bash
cd packages/pinterest-mcp && pnpm run test -- --reporter=verbose 2>&1 | head -40
```
Expected: PASS

**Step 5: Commit**

```bash
cd /Users/daniel.thorner/GitHub/cesteral-mcp-servers
git add packages/pinterest-mcp/src/auth/pinterest-auth-adapter.ts packages/pinterest-mcp/tests/auth/pinterest-auth-adapter.test.ts
git commit -m "fix(pinterest-mcp): fix token validation endpoint to use Pinterest v5 /user_account"
```

---

### Task 2: Fix Pinterest auth adapter — token refresh endpoint and response parsing

**Files:**
- Modify: `packages/pinterest-mcp/src/auth/pinterest-auth-adapter.ts`

**Context:** The refresh call currently POSTs JSON to `/open_api/v1.3/oauth2/access_token/` (TikTok). Pinterest v5 uses `POST /v5/oauth/token` with `application/x-www-form-urlencoded` and HTTP Basic auth (client_id:client_secret), and the response has `access_token` at the top level (not inside `data`).

**Step 1: Add test for refresh flow**

In `packages/pinterest-mcp/tests/auth/pinterest-auth-adapter.test.ts`, add:

```typescript
describe("PinterestRefreshTokenAdapter", () => {
  it("refreshes via POST /v5/oauth/token with form-encoded body and Basic auth", async () => {
    // First call: token refresh; second: validation
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "new_token", token_type: "bearer", expires_in: 2592000 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ username: "test_user", account_type: "BUSINESS" }),
      });

    const adapter = new PinterestRefreshTokenAdapter(
      { appId: "my_app", appSecret: "my_secret", refreshToken: "refresh_xyz" },
      "act_123",
      "https://api.pinterest.com"
    );
    await adapter.validate();

    const refreshCall = mockFetch.mock.calls[0];
    expect(refreshCall[0]).toBe("https://api.pinterest.com/v5/oauth/token");
    expect(refreshCall[3].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    // Basic auth header should encode client_id:client_secret in base64
    expect(refreshCall[3].headers["Authorization"]).toMatch(/^Basic /);
    expect(refreshCall[3].body).toContain("grant_type=refresh_token");
    expect(refreshCall[3].body).toContain("refresh_token=refresh_xyz");
  });

  it("reads access_token from top-level response (not data.access_token)", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "top_level_token", expires_in: 2592000 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ username: "user", account_type: "BUSINESS" }),
      });
    const adapter = new PinterestRefreshTokenAdapter(
      { appId: "a", appSecret: "b", refreshToken: "r" },
      "act_1",
      "https://api.pinterest.com"
    );
    const token = await adapter.getAccessToken();
    expect(token).toBe("top_level_token");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/pinterest-mcp && pnpm run test -- --reporter=verbose 2>&1 | grep -E "(FAIL|PASS|Error)"
```

**Step 3: Update the refresh token flow in auth adapter**

Replace `PinterestTokenResponse` interface:
```typescript
// OLD: { code, message, data?: { access_token, refresh_token?, expires_in } }
// NEW:
interface PinterestTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}
```

Replace `refreshAccessToken()` method body (lines 214-255):
```typescript
private async refreshAccessToken(): Promise<string> {
  const basicAuth = Buffer.from(`${this.credentials.appId}:${this.credentials.appSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: this.currentRefreshToken,
    scope: "ads:read,ads:write",
  }).toString();

  const response = await fetchWithTimeout(
    "https://api.pinterest.com/v5/oauth/token",  // absolute URL — not baseUrl dependent
    10_000,
    undefined,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body,
    }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Pinterest token refresh failed: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`);
  }

  const data = (await response.json()) as PinterestTokenResponse;
  if (!data.access_token) {
    throw new Error(`Pinterest token refresh failed: missing access_token in response`);
  }

  this.cachedToken = data.access_token;
  this.tokenExpiresAt = Date.now() + data.expires_in * 1000 - PinterestRefreshTokenAdapter.EXPIRY_BUFFER_MS;

  if (data.refresh_token) {
    this.currentRefreshToken = data.refresh_token;
  }

  return this.cachedToken;
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/pinterest-mcp && pnpm run test -- --reporter=verbose 2>&1 | grep -E "(FAIL|PASS)"
```

**Step 5: Commit**

```bash
git add packages/pinterest-mcp/src/auth/pinterest-auth-adapter.ts packages/pinterest-mcp/tests/auth/pinterest-auth-adapter.test.ts
git commit -m "fix(pinterest-mcp): fix token refresh to use Pinterest v5 OAuth2 endpoint with form-encoded Basic auth"
```

---

### Task 3: Fix Pinterest HTTP client — remove TikTok response envelope

**Files:**
- Modify: `packages/pinterest-mcp/src/services/pinterest/pinterest-http-client.ts`

**Context:** The HTTP client currently parses TikTok's `{ code: 0, data: {...} }` envelope in all responses. Pinterest v5 returns plain JSON objects with standard HTTP status codes — no `code` field.

**Step 1: Write failing test**

In `packages/pinterest-mcp/tests/services/pinterest-http-client.test.ts` (rename from `tiktok-http-client.test.ts`):

```typescript
it("returns response body directly without unwrapping TikTok code/data envelope", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ items: [{ id: "camp_1", name: "My Campaign" }], bookmark: "abc123" }),
    headers: { get: () => "application/json" },
  });
  const result = await client.get("/v5/ad_accounts/act_1/campaigns");
  expect(result).toEqual({ items: [{ id: "camp_1", name: "My Campaign" }], bookmark: "abc123" });
  // NOT result.data.list — Pinterest returns items array directly
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/pinterest-mcp && pnpm run test tests/services/pinterest-http-client.test.ts -- --reporter=verbose
```

**Step 3: Update HTTP client**

In `pinterest-http-client.ts`, find the response parsing method (look for the `code !== 0` check or `data.list` unwrapping). Replace with:

```typescript
private async parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Pinterest API error ${response.status} ${response.statusText}: ${errorBody.substring(0, 500)}`);
  }
  return response.json() as Promise<T>;
}
```

No `code` check. No `data` unwrapping. Pinterest v5 uses HTTP status for errors and returns data at the top level.

**Step 4: Run test to verify it passes**

```bash
cd packages/pinterest-mcp && pnpm run test -- --reporter=verbose
```

**Step 5: Commit**

```bash
git add packages/pinterest-mcp/src/services/pinterest/pinterest-http-client.ts packages/pinterest-mcp/tests/services/pinterest-http-client.test.ts
git commit -m "fix(pinterest-mcp): remove TikTok response envelope parsing from HTTP client"
```

---

### Task 4: Fix Pinterest entity mapping — Pinterest v5 path-based URL structure

**Files:**
- Modify: `packages/pinterest-mcp/src/mcp-server/tools/utils/entity-mapping.ts`

**Context:** Pinterest v5 puts `ad_account_id` in the URL path (`/v5/ad_accounts/{adAccountId}/campaigns`) rather than as a query param. The current entity mapping stores static path strings that were TikTok paths. We need to change them to Pinterest v5 paths. The service layer needs to substitute `{adAccountId}` at call time.

**Step 1: Write failing test**

In `packages/pinterest-mcp/tests/tools/pinterest-entity-mapping.test.ts` (rename from `tiktok-*.test.ts`):

```typescript
import { getEntityConfig } from "../../src/mcp-server/tools/utils/entity-mapping.js";

describe("Pinterest entity mapping", () => {
  it("campaign paths use Pinterest v5 structure with {adAccountId} placeholder", () => {
    const cfg = getEntityConfig("campaign");
    expect(cfg.listPath).toContain("/v5/ad_accounts/{adAccountId}/campaigns");
    expect(cfg.listPath).not.toContain("/open_api/v1.3/");
  });

  it("adGroup paths use /ad_groups", () => {
    const cfg = getEntityConfig("adGroup");
    expect(cfg.listPath).toContain("/v5/ad_accounts/{adAccountId}/ad_groups");
  });

  it("ad paths use /ads", () => {
    const cfg = getEntityConfig("ad");
    expect(cfg.listPath).toContain("/v5/ad_accounts/{adAccountId}/ads");
  });

  it("campaign idField is 'id' (not campaign_id)", () => {
    expect(getEntityConfig("campaign").idField).toBe("id");
  });
});
```

**Step 2: Run to verify failure**

```bash
cd packages/pinterest-mcp && pnpm run test tests/tools/ -- --reporter=verbose
```

**Step 3: Rewrite entity mapping**

Replace the `ENTITY_CONFIGS` in `entity-mapping.ts` with Pinterest v5 paths. Also add a `listParentPath` concept for sub-entities (ad groups, ads need the ad_account_id in path):

```typescript
export type PinterestEntityType = "campaign" | "adGroup" | "ad" | "creative";

export interface PinterestEntityConfig {
  /** Path template for GET list. {adAccountId} is replaced at runtime. */
  listPath: string;
  /** Path template for POST create. */
  createPath: string;
  /** Path template for PATCH update (bulk). */
  updatePath: string;
  /** No separate statusUpdatePath — status is updated via PATCH updatePath */
  statusUpdatePath: string;
  /** Path template for DELETE. May include {entityId} or uses query param. */
  deletePath: string;
  duplicatePath?: string;
  /** Primary ID field name in the API response */
  idField: string;
  /** Query param name when deleting multiple (e.g., campaign_ids) */
  deleteIdsParam: string;
  displayName: string;
  defaultFields: string[];
  supportsDuplicate?: boolean;
  /** HTTP method used for create */
  createMethod: "POST";
  /** HTTP method used for update */
  updateMethod: "PATCH" | "PUT";
  /** HTTP method used for delete */
  deleteMethod: "DELETE";
}

const ENTITY_CONFIGS: Record<PinterestEntityType, PinterestEntityConfig> = {
  campaign: {
    listPath: "/v5/ad_accounts/{adAccountId}/campaigns",
    createPath: "/v5/ad_accounts/{adAccountId}/campaigns",
    updatePath: "/v5/ad_accounts/{adAccountId}/campaigns",
    statusUpdatePath: "/v5/ad_accounts/{adAccountId}/campaigns",
    deletePath: "/v5/ad_accounts/{adAccountId}/campaigns",
    idField: "id",
    deleteIdsParam: "campaign_ids",
    displayName: "Campaign",
    defaultFields: ["id", "name", "status", "objective_type", "daily_spend_cap", "lifetime_spend_cap", "created_time", "updated_time"],
    supportsDuplicate: false,
    createMethod: "POST",
    updateMethod: "PATCH",
    deleteMethod: "DELETE",
  },
  adGroup: {
    listPath: "/v5/ad_accounts/{adAccountId}/ad_groups",
    createPath: "/v5/ad_accounts/{adAccountId}/ad_groups",
    updatePath: "/v5/ad_accounts/{adAccountId}/ad_groups",
    statusUpdatePath: "/v5/ad_accounts/{adAccountId}/ad_groups",
    deletePath: "/v5/ad_accounts/{adAccountId}/ad_groups",
    idField: "id",
    deleteIdsParam: "ad_group_ids",
    displayName: "Ad Group",
    defaultFields: ["id", "name", "status", "campaign_id", "budget_in_micro_currency", "pacing_delivery_type", "bid_strategy_type", "created_time"],
    supportsDuplicate: false,
    createMethod: "POST",
    updateMethod: "PATCH",
    deleteMethod: "DELETE",
  },
  ad: {
    listPath: "/v5/ad_accounts/{adAccountId}/ads",
    createPath: "/v5/ad_accounts/{adAccountId}/ads",
    updatePath: "/v5/ad_accounts/{adAccountId}/ads",
    statusUpdatePath: "/v5/ad_accounts/{adAccountId}/ads",
    deletePath: "/v5/ad_accounts/{adAccountId}/ads",
    idField: "id",
    deleteIdsParam: "ad_ids",
    displayName: "Ad",
    defaultFields: ["id", "name", "status", "ad_group_id", "creative_type", "pin_id", "created_time"],
    supportsDuplicate: false,
    createMethod: "POST",
    updateMethod: "PATCH",
    deleteMethod: "DELETE",
  },
  creative: {
    listPath: "/v5/pins/{entityId}",       // get single pin by ID
    createPath: "/v5/pins",
    updatePath: "/v5/pins/{entityId}",
    statusUpdatePath: "/v5/pins/{entityId}",
    deletePath: "/v5/pins/{entityId}",
    idField: "id",
    deleteIdsParam: "pin_id",
    displayName: "Pin (Creative)",
    defaultFields: ["id", "title", "description", "media", "link", "created_at"],
    supportsDuplicate: false,
    createMethod: "POST",
    updateMethod: "PATCH",
    deleteMethod: "DELETE",
  },
};
```

Also add a helper that the service layer will use:
```typescript
export function interpolatePath(path: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (acc, [key, val]) => acc.replace(`{${key}}`, val),
    path
  );
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/pinterest-mcp && pnpm run test -- --reporter=verbose
```

**Step 5: Commit**

```bash
git add packages/pinterest-mcp/src/mcp-server/tools/utils/entity-mapping.ts packages/pinterest-mcp/tests/tools/
git commit -m "fix(pinterest-mcp): replace TikTok entity paths with Pinterest v5 URL structure"
```

---

### Task 5: Fix Pinterest service layer — path interpolation and request patterns

**Files:**
- Modify: `packages/pinterest-mcp/src/services/pinterest/pinterest-service.ts`

**Context:** The service currently passes paths directly from entity mapping. Now that paths contain `{adAccountId}`, the service must interpolate them. Also Pinterest v5 uses different HTTP methods (PATCH not POST for updates, DELETE with query params not POST to a delete path) and different pagination (cursor/bookmark not page number).

**Step 1: Write failing test**

In `packages/pinterest-mcp/tests/services/pinterest-service.test.ts`:

```typescript
it("listEntities calls correct Pinterest v5 path with adAccountId interpolated", async () => {
  mockHttpClient.get.mockResolvedValueOnce({ items: [{ id: "camp_1" }], bookmark: null });
  const result = await service.listEntities("campaign", { adAccountId: "act_123" });
  expect(mockHttpClient.get).toHaveBeenCalledWith(
    "/v5/ad_accounts/act_123/campaigns",
    expect.objectContaining({ page_size: expect.any(Number) }),
    undefined
  );
  expect(result.entities).toHaveLength(1);
  expect(result.pageInfo.bookmark).toBeNull();
});

it("createEntity sends POST with body array", async () => {
  mockHttpClient.post.mockResolvedValueOnce({ items: [{ id: "new_camp" }] });
  await service.createEntity("campaign", { adAccountId: "act_123" }, { name: "Test", objective_type: "AWARENESS" });
  expect(mockHttpClient.post).toHaveBeenCalledWith(
    "/v5/ad_accounts/act_123/campaigns",
    [expect.objectContaining({ name: "Test" })],  // Pinterest v5 wraps in array
    undefined
  );
});

it("deleteEntity sends DELETE with query param (not POST)", async () => {
  mockHttpClient.delete.mockResolvedValueOnce({});
  await service.deleteEntity("campaign", { adAccountId: "act_123" }, ["camp_1", "camp_2"]);
  expect(mockHttpClient.delete).toHaveBeenCalledWith(
    "/v5/ad_accounts/act_123/campaigns",
    { campaign_ids: "camp_1,camp_2" },
    undefined
  );
});
```

**Step 2: Run to verify failure**

```bash
cd packages/pinterest-mcp && pnpm run test tests/services/pinterest-service.test.ts -- --reporter=verbose
```

**Step 3: Update service**

Key changes to `pinterest-service.ts`:

1. Update `listEntities()` — interpolate path, use cursor/bookmark pagination:
```typescript
async listEntities(entityType, filters: { adAccountId: string }, bookmark?: string, pageSize = 25) {
  const config = getEntityConfig(entityType);
  const path = interpolatePath(config.listPath, { adAccountId: filters.adAccountId });
  const params: Record<string, unknown> = { page_size: pageSize };
  if (bookmark) params.bookmark = bookmark;
  if (filters.campaignId) params.campaign_id = filters.campaignId;
  await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`);
  const data = await this.httpClient.get<{ items: unknown[]; bookmark?: string }>(path, params);
  return { entities: data.items, pageInfo: { bookmark: data.bookmark ?? null } };
}
```

2. Update `createEntity()` — wrap in array:
```typescript
async createEntity(entityType, filters: { adAccountId: string }, body: unknown) {
  const config = getEntityConfig(entityType);
  const path = interpolatePath(config.createPath, { adAccountId: filters.adAccountId });
  await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`, 3);
  const data = await this.httpClient.post<{ items: unknown[] }>(path, [body]);
  return data.items?.[0];
}
```

3. Update `updateEntity()` — PATCH with array:
```typescript
async updateEntity(entityType, filters: { adAccountId: string }, entityId: string, updates: unknown) {
  const config = getEntityConfig(entityType);
  const path = interpolatePath(config.updatePath, { adAccountId: filters.adAccountId });
  await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`, 3);
  const data = await this.httpClient.patch<{ items: unknown[] }>(path, [{ id: entityId, ...updates as object }]);
  return data.items?.[0];
}
```

4. Update `deleteEntity()` — DELETE with query params:
```typescript
async deleteEntity(entityType, filters: { adAccountId: string }, entityIds: string[]) {
  const config = getEntityConfig(entityType);
  const path = interpolatePath(config.deletePath, { adAccountId: filters.adAccountId });
  const param = config.deleteIdsParam;
  await this.rateLimiter.consume(`pinterest:${filters.adAccountId}`, 3);
  return this.httpClient.delete(path, { [param]: entityIds.join(",") });
}
```

5. Update `listAdAccounts()`:
```typescript
async listAdAccounts() {
  await this.rateLimiter.consume("pinterest:default");
  return this.httpClient.get<{ items: unknown[]; bookmark?: string }>("/v5/ad_accounts");
}
```

6. Update targeting/audience/preview endpoints:
```typescript
searchTargeting(type, query?, limit = 25) → GET /v5/targeting/search?targeting_type={type}&q={query}
getTargetingOptions(type?) → GET /v5/targeting/browse
getAudienceEstimate(config) → POST /v5/ad_accounts/{adAccountId}/delivery_metrics/estimate
getAdPreviews(adId, format?) → GET /v5/ad_accounts/{adAccountId}/ads/{adId}/preview
```

**Step 4: Run full test suite**

```bash
cd packages/pinterest-mcp && pnpm run test -- --reporter=verbose
```

**Step 5: Commit**

```bash
git add packages/pinterest-mcp/src/services/pinterest/pinterest-service.ts packages/pinterest-mcp/tests/services/
git commit -m "fix(pinterest-mcp): update service layer for Pinterest v5 path-based URLs and REST patterns"
```

---

### Task 6: Fix Pinterest prompts — correct objectives and field names

**Files:**
- Modify: `packages/pinterest-mcp/src/mcp-server/prompts/definitions/campaign-setup-workflow.prompt.ts`
- Modify: `packages/pinterest-mcp/src/mcp-server/prompts/definitions/cross-platform-campaign-setup.prompt.ts`

**Context:** Campaign setup prompt lists TikTok objectives (`TRAFFIC`, `APP_INSTALLS`, `COMMUNITY_INTERACTION`) and TikTok field names (`objective_type`, `budget_mode`, `adgroup_name`, `schedule_type: "SCHEDULE_START_END"`).

**Step 1: No test needed** — prompts are text content, covered by the cross-server contract test structure (string content check).

**Step 2: Update `campaign-setup-workflow.prompt.ts`**

Replace TikTok content with Pinterest v5:

- Objectives: `AWARENESS`, `CONSIDERATION`, `VIDEO_VIEW`, `CATALOG_SALES`, `CONVERSIONS`, `APP_INSTALL`, `SHOPPING`
- Campaign fields: `name`, `objective_type`, `status`, `daily_spend_cap` (in micro-currency), `lifetime_spend_cap`
- Ad group fields: `name`, `status`, `campaign_id`, `budget_in_micro_currency`, `pacing_delivery_type` (`STANDARD`/`ACCELERATED`), `bid_strategy_type` (`AUTOMATIC_BID`/`MAX_BID`/`TARGET_AVG_BID`), `targeting_spec` (JSON object with `age_bucket`, `gender`, `geo`, `interest`)
- Ad fields: `name`, `status`, `ad_group_id`, `creative_type` (`REGULAR`/`VIDEO`/`SHOPPING`/`CAROUSEL`), `pin_id`
- Budget unit gotcha: `⚠️ GOTCHA: Pinterest budgets are in micro-currency (1 USD = 1,000,000). $50 daily → daily_spend_cap: 50000000`
- Status values: `ACTIVE`, `PAUSED`, `ARCHIVED`
- Remove `schedule_type: "SCHEDULE_START_END"` gotcha — Pinterest uses ISO 8601 `start_time`/`end_time` at ad group level

**Step 3: Update `cross-platform-campaign-setup.prompt.ts`**

Add Pinterest to the platform selection matrix and budget reference table:

```markdown
| Pinterest | `pinterest_create_entity` | Micro-currency | 50000000 = $50 | AWARENESS, CONSIDERATION, VIDEO_VIEW, CONVERSIONS |
```

Also add a "Step X: Pinterest Setup" section mirroring the other platforms.

**Step 4: Commit**

```bash
git add packages/pinterest-mcp/src/mcp-server/prompts/
git commit -m "fix(pinterest-mcp): replace TikTok campaign objectives and field names with Pinterest v5 values in prompts"
```

---

### Task 7: Fix Pinterest resources — entity schemas and examples

**Files:**
- Modify: `packages/pinterest-mcp/src/mcp-server/resources/definitions/entity-schemas.resource.ts`
- Modify: `packages/pinterest-mcp/src/mcp-server/resources/definitions/entity-examples.resource.ts`

**Context:** Entity schemas and examples currently describe TikTok entity shapes (`campaign_name`, `objective_type: "TRAFFIC"`, `budget_mode: "BUDGET_MODE_DAY"`) rather than Pinterest v5 shapes.

**Step 1: Update `entity-schemas.resource.ts`**

Replace TikTok JSON schemas with Pinterest v5 schemas for each entity type:

Campaign schema:
```json
{
  "type": "object",
  "required": ["name", "objective_type"],
  "properties": {
    "name": { "type": "string" },
    "objective_type": {
      "type": "string",
      "enum": ["AWARENESS", "CONSIDERATION", "VIDEO_VIEW", "CATALOG_SALES", "CONVERSIONS", "APP_INSTALL", "SHOPPING"]
    },
    "status": { "type": "string", "enum": ["ACTIVE", "PAUSED", "ARCHIVED"], "default": "ACTIVE" },
    "daily_spend_cap": { "type": "integer", "description": "Daily budget in micro-currency (1 USD = 1000000)" },
    "lifetime_spend_cap": { "type": "integer", "description": "Total lifetime budget in micro-currency" }
  }
}
```

Ad Group schema (key fields):
```json
{
  "required": ["name", "campaign_id", "budget_in_micro_currency", "start_time"],
  "properties": {
    "budget_in_micro_currency": { "type": "integer" },
    "pacing_delivery_type": { "enum": ["STANDARD", "ACCELERATED"] },
    "bid_strategy_type": { "enum": ["AUTOMATIC_BID", "MAX_BID", "TARGET_AVG_BID"] },
    "targeting_spec": { "type": "object", "description": "Audience targeting configuration" },
    "start_time": { "type": "string", "format": "date-time" },
    "end_time": { "type": "string", "format": "date-time" }
  }
}
```

**Step 2: Update `entity-examples.resource.ts`**

Replace TikTok example payloads with real Pinterest v5 examples:

```typescript
campaign: {
  create: {
    name: "Spring Sale Awareness",
    objective_type: "AWARENESS",
    status: "ACTIVE",
    daily_spend_cap: 50000000,  // $50/day
  },
  update: {
    id: "549755885175",
    status: "PAUSED",
  }
}
```

**Step 3: Commit**

```bash
git add packages/pinterest-mcp/src/mcp-server/resources/
git commit -m "fix(pinterest-mcp): replace TikTok entity schemas and examples with Pinterest v5 API shapes"
```

---

### Task 8: Rename Pinterest test files

**Files:**
- Rename all `tiktok-*.test.ts` files in `packages/pinterest-mcp/tests/`

**Step 1: Rename files**

```bash
cd packages/pinterest-mcp/tests
find . -name "tiktok-*.test.ts" | while read f; do
  newname=$(echo "$f" | sed 's/tiktok-/pinterest-/g')
  mv "$f" "$newname"
done
```

**Step 2: Update imports inside renamed files**

Each renamed file imports from paths like `../../src/...` — those paths don't change. But any `import ... from "../auth/tiktok-auth-adapter.js"` style imports inside test files need updating to use `pinterest-auth-adapter.js` etc. Run:

```bash
cd packages/pinterest-mcp
grep -r "tiktok" tests/ --include="*.ts" -l
```

For each file found, replace `tiktok` with `pinterest` in import paths and describe block labels.

**Step 3: Verify tests still pass**

```bash
cd packages/pinterest-mcp && pnpm run test -- --reporter=verbose
```

**Step 4: Commit**

```bash
git add packages/pinterest-mcp/tests/
git commit -m "fix(pinterest-mcp): rename test files from tiktok-* to pinterest-*"
```

---

### Task 9: Wire pinterestApiVersion config into paths

**Files:**
- Modify: `packages/pinterest-mcp/src/config/index.ts`
- Modify: `packages/pinterest-mcp/src/services/pinterest/pinterest-http-client.ts`

**Context:** `pinterestApiVersion` is declared in config (defaults to `"v5"`) but never used — all paths hardcode `/v5/`. Wire it into the HTTP client base path so the config field is meaningful.

**Step 1: Update HTTP client constructor**

```typescript
constructor(
  private readonly authAdapter: PinterestAuthAdapter,
  private readonly baseUrl: string,
  private readonly apiVersion: string = "v5"  // new param
) {}

private buildUrl(path: string): string {
  // If path already starts with /v5 (absolute), use as-is
  // Otherwise prefix with /{apiVersion}
  if (path.startsWith(`/${this.apiVersion}`) || path.startsWith("/v")) {
    return `${this.baseUrl}${path}`;
  }
  return `${this.baseUrl}/${this.apiVersion}${path}`;
}
```

**Step 2: Pass apiVersion from config when constructing session services**

In `packages/pinterest-mcp/src/services/session-services.ts`:
```typescript
const httpClient = new PinterestHttpClient(
  authAdapter,
  config.pinterestApiBaseUrl,
  config.pinterestApiVersion  // was missing
);
```

**Step 3: Commit**

```bash
git add packages/pinterest-mcp/src/config/index.ts packages/pinterest-mcp/src/services/
git commit -m "fix(pinterest-mcp): wire pinterestApiVersion config into HTTP client path construction"
```

---

## Phase 2: Snapchat API Migration

### Task 10: Fix Snapchat auth adapter — validation endpoint and token refresh

**Files:**
- Modify: `packages/snapchat-mcp/src/auth/snapchat-auth-adapter.ts`

**Context:** Same TikTok copy-paste problem as Pinterest. Snapchat's validation is `GET /v1/me`, and refresh is `POST https://accounts.snapchat.com/login/oauth2/access_token` with form-encoded body.

**Step 1: Write failing test**

In `packages/snapchat-mcp/tests/auth/snapchat-auth-adapter.test.ts`:

```typescript
it("validates by calling GET /v1/me (Snapchat endpoint)", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ request_status: "SUCCESS", me: { id: "user_1", display_name: "Test User" } }),
  });
  const adapter = new SnapchatAccessTokenAdapter("token", "org_1:acct_1", "https://adsapi.snapchat.com");
  await adapter.validate();
  expect(mockFetch).toHaveBeenCalledWith(
    "https://adsapi.snapchat.com/v1/me",
    expect.any(Number), undefined, expect.objectContaining({ method: "GET" })
  );
  expect(adapter.userId).toBe("user_1");
});

it("refreshes via POST to Snapchat accounts domain (not TikTok)", async () => {
  mockFetch
    .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "snap_token", expires_in: 1800 }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ request_status: "SUCCESS", me: { id: "u1" } }) });
  const adapter = new SnapchatRefreshTokenAdapter(
    { appId: "cid", appSecret: "cs", refreshToken: "rt" }, "org_1:acct_1", "https://adsapi.snapchat.com"
  );
  await adapter.validate();
  expect(mockFetch.mock.calls[0][0]).toBe("https://accounts.snapchat.com/login/oauth2/access_token");
  expect(mockFetch.mock.calls[0][3].body).toContain("grant_type=refresh_token");
});
```

**Step 2: Run to verify failure**

```bash
cd packages/snapchat-mcp && pnpm run test -- --reporter=verbose 2>&1 | grep -E "(FAIL|PASS|Error)"
```

**Step 3: Update auth adapter** (same pattern as Pinterest but Snapchat-specific)

Key changes:
- `SnapchatUserInfoResponse`: `{ request_status: string; me: { id: string; display_name: string; email?: string } }`
- Validation URL: `${baseUrl}/v1/me`
- Extract `data.me.id` → `this._userId = data.me.id`
- Token refresh URL: `https://accounts.snapchat.com/login/oauth2/access_token` (hardcoded — not baseUrl)
- Refresh body: form-encoded `grant_type=refresh_token&client_id={appId}&client_secret={appSecret}&refresh_token={token}`
- Token response: `{ access_token, token_type, expires_in, refresh_token, scope }` (no `code` field)
- Default constructor baseUrl: `https://adsapi.snapchat.com`

Note: Snapchat's `adAccountId` field should store `"{orgId}:{adAccountId}"` to hold both values, or separate fields — look at how the service uses it and decide. Simplest: keep `adAccountId` as the Snapchat ad account ID and add `orgId` separately on the adapter.

**Step 4: Run test to verify it passes**

```bash
cd packages/snapchat-mcp && pnpm run test -- --reporter=verbose
```

**Step 5: Commit**

```bash
git add packages/snapchat-mcp/src/auth/snapchat-auth-adapter.ts packages/snapchat-mcp/tests/auth/snapchat-auth-adapter.test.ts
git commit -m "fix(snapchat-mcp): fix auth validation to GET /v1/me and refresh to Snapchat accounts endpoint"
```

---

### Task 11: Fix Snapchat entity mapping — Snapchat Ads API v1 paths

**Files:**
- Modify: `packages/snapchat-mcp/src/mcp-server/tools/utils/entity-mapping.ts`

**Context:** Snapchat's entity hierarchy differs from TikTok's. Campaigns list at `/v1/adaccounts/{adAccountId}/campaigns`. Ad squads (ad groups) list at `/v1/campaigns/{campaignId}/adsquads`. Ads list at `/v1/adsquads/{adSquadId}/ads`. Updates and deletes use PUT/DELETE on the entity-specific path.

**Step 1: Write failing test**

```typescript
it("campaign listPath uses Snapchat v1 adaccounts path", () => {
  expect(getEntityConfig("campaign").listPath).toBe("/v1/adaccounts/{adAccountId}/campaigns");
});
it("adGroup (ad squad) listPath uses campaign-based path", () => {
  expect(getEntityConfig("adGroup").listPath).toBe("/v1/campaigns/{campaignId}/adsquads");
});
it("ad listPath uses ad-squad-based path", () => {
  expect(getEntityConfig("ad").listPath).toBe("/v1/adsquads/{adSquadId}/ads");
});
```

**Step 2: Run to verify failure**

**Step 3: Rewrite entity mapping**

```typescript
export interface SnapchatEntityConfig {
  listPath: string;
  createPath: string;
  updatePath: string;       // PUT /v1/{entity}s/{id}
  statusUpdatePath: string; // Same as updatePath — status is a field
  deletePath: string;       // DELETE /v1/{entity}s/{id}
  idField: string;
  displayName: string;
  defaultFields: string[];
  /** Response envelope key (campaigns/adsquads/ads/creatives) */
  responseKey: string;
  supportsDuplicate?: boolean;
}

const ENTITY_CONFIGS = {
  campaign: {
    listPath: "/v1/adaccounts/{adAccountId}/campaigns",
    createPath: "/v1/adaccounts/{adAccountId}/campaigns",
    updatePath: "/v1/campaigns/{entityId}",
    statusUpdatePath: "/v1/campaigns/{entityId}",
    deletePath: "/v1/campaigns/{entityId}",
    idField: "id",
    responseKey: "campaigns",
    displayName: "Campaign",
    defaultFields: ["id", "name", "status", "ad_account_id", "objective", "daily_budget_micro", "start_time", "end_time"],
    supportsDuplicate: false,
  },
  adGroup: {
    listPath: "/v1/campaigns/{campaignId}/adsquads",
    createPath: "/v1/adaccounts/{adAccountId}/adsquads",
    updatePath: "/v1/adsquads/{entityId}",
    statusUpdatePath: "/v1/adsquads/{entityId}",
    deletePath: "/v1/adsquads/{entityId}",
    idField: "id",
    responseKey: "adsquads",
    displayName: "Ad Squad",
    defaultFields: ["id", "name", "status", "campaign_id", "daily_budget_micro", "bid_micro", "optimization_goal", "placement"],
    supportsDuplicate: false,
  },
  ad: {
    listPath: "/v1/adsquads/{adSquadId}/ads",
    createPath: "/v1/adaccounts/{adAccountId}/ads",
    updatePath: "/v1/ads/{entityId}",
    statusUpdatePath: "/v1/ads/{entityId}",
    deletePath: "/v1/ads/{entityId}",
    idField: "id",
    responseKey: "ads",
    displayName: "Ad",
    defaultFields: ["id", "name", "status", "ad_squad_id", "creative_id", "type"],
    supportsDuplicate: false,
  },
  creative: {
    listPath: "/v1/adaccounts/{adAccountId}/creatives",
    createPath: "/v1/adaccounts/{adAccountId}/creatives",
    updatePath: "/v1/creatives/{entityId}",
    statusUpdatePath: "/v1/creatives/{entityId}",
    deletePath: "/v1/creatives/{entityId}",
    idField: "id",
    responseKey: "creatives",
    displayName: "Creative",
    defaultFields: ["id", "name", "type", "ad_account_id", "brand_name", "headline", "call_to_action"],
    supportsDuplicate: false,
  },
};
```

**Step 4: Run tests, verify passing**

```bash
cd packages/snapchat-mcp && pnpm run test -- --reporter=verbose
```

**Step 5: Commit**

```bash
git add packages/snapchat-mcp/src/mcp-server/tools/utils/entity-mapping.ts
git commit -m "fix(snapchat-mcp): replace TikTok entity paths with Snapchat Ads API v1 structure"
```

---

### Task 12: Fix Snapchat HTTP client — Snapchat response envelope parsing

**Files:**
- Modify: `packages/snapchat-mcp/src/services/snapchat/snapchat-http-client.ts`

**Context:** Snapchat's response envelope is `{ request_status: "SUCCESS", <entity_type>: [{ sub_request_status, <entity>: {...} }] }`. Errors use `request_status: "FAILED"` with `display_message`. This is completely different from TikTok's `{ code: 0, data: {...} }`.

**Step 1: Write failing test**

```typescript
it("parseResponse unwraps Snapchat envelope: request_status + entity key", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      request_status: "SUCCESS",
      campaigns: [{ sub_request_status: "SUCCESS", campaign: { id: "c1", name: "Test" } }],
    }),
  });
  const result = await client.get("/v1/adaccounts/act_1/campaigns");
  // Should return the raw Snapchat envelope for service to unwrap
  expect(result.request_status).toBe("SUCCESS");
  expect(result.campaigns).toHaveLength(1);
});
```

**Step 2: Update HTTP client**

The client should return the raw Snapchat envelope (no unwrapping) and only throw on HTTP errors or `request_status: "FAILED"`:

```typescript
private async parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Snapchat API HTTP error ${response.status}: ${errorBody.substring(0, 500)}`);
  }
  const data = (await response.json()) as { request_status?: string; display_message?: string } & T;
  if (data.request_status === "FAILED") {
    throw new Error(`Snapchat API error: ${data.display_message ?? "Unknown error"}`);
  }
  return data;
}
```

**Step 3: Commit**

```bash
git add packages/snapchat-mcp/src/services/snapchat/snapchat-http-client.ts packages/snapchat-mcp/tests/services/
git commit -m "fix(snapchat-mcp): update HTTP client to parse Snapchat response envelope"
```

---

### Task 13: Fix Snapchat service layer — path interpolation and entity unwrapping

**Files:**
- Modify: `packages/snapchat-mcp/src/services/snapchat/snapchat-service.ts`

**Context:** The service must (1) interpolate `{adAccountId}`, `{campaignId}`, `{adSquadId}`, `{entityId}` into paths, (2) send create requests with `{ <entity>s: [{...}] }` body, (3) unwrap the Snapchat response envelope (`response.campaigns[0].campaign`), and (4) handle pagination via Snapchat's `paging.cursor` or `paging.next_link`.

**Step 1: Write failing test**

```typescript
it("listEntities interpolates path and unwraps Snapchat envelope", async () => {
  mockHttpClient.get.mockResolvedValueOnce({
    request_status: "SUCCESS",
    campaigns: [{ sub_request_status: "SUCCESS", campaign: { id: "c1", name: "Test" } }],
    paging: {},
  });
  const result = await service.listEntities("campaign", { adAccountId: "act_1" });
  expect(mockHttpClient.get).toHaveBeenCalledWith("/v1/adaccounts/act_1/campaigns", {}, undefined);
  expect(result.entities[0]).toEqual({ id: "c1", name: "Test" });
});
```

**Step 2: Update service**

Key pattern for unwrapping:
```typescript
function unwrapSnapchatList<T>(responseKey: string, response: Record<string, unknown>): T[] {
  const items = response[responseKey] as Array<Record<string, unknown>>;
  if (!Array.isArray(items)) return [];
  // Snapchat wraps each entity: { sub_request_status, campaign: {...} }
  const entityKey = responseKey.endsWith("s") ? responseKey.slice(0, -1) : responseKey;
  return items.map(item => item[entityKey] as T);
}
```

**Step 3: Update remaining service methods** (targeting, reporting, ad previews):
- `searchTargeting()` → `GET /v1/targeting/interests?q={query}&targeting_type={type}`
- `listAdAccounts()` → `GET /v1/organizations/{orgId}/adaccounts` (requires orgId — read from adapter or separate header)
- `getReportingStats()` → Snapchat uses `/v1/adaccounts/{id}/stats` with `start_time`, `end_time`, `granularity`

**Step 4: Run tests**

```bash
cd packages/snapchat-mcp && pnpm run test -- --reporter=verbose
```

**Step 5: Commit**

```bash
git add packages/snapchat-mcp/src/services/
git commit -m "fix(snapchat-mcp): update service for Snapchat API paths and response envelope unwrapping"
```

---

### Task 14: Fix Snapchat prompts, resources, and rename test files

**Files:**
- Modify: `packages/snapchat-mcp/src/mcp-server/prompts/definitions/campaign-setup-workflow.prompt.ts`
- Modify: `packages/snapchat-mcp/src/mcp-server/prompts/definitions/cross-platform-campaign-setup.prompt.ts`
- Modify: `packages/snapchat-mcp/src/mcp-server/resources/definitions/entity-schemas.resource.ts`
- Modify: `packages/snapchat-mcp/src/mcp-server/resources/definitions/entity-examples.resource.ts`
- Rename: all `tiktok-*.test.ts` files in `packages/snapchat-mcp/tests/`

**Step 1: Update campaign setup prompt**

Replace TikTok objectives with Snapchat objectives: `AWARENESS`, `APP_INSTALLS`, `DRIVE_REPLAY`, `LEAD_GENERATION`, `WEBSITE_CONVERSIONS`, `PRODUCT_CATALOG_SALES`, `VIDEO_VIEWS`

Replace field names:
- `campaign_name` → `name`
- `objective_type` → `objective`
- `budget_mode: "BUDGET_MODE_DAY"` → `daily_budget_micro` (in micro-currency)
- `adgroup_name` → `name` (for ad squads)
- `schedule_type: "SCHEDULE_START_END"` → `start_time`, `end_time` ISO 8601 strings

Add Snapchat-specific gotchas:
- `⚠️ GOTCHA: Budgets are in micro-currency (1 USD = 1,000,000). $50/day → daily_budget_micro: 50000000`
- `⚠️ GOTCHA: Ad squads list path uses campaign_id (/v1/campaigns/{id}/adsquads), but create path uses ad_account_id`
- `⚠️ GOTCHA: Snapchat uses ad_squad_id (not ad_group_id) for ads. Entity type is "adGroup" in tools but underlying API is "adsquad"`

**Step 2: Update entity schemas**

Campaign schema: `name`, `objective` (Snapchat enum), `status` (`ACTIVE`/`PAUSED`), `ad_account_id`, `daily_budget_micro`, `lifetime_spend_cap_micro`, `start_time`, `end_time`

Ad Squad schema: `name`, `campaign_id`, `daily_budget_micro`, `bid_micro`, `optimization_goal` (`SWIPE`/`PIXEL_PAGE_VIEW`/`APP_INSTALL`/etc.), `placement` (`SNAP_ADS`/`AUDIENCE_NETWORK`/`BOTH`), `targeting`

**Step 3: Rename test files**

```bash
cd packages/snapchat-mcp/tests
find . -name "tiktok-*.test.ts" | while read f; do
  mv "$f" "$(echo "$f" | sed 's/tiktok-/snapchat-/g')"
done
# Fix any tiktok references inside files
grep -r "tiktok" . --include="*.ts" -l | xargs sed -i 's/tiktok/snapchat/g; s/TikTok/Snapchat/g; s/TIKTOK/SNAPCHAT/g'
```

**Step 4: Run tests**

```bash
cd packages/snapchat-mcp && pnpm run test -- --reporter=verbose
```

**Step 5: Commit**

```bash
git add packages/snapchat-mcp/src/mcp-server/ packages/snapchat-mcp/tests/
git commit -m "fix(snapchat-mcp): update prompts/resources with Snapchat API values; rename test files"
```

---

## Phase 3: Amazon DSP API Migration

Amazon DSP is the most complex because the **entire auth model** differs. Amazon uses Login with Amazon (LwA) — a standard OAuth2 flow but with Amazon-specific required headers on every API call, different entity naming, and an offset-based (not page/cursor) pagination model.

### Task 15: Fix Amazon DSP auth adapter — LwA token refresh and response types

**Files:**
- Modify: `packages/amazon-dsp-mcp/src/auth/amazon-dsp-auth-adapter.ts`

**Context:** Currently uses TikTok's token endpoint and response shape. Amazon LwA token endpoint is `https://api.amazon.com/auth/o2/token` with form-encoded body and standard OAuth2 response (no `code` field, `access_token` is top-level, tokens expire in 3600s).

**Step 1: Write failing test**

```typescript
it("refreshes via POST to Amazon LwA token endpoint", async () => {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "amz_token", token_type: "bearer", expires_in: 3600 }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ advertisers: [{ advertiserId: "adv_1", name: "Test Advertiser" }], totalResults: 1 }),
    });

  const adapter = new AmazonDspRefreshTokenAdapter(
    { appId: "client_id", appSecret: "client_secret", refreshToken: "amz_rt" },
    "profile_123",
    "https://advertising-api.amazon.com"
  );
  await adapter.validate();

  expect(mockFetch.mock.calls[0][0]).toBe("https://api.amazon.com/auth/o2/token");
  expect(mockFetch.mock.calls[0][3].body).toContain("grant_type=refresh_token");
  expect(mockFetch.mock.calls[0][3].body).toContain("client_id=client_id");
  // Validation should call DSP advertisers endpoint, not user/info
  expect(mockFetch.mock.calls[1][0]).toContain("/dsp/advertisers");
});
```

**Step 2: Update auth adapter**

1. Replace `AmazonDspTokenResponse` interface:
```typescript
interface AmazonDspTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;  // typically 3600 (1 hour, NOT 24h)
  refresh_token?: string;
}
```

2. Replace `refreshAccessToken()`:
```typescript
private async refreshAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: this.credentials.appId,
    client_secret: this.credentials.appSecret,
    refresh_token: this.currentRefreshToken,
  }).toString();

  const response = await fetchWithTimeout(
    "https://api.amazon.com/auth/o2/token",  // LwA token endpoint
    10_000, undefined,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Amazon DSP token refresh failed: ${response.status}. ${errorBody.substring(0, 200)}`);
  }

  const data = (await response.json()) as AmazonDspTokenResponse;
  if (!data.access_token) {
    throw new Error(`Amazon DSP token refresh: missing access_token`);
  }

  this.cachedToken = data.access_token;
  this.tokenExpiresAt = Date.now() + data.expires_in * 1000 - AmazonDspRefreshTokenAdapter.EXPIRY_BUFFER_MS;
  if (data.refresh_token) this.currentRefreshToken = data.refresh_token;
  return this.cachedToken;
}
```

3. Replace `AmazonDspUserInfoResponse` and update `validate()`:
```typescript
interface AmazonDspAdvertisersResponse {
  advertisers: Array<{ advertiserId: string; name: string }>;
  totalResults: number;
}

// In validate():
const response = await fetchWithTimeout(
  `${this.baseUrl}/dsp/advertisers?startIndex=0&count=1`,
  10_000, undefined,
  {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Amazon-Advertising-API-ClientId": this.credentials.appId,
      "Amazon-Advertising-API-Scope": this._profileId,
      "Content-Type": "application/json",
    },
  }
);
// Check response.ok, no code check
const data = (await response.json()) as AmazonDspAdvertisersResponse;
this._userId = data.advertisers?.[0]?.advertiserId ?? "unknown";
```

4. Fix default base URL: `"https://advertising-api.amazon.com"` (not `"https://business-api.amazonDsp.com"`)

**Step 3: Run tests, verify passing**

```bash
cd packages/amazon-dsp-mcp && pnpm run test -- --reporter=verbose
```

**Step 4: Commit**

```bash
git add packages/amazon-dsp-mcp/src/auth/amazon-dsp-auth-adapter.ts packages/amazon-dsp-mcp/tests/auth/
git commit -m "fix(amazon-dsp-mcp): fix LwA token refresh endpoint, response parsing, and validation API call"
```

---

### Task 16: Fix Amazon DSP auth strategy — authType naming inconsistency

**Files:**
- Modify: `packages/amazon-dsp-mcp/src/auth/amazon-dsp-auth-strategy.ts`
- Modify: `packages/amazon-dsp-mcp/src/config/index.ts`

**Context:** `authType` is `"amazon_dsp-bearer"` (underscore-hyphen mix) but `mcpAuthMode` enum value is `"amazon-bearer"` (all-hyphen). Pick one convention and apply consistently.

**Step 1: Check what other servers use**

```bash
grep -r "authType" packages/*/src/auth/*-auth-strategy.ts | head -20
```
Meta uses `"meta-bearer"`, LinkedIn uses `"linkedin-bearer"`, TikTok uses `"tiktok-bearer"`. Pattern is `{platform}-bearer` with hyphen only.

**Step 2: Fix authType**

In `amazon-dsp-auth-strategy.ts`, change:
```typescript
// OLD:
protected readonly authType = "amazon_dsp-bearer";
// NEW:
protected readonly authType = "amazon-dsp-bearer";
```

In `config/index.ts`, ensure enum includes `"amazon-dsp-bearer"`:
```typescript
mcpAuthMode: z.enum(["amazon-dsp-bearer", "jwt", "none"]).default("amazon-dsp-bearer"),
```

**Step 3: Commit**

```bash
git add packages/amazon-dsp-mcp/src/auth/amazon-dsp-auth-strategy.ts packages/amazon-dsp-mcp/src/config/index.ts
git commit -m "fix(amazon-dsp-mcp): standardize authType to amazon-dsp-bearer (consistent hyphen convention)"
```

---

### Task 17: Fix Amazon DSP HTTP client — required Amazon headers on all requests

**Files:**
- Modify: `packages/amazon-dsp-mcp/src/services/amazon-dsp/amazon-dsp-http-client.ts`

**Context:** Amazon DSP requires two additional headers on every API request beyond `Authorization: Bearer`:
- `Amazon-Advertising-API-ClientId: {client_id}` (identifies the application)
- `Amazon-Advertising-API-Scope: {profile_id}` (identifies the DSP entity scope)

The current client (copy-pasted from TikTok) only sends `Authorization` and the `X-TikTok-Advertiser-Id`-equivalent header. The fix must inject both Amazon headers from the auth adapter.

**Step 1: Write failing test**

```typescript
it("injects Amazon-Advertising-API-ClientId and Amazon-Advertising-API-Scope headers", async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ orders: [] }) });
  await client.get("/dsp/orders");
  const requestHeaders = mockFetch.mock.calls[0][3].headers;
  expect(requestHeaders["Amazon-Advertising-API-ClientId"]).toBeDefined();
  expect(requestHeaders["Amazon-Advertising-API-Scope"]).toBeDefined();
  expect(requestHeaders["Amazon-Advertising-API-Scope"]).toBe("profile_123");
});
```

**Step 2: Update HTTP client**

The `AmazonDspAuthAdapter` interface needs to expose `clientId` and `profileId`. Add `clientId` to the interface if not present:

```typescript
export interface AmazonDspAuthAdapter {
  getAccessToken(): Promise<string>;
  validate(): Promise<void>;
  readonly userId: string;
  readonly profileId: string;
  readonly clientId: string;  // add this
}
```

In auth adapters, add `clientId` property (sourced from `credentials.appId`).

In HTTP client's `buildHeaders()`:
```typescript
private async buildHeaders(): Promise<Record<string, string>> {
  const token = await this.authAdapter.getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    "Amazon-Advertising-API-ClientId": this.authAdapter.clientId,
    "Amazon-Advertising-API-Scope": this.authAdapter.profileId,
    "Content-Type": "application/json",
  };
}
```

Remove any `X-TikTok-Advertiser-Id` or similar TikTok header injection.

**Step 3: Run tests**

```bash
cd packages/amazon-dsp-mcp && pnpm run test -- --reporter=verbose
```

**Step 4: Commit**

```bash
git add packages/amazon-dsp-mcp/src/auth/ packages/amazon-dsp-mcp/src/services/amazon-dsp/amazon-dsp-http-client.ts
git commit -m "fix(amazon-dsp-mcp): inject Amazon-Advertising-API-ClientId and -Scope headers on all requests"
```

---

### Task 18: Fix Amazon DSP entity mapping — DSP entity terminology

**Files:**
- Modify: `packages/amazon-dsp-mcp/src/mcp-server/tools/utils/entity-mapping.ts`

**Context:** Amazon DSP uses different entity names: "Orders" (campaigns), "Line Items" (ad groups), "Creatives" (creatives/ads). Paths are `/dsp/orders`, `/dsp/lineItems`, `/dsp/creatives`. Pagination uses `startIndex`/`count` (not page or cursor). Updates use PUT to `/dsp/orders/{orderId}`. No `DELETE` endpoint — entities are archived via status update.

**Step 1: Write failing test**

```typescript
it("campaign (order) uses DSP path /dsp/orders", () => {
  expect(getEntityConfig("campaign").listPath).toBe("/dsp/orders");
  expect(getEntityConfig("campaign").idField).toBe("orderId");
});
it("adGroup (line item) uses /dsp/lineItems", () => {
  expect(getEntityConfig("adGroup").listPath).toBe("/dsp/lineItems");
  expect(getEntityConfig("adGroup").idField).toBe("lineItemId");
});
it("creative uses /dsp/creatives", () => {
  expect(getEntityConfig("creative").listPath).toBe("/dsp/creatives");
  expect(getEntityConfig("creative").idField).toBe("creativeId");
});
```

**Step 2: Rewrite entity mapping**

```typescript
export type AmazonDspEntityType = "campaign" | "adGroup" | "creative";
// Note: no separate "ad" type — creatives ARE the ads in DSP

export interface AmazonDspEntityConfig {
  listPath: string;          // GET base path
  createPath: string;        // POST path
  updatePath: string;        // PUT /path/{entityId}
  statusUpdatePath: string;  // PUT /path/{entityId} (same — status is a field)
  /** No DELETE in Amazon DSP — archive via status update */
  idField: string;
  /** Query param for parent filter (e.g., orderId for lineItems) */
  parentIdParam?: string;
  displayName: string;
  defaultFields: string[];
  supportsDuplicate: false;
}

const ENTITY_CONFIGS = {
  campaign: {
    listPath: "/dsp/orders",
    createPath: "/dsp/orders",
    updatePath: "/dsp/orders/{entityId}",
    statusUpdatePath: "/dsp/orders/{entityId}",
    idField: "orderId",
    parentIdParam: "advertiserId",
    displayName: "Order (Campaign)",
    defaultFields: ["orderId", "name", "advertiserId", "budget", "startDate", "endDate", "status"],
    supportsDuplicate: false,
  },
  adGroup: {
    listPath: "/dsp/lineItems",
    createPath: "/dsp/lineItems",
    updatePath: "/dsp/lineItems/{entityId}",
    statusUpdatePath: "/dsp/lineItems/{entityId}",
    idField: "lineItemId",
    parentIdParam: "orderId",
    displayName: "Line Item (Ad Group)",
    defaultFields: ["lineItemId", "name", "orderId", "budget", "bidding", "status", "targetingCriteria"],
    supportsDuplicate: false,
  },
  creative: {
    listPath: "/dsp/creatives",
    createPath: "/dsp/creatives",
    updatePath: "/dsp/creatives/{entityId}",
    statusUpdatePath: "/dsp/creatives/{entityId}",
    idField: "creativeId",
    parentIdParam: "advertiserId",
    displayName: "Creative",
    defaultFields: ["creativeId", "name", "advertiserId", "creativeType", "clickThroughUrl"],
    supportsDuplicate: false,
  },
};
```

**Step 3: Run tests, commit**

```bash
git add packages/amazon-dsp-mcp/src/mcp-server/tools/utils/entity-mapping.ts
git commit -m "fix(amazon-dsp-mcp): replace TikTok entity paths with Amazon DSP API paths and terminology"
```

---

### Task 19: Fix Amazon DSP service layer — offset pagination and entity conventions

**Files:**
- Modify: `packages/amazon-dsp-mcp/src/services/amazon-dsp/amazon-dsp-service.ts`

**Context:** Amazon DSP pagination uses `startIndex`/`count` query params and `totalResults` in response. The service also needs to handle the missing DELETE endpoint (archive via status update) and interpolate `{entityId}` in update/delete paths.

**Step 1: Write failing test**

```typescript
it("listEntities sends startIndex/count params and returns totalResults", async () => {
  mockHttpClient.get.mockResolvedValueOnce({
    orders: [{ orderId: "o1", name: "Campaign 1" }],
    totalResults: 1,
  });
  const result = await service.listEntities("campaign", { advertiserId: "adv_1" });
  expect(mockHttpClient.get).toHaveBeenCalledWith(
    "/dsp/orders",
    expect.objectContaining({ startIndex: 0, count: 10, advertiserId: "adv_1" }),
    undefined
  );
  expect(result.entities[0]).toEqual({ orderId: "o1", name: "Campaign 1" });
  expect(result.pageInfo.totalResults).toBe(1);
});

it("deleteEntity sends PUT with ARCHIVED status (no DELETE endpoint)", async () => {
  mockHttpClient.put.mockResolvedValueOnce({});
  await service.deleteEntity("campaign", {}, "order_123");
  expect(mockHttpClient.put).toHaveBeenCalledWith(
    "/dsp/orders/order_123",
    { status: "ARCHIVED" },
    undefined
  );
});
```

**Step 2: Update service**

Key changes:
1. `listEntities()`: use `startIndex`/`count` pagination, pass `advertiserId`/`orderId` as query params
2. `deleteEntity()`: send `PUT {updatePath}` with `{ status: "ARCHIVED" }` instead of DELETE
3. Response unwrapping: DSP returns `{ orders: [...] }`, `{ lineItems: [...] }`, `{ creatives: [...] }` — map entity type to response key
4. `listAdAccounts()` → `GET /dsp/advertisers?startIndex=0&count=100`
5. Remove all TikTok-style reporting (async task-based) — Amazon DSP uses `GET /dsp/reports` with different params

**Step 3: Run tests, commit**

```bash
git add packages/amazon-dsp-mcp/src/services/
git commit -m "fix(amazon-dsp-mcp): update service for DSP entity conventions, offset pagination, and archive-based delete"
```

---

### Task 20: Fix Amazon DSP prompts, resources, rename test files, fix header extraction

**Files:**
- Modify: `packages/amazon-dsp-mcp/src/auth/amazon-dsp-auth-adapter.ts` (header name)
- Modify: `packages/amazon-dsp-mcp/src/mcp-server/prompts/definitions/campaign-setup-workflow.prompt.ts`
- Modify: `packages/amazon-dsp-mcp/src/mcp-server/resources/definitions/entity-schemas.resource.ts`
- Modify: `packages/amazon-dsp-mcp/src/mcp-server/resources/definitions/entity-examples.resource.ts`
- Rename: `tiktok-*.test.ts` files in `packages/amazon-dsp-mcp/tests/`

**Step 1: Fix header extraction in auth adapter**

Currently `getAmazonDspAdvertiserIdFromHeaders()` reads `x-amazon-dsp-advertiser-id` (invented). The Amazon DSP header standard is `Amazon-Advertising-API-Scope` for the profile/entity ID:

```typescript
// In amazon-dsp-auth-adapter.ts, replace getAmazonDspAdvertiserIdFromHeaders():
export function getAmazonDspProfileIdFromHeaders(
  headers: Record<string, string | string[] | undefined>
): string {
  const profileId =
    extractHeader(headers, "amazon-advertising-api-scope") ??
    extractHeader(headers, "Amazon-Advertising-API-Scope");

  if (!profileId) {
    throw new Error(
      "Missing required Amazon-Advertising-API-Scope header (DSP entity ID / profile ID). " +
      "Also ensure Amazon-Advertising-API-ClientId header is set."
    );
  }

  return profileId;
}
```

Also rename `adAccountId` to `profileId` in the auth strategy's `resolveAccessBranch` and `resolveRefreshBranch`.

**Step 2: Update campaign setup prompt**

Replace TikTok content with Amazon DSP content:
- Entity terminology: "Orders" (campaigns), "Line Items" (ad groups), "Creatives"
- Objectives: `REACH`, `REMARKETING`, `BEHAVIORAL_RETARGETING`, `CONTEXTUAL_TARGETING`
- Order fields: `name`, `advertiserId`, `budget` (dollars), `startDate`, `endDate` (ISO 8601), `status`
- Line Item fields: `name`, `orderId`, `budget`, `bidding: { bidOptimization: "AUTO"|"MANUAL", bidAmount: ... }`, `targetingCriteria`
- Add gotchas:
  - `⚠️ GOTCHA: Amazon DSP has no DELETE endpoint. Use status: "ARCHIVED" to remove entities.`
  - `⚠️ GOTCHA: Amazon-Advertising-API-Scope header must contain your DSP entity ID (profile ID).`
  - `⚠️ GOTCHA: Budget amounts are in USD dollars (not micro-currency). $50 → budget: 50.00`

**Step 3: Update entity schemas and examples**

Order (campaign) schema:
```json
{
  "required": ["name", "advertiserId", "budget", "startDate", "endDate"],
  "properties": {
    "name": { "type": "string" },
    "advertiserId": { "type": "string" },
    "budget": { "type": "number", "description": "Total budget in USD dollars" },
    "startDate": { "type": "string", "format": "date" },
    "endDate": { "type": "string", "format": "date" },
    "status": { "enum": ["DELIVERING", "PAUSED", "ARCHIVED"] }
  }
}
```

**Step 4: Rename test files**

```bash
cd packages/amazon-dsp-mcp/tests
find . -name "tiktok-*.test.ts" | while read f; do
  mv "$f" "$(echo "$f" | sed 's/tiktok-/amazon-dsp-/g')"
done
grep -r "tiktok\|TikTok\|TIKTOK" . --include="*.ts" -l | xargs sed -i 's/tiktok/amazon-dsp/g; s/TikTok/AmazonDsp/g; s/TIKTOK/AMAZON_DSP/g'
```

**Step 5: Run full test suite**

```bash
cd packages/amazon-dsp-mcp && pnpm run test -- --reporter=verbose
```

**Step 6: Commit**

```bash
git add packages/amazon-dsp-mcp/
git commit -m "fix(amazon-dsp-mcp): fix header extraction, prompts, schemas, examples; rename test files"
```

---

## Phase 4: Cross-Cutting Fixes

### Task 21: Document bearer token allowedAdvertisers limitation in shared package

**Files:**
- Modify: `packages/shared/src/auth/bearer-auth-strategy-base.ts`

**Context:** Bearer token strategies never set `allowedAdvertisers` in the `AuthResult`, which means JWT scope enforcement is silently skipped in bearer-token mode. This is a known design decision but is undocumented.

**Step 1: Add explicit comment**

In `bearer-auth-strategy-base.ts` near the `verify()` return statement (around line 100-108), add:

```typescript
// NOTE: allowedAdvertisers is intentionally not set for bearer-token sessions.
// Bearer token auth is trusted at the connection level (the token itself acts
// as the credential bound to the ad account via the adapter's adAccountId/profileId).
// JWT scope enforcement (allowedAdvertisers check in registerToolsFromDefinitions)
// only activates in jwt mode where the JWT explicitly declares allowed advertiser IDs.
// If per-call advertiser scoping is needed in bearer-token mode, implement it
// inside the individual auth adapters' validate() method or add it here.
```

**Step 2: Commit**

```bash
git add packages/shared/src/auth/bearer-auth-strategy-base.ts
git commit -m "docs(shared): document why bearer token strategies don't set allowedAdvertisers"
```

---

### Task 22: Fix error format inconsistency in tool handler factory

**Files:**
- Modify: `packages/shared/src/mcp-server/tool-handler-factory.ts`

**Context:** Non-production error format is plaintext `"Error: ${message}"` while production returns JSON `{ error, code, data }`. AI agents that parse tool error responses will behave differently by environment.

**Step 1: Write failing test**

```typescript
it("non-production errors return same JSON structure as production errors", async () => {
  process.env.NODE_ENV = "development";
  // ... invoke a tool that throws
  const result = await handler({ isError: true });
  // result.content[0].text should be parseable JSON with error/code fields
  expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  const parsed = JSON.parse(result.content[0].text);
  expect(parsed).toHaveProperty("error");
  expect(parsed).toHaveProperty("code");
});
```

**Step 2: Find and update the non-production error formatter**

In `tool-handler-factory.ts`, find the block that formats errors differently by environment (lines ~654-671). Change the non-production path to return the same JSON structure:

```typescript
// In both production and non-production:
return {
  content: [{ type: "text", text: JSON.stringify({ error: mcpError.message, code: mcpError.code, data: mcpError.data ?? null }) }],
  isError: true,
};
// The only difference allowed is adding a `stack` field in non-production for debugging:
// In non-production only: { error, code, data, stack: originalError.stack }
```

**Step 3: Run shared tests**

```bash
cd packages/shared && pnpm run test -- --reporter=verbose
```

**Step 4: Commit**

```bash
git add packages/shared/src/mcp-server/tool-handler-factory.ts packages/shared/tests/
git commit -m "fix(shared): standardize error response format to JSON across all environments"
```

---

### Task 23: Add new platforms to SENSITIVE_KEYS in interaction logger

**Files:**
- Modify: `packages/shared/src/utils/interaction-logger.ts`

**Context:** `SENSITIVE_KEYS` includes specific entries for TTD headers (`x-ttd-api-secret`, `x-ttd-partner-id`) but uses a generic `secret`/`token` substring match for everything else. The new platform-specific header names follow the same generic pattern and don't need explicit entries — but the `x-ttd-*` explicit entries are inconsistent with this.

**Step 1: Review current SENSITIVE_KEYS pattern (around line 90)**

```bash
grep -n "SENSITIVE_KEYS\|ttd-api-secret" packages/shared/src/utils/interaction-logger.ts
```

**Step 2: Simplify**

Replace explicit TTD entries with the comment that the generic pattern covers them:

```typescript
// Keys are redacted if they contain any of these substrings (case-insensitive).
// Covers: access_token, refresh_token, api_secret, app_secret, client_secret,
// authorization, x-ttd-api-secret, x-pinterest-app-secret, etc.
const SENSITIVE_KEY_PATTERNS = ["secret", "token", "authorization", "password", "key", "credential"];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some(pattern => lower.includes(pattern));
}
```

**Step 3: Commit**

```bash
git add packages/shared/src/utils/interaction-logger.ts
git commit -m "fix(shared): generalize SENSITIVE_KEYS to pattern-match instead of platform-specific entries"
```

---

### Task 24: Update cross-platform prompts in existing servers to include new platforms

**Files:**
- Modify: All `cross-platform-campaign-setup.prompt.ts` in the ORIGINAL 7 servers (dbm, dv360, ttd, gads, meta, linkedin, tiktok)

**Context:** All original server cross-platform prompts only mention DV360, TTD, Google Ads, and Meta. LinkedIn, TikTok, Pinterest, Snapchat, and Amazon DSP have been added since.

**Step 1: Find all cross-platform prompt files**

```bash
find packages -name "cross-platform-campaign-setup.prompt.ts" | sort
```

**Step 2: Update platform selection matrix in each**

Add rows for:
- **LinkedIn:** B2B, professional audiences, `linkedin_create_entity`, CPM in micro-currency
- **TikTok:** Short-form video, Gen Z/Millennial, `tiktok_create_entity`, budget in dollars
- **Pinterest:** Visual discovery, shopping intent, `pinterest_create_entity`, micro-currency
- **Snapchat:** Gen Z, AR/video, `snapchat_create_entity`, micro-currency
- **Amazon DSP:** Retail/commerce intent, programmatic display, `amazon_dsp_create_entity`, dollars

**Step 3: Commit**

```bash
git add packages/*/src/mcp-server/prompts/definitions/cross-platform-campaign-setup.prompt.ts
git commit -m "feat: add LinkedIn, TikTok, Pinterest, Snapchat, Amazon DSP to cross-platform setup prompts"
```

---

### Task 25: Verify and update CLAUDE.md and memory with new server details

**Files:**
- Modify: `CLAUDE.md`
- Modify: `/Users/daniel.thorner/.claude/projects/-Users-daniel-thorner-GitHub-cesteral-mcp-servers/memory/MEMORY.md`

**Context:** CLAUDE.md still lists "seven MCP servers" in the overview and doesn't document Pinterest, Snapchat, or Amazon DSP. Memory MEMORY.md also needs updating.

**Step 1: Update CLAUDE.md**

- In "Project Overview" section: change "seven independent MCP servers" → "ten independent MCP servers"
- Add to "Current Project Status": pinterest-mcp (port 3011), snapchat-mcp (port 3009), amazon-dsp-mcp (port 3012) — with their respective API references
- Add port assignments to "Server Ports" section in running servers
- Add tools catalog entries for all three new servers
- Update `dev-server.sh` section if ports are new

**Step 2: Run full build to confirm nothing broken**

```bash
cd /Users/daniel.thorner/GitHub/cesteral-mcp-servers && pnpm run build
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with pinterest-mcp, snapchat-mcp, amazon-dsp-mcp server details"
```

---

## Phase 5: Final Verification

### Task 26: Run full test suite and typecheck across all packages

**Step 1: Build all packages**

```bash
cd /Users/daniel.thorner/GitHub/cesteral-mcp-servers
pnpm run build 2>&1 | tail -20
```
Expected: no errors.

**Step 2: Run full test suite**

```bash
pnpm run test 2>&1 | tail -40
```
Expected: all packages pass.

**Step 3: Run typecheck**

```bash
pnpm run typecheck 2>&1 | tail -20
```
Expected: no type errors.

**Step 4: Spot-check cross-server contract tests in new packages**

```bash
cd packages/pinterest-mcp && pnpm run test tests/cross-server-contract.test.ts -- --reporter=verbose
cd packages/snapchat-mcp && pnpm run test tests/cross-server-contract.test.ts -- --reporter=verbose
cd packages/amazon-dsp-mcp && pnpm run test tests/cross-server-contract.test.ts -- --reporter=verbose
```

**Step 5: Commit (if any last-minute fixes needed)**

```bash
git add -p  # stage only what changed
git commit -m "fix: final cleanup from full test suite run"
```

---

## Summary

| Phase | Tasks | Scope |
|---|---|---|
| 1: Pinterest | 1–9 | Auth adapter, HTTP client, entity mapping, service, prompts, resources, tests, config |
| 2: Snapchat | 10–14 | Auth adapter, entity mapping, HTTP client, service, prompts, resources, tests |
| 3: Amazon DSP | 15–20 | Auth (LwA), auth strategy naming, HTTP headers, entity mapping, service, prompts, resources, tests |
| 4: Cross-cutting | 21–25 | Bearer auth docs, error format, sensitive keys, cross-platform prompts, CLAUDE.md |
| 5: Verification | 26 | Full build + test + typecheck |

**Total estimated tasks:** 26 tasks

**Critical path:** Tasks 1–20 (platform API migrations) must be done before verification. Tasks 21–25 are independent and can be done in any order or in parallel.
